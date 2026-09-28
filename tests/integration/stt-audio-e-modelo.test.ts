/**
 * P0-2 e P0-3 da auditoria de prontidão — o que o CLIENTE não pode mais decidir no caminho que o
 * app paga (chave do servidor, sem `x-credential-id`):
 *
 *  - P0-2: a duração cobrada. O `byteRate` do cabeçalho era a base da conta; forjado, 13 min de
 *    áudio contavam como 1 s. Corpo não-RIFF contava 10 s fixos e seguia para o provedor.
 *  - P0-3: o modelo. `x-model` escolhia o modelo que a chave do dono pagava.
 *
 * No BYOK a chave e a conta são do usuário: ele escolhe o modelo livremente.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { oggOpus } from '../harness/ogg'
import { wavPcm } from '../harness/wav'

let h: EphemeralDb
let stt: any
let subs: any
let counters: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sttTranscribeProxy: stt } = await h.load('../../server/ai/sttProxy'))
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
  ;({ usageCountersRepo: counters } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => {
  await h.cleanup()
})
afterEach(() => {
  delete process.env.AUTH_REQUIRED
  delete process.env.GROQ_API_KEY
  delete process.env.STT_MODEL
  vi.restoreAllMocks()
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    r.headersSent = true
    return r
  }
  return r
}
const janela = () => new Date().toISOString().slice(0, 7)

async function usuarioPro(id: string) {
  process.env.AUTH_REQUIRED = '1'
  process.env.GROQ_API_KEY = 'chave-do-dono'
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'pro', status: 'active' })
  return u
}

/** Espia o `fetch` e devolve o `model` que cada chamada ao provedor levou no FormData. */
function espiarProvedor() {
  const modelos: string[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
    modelos.push(String((init?.body as FormData).get('model')))
    return { ok: true, status: 200, json: async () => ({ text: 'oi' }), text: async () => '' } as any
  })
  return { spy, modelos }
}

describe('P0-2 — áudio ilegível ou forjado no caminho pago pelo app', () => {
  it('corpo não-RIFF → 415 audio_ilegivel, sem provedor e sem consumir cota', async () => {
    const u = await usuarioPro('p02-nao-riff')
    const { spy } = espiarProvedor()
    const res = fakeRes()
    await stt(
      { userId: u, body: Buffer.from('lixo que não é wav, de tamanho qualquer, 123456'), header: () => undefined },
      res,
    )
    expect(res.statusCode).toBe(415)
    expect(res.body?.code).toBe('audio_ilegivel')
    expect(spy).not.toHaveBeenCalled()
    expect(await counters.get(u, 'managed_calls', janela())).toBe(0)
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(0)
  })

  it('byteRate forjado (13 min declarados como ~1 s) → 415, sem provedor', async () => {
    const u = await usuarioPro('p02-byterate')
    const { spy } = espiarProvedor()
    const res = fakeRes()
    await stt({ userId: u, body: wavPcm(780, { byteRate: 25_000_000 }), header: () => undefined }, res)
    expect(res.statusCode).toBe(415)
    expect(res.body?.code).toBe('audio_ilegivel')
    expect(spy).not.toHaveBeenCalled()
  })

  it('formato não-PCM → 415', async () => {
    const u = await usuarioPro('p02-nao-pcm')
    const { spy } = espiarProvedor()
    const res = fakeRes()
    await stt({ userId: u, body: wavPcm(2, { formato: 0x55 }), header: () => undefined }, res)
    expect(res.statusCode).toBe(415)
    expect(spy).not.toHaveBeenCalled()
  })

  it('acima do teto por requisição → 413 audio_longo_demais, sem provedor', async () => {
    const u = await usuarioPro('p02-teto')
    const { spy } = espiarProvedor()
    const res = fakeRes()
    await stt({ userId: u, body: wavPcm(61), header: () => undefined }, res)
    expect(res.statusCode).toBe(413)
    expect(res.body?.code).toBe('audio_longo_demais')
    expect(spy).not.toHaveBeenCalled()
  })

  it('o WAV do cliente legítimo (6 s, 16 kHz mono 16 bits) passa e debita os 6 s reais da cota', async () => {
    const u = await usuarioPro('p02-legitimo')
    espiarProvedor()
    const res = fakeRes()
    await stt({ userId: u, body: wavPcm(6), header: () => undefined }, res)
    expect(res.statusCode).toBe(200)
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(6)
  })
})

