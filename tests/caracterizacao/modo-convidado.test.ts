/**
 * MODO CONVIDADO NO SERVIDOR (Fase 7) — por HTTP, no modo público, com a montagem de produção.
 *
 * O convidado é o usuário ANÔNIMO do Supabase: o token traz `is_anonymous: true`. O que se prova:
 *  - o plano dele é `convidado` (e deixa de ser na conversão, com o MESMO id);
 *  - flag `nuvem_convidado` desligada → 403 `exige_conta` na nuvem;
 *  - escrever no servidor fora da nuvem → 403 `exige_conta` (a exclusão do titular não trava);
 *  - limite de criação por IP, teto por IP que sobrevive a um id anônimo novo, pool global do dia,
 *    teto de mensagens de tutor.
 *
 * Cada teste roda num DIA diferente (relógio falso de `server/lib/convidado.ts`): o IP é sempre
 * 127.0.0.1, e os contadores por IP e o limite de criação são diários — sem isso um teste herdaria
 * os convidados do anterior.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

const CHAVES = [
  'LLM_API_KEY',
  'GROQ_API_KEY',
  'STT_API_KEY',
  'OPENROUTER_API_KEY',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_MODEL',
  'CONVIDADOS_POR_IP_DIA',
  'CONVIDADO_IP_USD_DIA',
  'CONVIDADO_IP_TUTOR_DIA',
  'POOL_GRATUITO_PISO_USD_DIA',
  'AI_BUDGET_USD_MONTH',
] as const
const salvo: Record<string, string | undefined> = {}

let s: AppDeTeste
let convidado: any
let flags: any
let counters: any
let admissao: any
let cache: any
let dia = 0
const fetchOriginal = globalThis.fetch

/** Um dia novo por teste, a partir de 2026-10-01 (UTC). */
function novoDia(): number {
  dia++
  const t = Date.UTC(2026, 9, dia, 12, 0, 0)
  convidado._definirRelogio(() => t)
  return t
}

const anonimo = (sub: string) => s.token(sub, { is_anonymous: true })

async function ligarNuvem(ligada: boolean): Promise<void> {
  await flags.definirFlag('nuvem_convidado', { habilitada: ligada }, 'teste')
}

/** Provedor de LLM falso (formato OpenAI) com `usage`, para o custo sair > 0; o resto vai à rede real. */
function provedorFalso(): void {
  process.env.GROQ_API_KEY = 'chave-de-teste'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input?.url ?? input)
    if (url.startsWith(s.base)) return fetchOriginal(input, init)
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'olá' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 1000 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
}

beforeAll(async () => {
  for (const k of CHAVES) {
    salvo[k] = process.env[k]
    if (k === 'OPENROUTER_API_KEY' || k === 'LLM_RESERVA_API_KEY') process.env[k] = ''
    else delete process.env[k]
  }
  s = await subirApp({ modo: 'publico' })
  convidado = await s.load('../../server/lib/convidado')
  flags = await s.load('../../server/lib/flags')
  ;({ usageCountersRepo: counters } = await s.load('../../server/db/repositories/usageCounters'))
  admissao = await s.load('../../server/ai/admissao')
  cache = await s.load('../../server/ai/cacheDeTraducao')
})
afterAll(async () => {
  convidado._definirRelogio(null)
  await s.encerrar()
  for (const k of CHAVES) {
    if (salvo[k] === undefined) delete process.env[k]
    else process.env[k] = salvo[k]
  }
})
beforeEach(async () => {
  novoDia()
  cache.esvaziarCacheDeTraducao()
  await ligarNuvem(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  admissao.esquecerAdmissao()
  delete process.env.GROQ_API_KEY
  delete process.env.CONVIDADOS_POR_IP_DIA
  delete process.env.CONVIDADO_IP_USD_DIA
  delete process.env.POOL_GRATUITO_PISO_USD_DIA
})

describe('identidade e plano', () => {
  it('JWT anônimo → plano convidado; o mesmo id sem `is_anonymous` (conversão) → free', async () => {
    const r = await s.get('/api/me/uso', await anonimo('conv-plano'))
    expect(r.status).toBe(200)
    expect((await r.json()).plano).toBe('convidado')

    const convertido = await s.get('/api/me/uso', await s.token('conv-plano'))
    expect((await convertido.json()).plano).toBe('free')
  })

  it('GET /api/me/entitlements do convidado não cria conta em `users`', async () => {
    const r = await s.get('/api/me/entitlements', await anonimo('conv-sem-users'))
    expect(r.status).toBe(200)
    expect((await r.json()).plan).toBe('convidado')
    const { usersRepo } = await s.load('../../server/db/repositories/users')
    expect(await usersRepo.get('conv-sem-users')).toBeFalsy()
  })
})

describe('flag nuvem_convidado', () => {
  it('desligada: tradução, transcrição e tutor respondem 403 exige_conta', async () => {
    const t = await anonimo('conv-flag-off')
    const mt = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, t)
    expect(mt.status).toBe(403)
    expect((await mt.json()).code).toBe('exige_conta')

    const tutor = await s.post('/api/tutor/chat', { messages: [{ role: 'user', content: 'oi' }] }, t)
    expect(tutor.status).toBe(403)
    expect((await tutor.json()).code).toBe('exige_conta')

    const stt = await s.chamar('POST', '/api/ai/stt', {
      token: t,
      raw: Buffer.alloc(64),
      headers: { 'content-type': 'audio/wav' },
    })
    expect(stt.status).toBe(403)

    const disp = await s.get('/api/ai/stt/available', t)
    expect(disp.status).toBe(501)
  })

  it('ligada: o convidado passa pela porta (sem provedor configurado, 501) e fica registrado', async () => {
    await ligarNuvem(true)
    const r = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await anonimo('conv-flag-on'))
    expect(r.status).toBe(501)
    const { convidadosRepo } = await s.load('../../server/db/repositories/convidados')
    expect(await convidadosRepo.ler('conv-flag-on')).toBeTruthy()
  })

  it('o free logado continua sem nuvem (402 de plano), com a flag ligada ou não', async () => {
    await ligarNuvem(true)
    const r = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await s.token('conta-free'))
    expect(r.status).toBe(402)
  })
})

