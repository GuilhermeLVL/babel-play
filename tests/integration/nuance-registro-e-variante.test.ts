/**
 * D2 (Fase D, 30/09/2026) — FORMAL/INFORMAL E AS VARIANTES (pt-BR/pt-PT, es-419/es-ES) NA ROTA.
 *
 * `POST /api/ai/mt` aceita `registro` (`formal` | `informal`) e `variante`. O que se prova:
 *
 *   1. O SUFIXO VAI DEPOIS DO PREFIXO FIXO. O cache de prompt dos provedores é por prefixo (Groq,
 *      DeepInfra, OpenRouter cobram menos pelos tokens iniciais repetidos): o registro no começo daria
 *      um prefixo novo por registro e o desconto sumiria. O `system` com registro COMEÇA pelo `system`
 *      sem ele, byte a byte;
 *   2. O REGISTRO ENTRA NA CHAVE DO CACHE: a mesma frase em formal, informal e sem registro são três
 *      traduções; a repetida sai do cache;
 *   3. A VERSÃO DO PROMPT NÃO MUDOU: o L2 dura 30 dias, e o D2 não pode jogá-lo fora — sem registro, o
 *      prompt (e a chave) são os de antes;
 *   4. AS VARIANTES SÃO DO PREMIUM (decisão do dono), e o formal/informal também é da Tradução Nuance:
 *      quem não tem `traducaoNuance` manda os dois e recebe o prompt de sempre, na chave de sempre.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { systemComunicativo, systemTextoEscrito } from '../../src/lib/traducao/promptComunicativo'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'

/* A conta paga SEM a Nuance (o mock forja o que a matriz não tem), como em
   `seguranca/modelo-por-plano-nivel`: um interruptor, e não o nome do plano — a regra lê o campo. */
const forja = vi.hoisted(() => ({ semNuance: false }))
vi.mock('../../server/lib/entitlements', async (original) => {
  const real = await original<typeof import('../../server/lib/entitlements')>()
  return {
    ...real,
    getEntitlements: (plano: Parameters<typeof real.getEntitlements>[0]) => {
      const e = real.getEntitlements(plano)
      return forja.semNuance ? { ...e, traducaoNuance: false } : e
    },
  }
})

const ENVS = ['IA_PROVEDORES', 'GROQ_API_KEY', 'LLM_API_KEY', 'OPENROUTER_API_KEY', 'NUANCE_AO_VIVO'] as const
const PREMIUM = asUserId('d2-pagante')

let h: EphemeralDb
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let versaoDoPrompt: string
let esvaziarCache: () => Promise<void>

interface Chamada {
  system: string
  user: string
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  return r
}

function provedorFalso(): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const { messages } = JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> }
    chamadas.push({
      system: messages.find((m) => m.role === 'system')?.content ?? '',
      user: messages.find((m) => m.role === 'user')?.content ?? '',
    })
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `tradução ${chamadas.length}` } }],
        usage: { prompt_tokens: 30, completion_tokens: 5 },
      }),
    }
  })
  return chamadas
}

async function traduzir(userId: string, body: Record<string, unknown>) {
  const res = mockRes()
  await mtTranslateProxy({ userId, body: { tgt: 'pt', ...body }, requestId: 'r-d2' }, res)
  return res
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy, VERSAO_DO_PROMPT: versaoDoPrompt } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ esvaziarCacheDeTraducao: esvaziarCache } = await h.load<any>('../../server/ai/cacheDeTraducao'))
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(PREMIUM, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
  for (const e of ENVS) process.env[e] = ''
  process.env.GROQ_API_KEY = 'chave-groq-falsa'
  await esvaziarCache()
})
afterEach(() => {
  forja.semNuance = false
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('o registro depois do prefixo fixo', () => {
  it('fala formal: o system começa pelo de sempre e termina com o registro', async () => {
    const chamadas = provedorFalso()
    const res = await traduzir(PREMIUM, {
      text: 'hey, what are you up to?',
      src: 'en',
      falada: true,
      registro: 'formal',
    })
    expect(res.statusCode).toBe(200)
    const base = systemComunicativo('pt', 'en')
    expect(chamadas[0].system.startsWith(base)).toBe(true)
    expect(chamadas[0].system.slice(base.length)).toMatch(/FORMAL/)
  })

  it('texto escrito informal: a mesma disciplina', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'Please take a seat.', src: 'en', registro: 'informal' })
    const base = systemTextoEscrito('pt', 'en')
    expect(chamadas[0].system.startsWith(base)).toBe(true)
    expect(chamadas[0].system.slice(base.length)).toMatch(/INFORMAL/)
  })

  it('a versão do prompt é a de antes do D2 — o L2 de 30 dias continua valendo', () => {
    expect(versaoDoPrompt).toBe('635471a621e6c195')
  })
})

