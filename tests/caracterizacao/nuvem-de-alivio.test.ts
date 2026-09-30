/**
 * A NUVEM DE ALÍVIO NO SERVIDOR (A10) — por HTTP, no modo público, com a montagem de produção.
 *
 * O Grátis tem 3 h/mês de nuvem para aparelho fraco. O cliente só OFERECE; quem decide é o servidor,
 * POR CONTA, a cada pedido que traz `x-nuvem-alivio: 1`. O que se prova:
 *  - sem o cabeçalho, a conta Grátis continua no 402 de sempre (ninguém gasta a franquia por acaso);
 *  - flag desligada → 503 `alivio_desligado`, e a disponibilidade diz o mesmo;
 *  - ligada: transcrição e tradução passam, e contam nos contadores PRÓPRIOS do alívio (não nos do plano);
 *  - a franquia é por CONTA: segundos e o teto de US$ 0,13 fecham com 402 `quota_exceeded`/`alivio`,
 *    e uma conta esgotada não afeta outra;
 *  - o pool do dia (no máximo 20% do orçamento diário) e a reserva de 80% dos pagantes fecham com 503;
 *  - a capacidade também tem a reserva: a faixa `alivio` só usa os 20% de cima do balde;
 *  - perfil protegido sem o responsável é recusado (403); com o vínculo aceito, passa;
 *  - o pagante não é afetado (cabeçalho ignorado, cota do plano); o convidado segue na regra dele.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

const CHAVES = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'GROQ_LLM_MODEL',
  'GROQ_MODEL',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
  'OPENROUTER_API_KEY',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_MODEL',
  'AI_BUDGET_USD_MONTH',
  'AI_BUDGET_USD_DAY',
  'ALIVIO_POOL_USD_DIA',
  'ALIVIO_TETO_USD_MES',
  'POOL_GRATUITO_PISO_USD_DIA',
  'IA_ADMISSAO_LLM_RPM',
] as const
const salvo: Record<string, string | undefined> = {}

const ALIVIO = { 'x-nuvem-alivio': '1' }

let s: AppDeTeste
let flags: any
let counters: any
let quota: any
let alivio: any
let admissao: any
let cache: any
let gastoDeIa: any
let client: { execute: (q: string) => Promise<unknown> }
let chamadasAoProvedor = 0
let n = 0
const fetchOriginal = globalThis.fetch

const janela = () => new Date().toISOString().slice(0, 7)
const hoje = () => new Date().toISOString().slice(0, 10)
/** Uma frase nova por chamada: o cache de tradução não pode responder no lugar do provedor. */
const frase = () => ({ text: `good morning number ${++n}`, tgt: 'pt' })

/** `AAAA-MM-DD` de alguém com `anos` completos hoje (aniversário há ~40 dias). */
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}

/** WAV PCM 16 kHz mono 16 bits com `segundos` de silêncio. */
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

/** Uma conta adulta declarada (o perfil protegido é o padrão sem data). */
async function adulto(sub: string): Promise<string> {
  const t = await s.token(sub)
  expect((await s.put('/api/me/idade', { nascimento: nascidoHa(30) }, t)).status).toBe(200)
  return t
}

const stt = (token: string, headers: Record<string, string> = ALIVIO) =>
  s.chamar('POST', '/api/ai/stt', { token, raw: wav(1), headers: { 'content-type': 'audio/wav', ...headers } })
const mt = (token: string, headers: Record<string, string> = ALIVIO) =>
  s.chamar('POST', '/api/ai/mt', { token, body: frase(), headers })

async function ligar(ligada: boolean): Promise<void> {
  await flags.definirFlag('nuvem_gratuita_alivio', { habilitada: ligada }, 'teste')
}