describe('escrita no servidor exige conta', () => {
  it.each([
    ['POST', '/api/sessions', { title: 'x' }],
    ['PUT', '/api/settings', { ui: {} }],
    ['POST', '/api/vocab/bulk-add', { cards: [] }],
    ['POST', '/api/billing/assinar', { plano: 'pro' }],
    ['POST', '/api/import/texto', { texto: 'x' }],
    ['POST', '/api/metrics/seeds/gastar', { valor: 1 }],
  ])('%s %s → 403 exige_conta', async (metodo, caminho, corpo) => {
    const r = await s.chamar(metodo, caminho, { token: await anonimo('conv-escrita'), body: corpo })
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('exige_conta')
  })

  it('DELETE /api/me (direito do titular) não é barrado pelo modo convidado', async () => {
    const r = await s.chamar('DELETE', '/api/me', {
      token: await anonimo('conv-apagar'),
      body: { confirmar: 'EXCLUIR' },
    })
    const corpo = await r.json().catch(() => ({}))
    expect(corpo.code).not.toBe('exige_conta')
  })

  it('conta de verdade escreve normalmente (o middleware só olha o convidado)', async () => {
    const r = await s.put('/api/settings', { ui: {} }, await s.token('conta-escreve'))
    expect(r.status).not.toBe(403)
  })
})