describe('o registro na chave do cache', () => {
  it('sem registro, formal e informal: três traduções; a repetida sai do cache', async () => {
    const chamadas = provedorFalso()
    const frase = { text: 'see you later', src: 'en' }
    await traduzir(PREMIUM, frase)
    await traduzir(PREMIUM, { ...frase, registro: 'formal' })
    await traduzir(PREMIUM, { ...frase, registro: 'informal' })
    const repetida = await traduzir(PREMIUM, { ...frase, registro: 'formal' })
    expect(chamadas).toHaveLength(3)
    expect(repetida.body?.cache).toBe(true)
    expect(repetida.body?.text).toBe('tradução 2')
  })

  it('a variante também separa: pt-PT não recebe a tradução de pt', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'good morning', src: 'en' })
    const pt = await traduzir(PREMIUM, { text: 'good morning', src: 'en', variante: 'pt-PT' })
    expect(chamadas).toHaveLength(2)
    expect(pt.body?.cache).toBeUndefined()
  })
})

describe('as variantes da Tradução Nuance', () => {
  it('pt-PT pedido com o destino pt: o prompt diz "português de Portugal"', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'the bus is late', src: 'en', variante: 'pt-PT' })
    expect(chamadas[0].system).toMatch(/Idioma de destino: português de Portugal\./)
  })

  it('o destino já com a região (es-ES) também vale, e a caixa não importa', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'the bus is late', src: 'en', tgt: 'es-es' })
    expect(chamadas[0].system).toMatch(/Idioma de destino: espanhol da Espanha\./)
  })

  it('variante de outro idioma que não o destino é ignorada (pt-PT com destino inglês)', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'o ônibus atrasou', src: 'pt', tgt: 'en', variante: 'pt-PT' })
    expect(chamadas[0].system).toMatch(/Idioma de destino: inglês\./)
  })

  it('variante fora da lista e registro inventado são 400, sem chamar provedor', async () => {
    const chamadas = provedorFalso()
    expect((await traduzir(PREMIUM, { text: 'hi', variante: 'pt-AO' })).statusCode).toBe(400)
    expect((await traduzir(PREMIUM, { text: 'hi', registro: 'solene' })).statusCode).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('sem traducaoNuance: o prompt e a chave de sempre', () => {
  beforeEach(() => {
    forja.semNuance = true
  })

  it('registro e variante pedidos são ignorados; a região do destino não vai ao prompt', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, {
      text: 'thank you so much',
      src: 'en',
      tgt: 'pt-PT',
      registro: 'formal',
      variante: 'pt-PT',
    })
    expect(chamadas[0].system).toBe(systemTextoEscrito('pt', 'en'))
  })

  it('e o pedido com registro cai na MESMA chave do pedido sem ele (um provedor chamado)', async () => {
    const chamadas = provedorFalso()
    await traduzir(PREMIUM, { text: 'good night', src: 'en', registro: 'formal' })
    const segunda = await traduzir(PREMIUM, { text: 'good night', src: 'en' })
    expect(chamadas).toHaveLength(1)
    expect(segunda.body?.cache).toBe(true)
  })
})