beforeAll(async () => {
  for (const k of CHAVES) {
    salvo[k] = process.env[k]
    /* Vazias, não apagadas, as que um .env de desenvolvedor pode trazer (ver ia.test.ts). */
    if (k === 'OPENROUTER_API_KEY' || k === 'LLM_RESERVA_API_KEY') process.env[k] = ''
    else delete process.env[k]
  }
  /* Provedores FALSOS: IP público literal no STT (o anti-SSRF resolve DNS de qualquer nome). */
  process.env.STT_API_KEY = 'chave-stt-falsa'
  process.env.STT_BASE_URL = 'http://203.0.113.20/v1'
  process.env.LLM_API_KEY = 'chave-llm-falsa'
  process.env.LLM_BASE_URL = 'http://203.0.113.21/v1'
  process.env.LLM_MODEL = 'openai/gpt-oss-120b'
  s = await subirApp({ modo: 'publico' })
  flags = await s.load('../../server/lib/flags')
  ;({ usageCountersRepo: counters } = await s.load('../../server/db/repositories/usageCounters'))
  ;({ gastoDeIaRepo: gastoDeIa } = await s.load('../../server/db/repositories/gastoDeIa'))
  ;({ client } = await s.load('../../server/db/db'))
  quota = await s.load('../../server/lib/usageQuota')
  alivio = await s.load('../../server/lib/nuvemDeAlivio')
  admissao = await s.load('../../server/ai/admissao')
  cache = await s.load('../../server/ai/cacheDeTraducao')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input?.url ?? input)
    if (url.startsWith(s.base)) return fetchOriginal(input, init)
    chamadasAoProvedor++
    if (url.includes('/audio/transcriptions'))
      return new Response(JSON.stringify({ text: 'olá mundo', language: 'portuguese', duration: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'bom dia' } }],
        usage: { prompt_tokens: 300, completion_tokens: 60 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await s.encerrar()
  for (const k of CHAVES) {
    if (salvo[k] === undefined) delete process.env[k]
    else process.env[k] = salvo[k]
  }
})
beforeEach(async () => {
  chamadasAoProvedor = 0
  admissao.esquecerAdmissao()
  await cache.esvaziarCacheDeTraducao()
  await ligar(true)
})
afterEach(async () => {
  for (const k of [
    'AI_BUDGET_USD_MONTH',
    'AI_BUDGET_USD_DAY',
    'ALIVIO_POOL_USD_DIA',
    'ALIVIO_TETO_USD_MES',
    'IA_ADMISSAO_LLM_RPM',
  ])
    delete process.env[k]
  /* O pool do dia e o gasto global são do app inteiro: cada caso começa do zero. */
  await client.execute(`DELETE FROM usage_counters WHERE user_id IN ('pool-alivio', 'pool-gratuito')`)
  await gastoDeIa.zerar(hoje())
  await gastoDeIa.zerar(janela())
})

describe('sem a oferta aceita, nada muda', () => {
  it('a conta Grátis sem o cabeçalho continua no 402 do plano, e nada é gasto', async () => {
    const t = await adulto('alivio-sem-cabecalho')
    expect((await mt(t, {})).status).toBe(402)
    expect((await stt(t, {})).status).toBe(402)
    expect(chamadasAoProvedor).toBe(0)
    expect(await counters.get('alivio-sem-cabecalho', quota.METRIC_ALIVIO_CHAMADAS, janela())).toBe(0)
  })
})

describe('flag nuvem_gratuita_alivio', () => {
  it('desligada: 503 alivio_desligado na transcrição, na tradução e na disponibilidade', async () => {
    await ligar(false)
    const t = await adulto('alivio-flag-off')
    const r = await mt(t)
    expect(r.status).toBe(503)
    expect((await r.json()).code).toBe('alivio_desligado')
    const r2 = await stt(t)
    expect(r2.status).toBe(503)
    expect((await r2.json()).code).toBe('alivio_desligado')
    const disp = await s.chamar('GET', '/api/ai/stt/available', { token: t, headers: ALIVIO })
    expect(disp.status).toBe(501)
    expect(await disp.json()).toEqual({ available: false, motivo: 'alivio_desligado' })
    expect(chamadasAoProvedor).toBe(0)
  })
})