describe('antiabuso', () => {
  it('limite de criação por IP: o N+1-ésimo convidado do dia recebe 429 limite_de_convidados', async () => {
    await ligarNuvem(true)
    process.env.CONVIDADOS_POR_IP_DIA = '2'
    const corpo = { text: 'good morning', tgt: 'pt' }
    expect((await s.post('/api/ai/mt', corpo, await anonimo('ip-a'))).status).toBe(501)
    expect((await s.post('/api/ai/mt', corpo, await anonimo('ip-b'))).status).toBe(501)
    const terceiro = await s.post('/api/ai/mt', corpo, await anonimo('ip-c'))
    expect(terceiro.status).toBe(429)
    expect((await terceiro.json()).code).toBe('limite_de_convidados')
    // Estável: os dois primeiros continuam aceitos, o terceiro continua recusado.
    expect((await s.post('/api/ai/mt', corpo, await anonimo('ip-a'))).status).toBe(501)
    expect((await s.post('/api/ai/mt', corpo, await anonimo('ip-c'))).status).toBe(429)
  })

  it('teto por IP sobrevive a um id anônimo novo (limpar cookies não reseta)', async () => {
    await ligarNuvem(true)
    process.env.CONVIDADO_IP_USD_DIA = '0.0005'
    provedorFalso()
    const primeiro = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await anonimo('teto-ip-1'))
    expect(primeiro.status).toBe(200)
    const novoId = await s.post('/api/ai/mt', { text: 'good evening', tgt: 'pt' }, await anonimo('teto-ip-2'))
    expect(novoId.status).toBe(402)
    const corpo = await novoId.json()
    expect(corpo.code).toBe('quota_exceeded')
    expect(corpo.detalhes).toMatchObject({ plano: 'convidado', escopo: 'ip' })
  })

  it('teto em US$ do convidado no mês: acima de US$ 0,02 a nuvem dele fecha (402)', async () => {
    await ligarNuvem(true)
    const mes = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 7)
    await counters.increment('teto-usd', convidado.METRIC_GASTO_MICRO_USD, mes, 20_000)
    const r = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await anonimo('teto-usd'))
    expect(r.status).toBe(402)
    expect((await r.json()).detalhes).toMatchObject({ escopo: 'convidado' })
  })

  it('pool global do dia esgotado → 503 pool_gratuito_esgotado', async () => {
    await ligarNuvem(true)
    process.env.POOL_GRATUITO_PISO_USD_DIA = '0.001'
    const hoje = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 10)
    await counters.increment(convidado.CHAVE_POOL, convidado.METRIC_GASTO_MICRO_USD, hoje, 1_000)
    const r = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await anonimo('pool-1'))
    expect(r.status).toBe(503)
    expect((await r.json()).code).toBe('pool_gratuito_esgotado')
  })

  it('reserva dos pagantes: com o orçamento do mês a 80%, a nuvem gratuita fecha', async () => {
    await ligarNuvem(true)
    process.env.AI_BUDGET_USD_MONTH = '1'
    const { gastoDeIaRepo } = await s.load('../../server/db/repositories/gastoDeIa')
    const mes = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 7)
    await gastoDeIaRepo.somar(mes, 800_000)
    try {
      const r = await s.post('/api/ai/mt', { text: 'good morning', tgt: 'pt' }, await anonimo('reserva-1'))
      expect(r.status).toBe(503)
      expect((await r.json()).code).toBe('pool_gratuito_esgotado')
    } finally {
      await gastoDeIaRepo.zerar(mes)
      delete process.env.AI_BUDGET_USD_MONTH
    }
  })

  it('tutor: 5 mensagens por mês; a 6ª é 402 (e a recusa não consome)', async () => {
    await ligarNuvem(true)
    const mes = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 7)
    await counters.increment('tutor-cota', convidado.METRIC_TUTOR_MENSAGENS, mes, 5)
    const r = await s.post(
      '/api/tutor/chat',
      { messages: [{ role: 'user', content: 'oi' }] },
      await anonimo('tutor-cota'),
    )
    expect(r.status).toBe(402)
    const { convidadosRepo } = await s.load('../../server/db/repositories/convidados')
    expect(await convidadosRepo.lerContador('tutor-cota', convidado.METRIC_TUTOR_MENSAGENS, mes)).toBe(5)
  })

  it('tutor sem provedor devolve a mensagem reservada (não conta o que não foi entregue)', async () => {
    await ligarNuvem(true)
    const mes = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 7)
    const r = await s.post(
      '/api/tutor/chat',
      { messages: [{ role: 'user', content: 'oi' }] },
      await anonimo('tutor-estorno'),
    )
    expect(r.status).toBe(200)
    const { convidadosRepo } = await s.load('../../server/db/repositories/convidados')
    expect(await convidadosRepo.lerContador('tutor-estorno', convidado.METRIC_TUTOR_MENSAGENS, mes)).toBe(0)
  })
})

describe('conversão', () => {
  it('mantém o id e os contadores: o gasto do convidado continua na conta convertida', async () => {
    await ligarNuvem(true)
    provedorFalso()
    const r = await s.post('/api/ai/mt', { text: 'good night', tgt: 'pt' }, await anonimo('converte-1'))
    expect(r.status).toBe(200)
    const mes = new Date(Date.UTC(2026, 9, dia)).toISOString().slice(0, 7)
    const { convidadosRepo } = await s.load('../../server/db/repositories/convidados')
    const gasto = await convidadosRepo.lerContador('converte-1', convidado.METRIC_GASTO_MICRO_USD, mes)
    expect(gasto).toBeGreaterThan(0)
    const chamadasAntes = await convidadosRepo.lerContador(
      'converte-1',
      'managed_calls',
      new Date().toISOString().slice(0, 7),
    )

    // Mesmo `sub`, agora sem `is_anonymous`: é conta (free) e o servidor não duplica nada.
    const uso = await (await s.get('/api/me/uso', await s.token('converte-1'))).json()
    expect(uso.plano).toBe('free')
    expect(uso.chamadas.usado).toBe(chamadasAntes)
    expect(await convidadosRepo.lerContador('converte-1', convidado.METRIC_GASTO_MICRO_USD, mes)).toBe(gasto)
  })
})
