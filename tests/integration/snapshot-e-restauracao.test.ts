/**
 * Fase 5 — o snapshot diário vai para um "R2" e VOLTA íntegro num diretório limpo.
 *
 * Backup que nunca foi restaurado não é backup. Este teste faz o caminho inteiro contra um S3 FALSO
 * de verdade (HTTP, recebendo o PUT assinado do `armazenamentoS3`): banco com dados → `VACUUM INTO`
 * → gzip → PUT; depois GET → gunzip → arquivo novo → `PRAGMA integrity_check` e contagens iguais.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@libsql/client'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  agendarSnapshotDiario,
  destinoDoBackup,
  fazerSnapshot,
  msAteAProxima,
  restaurarSnapshot,
} from '../../server/operacao/snapshot'

let dir: string
let servidor: Server
let endpoint: string
const objetos = new Map<string, Buffer>()
const assinados: string[] = []

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'snapshot-'))
  const s3 = express()
  s3.put('/*', express.raw({ type: () => true, limit: '50mb' }), (req, res) => {
    assinados.push(String(req.header('authorization') ?? ''))
    objetos.set(decodeURIComponent(req.path), req.body as Buffer)
    res.status(200).end()
  })
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

  // Um banco com as tabelas que a verificação conta, e dados.
  const banco = createClient({ url: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}` })
  await banco.execute('PRAGMA journal_mode = WAL')
  await banco.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, titulo TEXT)')
  await banco.execute('CREATE TABLE users (id TEXT PRIMARY KEY)')
  for (let i = 0; i < 250; i++)
    await banco.execute({ sql: 'INSERT INTO sessions VALUES (?, ?)', args: [`s${i}`, `sessão ${i}`] })
  await banco.execute("INSERT INTO users VALUES ('u1')")
  banco.close()
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

describe('snapshot diário → R2 → restauração', () => {
  it('destinoDoBackup exige as credenciais e prefere BACKUP_S3_BUCKET', () => {
    expect(destinoDoBackup({} as NodeJS.ProcessEnv)).toBeNull()
    expect(destino().cfg.bucket).toBe('backups-babel')
  })

  it('envia o snapshot do dia, comprimido e assinado', async () => {
    const r = await fazerSnapshot({
      urlDoBanco: `file:${path.join(dir, 'vivo.db').replace(/\\/g, '/')}`,
      dirTemporario: dir,
      destino: destino(),
      agora: new Date('2026-09-24T06:00:00Z'),
    })
    expect(r.chave).toBe('backups/diario/2026-09-24.db.gz')
    expect(r.verificacao.ok).toBe(true)
    expect(objetos.has('/backups-babel/backups/diario/2026-09-24.db.gz')).toBe(true)
    expect(assinados.at(-1)).toMatch(/^AWS4-HMAC-SHA256 Credential=chave\//)
  })

  it('restaura num arquivo NOVO, e a cópia passa no integrity_check com as mesmas contagens', async () => {
    const saida = path.join(dir, 'limpo', 'restaurado.db')
    rmSync(path.dirname(saida), { recursive: true, force: true })
    await import('node:fs').then((fs) => fs.mkdirSync(path.dirname(saida), { recursive: true }))
    const v = await restaurarSnapshot({ destino: destino(), dia: '2026-09-24', arquivoSaida: saida })
    expect(v.ok).toBe(true)
    expect(v.integridade).toBe('ok')
    expect(v.contagens.sessions).toBe(250)
    expect(v.contagens.users).toBe(1)
  })

  it('recusa restaurar por cima de um arquivo que já existe', async () => {
    await expect(
      restaurarSnapshot({ destino: destino(), dia: '2026-09-24', arquivoSaida: path.join(dir, 'vivo.db') }),
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

  it('sucesso → heartbeat; falha → sem heartbeat', async () => {
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
    } finally {
      vi.useRealTimers()
    }
  })
})
