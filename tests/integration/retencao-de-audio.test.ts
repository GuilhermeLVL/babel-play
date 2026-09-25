/**
 * RETENÇÃO DO ÁUDIO DAS SESSÕES — `AUDIO_RETENCAO_DIAS` (padrão 90; 0 = guardar para sempre).
 *
 * O áudio gravado de uma captura é o dado mais pesado e o mais pessoal que o servidor guarda: é a
 * voz de quem falou, e às vezes de quem estava perto. Até aqui ele ficava para sempre, e a política
 * de privacidade não dizia por quanto tempo. A limpeza periódica apaga o ARQUIVO (disco ou S3/R2),
 * devolve o espaço à cota do usuário e tira a referência do `meta` da sessão — a transcrição, o
 * vocabulário e o resto da sessão ficam.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { diasDeRetencaoDeAudio } from '../../server/lib/config'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000

let h: EphemeralDb
let dir: string
let sessionsRepo: any
let quota: any
let limparAudiosVencidos: any
let armazenamentoDeArquivos: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  dir = mkdtempSync(path.join(tmpdir(), 'babel-audio-retencao-'))
  ;({ sessionsRepo } = await h.load<any>('../../server/db/repositories/sessions'))
  quota = await h.load<any>('../../server/lib/storageQuota')
  ;({ limparAudiosVencidos } = await h.load<any>('../../server/lib/retencaoDeAudio'))
  ;({ armazenamentoDeArquivos } = await h.load<any>('../../server/lib/armazenamento'))
})
afterAll(async () => {
  await h.cleanup()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* OneDrive pode travar o unlink; best-effort */
  }
})

/** Uma sessão com um arquivo de áudio de `bytes` no diretório de teste, já contado na cota. */
async function sessaoComAudio(userId: string, bytes: number) {
  const u = asUserId(userId)
  const s = await sessionsRepo.create(u, { title: 'com áudio' })
  const nome = `${s.id}.webm`
  writeFileSync(path.join(dir, nome), Buffer.alloc(bytes, 1))
  await sessionsRepo.setAudio(u, s.id, nome, 'audio/webm')
  await quota.ajustarArmazenamento(u, bytes)
  return { u, id: s.id as string, nome }
}

const existe = (nome: string) => {
  try {
    readFileSync(path.join(dir, nome))
    return true
  } catch {
    return false
  }
}

describe('configuração', () => {
  it('padrão 90 dias; 0 desliga; valor inválido cai no padrão', () => {
    expect(diasDeRetencaoDeAudio({})).toBe(90)
    expect(diasDeRetencaoDeAudio({ AUDIO_RETENCAO_DIAS: '0' })).toBe(0)
    expect(diasDeRetencaoDeAudio({ AUDIO_RETENCAO_DIAS: '30' })).toBe(30)
    expect(diasDeRetencaoDeAudio({ AUDIO_RETENCAO_DIAS: '-4' })).toBe(90)
    expect(diasDeRetencaoDeAudio({ AUDIO_RETENCAO_DIAS: 'muito' })).toBe(90)
  })
})

describe('limpeza de áudio vencido', () => {
  it('apaga o arquivo, devolve a cota e tira a referência — a sessão fica', async () => {
    const { u, id, nome } = await sessaoComAudio('retencao-vencido', 5_000)
    const antes = await quota.usoDeArmazenamento(u)
    const store = armazenamentoDeArquivos(dir)

    const r = await limparAudiosVencidos({ dias: 90, agora: Date.now() + 91 * DIA, store })

    expect(r.removidos).toBeGreaterThanOrEqual(1)
    expect(existe(nome)).toBe(false)
    expect(await quota.usoDeArmazenamento(u)).toBe(antes - 5_000)
    const sessao = await sessionsRepo.get(u, id)
    expect(sessao).toBeTruthy()
    const meta = JSON.parse(sessao.meta ?? '{}')
    expect(meta.audioFile).toBeUndefined()
    expect(meta.audioType).toBeUndefined()
  })

  it('áudio dentro do prazo fica intocado', async () => {
    const { u, id, nome } = await sessaoComAudio('retencao-recente', 3_000)
    const store = armazenamentoDeArquivos(dir)
    await limparAudiosVencidos({ dias: 90, agora: Date.now() + 10 * DIA, store })
    expect(existe(nome)).toBe(true)
    expect(JSON.parse((await sessionsRepo.get(u, id)).meta).audioFile).toBe(nome)
  })

  it('dias = 0 é "guardar para sempre": não apaga nada', async () => {
    const { nome } = await sessaoComAudio('retencao-sempre', 1_000)
    const store = armazenamentoDeArquivos(dir)
    const r = await limparAudiosVencidos({ dias: 0, agora: Date.now() + 5000 * DIA, store })
    expect(r.removidos).toBe(0)
    expect(existe(nome)).toBe(true)
  })

  it('falha ao apagar UM arquivo não para a varredura, e não libera cota do que não saiu', async () => {
    const a = await sessaoComAudio('retencao-falha-a', 2_000)
    const b = await sessaoComAudio('retencao-falha-b', 2_000)
    const real = armazenamentoDeArquivos(dir)
    const store = {
      ...real,
      remover: async (n: string) => {
        if (n === a.nome) throw new Error('EPERM simulado')
        return real.remover(n)
      },
    }
    const usoAntesA = await quota.usoDeArmazenamento(a.u)
    const r = await limparAudiosVencidos({ dias: 90, agora: Date.now() + 91 * DIA, store })
    expect(r.falhas).toBeGreaterThanOrEqual(1)
    expect(existe(a.nome)).toBe(true)
    expect(existe(b.nome)).toBe(false)
    expect(await quota.usoDeArmazenamento(a.u)).toBe(usoAntesA)
    expect(JSON.parse((await sessionsRepo.get(a.u, a.id)).meta).audioFile).toBe(a.nome)
  })
})
