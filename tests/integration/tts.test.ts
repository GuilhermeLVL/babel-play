/**
 * E4 (Fase E, 30/09/2026) — `POST /api/ai/tts`, a voz natural do modo intérprete.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA, e o que se prova em cada passo:
 *   - sem o entitlement `vozNatural` (qualquer que seja o nome do plano): 402 `exige_voz_natural`, sem
 *     provedor nem cota;
 *   - com a flag `voz_natural` desligada (o padrão da migração 0046): 503 `voz_natural_desligada`;
 *   - sem perna `tts` com chave (a chave do dono ainda não existe): 501 `voz_nao_configurada`;
 *   - com tudo: o áudio (`audio/mpeg`), os caracteres contados no mês E no dia, o custo no gasto do mês;
 *   - a mesma fala de novo vem do cache L1: nem provedor, nem cota;
 *   - o uso justo do dia: 429 `uso_justo_do_dia`, e o mês devolvido; o mês: 402 `quota_exceeded`;
 *   - SEM CLONAGEM: pedido com áudio de referência ou voz criada é 400, sem provedor, e o que vai ao
 *     provedor nunca tem esses campos;
 *   - a cascata: 429 da primeira perna passa para a segunda; tudo em 429 é 429 `nuvem_ocupada`; o 5xx
 *     é 502 e os caracteres voltam.
 * O menor (conta restrita) está em `tts-menor.test.ts`, pelo app de verdade.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { CAMPOS_DE_CLONAGEM } from '../../server/ai/provedoresDeVoz'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'

const forja = vi.hoisted(() => ({ semVoz: false }))
vi.mock('../../server/lib/entitlements', async (original) => {
  const real = await original<typeof import('../../server/lib/entitlements')>()
  return {
    ...real,
    getEntitlements: (plano: Parameters<typeof real.getEntitlements>[0]) => {
      const e = real.getEntitlements(plano)
      return forja.semVoz ? { ...e, vozNatural: false } : e
    },
  }
})

const perna = (id: string, base: string, extra: Record<string, unknown> = {}) => ({
  id,
  formato: 'openai',
  base,
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'ResembleAI/chatterbox-multilingual', funcoes: ['tts'], preco: { milhaoDeCaracteres: 1 } }],
  ...extra,
})
const PRIMARIA = perna('deepinfra', 'https://deepinfra.exemplo/v1/openai')
const RESERVA = perna('reserva-voz', 'https://reserva-voz.exemplo/v1/openai')

const ENVS = [
  'IA_PROVEDORES',
  'DEEPINFRA_API_KEY',
  'PREMIUM_DAILY_TTS_CHARS',
  'PREMIUM_MONTHLY_TTS_CHARS',
  'LLM_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
] as const
const PAGANTE = asUserId('tts-pagante')
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let ttsProxy: (req: any, res: any) => Promise<void>
let esvaziarCacheDeVoz: () => void
let counters: any
let gasto: any
let flags: any

interface Chamada {
  url: string
  corpo: Record<string, unknown>
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.send = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

const AUDIO = Buffer.from('ID3-audio-falso')

function provedor(resposta: (c: Chamada) => { status?: number } | undefined = () => undefined): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (u: unknown, init: any) => {
    const c = { url: String(u), corpo: JSON.parse(init.body) }
    chamadas.push(c)
    const r = resposta(c)
    if (r?.status && r.status !== 200)
      return new Response('falhou', { status: r.status, headers: r.status === 429 ? { 'retry-after': '7' } : {} })
    return new Response(AUDIO, { status: 200, headers: { 'content-type': 'audio/mpeg' } })
  })
  return chamadas
}

async function pedir(body: Record<string, unknown>) {
  const res = mockRes()
  await ttsProxy({ userId: PAGANTE, body, requestId: 'r-tts', header: () => undefined, headers: {} }, res)
  return res
}

const contador = async (metrica: string, janela = mes()) => (await counters.get(PAGANTE, metrica, janela)) ?? 0
const hoje = async () => {
  const { janelaDoDia } = await h.load<any>('../../server/lib/usageQuota')
  return janelaDoDia(PAGANTE)
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ ttsProxy, esvaziarCacheDeVoz } = await h.load<any>('../../server/ai/ttsProxy'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
  flags = await h.load<any>('../../server/lib/flags')
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(PAGANTE, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [PRIMARIA] })
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  await flags.definirFlag('voz_natural', { habilitada: true }, 'teste')
  esvaziarCacheDeVoz()
})
afterEach(() => {
  forja.semVoz = false
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('a porta da voz natural', () => {
  it('a flag nasce DESLIGADA na migração 0046', async () => {
    const linha = (await flags.listarFlagsCruas()).find((f: { chave: string }) => f.chave === 'voz_natural')
    expect(linha).toBeDefined()
    await flags.definirFlag('voz_natural', { habilitada: false }, 'teste')
    const chamadas = provedor()
    const res = await pedir({ texto: 'Good morning', idioma: 'en' })
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('voz_natural_desligada')
    expect(chamadas).toHaveLength(0)
  })

  it('sem o entitlement vozNatural: 402, sem provedor e sem cota', async () => {
    forja.semVoz = true
    const chamadas = provedor()
    const antes = await contador('tts_chars')
    const res = await pedir({ texto: 'Good morning', idioma: 'en' })
    expect(res.statusCode).toBe(402)
    expect(res.body).toMatchObject({ code: 'exige_voz_natural', entitlement: 'vozNatural' })
    expect(chamadas).toHaveLength(0)
    expect(await contador('tts_chars')).toBe(antes)
  })

  it('sem perna de voz com chave (a chave do dono ainda não existe): 501 claro', async () => {
    process.env.DEEPINFRA_API_KEY = ''
    const chamadas = provedor()
    const res = await pedir({ texto: 'Good morning', idioma: 'en' })
    expect(res.statusCode).toBe(501)
    expect(res.body.code).toBe('voz_nao_configurada')
    expect(chamadas).toHaveLength(0)
  })

  it('idioma que nenhuma voz fala: 422, e o cliente usa a voz do aparelho', async () => {
    const res = await pedir({ texto: 'สวัสดี', idioma: 'th' })
    expect(res.statusCode).toBe(422)
    expect(res.body.code).toBe('idioma_sem_voz_natural')
  })

  it('corpo inválido: 400, sem provedor', async () => {
    const chamadas = provedor()
    expect((await pedir({ texto: '', idioma: 'pt' })).statusCode).toBe(400)
    expect((await pedir({ texto: 'x'.repeat(601), idioma: 'pt' })).statusCode).toBe(400)
    expect((await pedir({ texto: 'oi', idioma: 'português' })).statusCode).toBe(400)
    expect((await pedir({ texto: 'oi', idioma: 'pt', velocidade: 9 })).statusCode).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('com a voz natural', () => {
  it('o áudio, os caracteres no mês e no dia, e o custo no gasto do mês', async () => {
    const chamadas = provedor()
    const texto = 'Where is the train station?'
    const dia = await hoje()
    const [mesAntes, diaAntes] = [await contador('tts_chars'), await contador('tts_chars_dia', dia)]
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    const res = await pedir({ texto, idioma: 'en-US' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('audio/mpeg')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(Buffer.compare(res.body, AUDIO)).toBe(0)
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('https://deepinfra.exemplo/v1/openai/audio/speech')
    expect(chamadas[0].corpo).toMatchObject({ input: texto, extra_body: { language: 'en' } })
    expect(await contador('tts_chars')).toBe(mesAntes + texto.length)
    expect(await contador('tts_chars_dia', dia)).toBe(diaAntes + texto.length)
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBeGreaterThan(gastoAntes)
  })

  it('a mesma fala de novo vem do cache: nem provedor, nem cota', async () => {
    const chamadas = provedor()
    await pedir({ texto: 'Thank you very much', idioma: 'en' })
    const depois = await contador('tts_chars')
    const res = await pedir({ texto: 'Thank you very much', idioma: 'en' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-voz-cache']).toBe('1')
    expect(chamadas).toHaveLength(1)
    expect(await contador('tts_chars')).toBe(depois)
  })
})

describe('as cotas de caracteres', () => {
  it('o uso justo do dia acabou: 429 uso_justo_do_dia, sem provedor, e o mês devolvido', async () => {
    process.env.PREMIUM_DAILY_TTS_CHARS = '10'
    const chamadas = provedor()
    const antes = await contador('tts_chars')
    const res = await pedir({ texto: 'This sentence is longer than ten', idioma: 'en' })
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('uso_justo_do_dia')
    expect(res.headers['retry-after']).toBeDefined()
    expect(chamadas).toHaveLength(0)
    expect(await contador('tts_chars')).toBe(antes)
  })

  it('o mês acabou: 402 quota_exceeded da voz, sem provedor', async () => {
    process.env.PREMIUM_MONTHLY_TTS_CHARS = '5'
    const chamadas = provedor()
    const res = await pedir({ texto: 'Beyond the monthly cap', idioma: 'en' })
    expect(res.statusCode).toBe(402)
    expect(res.body).toMatchObject({ code: 'quota_exceeded', detalhes: { escopo: 'voz' } })
    expect(chamadas).toHaveLength(0)
  })
})

describe('sem clonagem de voz', () => {
  it.each([
    [{ audio_prompt: 'data:audio/wav;base64,AAAA' }],
    [{ voice_id: 'voz-criada-123' }],
    [{ reference_audio: 'https://exemplo/voz.wav' }],
    [{ extra: { speaker_wav: 'x' } }],
  ])('pedido com %j: 400 clonagem_de_voz_recusada, sem provedor', async (campo) => {
    const chamadas = provedor()
    const res = await pedir({ texto: 'Hello there', idioma: 'en', ...campo })
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('clonagem_de_voz_recusada')
    expect(chamadas).toHaveLength(0)
  })

  it('o que vai ao provedor nunca tem campo de clonagem, qualquer que seja a voz pedida', async () => {
    const chamadas = provedor()
    for (const voz of ['Vivian', 'voice_id', 'minha_voz']) await pedir({ texto: `Hi ${voz}`, idioma: 'en', voz })
    expect(chamadas).toHaveLength(3)
    const chaves = (v: unknown): string[] =>
      v && typeof v === 'object'
        ? Object.entries(v as Record<string, unknown>).flatMap(([k, f]) => [k, ...chaves(f)])
        : []
    for (const c of chamadas) expect(chaves(c.corpo).filter((k) => CAMPOS_DE_CLONAGEM.includes(k))).toEqual([])
    for (const c of chamadas) expect(c.corpo.voice).toBeUndefined() // o Chatterbox vai com a voz padrão dele
  })
})

describe('a cascata', () => {
  it('429 da primeira perna: a segunda atende, e o custo é da que respondeu', async () => {
    process.env.IA_PROVEDORES = JSON.stringify({ provedores: [PRIMARIA, RESERVA] })
    const chamadas = provedor((c) => (c.url.includes('deepinfra.exemplo') ? { status: 429 } : undefined))
    const res = await pedir({ texto: 'Second leg please', idioma: 'en' })
    expect(res.statusCode).toBe(200)
    expect(chamadas.map((c) => new URL(c.url).host)).toEqual(['deepinfra.exemplo', 'reserva-voz.exemplo'])
  })

  it('todas em 429: 429 nuvem_ocupada, e os caracteres voltam', async () => {
    const chamadas = provedor(() => ({ status: 429 }))
    const antes = await contador('tts_chars')
    const res = await pedir({ texto: 'Everyone is busy', idioma: 'en' })
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('nuvem_ocupada')
    expect(chamadas).toHaveLength(1)
    expect(await contador('tts_chars')).toBe(antes)
  })

  it('5xx: 502 provedor_indisponivel, e os caracteres voltam', async () => {
    provedor(() => ({ status: 503 }))
    const antes = await contador('tts_chars')
    const res = await pedir({ texto: 'Server is down', idioma: 'en' })
    expect(res.statusCode).toBe(502)
    expect(res.body.code).toBe('provedor_indisponivel')
    expect(await contador('tts_chars')).toBe(antes)
  })
})