describe('ligada: a franquia é da conta, com contadores próprios', () => {
  it('tradução e transcrição passam e contam no ALÍVIO, não no plano; o gasto entra na conta e no pool', async () => {
    const t = await adulto('alivio-ok')
    expect((await mt(t)).status).toBe(200)
    expect((await stt(t)).status).toBe(200)
    expect(chamadasAoProvedor).toBe(2)

    expect(await counters.get('alivio-ok', quota.METRIC_ALIVIO_CHAMADAS, janela())).toBe(2)
    expect(await counters.get('alivio-ok', quota.METRIC_ALIVIO_STT_SEGUNDOS, janela())).toBe(1)
    expect(await counters.get('alivio-ok', quota.METRIC_ALIVIO_TOKENS, janela())).toBe(360)
    expect(await counters.get('alivio-ok', quota.METRIC_MANAGED, janela())).toBe(0)
    expect(await counters.get('alivio-ok', quota.METRIC_STT_SEGUNDOS, janela())).toBe(0)
    expect(await counters.get('alivio-ok', alivio.METRIC_ALIVIO_GASTO_MICRO_USD, janela())).toBeGreaterThan(0)
    expect(await counters.get(alivio.CHAVE_POOL_DO_ALIVIO, 'gasto_micro_usd', hoje())).toBeGreaterThan(0)
  })

  it('a disponibilidade e o /api/me/uso contam a mesma história', async () => {
    const t = await adulto('alivio-uso')
    const disp = await s.chamar('GET', '/api/ai/stt/available', { token: t, headers: ALIVIO })
    expect(disp.status).toBe(200)
    expect(await disp.json()).toEqual({ available: true })

    const uso = await (await s.get('/api/me/uso', t)).json()
    expect(uso.alivio).toMatchObject({
      disponivel: true,
      motivo: null,
      restanteSegundos: 10_800,
      segundosDeAudio: { usado: 0, teto: 10_800 },
      tokensDeLlm: { usado: 0, teto: 540_000 },
    })
  })

  it('segundos esgotados: 402 quota_exceeded com escopo alivio; outra conta não é afetada', async () => {
    const t = await adulto('alivio-cheio')
    await counters.increment('alivio-cheio', quota.METRIC_ALIVIO_STT_SEGUNDOS, janela(), 10_800)
    const r = await stt(t)
    expect(r.status).toBe(402)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ code: 'quota_exceeded', detalhes: { escopo: 'alivio' } })
    expect(r.headers.get('retry-after')).toBeTruthy()
    expect(chamadasAoProvedor).toBe(0)

    const outra = await adulto('alivio-vizinha')
    expect((await stt(outra)).status).toBe(200)
  })

  it('o teto em dólar da conta (US$ 0,13) fecha o alívio, qualquer que seja a mistura', async () => {
    const t = await adulto('alivio-dolar')
    await counters.increment('alivio-dolar', alivio.METRIC_ALIVIO_GASTO_MICRO_USD, janela(), 130_000)
    const r = await mt(t)
    expect(r.status).toBe(402)
    expect((await r.json()).detalhes).toEqual({ escopo: 'alivio' })
    const uso = await (await s.get('/api/me/uso', t)).json()
    expect(uso.alivio).toMatchObject({ disponivel: false, motivo: 'quota_exceeded', restanteSegundos: 0 })
  })

  it('a tradução gasta do mesmo dólar: o "restam" encolhe', async () => {
    const t = await adulto('alivio-restam')
    await counters.increment('alivio-restam', alivio.METRIC_ALIVIO_GASTO_MICRO_USD, janela(), 65_000)
    const uso = await (await s.get('/api/me/uso', t)).json()
    expect(uso.alivio.disponivel).toBe(true)
    expect(uso.alivio.restanteSegundos).toBeLessThan(10_800)
    expect(uso.alivio.restanteSegundos).toBeGreaterThan(5_000)
  })
})