describe('P0-3 — o modelo pago pelo app é decidido no servidor', () => {
  it('caminho pago: x-model do cliente é IGNORADO; vale o STT_MODEL do servidor', async () => {
    const u = await usuarioPro('p03-pago')
    process.env.STT_MODEL = 'whisper-large-v3-turbo'
    const { modelos } = espiarProvedor()
    const res = fakeRes()
    const cab: Record<string, string> = { 'x-model': 'whisper-large-v3' }
    await stt({ userId: u, body: wavPcm(2), header: (n: string) => cab[n] }, res)
    expect(res.statusCode).toBe(200)
    expect(modelos.length).toBeGreaterThan(0)
    expect(new Set(modelos)).toEqual(new Set(['whisper-large-v3-turbo']))
  })

  it('BYOK: x-model do usuário é respeitado (a chave e a conta são dele)', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('p03-byok')
    const { credentialsRepo } = (await h.load('../../server/db/repositories/credentials')) as any
    const cred = await credentialsRepo.create(u, {
      // example.com é reservado pela IANA e sempre resolve — `assertPublicUrl` faz DNS real.
      label: 'minha',
      kind: 'openai',
      baseUrl: 'https://example.com/v1',
      secret: 'sk-do-usuario',
      defaultModel: 'modelo-padrao-da-credencial',
    })
    const { modelos } = espiarProvedor()
    const res = fakeRes()
    const cab: Record<string, string> = { 'x-credential-id': cred.id, 'x-model': 'whisper-large-v3' }
    await stt({ userId: u, body: wavPcm(2), header: (n: string) => cab[n] }, res)
    expect(res.statusCode).toBe(200)
    expect(modelos[0]).toBe('whisper-large-v3')
  })
})

describe('Ogg Opus no caminho pago pelo app (auditoria de eficiência 2026-09-28, achado 3)', () => {
  /** Espia o `fetch` e devolve o arquivo que cada chamada levou no FormData. */
  function espiarArquivo() {
    const arquivos: Array<{ nome: string; tipo: string }> = []
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init: any) => {
      const f = (init?.body as FormData).get('file') as File
      arquivos.push({ nome: f.name, tipo: f.type })
      return { ok: true, status: 200, json: async () => ({ text: 'oi' }), text: async () => '' } as any
    })
    return { spy, arquivos }
  }

  it('Ogg legítimo de 6 s passa, vai ao provedor como audio/ogg e debita os 6 s reais — igual ao WAV', async () => {
    const u = await usuarioPro('ogg-legitimo')
    const { arquivos } = espiarArquivo()
    const res = fakeRes()
    await stt({ userId: u, body: oggOpus(6), header: () => undefined }, res)
    expect(res.statusCode).toBe(200)
    expect(arquivos[0]).toEqual({ nome: 'audio.ogg', tipo: 'audio/ogg' })
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(6)
  })

  it('WAV continua indo como audio/wav (o reserva de quem não tem WebCodecs)', async () => {
    const u = await usuarioPro('ogg-wav-reserva')
    const { arquivos } = espiarArquivo()
    const res = fakeRes()
    await stt({ userId: u, body: wavPcm(2), header: () => undefined }, res)
    expect(res.statusCode).toBe(200)
    expect(arquivos[0]).toEqual({ nome: 'audio.wav', tipo: 'audio/wav' })
  })

  it('granule forjado (30 s de pacotes declarados como 1 s) → 415, sem provedor e sem cota', async () => {
    const u = await usuarioPro('ogg-forjado')
    const { spy } = espiarArquivo()
    const res = fakeRes()
    await stt({ userId: u, body: oggOpus(30, { totalAmostras48k: 48_000 }), header: () => undefined }, res)
    expect(res.statusCode).toBe(415)
    expect(res.body?.code).toBe('audio_ilegivel')
    expect(spy).not.toHaveBeenCalled()
    expect(await counters.get(u, 'stt_seconds', janela())).toBe(0)
  })

  it('Ogg acima do teto por requisição → 413', async () => {
    const u = await usuarioPro('ogg-teto')
    const { spy } = espiarArquivo()
    const res = fakeRes()
    await stt({ userId: u, body: oggOpus(61), header: () => undefined }, res)
    expect(res.statusCode).toBe(413)
    expect(spy).not.toHaveBeenCalled()
  })
})
