/**
 * B6 (Fase B, 29/09/2026) — A CASCATA DO STT: PERNAS PELO CUSTO EFETIVO DO PEDIDO.
 *
 * Até aqui o STT tinha UMA perna (`sttGerenciado`, a primeira do registro no formato OpenAI): um 429
 * ou uma queda do provedor mandava toda fala para o aparelho, e a Cloudflare (Workers AI, áudio em
 * base64) ficava declarada e ignorada. O que muda:
 *
 *   - as pernas são tentadas pelo CUSTO EFETIVO do pedido — com o mínimo faturado de cada uma
 *     (`minimoFaturadoDoStt`): a Groq fatura 10 s por pedido, então um clipe de 3 s custa 10 s lá e
 *     3 s em quem cobra por segundo; num clipe longo, o preço por hora volta a mandar;
 *   - dois formatos: OpenAI multipart (`/audio/transcriptions`) e Cloudflare (`/ai/run/<modelo>`,
 *     JSON com o áudio em base64 — o schema de `@cf/openai/whisper-large-v3-turbo` conferido em
 *     developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo em 30/09/2026);
 *   - 429, 5xx e timeout passam para a próxima perna; o disjuntor é POR PERNA, como no LLM;
 *   - custo e métrica são os da perna que respondeu;
 *   - o legado (sem `IA_PROVEDORES`, uma perna só) fica idêntico: os testes de sempre do STT
 *     (`admissao-de-ia`, `stt-nuvem-honesta`, `stt-audio-e-modelo`, `custo-por-provedor`) continuam.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao, fracaoDoBalde } from '../../server/ai/admissao'
import {
  custoEfetivoDaPerna,
  lerRespostaDeStt,
  montarPedidoDeStt,
  ordenarPorCustoEfetivo,
} from '../../server/ai/cascataDeStt'
import { esquecerDisjuntores, FALHAS_PARA_ABRIR } from '../../server/ai/disjuntor'
import type { Provedor } from '../../server/ai/provedores'
import {
  endpointDaTranscricao,
  esquecerRegistro,
  sttDeNuvemConfigurado,
  sttGerenciado,
} from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { wavPcm } from '../harness/wav'

const CONTA = '0123456789abcdef0123456789abcdef'

const pernaDe = (o: Partial<Provedor> & { model: string }): Provedor => ({
  rotulo: 'stt-gerenciado',
  base: 'https://stt.exemplo/v1',
  apiKey: 'k',
  formato: 'openai',
  ...o,
})
/** Groq: US$ 0,04/h com 10 s mínimos por pedido. */
const GROQ = pernaDe({
  fornecedor: 'groq',
  model: 'whisper-large-v3-turbo',
  preco: { hora: 0.04, minimoFaturadoS: 10 },
})
/** Por segundo, sem mínimo, mais caro por hora: US$ 0,06/h. */
const POR_SEGUNDO = pernaDe({
  fornecedor: 'porsegundo',
  model: 'whisper-por-segundo',
  preco: { hora: 0.06, minimoFaturadoS: 0 },
})

describe('custo efetivo: o mínimo faturado decide o clipe curto', () => {
  it('3 s: a Groq fatura 10 s (US$ 0,000111); quem cobra por segundo, 3 s (US$ 0,00005) — vai primeiro', () => {
    expect(custoEfetivoDaPerna(GROQ, 3)).toBeCloseTo((10 * 0.04) / 3600, 12)
    expect(custoEfetivoDaPerna(POR_SEGUNDO, 3)).toBeCloseTo((3 * 0.06) / 3600, 12)
    expect(ordenarPorCustoEfetivo([GROQ, POR_SEGUNDO], 3).map((p) => p.fornecedor)).toEqual(['porsegundo', 'groq'])
  })

  it('30 s: o mínimo já não pesa, e o preço por hora volta a mandar', () => {
    expect(ordenarPorCustoEfetivo([POR_SEGUNDO, GROQ], 30).map((p) => p.fornecedor)).toEqual(['groq', 'porsegundo'])
  })

  it('empate mantém a ordem do registro; fração de segundo é cobrada inteira', () => {
    const outra = { ...GROQ, fornecedor: 'groq-2' }
    expect(ordenarPorCustoEfetivo([GROQ, outra], 4).map((p) => p.fornecedor)).toEqual(['groq', 'groq-2'])
    expect(custoEfetivoDaPerna(POR_SEGUNDO, 2.2)).toBeCloseTo((3 * 0.06) / 3600, 12)
  })

  it('mínimo não declarado vale os 10 s (o erro para mais)', () => {
    const semMinimo = pernaDe({ fornecedor: 'x', model: 'm', preco: { hora: 0.001 } })
    expect(custoEfetivoDaPerna(semMinimo, 1)).toBeCloseTo((10 * 0.001) / 3600, 12)
  })
})

