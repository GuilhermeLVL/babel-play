/**
 * Lacunas da auditoria, por HTTP no servidor de verdade (self-host):
 *
 * 1. `GET /api/sessions/:id/audio` com `Range` (server/routes/sessions.ts): o contrato do seek do
 *    `<audio>`. `bytes=-N` são os N ÚLTIMOS bytes (antes era lido como `0-N`); faixa invertida
 *    (`9-2`), fora do arquivo e lixo respondem 416 com `Content-Range: bytes * /tamanho`;
 *    `bytes=0-` é o arquivo inteiro em 206.
 * 2. `POST /api/import/document` com `x-filename` malformado em percent-encoding
 *    (`%E0%A4%A`): o `decodeURIComponent` lança URIError, e isso não pode virar 500. O nome cai
 *    no padrão.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

/** 16 bytes distinguíveis: o byte i vale i, então o conteúdo de cada faixa é conferível. */
const AUDIO = Buffer.from(Array.from({ length: 16 }, (_, i) => i))

let s: AppDeTeste
let audioDir: string
let sessaoId: string

beforeAll(async () => {
  // O diretório de áudio é lido do ambiente no import dos módulos: tem de existir antes do subirApp.
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-range-'))
  process.env.AUDIO_DIR = audioDir
  s = await subirApp({ modo: 'self-host' })
  const { donoLocal } = await s.load('../../server/lib/authContext')
  const { sessionsRepo } = await s.load('../../server/db/repositories/sessions')
  const dono = donoLocal()
  const sessao = await sessionsRepo.create(dono, { title: 'range', kind: 'audio' })
  const arquivo = `${sessao.id}.webm`
  writeFileSync(path.join(audioDir, arquivo), AUDIO)
  await sessionsRepo.setAudio(dono, sessao.id, arquivo, 'audio/webm')
  sessaoId = sessao.id
})
afterAll(async () => {
  await s.encerrar()
  delete process.env.AUDIO_DIR
  rmSync(audioDir, { recursive: true, force: true })
})

const audio = (range?: string) =>
  s.chamar('GET', `/api/sessions/${sessaoId}/audio`, { headers: range ? { range } : {} })
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer())

describe('GET /api/sessions/:id/audio com Range', () => {
  it('sem Range: 200 com o arquivo inteiro e Accept-Ranges', async () => {
    const r = await audio()
    expect(r.status).toBe(200)
    expect(r.headers.get('accept-ranges')).toBe('bytes')
    expect(await bytes(r)).toEqual(AUDIO)
  })

  it('bytes=-5: os 5 ÚLTIMOS bytes, 206', async () => {
    const r = await audio('bytes=-5')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 11-15/16')
    expect(r.headers.get('content-length')).toBe('5')
    expect(await bytes(r)).toEqual(AUDIO.subarray(11))
  })

  it('bytes=-999 (mais que o arquivo): o arquivo inteiro em 206, sem estourar', async () => {
    const r = await audio('bytes=-999')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 0-15/16')
    expect(await bytes(r)).toEqual(AUDIO)
  })

  it('bytes=0-: o arquivo inteiro em 206', async () => {
    const r = await audio('bytes=0-')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 0-15/16')
    expect(r.headers.get('content-length')).toBe('16')
    expect(await bytes(r)).toEqual(AUDIO)
  })

  it('bytes=4-7: faixa fechada, 206 com os bytes certos', async () => {
    const r = await audio('bytes=4-7')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 4-7/16')
    expect(await bytes(r)).toEqual(AUDIO.subarray(4, 8))
  })

  /* `bytes=-` (sem número nenhum) NÃO está aqui: hoje devolve 206 com o arquivo inteiro, quando o RFC 7233
     o trata como inválido. Defeito menor, relatado à parte (server/routes/sessions.ts, regex do Range). */
  it.each([
    ['sem número nenhum', 'bytes=-'],
    ['faixa invertida', 'bytes=9-2'],
    ['início depois do fim do arquivo', 'bytes=16-'],
    ['fim além do arquivo', 'bytes=0-16'],
    ['lixo', 'lixo'],
    ['unidade desconhecida', 'items=0-4'],
    ['vários intervalos', 'bytes=0-1,4-5'],
  ])('%s (%s): 416 com Content-Range bytes */16', async (_nome, range) => {
    const r = await audio(range)
    expect(r.status).toBe(416)
    expect(r.headers.get('content-range')).toBe('bytes */16')
    await r.arrayBuffer()
  })
})

describe('POST /api/import/document com x-filename malformado', () => {
  const enviar = (nome: string) =>
    s.chamar('POST', '/api/import/document', {
      raw: 'Olá, mundo. Um texto qualquer para extrair.',
      headers: { 'content-type': 'text/plain', 'x-filename': nome },
    })

  it('%E0%A4%A (percent-encoding truncado): não é 500; o nome cai no padrão', async () => {
    const r = await enviar('%E0%A4%A')
    expect(r.status, await r.clone().text()).toBeLessThan(500)
    await r.arrayBuffer()
  })

  it('outros malformados também não derrubam a rota', async () => {
    for (const nome of ['%', '%zz', '100%.txt', '%C0%AF']) {
      const r = await enviar(nome)
      expect(r.status, nome).toBeLessThan(500)
      await r.arrayBuffer()
    }
  })

  it('controle: nome bem formado com percent-encoding continua decodificando (.txt, 200)', async () => {
    const r = await enviar(encodeURIComponent('relatório final.txt'))
    expect(r.status, await r.clone().text()).toBe(200)
    await r.arrayBuffer()
  })
})
