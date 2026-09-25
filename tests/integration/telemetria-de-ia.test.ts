/**
 * TELEMETRIA DE IA NAS ROTAS DE VERDADE — STT, tradução (com a cascata) e o contador de 429.
 *
 * O cliente do Langfuse tem teste próprio (`tests/langfuse.test.ts`). Aqui a pergunta é outra: as
 * rotas EMITEM o que o dono precisa para precificar? Um rastro por requisição com o plano, uma
 * geração por tentativa ao provedor (o fallback visível), segundos de áudio reais e faturados,
 * tokens, custo pela tabela única — e nada do texto do usuário, nem o id dele em claro.
 *
 * O destino usado é o ARQUIVO (`LANGFUSE_ARQUIVO`): é o formato legível, e é o que o dono vai usar
 * antes de o projeto no Langfuse existir.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let stt: any
let mt: any
let subs: any
let lf: any
let tel: any
let metricas: any
let prom: any
let dir: string
let arquivo: string

function wav(segundos: number): Buffer {
  const taxa = 16_000
  const dados = Math.round(taxa * segundos) * 2
  const b = Buffer.alloc(44 + dados)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dados, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dados, 40)
  return b
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}

const reqStt = (userId: string, corpo: Buffer, headers: Record<string, string> = {}): any => ({
  userId,
  body: corpo,
  header: (n: string) => headers[n.toLowerCase()],
  requestId: 'r-stt',
})
const reqMt = (userId: string, headers: Record<string, string> = {}): any => ({
  userId,
  body: { text: 'segredo do usuário', src: 'en', tgt: 'pt', falada: true },
  header: (n: string) => headers[n.toLowerCase()],
  requestId: 'r-mt',
})

const ENVS = [
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'STT_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_MODEL',
] as const

async function eventos(): Promise<any[]> {
  await tel.aguardarRastrosPendentes()
  await lf.langfuse().descarregar()
  let texto: string
  try {
    texto = readFileSync(arquivo, 'utf8')
  } catch {
    return []
  }
  return texto
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sttTranscribeProxy: stt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ mtTranslateProxy: mt } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  lf = await h.load<any>('../../server/lib/langfuse')
  tel = await h.load<any>('../../server/ai/telemetriaDeIa')
  metricas = await h.load<any>('../../server/http/metricas')
  prom = await import('prom-client')
})
afterAll(async () => {
  lf.redefinirLangfuse()
  await h.cleanup()
})
beforeEach(async () => {
  process.env.AUTH_REQUIRED = '1'
  dir = mkdtempSync(join(tmpdir(), 'telemetria-'))
  arquivo = join(dir, 'ia.jsonl')
  lf.redefinirLangfuse({ arquivo, intervaloMs: 0, ambiente: 'test' })
  tel.esquecerAvisosDeLimite()
  const { esvaziarCacheDeTraducao } = await h.load<any>('../../server/ai/cacheDeTraducao')
  esvaziarCacheDeTraducao()
  const { esquecerDisjuntores } = await h.load<any>('../../server/ai/disjuntor')
  esquecerDisjuntores()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const e of ENVS) process.env[e] = ''
  delete process.env.AUTH_REQUIRED
  metricas.esquecerMetricas()
  rmSync(dir, { recursive: true, force: true })
})

async function assinante(id: string, plano = 'pro') {
  const u = asUserId(id)
  await subs.upsert(u, { plan: plano, status: 'active' })
  return u
}

describe('STT de nuvem emite rastro + geração com áudio e custo', () => {
  it('uma fala de 6 s: geração com segundos reais (6) e faturados (10), custo da tabela única, plano no rastro', async () => {
    process.env.GROQ_API_KEY = 'chave-stt'
    process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
    process.env.STT_MODEL = ''
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ text: 'fala secreta do usuário', language: 'portuguese', duration: 6 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const u = await assinante('tel-stt-6s')
    const res = mockRes()
    await stt(reqStt(u, wav(6), { 'x-sessao-captura': 'sessao-abc-123' }), res)
    expect(res.statusCode).toBe(200)

    const ev = await eventos()
    const trace = ev.find((e) => e.type === 'trace-create')
    const gens = ev.filter((e) => e.type === 'generation-create')
    expect(trace.body.name).toBe('stt')
    expect(trace.body.metadata).toMatchObject({ plano: 'pro', feature: 'stt', statusHttp: 200, fallback: false })
    expect(trace.body.tags).toEqual(['stt', 'pro'])
    // Pseudônimo: presente, estável no formato, e sem o id em claro.
    expect(trace.body.userId).toMatch(/^u_[0-9a-f]{24}$/)
    expect(trace.body.sessionId).toMatch(/^u_[0-9a-f]{24}$/)
    expect(JSON.stringify(ev)).not.toContain('tel-stt-6s')
    expect(JSON.stringify(ev)).not.toContain('sessao-abc-123')

    expect(gens).toHaveLength(1)
    const g = gens[0].body
    expect(g.model).toBe('whisper-large-v3-turbo')
    expect(g.usageDetails).toEqual({ audio_seconds: 6, audio_seconds_billed: 10 })
    const orc = await h.load<any>('../../server/lib/orcamentoDeIa')
    expect(g.costDetails.total).toBeCloseTo(orc.custoDeStt('whisper-large-v3-turbo', 10), 12)
    expect(g.metadata).toMatchObject({ status: 'ok', plano: 'pro', tentativa: 1 })
    // Nada do texto do usuário, por padrão.
    expect(JSON.stringify(ev)).not.toContain('secreta')
  })

  it('o mesmo usuário gera o MESMO pseudônimo em requisições diferentes', async () => {
    process.env.GROQ_API_KEY = 'chave-stt'
    process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ text: 'oi', duration: 2 }), { status: 200 }))
    const u = await assinante('tel-stt-estavel')
    await stt(reqStt(u, wav(2)), mockRes())
    await stt(reqStt(u, wav(2)), mockRes())
    const ids = (await eventos()).filter((e) => e.type === 'trace-create').map((e) => e.body.userId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })
})

describe('tradução: uma geração por perna da cascata, e o 429 contado', () => {
  it('primário em 429 → reserva serve: DUAS gerações, fallback no rastro, contador de 429 sobe', async () => {
    metricas.handlerDeMetricas() // liga o registro do prom-client
    process.env.LLM_API_KEY = 'k1'
    process.env.LLM_BASE_URL = 'https://api.groq.com/openai/v1'
    process.env.LLM_MODEL = 'openai/gpt-oss-120b'
    process.env.LLM_RESERVA_API_KEY = 'k2'
    process.env.LLM_RESERVA_BASE_URL = 'https://openrouter.ai/api/v1'
    process.env.LLM_RESERVA_MODEL = 'openai/gpt-oss-120b'
    const avisos: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((l: string) => void avisos.push(String(l)))
    vi.stubGlobal('fetch', async (url: any) => {
      if (String(url).includes('groq')) return new Response('rate limited', { status: 429 })
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'tradução secreta' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 64 } },
        }),
        { status: 200 },
      )
    })
    const u = await assinante('tel-mt-429')
    const res = mockRes()
    await mt(reqMt(u), res)
    expect(res.statusCode).toBe(200)

    const ev = await eventos()
    const trace = ev.find((e) => e.type === 'trace-create')
    expect(trace.body.name).toBe('mt-fala')
    expect(trace.body.metadata).toMatchObject({ plano: 'pro', fallback: true, tentativas: 2, parDeIdiomas: 'en-pt' })
    const gens = ev.filter((e) => e.type === 'generation-create').map((e) => e.body)
    expect(gens.map((g) => g.metadata.provedor)).toEqual(['groq', 'openrouter'])
    expect(gens[0].metadata.status).toBe('429')
    expect(gens[0].level).toBe('WARNING')
    expect(gens[1].usageDetails).toEqual({ input: 100, output: 20, cached_input: 64 })
    const orc = await h.load<any>('../../server/lib/orcamentoDeIa')
    expect(gens[1].costDetails.total).toBeCloseTo(orc.custoDeLlm('openai/gpt-oss-120b', 100, 20), 12)
    expect(gens[1].metadata.esforco).toBe('low')
    expect(JSON.stringify(ev)).not.toContain('secret')

    const contador = await prom.register.getSingleMetricAsString('ia_provedor_limite_total')
    expect(contador).toContain('ia_provedor_limite_total{provedor="groq",modelo="openai/gpt-oss-120b"} 1')
    expect(avisos.filter((l) => l.includes('ia_provedor_limite'))).toHaveLength(1)
  })

  it('o aviso de limite sai NO MÁXIMO uma vez por minuto por provedor; o contador conta todos', async () => {
    metricas.handlerDeMetricas()
    const avisos: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((l: string) => void avisos.push(String(l)))
    const t0 = 1_000_000
    tel.registrarLimiteDoProvedor('groq', 'm', t0)
    tel.registrarLimiteDoProvedor('groq', 'm', t0 + 10_000)
    tel.registrarLimiteDoProvedor('openrouter', 'm', t0 + 10_000)
    tel.registrarLimiteDoProvedor('groq', 'm', t0 + 61_000)
    expect(avisos.filter((l) => l.includes('"provider":"groq"'))).toHaveLength(2)
    expect(avisos.filter((l) => l.includes('"provider":"openrouter"'))).toHaveLength(1)
    const contador = await prom.register.getSingleMetricAsString('ia_provedor_limite_total')
    expect(contador).toContain('ia_provedor_limite_total{provedor="groq",modelo="m"} 3')
  })

  it('cache de tradução: rastro com cacheHit e NENHUMA geração (não custou nada a ninguém)', async () => {
    process.env.LLM_API_KEY = 'k1'
    process.env.LLM_BASE_URL = 'https://api.groq.com/openai/v1'
    process.env.LLM_MODEL = 'openai/gpt-oss-120b'
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200 },
        ),
    )
    const u = await assinante('tel-mt-cache')
    await mt(reqMt(u), mockRes())
    await mt(reqMt(u), mockRes())
    const traces = (await eventos()).filter((e) => e.type === 'trace-create')
    expect(traces).toHaveLength(2)
    expect(traces[1].body.metadata.cacheHit).toBe(true)
    expect(traces[1].body.metadata.tentativas).toBe(0)
  })

  it('telemetria DESLIGADA não muda nada na rota e não grava nada', async () => {
    lf.redefinirLangfuse({ intervaloMs: 0 })
    process.env.LLM_API_KEY = 'k1'
    process.env.LLM_BASE_URL = 'https://api.groq.com/openai/v1'
    process.env.LLM_MODEL = 'openai/gpt-oss-120b'
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200 },
        ),
    )
    const u = await assinante('tel-desligada')
    const res = mockRes()
    await mt(reqMt(u), res)
    expect(res.statusCode).toBe(200)
    expect(await eventos()).toEqual([])
  })
})