describe('pool do dia e reserva dos pagantes', () => {
  it('pool do dia esgotado → 503 pool_de_alivio_esgotado, com Retry-After até a virada', async () => {
    process.env.ALIVIO_POOL_USD_DIA = '0.001'
    await counters.increment(alivio.CHAVE_POOL_DO_ALIVIO, 'gasto_micro_usd', hoje(), 1_000)
    const r = await stt(await adulto('alivio-pool'))
    expect(r.status).toBe(503)
    expect((await r.json()).code).toBe('pool_de_alivio_esgotado')
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(chamadasAoProvedor).toBe(0)
  })

  it('o pool nunca passa de 20% do orçamento diário, mesmo configurado acima', async () => {
    process.env.AI_BUDGET_USD_DAY = '1'
    process.env.ALIVIO_POOL_USD_DIA = '50'
    expect(alivio.poolDoAlivioDoDiaUsd()).toBeCloseTo(0.2)
    await counters.increment(alivio.CHAVE_POOL_DO_ALIVIO, 'gasto_micro_usd', hoje(), 200_000)
    const r = await mt(await adulto('alivio-pool-20'))
    expect(r.status).toBe(503)
    expect((await r.json()).code).toBe('pool_de_alivio_esgotado')
  })

  it('reserva de 80%: com o gasto do dia a 80% do teto, o alívio fecha — e o pagante segue', async () => {
    process.env.AI_BUDGET_USD_DAY = '1'
    await gastoDeIa.somar(hoje(), 800_000)
    const r = await mt(await adulto('alivio-reserva'))
    expect(r.status).toBe(503)
    expect((await r.json()).code).toBe('pool_de_alivio_esgotado')

    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('pagante-reserva', {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * 86_400_000,
    })
    const pago = await mt(await s.token('pagante-reserva'))
    expect(pago.status).toBe(200)
  })

  it('capacidade: a faixa alivio só usa os 20% de cima do balde; o pagante alcança o resto', async () => {
    expect(admissao.pisoDoPlano('alivio', 0.2)).toBe(0.8)
    expect(admissao.planoDeAdmissao('free', true)).toBe('alivio')
    process.env.IA_ADMISSAO_LLM_RPM = '5'
    const t = await adulto('alivio-balde')
    expect((await mt(t)).status).toBe(200)
    const segunda = await mt(t)
    expect(segunda.status).toBe(429)
    expect((await segunda.json()).code).toBe('nuvem_ocupada')

    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('pagante-balde', {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * 86_400_000,
    })
    expect((await mt(await s.token('pagante-balde'))).status).toBe(200)
  })
})

describe('perfil protegido', () => {
  it('idade não declarada (protegido por padrão) ou 16–17 anos, sem responsável: 403 alivio_exige_responsavel', async () => {
    const semData = await s.token('alivio-sem-data')
    const r = await stt(semData)
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('alivio_exige_responsavel')

    const t17 = await s.token('alivio-17')
    await s.put('/api/me/idade', { nascimento: nascidoHa(17) }, t17)
    const r17 = await mt(t17)
    expect(r17.status).toBe(403)
    expect((await r17.json()).code).toBe('alivio_exige_responsavel')
    const uso = await (await s.get('/api/me/uso', t17)).json()
    expect(uso.alivio).toMatchObject({ disponivel: false, motivo: 'alivio_exige_responsavel' })
    expect(chamadasAoProvedor).toBe(0)
  })

  it('menor com o vínculo do responsável aceito: autorizado', async () => {
    const t = await s.token('alivio-menor-ok')
    await s.put('/api/me/idade', { nascimento: nascidoHa(14) }, t)
    const { vinculosRepo } = await s.load('../../server/db/repositories/vinculos')
    const convite = await vinculosRepo.convidar('alivio-menor-ok', 'resp@exemplo.com')
    expect(
      await vinculosRepo.aceitar(convite.token, {
        responsavelUserId: 'responsavel-1',
        nomeDoResponsavel: 'Responsável',
        consentimento: null,
      }),
    ).toBe(true)
    expect((await stt(t)).status).toBe(200)
  })
})

describe('quem não é afetado', () => {
  it('pagante com o cabeçalho: a cota é a do plano e os contadores do alívio ficam em zero', async () => {
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('pagante-alivio', {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * 86_400_000,
    })
    await ligar(false)
    const t = await s.token('pagante-alivio')
    expect((await stt(t)).status).toBe(200)
    expect(await counters.get('pagante-alivio', quota.METRIC_STT_SEGUNDOS, janela())).toBe(1)
    expect(await counters.get('pagante-alivio', quota.METRIC_ALIVIO_STT_SEGUNDOS, janela())).toBe(0)
    const uso = await (await s.get('/api/me/uso', t)).json()
    expect(uso.alivio).toBeNull()
  })

  it('convidado com o cabeçalho: segue a regra dele (403 exige_conta com a nuvem do convidado desligada)', async () => {
    const r = await stt(await s.token('convidado-alivio', { is_anonymous: true }))
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('exige_conta')
  })

  it('tutor com o cabeçalho: o alívio não se aplica (a regra do plano continua)', async () => {
    const t = await adulto('alivio-tutor')
    const r = await s.chamar('POST', '/api/tutor/chat', {
      token: t,
      body: { messages: [{ role: 'user', content: 'oi' }] },
      headers: ALIVIO,
    })
    const corpo = await r.json()
    expect(corpo.code).not.toBe('alivio_desligado')
    expect(await counters.get('alivio-tutor', quota.METRIC_ALIVIO_CHAMADAS, janela())).toBe(0)
  })
})
