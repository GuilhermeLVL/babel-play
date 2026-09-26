/**
 * CASCATA DE TRADUÇÃO COM RESERVA (E2) — o primário barato pode falhar; o assinante não pode sentir.
 *
 * A bancada mediu o `minimax-m3:free` empatando com o pago, mas a camada gratuita é INTERMITENTE
 * (some por janelas inteiras com 429). A cascata é o que permite colher a economia sem apostar a
 * experiência de quem paga na cota de um terceiro. Estes testes prendem os três contratos:
 * reserva serve quando o primário cai; sem reserva o comportamento é o antigo; e a QUOTA é cobrada
 * uma vez só por tradução entregue, nunca por tentativa.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esvaziarCacheDeTraducao } from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let mtTranslateProxy: any
let subs: any
let counters: any

const ENVS = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_MODEL',
  'GROQ_API_KEY',
] as const

function mockReq(userId: any): any {
  return { userId, body: { text: 'hello there', tgt: 'pt', falada: true }, requestId: 'req-teste' }
}
function mockRes(): any {
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
const respostaOk = (texto: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ usageCountersRepo: counters } = (await h.load('../../server/db/repositories/usageCounters')) as any)
  await subs.upsert(asUserId('cascata'), { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) delete process.env[e]
  await h.cleanup()
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const e of ENVS) delete process.env[e]
  /* O disjuntor (Fase 5) conta falhas SEGUIDAS por provedor e o estado é do processo. Estes casos
     encenam falha de propósito; sem zerar, a soma de um caso abriria o disjuntor no seguinte e a
     chamada que ele conta deixaria de sair. O disjuntor tem arquivo próprio
     (`tests/integration/disjuntor-de-ia.test.ts`) — aqui ele não pode ser variável escondida. */
  esquecerDisjuntores()
  /* A admissão de IA (ADR 0007) é estado de processo como o disjuntor: um 429 encenado fecha o
     balde do modelo, e os casos somados passariam do limite por minuto. Zerada entre casos. */
  esquecerAdmissao()
})

function configurarPrimario() {
  process.env.LLM_API_KEY = 'chave-primaria'
  process.env.LLM_BASE_URL = 'https://primario.exemplo/v1'
  process.env.LLM_MODEL = 'modelo-barato'
}
function configurarReserva() {
  process.env.LLM_RESERVA_API_KEY = 'chave-reserva'
  process.env.LLM_RESERVA_BASE_URL = 'https://reserva.exemplo/v1'
  process.env.LLM_RESERVA_MODEL = 'modelo-pago'
}

/* O cache de tradução (Fase 2 do lançamento) é do processo: sem esvaziar, a frase repetida de um
   caso seria servida do cache no seguinte, e o provedor que o caso encena nem seria chamado. */
beforeEach(() => esvaziarCacheDeTraducao())

describe('cascata de MT com reserva', () => {
  it('primário responde → reserva nem é chamada, procedência diz o modelo primário', async () => {
    configurarPrimario()
    configurarReserva()
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => {
      chamadas.push(String(url))
      return respostaOk('olá!')
    })
    const res = mockRes()
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.text).toBe('olá!')
    expect(res.body?.provenance?.origin).toBe('modelo-barato')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toContain('primario.exemplo')
  })

  it('primário em 429 → a reserva serve, e a procedência diz o modelo da RESERVA', async () => {
    configurarPrimario()
    configurarReserva()
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (url: any) => {
      chamadas.push(String(url))
      if (String(url).includes('primario')) return { ok: false, status: 429, text: async () => 'rate limited' }
      return respostaOk('salvo pela reserva')
    })
    const res = mockRes()
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.text).toBe('salvo pela reserva')
    expect(res.body?.provenance?.origin).toBe('modelo-pago')
    expect(chamadas).toHaveLength(2)
  })

  it('primário devolve VAZIO (raciocínio estourou o teto) → a reserva também serve', async () => {
    // O caso medido: HTTP 200 sem conteúdo, sem nenhum erro para ler.
    configurarPrimario()
    configurarReserva()
    vi.stubGlobal('fetch', async (url: any) => {
      if (String(url).includes('primario')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: '' } }],
            usage: { completion_tokens: 1200, completion_tokens_details: { reasoning_tokens: 1197 } },
          }),
        }
      }
      return respostaOk('a reserva entrega')
    })
    const res = mockRes()
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.text).toBe('a reserva entrega')
  })

  it('sem reserva configurada, falha do primário responde 502 — o comportamento antigo', async () => {
    configurarPrimario()
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'fora do ar' }))
    const res = mockRes()
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(502)
  })

  /* FASE 4 (suíte de carga): com o provedor em 429 e sem reserva, o cliente recebia 502
     `provedor_indisponivel` — um ERRO, contado como 5xx no SLO e nos alertas —, enquanto o STT no
     mesmo caso já respondia 429 `nuvem_ocupada` com `Retry-After`. Limite de taxa não é defeito:
     é a mesma degradação desenhada no ADR 0007, e o cliente pausa a nuvem pelo tempo pedido. */
  it('todas as pernas em 429 → 429 nuvem_ocupada com Retry-After (não 502)', async () => {
    configurarPrimario()
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '7' : null) },
      text: async () => 'rate limited',
    }))
    const res = mockRes()
    const cabecalhos: Record<string, string> = {}
    res.setHeader = (k: string, v: string) => (cabecalhos[k.toLowerCase()] = v)
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(429)
    expect(res.body?.code).toBe('nuvem_ocupada')
    expect(res.body?.detalhes).toEqual({ motivo: 'provedor_limitou', retryAfter: 7 })
    expect(cabecalhos['retry-after']).toBe('7')
  })

  it('429 no primário e 500 na reserva continua 502: não foi só limite de taxa', async () => {
    configurarPrimario()
    configurarReserva()
    vi.stubGlobal('fetch', async (url: any) =>
      String(url).includes('primario')
        ? { ok: false, status: 429, text: async () => 'limite' }
        : { ok: false, status: 500, text: async () => 'caiu' },
    )
    const res = mockRes()
    await mtTranslateProxy(mockReq(asUserId('cascata')), res)
    expect(res.statusCode).toBe(502)
  })

  it('QUOTA: uma tradução entregue pela reserva debita UMA chamada, e falha total estorna', async () => {
    configurarPrimario()
    configurarReserva()
    const u = asUserId('cascata-quota')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    const janela = new Date().toISOString().slice(0, 7)

    // Entregue pela reserva: 1 chamada no contador — a tentativa falhada do primário NÃO cobra.
    vi.stubGlobal('fetch', async (url: any) =>
      String(url).includes('primario') ? { ok: false, status: 429, text: async () => 'limite' } : respostaOk('ok'),
    )
    await mtTranslateProxy(mockReq(u), mockRes())
    expect(await counters.get(u, 'managed_calls', janela)).toBe(1)

    // Falha TOTAL (primário e reserva): a reserva de quota é estornada — pagar por nada é o defeito.
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'caiu' }))
    await mtTranslateProxy(mockReq(u), mockRes())
    expect(await counters.get(u, 'managed_calls', janela)).toBe(1)
  })
})
