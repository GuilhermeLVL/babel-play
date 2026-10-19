/**
 * O SNAPSHOT DIÁRIO NO POSTGRES: o job continua agendado, mas só registra que está indisponível.
 *
 * O `VACUUM INTO` saiu com o SQLite (ver `server/operacao/snapshot.ts`); o backup passa a ser
 * `pg_dump` no CI. O que este arquivo prova é o que sobrou de comportamento: o job não lança, não
 * pinga o heartbeat (que significa "há backup conferido") e o agendador segue tratando sucesso e
 * falha como antes; e a VOLTA dos snapshots SQLite que já estão no R2 (os de antes da migração)
 * continua funcionando: GET → gunzip → arquivo novo → `integrity_check` e contagens. Os testes do
 * agendador e da restauração vieram de `snapshot-e-restauracao.test.ts`, apagado com o `VACUUM INTO`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { createClient } from '@libsql/client'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  agendarSnapshotDiario,
  destinoDoBackup,
  fazerSnapshot,
  msAteAProxima,
  restaurarSnapshot,
  SNAPSHOT_INDISPONIVEL,
} from '../../server/operacao/snapshot'

let dir: string
let servidor: Server
let endpoint: string
const objetos = new Map<string, Buffer>()

/* Um "R2" falso de verdade (HTTP, recebendo o GET assinado do `armazenamentoS3`) com UM snapshot
   SQLite do dia 2026-09-24, feito como o job antigo fazia: um arquivo `.db` comprimido. */
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'snapshot-legado-'))
  const s3 = express()
  s3.get('/*', (req, res) => {
    const o = objetos.get(decodeURIComponent(req.path))
    if (!o) {
      res.status(404).end()
      return
    }
    res.status(200).send(o)
  })
  servidor = await new Promise((r) => {
    const s = s3.listen(0, '127.0.0.1', () => r(s))
  })
  const addr = servidor.address()
  endpoint = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`

  const arquivo = path.join(dir, 'antigo.db')
  const banco = createClient({ url: `file:${arquivo.replace(/\\/g, '/')}` })
  await banco.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, titulo TEXT)')
  await banco.execute('CREATE TABLE users (id TEXT PRIMARY KEY)')
  for (let i = 0; i < 250; i++)
    await banco.execute({ sql: 'INSERT INTO sessions VALUES (?, ?)', args: [`s${i}`, `sessão ${i}`] })
  await banco.execute("INSERT INTO users VALUES ('u1')")
  banco.close()
  objetos.set('/backups-babel/backups/diario/2026-09-24.db.gz', gzipSync(readFileSync(arquivo)))
})

afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows segura o arquivo do libsql por um instante depois do close; limpeza é best-effort */
  }
})

const destino = () => {
  const d = destinoDoBackup({
    S3_ENDPOINT: endpoint,
    S3_BUCKET: 'midia',
    BACKUP_S3_BUCKET: 'backups-babel',
    S3_ACCESS_KEY_ID: 'chave',
    S3_SECRET_ACCESS_KEY: 'segredo',
  } as unknown as NodeJS.ProcessEnv)
  if (!d) throw new Error('destino deveria existir')
  return d
}

describe('snapshot diário no Postgres', () => {
  it('o job registra a indisponibilidade e devolve null, sem lançar', async () => {
    const saida = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const saidaLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(fazerSnapshot()).resolves.toBeNull()
      const escrito = [...saida.mock.calls, ...saidaLog.mock.calls].flat().join(' ')
      expect(escrito).toContain('backup_diario_indisponivel')
      expect(escrito).toContain(SNAPSHOT_INDISPONIVEL)
    } finally {
      saida.mockRestore()
      saidaLog.mockRestore()
    }
  })

  it('destinoDoBackup exige as credenciais e prefere BACKUP_S3_BUCKET', () => {
    expect(destinoDoBackup({})).toBeNull()
    const base = { S3_ENDPOINT: 'https://r2', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }
    expect(destinoDoBackup({ ...base, S3_BUCKET: 'midia' })?.cfg.bucket).toBe('midia')
    expect(destinoDoBackup({ ...base, S3_BUCKET: 'midia', BACKUP_S3_BUCKET: 'backups' })?.cfg.bucket).toBe('backups')
  })
})

describe('a volta de um snapshot SQLite do R2', () => {
  it('restaura num arquivo NOVO, e a cópia passa no integrity_check com as mesmas contagens', async () => {
    const saida = path.join(dir, 'limpo', 'restaurado.db')
    mkdirSync(path.dirname(saida), { recursive: true })
    const v = await restaurarSnapshot({ destino: destino(), dia: '2026-09-24', arquivoSaida: saida })
    expect(v.ok).toBe(true)
    expect(v.integridade).toBe('ok')
    expect(v.contagens.sessions).toBe(250)
    expect(v.contagens.users).toBe(1)
  })

  it('recusa restaurar por cima de um arquivo que já existe', async () => {
    await expect(
      restaurarSnapshot({ destino: destino(), dia: '2026-09-24', arquivoSaida: path.join(dir, 'antigo.db') }),
    ).rejects.toThrow(/já existe/)
  })

  it('dia inexistente falha alto', async () => {
    await expect(
      restaurarSnapshot({ destino: destino(), dia: '2020-01-01', arquivoSaida: path.join(dir, 'nada.db') }),
    ).rejects.toThrow()
  })
})

describe('agendador', () => {
  it('msAteAProxima: sempre no futuro, no máximo 24 h', () => {
    const agora = new Date('2026-09-24T06:00:00Z')
    expect(msAteAProxima(6, agora)).toBe(24 * 3600_000)
    expect(msAteAProxima(7, agora)).toBe(3600_000)
    expect(msAteAProxima(5, agora)).toBe(23 * 3600_000)
  })

  it('sucesso → heartbeat; falha → sem heartbeat; indisponível (null) → sem heartbeat nem métrica', async () => {
    vi.useFakeTimers()
    try {
      const buscar = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
      const ok = vi.fn(async () => ({ chave: 'x', bytes: 1 }))
      const parar = agendarSnapshotDiario({ horaUtc: 0, executar: ok, heartbeatUrl: 'https://hb.exemplo/abc', buscar })
      await vi.advanceTimersByTimeAsync(24 * 3600_000 + 1000)
      expect(ok).toHaveBeenCalledTimes(1)
      expect(buscar).toHaveBeenCalledTimes(1)
      parar()

      const buscar2 = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
      const falha = vi.fn(async () => {
        throw new Error('disco cheio')
      })
      const parar2 = agendarSnapshotDiario({
        horaUtc: 0,
        executar: falha,
        heartbeatUrl: 'https://hb.exemplo/abc',
        buscar: buscar2,
      })
      await vi.advanceTimersByTimeAsync(24 * 3600_000 + 1000)
      expect(falha).toHaveBeenCalledTimes(1)
      expect(buscar2).not.toHaveBeenCalled()
      parar2()

      const buscar3 = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
      const observar = vi.fn()
      const nada = vi.fn(async () => null)
      const parar3 = agendarSnapshotDiario({
        horaUtc: 0,
        executar: nada,
        heartbeatUrl: 'https://hb.exemplo/abc',
        buscar: buscar3,
        observar,
      })
      await vi.advanceTimersByTimeAsync(24 * 3600_000 + 1000)
      expect(nada).toHaveBeenCalledTimes(1)
      expect(buscar3).not.toHaveBeenCalled()
      expect(observar).not.toHaveBeenCalled()
      parar3()
    } finally {
      vi.useRealTimers()
    }
  })
})