describe('os dois formatos', () => {
  it('OpenAI: base + /audio/transcriptions', () => {
    expect(endpointDaTranscricao(GROQ)).toBe('https://stt.exemplo/v1/audio/transcriptions')
  })

  it('Cloudflare: a rota nativa /ai/run/<modelo> — na API direta e pelo AI Gateway', () => {
    const cf = pernaDe({
      formato: 'cloudflare',
      base: `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/v1`,
      model: '@cf/openai/whisper-large-v3-turbo',
    })
    expect(endpointDaTranscricao(cf)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/run/@cf/openai/whisper-large-v3-turbo`,
    )
    const gw = { ...cf, base: `https://gateway.ai.cloudflare.com/v1/${CONTA}/meu-gw/workers-ai/v1` }
    expect(endpointDaTranscricao(gw)).toBe(
      `https://gateway.ai.cloudflare.com/v1/${CONTA}/meu-gw/workers-ai/@cf/openai/whisper-large-v3-turbo`,
    )
  })

  it('Cloudflare com base de outro formato, ou modelo que escaparia do caminho: a perna não existe', () => {
    const cf = pernaDe({ formato: 'cloudflare', base: 'https://api.cloudflare.com/x', model: '@cf/openai/w' })
    expect(endpointDaTranscricao(cf)).toBeNull()
    const fuga = pernaDe({
      formato: 'cloudflare',
      base: `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/v1`,
      model: '@cf/../../tokens',
    })
    expect(endpointDaTranscricao(fuga)).toBeNull()
  })

  it('Cloudflare: JSON com o áudio em base64, idioma e o prompt como initial_prompt', async () => {
    const cf = pernaDe({
      formato: 'cloudflare',
      base: `https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/v1`,
      model: '@cf/openai/whisper-large-v3-turbo',
      apiKey: 'token-cf',
    })
    const audio = Buffer.from([1, 2, 3, 250])
    const p = montarPedidoDeStt(cf, audio, { idioma: 'pt', prompt: 'olá de novo', formato: 'verbose_json' })
    expect(p.url).toBe(endpointDaTranscricao(cf))
    expect(p.init.method).toBe('POST')
    expect((p.init.headers as Record<string, string>).Authorization).toBe('Bearer token-cf')
    expect((p.init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(p.init.body as string)).toEqual({
      audio: audio.toString('base64'),
      task: 'transcribe',
      language: 'pt',
      initial_prompt: 'olá de novo',
    })
  })

  it('OpenAI: o multipart de sempre (modelo, temperatura zero, verbose_json)', async () => {
    const p = montarPedidoDeStt(GROQ, wavPcm(1), { idioma: 'en', formato: 'verbose_json' })
    const f = p.init.body as FormData
    expect(f.get('model')).toBe('whisper-large-v3-turbo')
    expect(f.get('language')).toBe('en')
    expect(f.get('temperature')).toBe('0')
    expect(f.get('response_format')).toBe('verbose_json')
    expect((f.get('file') as File).name).toBe('audio.wav')
  })

  it('a resposta da Cloudflare vira a forma do verbose_json (texto, idioma, duração, segmentos)', () => {
    const r = lerRespostaDeStt('cloudflare', {
      success: true,
      result: {
        text: ' olá mundo',
        transcription_info: { language: 'pt', duration: 2.1 },
        segments: [{ start: 0, end: 2, text: ' olá mundo', avg_logprob: -0.2, no_speech_prob: 0.01 }],
      },
    })
    expect(r).toEqual({
      text: ' olá mundo',
      language: 'pt',
      duration: 2.1,
      segments: [{ start: 0, end: 2, text: ' olá mundo', avg_logprob: -0.2, no_speech_prob: 0.01 }],
    })
  })
})

describe('o registro anuncia o STT que o proxy sabe chamar', () => {
  afterEach(() => esquecerRegistro())
  it('só a Cloudflare declarada: agora é STT de nuvem (a cascata sabe o base64)', () => {
    const env = {
      IA_PROVEDORES: JSON.stringify({
        provedores: [
          {
            id: 'cloudflare',
            formato: 'cloudflare',
            conta: 'CLOUDFLARE_ACCOUNT_ID',
            chave: 'CLOUDFLARE_API_TOKEN',
            retencao: 'zdr',
            modelos: [{ id: '@cf/openai/whisper-large-v3-turbo', funcoes: ['stt'] }],
          },
        ],
      }),
      CLOUDFLARE_ACCOUNT_ID: CONTA,
      CLOUDFLARE_API_TOKEN: 'token-cf',
    } as NodeJS.ProcessEnv
    expect(sttDeNuvemConfigurado(env)).toBe(true)
    expect(sttGerenciado(env)?.fornecedor).toBe('cloudflare')
  })
})

/* ─────────────────────────── a rota ─────────────────────────── */

let h: EphemeralDb
let stt: (req: any, res: any) => Promise<void>
let subs: any
let gasto: any
let metricas: typeof import('../../server/http/metricas')
let promClient: typeof import('prom-client')

const PRO = asUserId('stt-cascata-pro')
const ENVS = [
  'IA_PROVEDORES',
  'GROQ_API_KEY',
  'DEEPINFRA_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'IA_ADMISSAO_STT_RPM',
  'IA_EM_VOO_STT',
  'LLM_API_KEY',
  'STT_API_KEY',
] as const
const mes = () => new Date().toISOString().slice(0, 7)

/* IPs públicos literais: `assertPublicUrl` resolveria DNS de verdade, e o host não é assunto aqui. */
const REG_GROQ = {
  id: 'groq',
  formato: 'openai',
  base: 'http://203.0.113.20/openai/v1',
  chave: 'GROQ_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.04, minimoFaturadoS: 10 } }],
}
const REG_POR_SEGUNDO = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'http://203.0.113.21/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'openai/whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.06, minimoFaturadoS: 0 } }],
}
const REG_CLOUDFLARE = {
  id: 'cloudflare',
  formato: 'cloudflare',
  base: 'http://203.0.113.22/client/v4/accounts/{conta}/ai/v1',
  conta: 'CLOUDFLARE_ACCOUNT_ID',
  chave: 'CLOUDFLARE_API_TOKEN',
  retencao: 'zdr',
  modelos: [{ id: '@cf/openai/whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.0306, minimoFaturadoS: 0 } }],
}
function registro(...provedores: unknown[]) {
  process.env.IA_PROVEDORES = JSON.stringify({ provedores })
  process.env.GROQ_API_KEY = 'chave-groq-falsa'
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  process.env.CLOUDFLARE_ACCOUNT_ID = CONTA
  process.env.CLOUDFLARE_API_TOKEN = 'token-cf-falso'
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (n: string, v: string) => ((r.headers[n.toLowerCase()] = v), r)
  return r
}
const reqStt = (corpo: Buffer, headers: Record<string, string> = {}): any => ({
  userId: PRO,
  body: corpo,
  header: (n: string) => headers[n.toLowerCase()],
  requestId: 'r-stt-cascata',
})
const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

type Roteiro = Record<string, () => Response | Promise<Response>>
/** O provedor falso: por HOST, o que cada um responde; registra a ordem das chamadas. */
function provedores(roteiro: Roteiro) {
  const chamadas: Array<{ host: string; url: string; corpo: unknown }> = []
  vi.stubGlobal('fetch', async (u: unknown, init: any) => {
    const url = String(u)
    if (!/\/(audio\/transcriptions|ai\/run\/)/.test(url)) return new Response('{}', { status: 200 })
    const host = new URL(url).hostname
    chamadas.push({ host, url, corpo: init?.body })
    const f = roteiro[host]
    if (!f) throw new Error(`host inesperado: ${host}`)
    return f()
  })
  return chamadas
}
const OK_OPENAI = () => json({ text: 'olá mundo', language: 'portuguese', duration: 2 })
const OK_CF = () =>
  json({ success: true, result: { text: 'olá mundo', transcription_info: { language: 'pt', duration: 2 } } })

describe('POST /api/ai/stt — a cascata', () => {
  beforeAll(async () => {
    h = await setupEphemeralDb()
    process.env.AUTH_REQUIRED = '1'
    ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
    ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
    ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
    metricas = await h.load('../../server/http/metricas')
    promClient = await import('prom-client')
    metricas.esquecerMetricas()
    metricas.handlerDeMetricas()
    await subs.upsert(PRO, { plan: 'pro', status: 'active' })
  })
  afterAll(async () => {
    metricas.esquecerMetricas()
    delete process.env.AUTH_REQUIRED
    for (const e of ENVS) process.env[e] = ''
    await h.cleanup()
  })
  beforeEach(() => {
    /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
    for (const e of ENVS) process.env[e] = ''
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    esquecerAdmissao()
    esquecerDisjuntores()
    esquecerRegistro()
  })

  it('clipe curto (2 s): quem cobra por segundo vai primeiro, e o custo é o DELE', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({ '203.0.113.21': OK_OPENAI, '203.0.113.20': OK_OPENAI })
    const antes = (await gasto.ler(mes()))?.microUsd ?? 0
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toBe('olá mundo')
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.21'])
    // 2 s a US$ 0,06/h, sem mínimo — e não os 10 s da Groq.
    expect(((await gasto.ler(mes())).microUsd - antes) / 1_000_000).toBeCloseTo((2 * 0.06) / 3600, 6)
    const corpo = await promClient.register.metrics()
    expect(corpo).toMatch(/ia_provedor_custo_usd_total\{[^}]*funcao="stt"[^}]*fornecedor="deepinfra"/)
  })

  it('clipe longo (30 s): o preço por hora manda, e a Groq vai primeiro', async () => {
    registro(REG_POR_SEGUNDO, REG_GROQ)
    const chamadas = provedores({ '203.0.113.21': OK_OPENAI, '203.0.113.20': OK_OPENAI })
    const res = mockRes()
    await stt(reqStt(wavPcm(30)), res)
    expect(res.statusCode).toBe(200)
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.20'])
  })

  it('a perna que a porta admitiu e não foi chamada devolve o pedido ao balde', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO) // a porta admite a Groq (1ª do registro); o clipe curto vai para a outra
    provedores({ '203.0.113.21': OK_OPENAI, '203.0.113.20': OK_OPENAI })
    await stt(reqStt(wavPcm(2)), mockRes())
    expect(fracaoDoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'whisper-large-v3-turbo' })).toBe(1)
  })

  it('429 na primeira: a próxima atende — e a que limitou fica fechada até o Retry-After', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({
      '203.0.113.21': () => new Response('limite', { status: 429, headers: { 'retry-after': '20' } }),
      '203.0.113.20': OK_OPENAI,
    })
    const a = mockRes()
    await stt(reqStt(wavPcm(2)), a)
    expect(a.statusCode).toBe(200)
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.21', '203.0.113.20'])
    // A próxima fala nem tenta a que limitou.
    chamadas.length = 0
    await stt(reqStt(wavPcm(2)), mockRes())
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.20'])
  })

  it('5xx na primeira: a próxima atende NA HORA, sem a retentativa (há quem atender)', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({
      '203.0.113.21': () => new Response('fora', { status: 503 }),
      '203.0.113.20': OK_OPENAI,
    })
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(200)
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.21', '203.0.113.20'])
  })

  it('timeout (ou rede) na primeira: a próxima atende', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({
      '203.0.113.21': () =>
        Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })),
      '203.0.113.20': OK_OPENAI,
    })
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(200)
    expect(chamadas).toHaveLength(2)
  })

  it('todas em 429: 429 nuvem_ocupada com a MENOR espera', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    provedores({
      '203.0.113.21': () => new Response('x', { status: 429, headers: { 'retry-after': '40' } }),
      '203.0.113.20': () => new Response('x', { status: 429, headers: { 'retry-after': '9' } }),
    })
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(429)
    expect(res.body.code).toBe('nuvem_ocupada')
    expect(res.headers['retry-after']).toBe('9')
  })

  it('todas em 5xx: a ÚLTIMA repete uma vez (como a perna única de sempre) e sai 502', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({
      '203.0.113.21': () => new Response('x', { status: 500 }),
      '203.0.113.20': () => new Response('x', { status: 502 }),
    })
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.code).toBe('provedor_indisponivel')
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.21', '203.0.113.20', '203.0.113.20'])
  })

  it('disjuntor POR PERNA: a que caiu cinco vezes é pulada sem socket, e a outra atende', async () => {
    registro(REG_GROQ, REG_POR_SEGUNDO)
    const chamadas = provedores({
      '203.0.113.21': () => new Response('x', { status: 500 }),
      '203.0.113.20': OK_OPENAI,
    })
    for (let i = 0; i < FALHAS_PARA_ABRIR; i++) await stt(reqStt(wavPcm(2)), mockRes())
    chamadas.length = 0
    const res = mockRes()
    await stt(reqStt(wavPcm(2)), res)
    expect(res.statusCode).toBe(200)
    expect(chamadas.map((c) => c.host)).toEqual(['203.0.113.20'])
  })

  it('Cloudflare: o áudio vai em base64 para /ai/run/<modelo>, e a resposta volta normalizada', async () => {
    registro(REG_GROQ, REG_CLOUDFLARE)
    const chamadas = provedores({ '203.0.113.22': OK_CF, '203.0.113.20': OK_OPENAI })
    const audio = wavPcm(2)
    const res = mockRes()
    await stt(reqStt(audio, { 'x-language': 'pt' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ text: 'olá mundo', language: 'pt' })
    expect(chamadas[0].url).toBe(
      `http://203.0.113.22/client/v4/accounts/${CONTA}/ai/run/@cf/openai/whisper-large-v3-turbo`,
    )
    expect(JSON.parse(chamadas[0].corpo as string)).toMatchObject({
      audio: audio.toString('base64'),
      task: 'transcribe',
      language: 'pt',
    })
  })

  it('Cloudflare: os segmentos passam pela MESMA triagem do verbose_json (silêncio inventado cai)', async () => {
    registro(REG_CLOUDFLARE)
    provedores({
      '203.0.113.22': () =>
        json({
          success: true,
          result: {
            text: ' Olá. Obrigado por assistir.',
            transcription_info: { language: 'pt', duration: 4 },
            segments: [
              { start: 0, end: 1, text: ' Olá.', avg_logprob: -0.1, no_speech_prob: 0.02, compression_ratio: 1 },
              {
                start: 1,
                end: 4,
                text: ' Obrigado por assistir.',
                avg_logprob: -1.5,
                no_speech_prob: 0.9,
                compression_ratio: 1,
              },
            ],
          },
        }),
    })
    const res = mockRes()
    await stt(reqStt(wavPcm(4)), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toBe('Olá.')
  })
})
