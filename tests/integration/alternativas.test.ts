/**
 * D4 (Fase D, 30/09/2026) — `POST /api/ai/mt/alternativas`, as "Outras formas" ao tocar numa frase.
 *
 * Uma função de IA nova (`alternativas` em `FUNCOES_DE_IA`), com o MESMO caminho das outras: plano
 * (a Tradução Nuance, pelo entitlement), portão da nuvem, política de custo, admissão, reserva de cota
 * antes do provedor, cascata, custo registrado. O que se prova:
 *
 *   - com a Nuance: até 3 opções e a nota, pelo modelo do nível `nuance`;
 *   - sem a Nuance (pelo entitlement, qualquer que seja o nome do plano): 402 `exige_nuance`, sem
 *     chamar provedor nem gastar cota;
 *   - a chamada gasta cota (chamada + tokens) e entra no gasto de IA do mês;
 *   - resposta que não é JSON utilizável: 502 `resposta_invalida` — nunca opção inventada —, e o custo
 *     que o provedor cobrou continua registrado;
 *   - todas as pernas em 429: 429 `nuvem_ocupada`, como no `/mt`;
 *   - o glossário da pessoa vai ao prompt como dado, igual ao `/mt`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerGlossarioEmMemoria, normalizarTermo } from '../../server/ai/glossario'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'

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

const DEEPINFRA = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'https://deepinfra.exemplo/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [
    { id: 'openai/gpt-oss-20b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.03, saida: 0.14 } },
    {
      id: 'openai/gpt-oss-120b',
      funcoes: ['traducao', 'tutor'],
      niveis: ['nuance'],
      preco: { entrada: 0.04, saida: 0.2 },
    },
  ],
}
const ENVS = ['IA_PROVEDORES', 'DEEPINFRA_API_KEY', 'LLM_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'] as const
const PAGANTE = asUserId('alternativas-pagante')
const mes = () => new Date().toISOString().slice(0, 7)

let h: EphemeralDb
let alternativasProxy: (req: any, res: any) => Promise<void>
let counters: any
let gasto: any
let glossario: any

interface Chamada {
  modelo: string
  system: string
  user: string
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, headers: {} as Record<string, string> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = (k: string, v: string) => ((r.headers[k.toLowerCase()] = v), r)
  return r
}

function provedor(resposta: (c: Chamada) => { status?: number; texto?: string }): Chamada[] {
  const chamadas: Chamada[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const corpo = JSON.parse(init.body) as { model: string; messages: Array<{ role: string; content: string }> }
    const c = {
      modelo: corpo.model,
      system: corpo.messages.find((m) => m.role === 'system')?.content ?? '',
      user: corpo.messages.find((m) => m.role === 'user')?.content ?? '',
    }
    chamadas.push(c)
    const r = resposta(c)
    if (r.status && r.status !== 200)
      return { ok: false, status: r.status, headers: new Headers(), text: async () => 'limite' }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: r.texto ?? '' } }],
        usage: { prompt_tokens: 120, completion_tokens: 60 },
      }),
    }
  })
  return chamadas
}
const OK = JSON.stringify({ opcoes: ['Até logo', 'A gente se vê', 'Tchau'], nota: 'A primeira é neutra.' })

async function pedir(body: Record<string, unknown>) {
  const res = mockRes()
  await alternativasProxy({ userId: PAGANTE, body: { tgt: 'pt', ...body }, requestId: 'r-alt' }, res)
  return res
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ alternativasProxy } = await h.load<any>('../../server/ai/alternativas'))
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ gastoDeIaRepo: gasto } = await h.load<any>('../../server/db/repositories/gastoDeIa'))
  ;({ glossarioRepo: glossario } = await h.load<any>('../../server/db/repositories/glossario'))
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(PAGANTE, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(() => {
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [DEEPINFRA] })
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  esquecerGlossarioEmMemoria()
})
afterEach(() => {
  forja.semNuance = false
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('com a Tradução Nuance', () => {
  it('até 3 opções e a nota, pelo modelo da nuance; a frase e a atual vão como dado', async () => {
    const chamadas = provedor(() => ({ texto: OK }))
    const res = await pedir({ text: 'see you later', src: 'en', traducaoAtual: 'até mais' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ opcoes: ['Até logo', 'A gente se vê', 'Tchau'], nota: 'A primeira é neutra.' })
    expect(res.body.provenance.origin).toBe('openai/gpt-oss-120b')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].modelo).toBe('openai/gpt-oss-120b')
    expect(chamadas[0].user).toContain('Frase: <<<see you later>>>')
    expect(chamadas[0].user).toContain('Tradução atual: <<<até mais>>>')
  })

  it('gasta cota (chamada + tokens) e entra no gasto de IA do mês', async () => {
    provedor(() => ({ texto: OK }))
    const chamadasAntes = (await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    await pedir({ text: 'good night', src: 'en' })
    expect(await counters.get(PAGANTE, 'managed_calls', mes())).toBe(chamadasAntes + 1)
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBeGreaterThan(gastoAntes)
  })

  it('o registro pedido vai no fim do system; o glossário da pessoa, como dado', async () => {
    await glossario.gravar(
      PAGANTE,
      { origem: 'en', destino: 'pt', termo: 'meetup', termoNorm: normalizarTermo('meetup'), traducao: 'encontro' },
      500,
    )
    const chamadas = provedor(() => ({ texto: OK }))
    await pedir({ text: 'see you at the meetup', src: 'en', registro: 'formal' })
    expect(chamadas[0].system).toMatch(/FORMAL/)
    expect(chamadas[0].user).toContain('{"termo":"meetup","traducao":"encontro"}')
  })

  it('resposta sem JSON utilizável: 502 resposta_invalida, e o custo cobrado fica registrado', async () => {
    provedor(() => ({ texto: 'Desculpe, não consigo.' }))
    const gastoAntes = (await gasto.ler(mes()))?.microUsd ?? 0
    const res = await pedir({ text: 'hello there', src: 'en' })
    expect(res.statusCode).toBe(502)
    expect(res.body?.code).toBe('resposta_invalida')
    expect((await gasto.ler(mes()))?.microUsd ?? 0).toBeGreaterThan(gastoAntes)
  })

  it('todas as pernas em 429: 429 nuvem_ocupada, como no /mt', async () => {
    provedor(() => ({ status: 429 }))
    const res = await pedir({ text: 'hello again', src: 'en' })
    expect(res.statusCode).toBe(429)
    expect(res.body?.code).toBe('nuvem_ocupada')
  })

  it('corpo inválido: 400, sem provedor', async () => {
    const chamadas = provedor(() => ({ texto: OK }))
    expect((await pedir({ text: '' })).statusCode).toBe(400)
    expect((await pedir({ text: 'x'.repeat(501) })).statusCode).toBe(400)
    expect((await pedir({ text: 'hi', registro: 'solene' })).statusCode).toBe(400)
    expect(chamadas).toHaveLength(0)
  })
})

describe('sem a Tradução Nuance', () => {
  it('402 exige_nuance pelo entitlement, sem provedor e sem gastar cota', async () => {
    forja.semNuance = true
    const chamadas = provedor(() => ({ texto: OK }))
    const antes = (await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0
    const res = await pedir({ text: 'see you later', src: 'en' })
    expect(res.statusCode).toBe(402)
    expect(res.body).toMatchObject({ code: 'exige_nuance', entitlement: 'traducaoNuance' })
    expect(chamadas).toHaveLength(0)
    expect((await counters.get(PAGANTE, 'managed_calls', mes())) ?? 0).toBe(antes)
  })
})
