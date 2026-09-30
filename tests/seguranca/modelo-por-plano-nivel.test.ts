/**
 * D1 (Fase D, 30/09/2026) — O NÍVEL QUE O CLIENTE PEDE NUNCA COMPRA O MODELO DE OUTRO PLANO.
 *
 * `POST /api/ai/mt` passou a aceitar `nivel` (`rapida` | `nuance`): a legenda ao vivo vai sem ele (a
 * rápida, o padrão até o dono decidir diferente), e tocar numa frase pede a `nuance`. O corpo é do
 * CLIENTE — qualquer um escreve `"nivel": "nuance"` num `curl`. O que este arquivo prende:
 *
 *   1. quem não tem o entitlement `traducaoNuance` pede a nuance e recebe a RÁPIDA (o modelo barato),
 *      sem erro — a rápida é tradução de verdade, é o Grátis;
 *   2. a decisão lê o ENTITLEMENT, nunca o nome do plano. O caso de prova é um plano PAGO sem a
 *      nuance (o `essencial` com `traducaoNuance: false`, forjado pelo mock): a Fase C está
 *      renomeando os planos agora, e um `plan === 'pro'` escondido viraria, no rename, um furo;
 *   3. quem tem a nuance recebe o modelo dela só quando PEDE (ou com `NUANCE_AO_VIVO=1`): sem
 *      `nivel`, a legenda ao vivo segue no modelo rápido, que é o custo que o plano foi calculado;
 *   4. nível fora do contrato (inclusive `polimento`, que é da rota de polir, D5) é 400, sem chamar
 *      provedor nenhum.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { nivelDaTraducaoPedida } from '../../server/ai/niveis'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { getEntitlements } from '../../server/lib/entitlements'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

/* O PLANO PAGO SEM A NUANCE. Hoje todo plano pago tem `traducaoNuance`; o mock forja o que a matriz
   não tem (ainda), para provar que o servidor decide pelo campo e não pelo nome `essencial`. */
vi.mock('../../server/lib/entitlements', async (original) => {
  const real = await original<typeof import('../../server/lib/entitlements')>()
  return {
    ...real,
    getEntitlements: (plano: Parameters<typeof real.getEntitlements>[0]) => {
      const e = real.getEntitlements(plano)
      return plano === 'essencial' ? { ...e, traducaoNuance: false } : e
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
const RAPIDO = 'openai/gpt-oss-20b'
const NUANCE = 'openai/gpt-oss-120b'

const ENVS = ['IA_PROVEDORES', 'DEEPINFRA_API_KEY', 'LLM_API_KEY', 'OPENROUTER_API_KEY', 'NUANCE_AO_VIVO'] as const
const SEM_NUANCE = asUserId('nivel-pago-sem-nuance')
const COM_NUANCE = asUserId('nivel-pago-com-nuance')

let h: EphemeralDb
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let esvaziarCache: () => Promise<void>
let n = 0

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  return r
}

/** Registra o modelo de cada chamada ao provedor. */
function provedorFalso(): string[] {
  const modelos: string[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const modelo = JSON.parse(init.body).model as string
    modelos.push(modelo)
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `tradução de ${modelo}` } }],
        usage: { prompt_tokens: 30, completion_tokens: 5 },
      }),
    }
  })
  return modelos
}

/** Uma frase nova por chamada: o cache não pode responder no lugar do provedor. */
async function traduzir(userId: string, extra: Record<string, unknown> = {}) {
  const res = mockRes()
  await mtTranslateProxy({ userId, body: { text: `good evening ${++n}`, tgt: 'pt', ...extra }, requestId: 'r' }, res)
  return res
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ esvaziarCacheDeTraducao: esvaziarCache } = await h.load<any>('../../server/ai/cacheDeTraducao'))
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(SEM_NUANCE, { plan: 'essencial', status: 'active' })
  await subscriptionsRepo.upsert(COM_NUANCE, { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
  for (const e of ENVS) process.env[e] = ''
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [DEEPINFRA] })
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  await esvaziarCache()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('quem não tem traducaoNuance é rebaixado para a rápida', () => {
  it('um plano PAGO sem o entitlement pede a nuance e recebe o modelo rápido, sem erro', async () => {
    const modelos = provedorFalso()
    const res = await traduzir(SEM_NUANCE, { nivel: 'nuance' })
    expect(res.statusCode).toBe(200)
    expect(modelos).toEqual([RAPIDO])
    expect(res.body?.provenance?.origin).toBe(RAPIDO)
  })

  it('nem o NUANCE_AO_VIVO=1 leva a nuance a quem não a tem', async () => {
    process.env.NUANCE_AO_VIVO = '1'
    const modelos = provedorFalso()
    await traduzir(SEM_NUANCE)
    await traduzir(SEM_NUANCE, { nivel: 'nuance' })
    expect(modelos).toEqual([RAPIDO, RAPIDO])
  })

  it('a regra pura: Grátis, convidado e a capacidade ausente ficam na rápida, qualquer que seja o pedido', () => {
    for (const plano of ['free', 'convidado'] as const) {
      for (const pedido of [undefined, 'rapida', 'nuance', 'polimento'] as const) {
        expect(
          nivelDaTraducaoPedida(pedido, getEntitlements(plano), { NUANCE_AO_VIVO: '1' }),
          `${plano}/${pedido}`,
        ).toBe('rapida')
      }
    }
    expect(nivelDaTraducaoPedida('nuance', {}, {})).toBe('rapida')
  })
})

describe('quem tem traducaoNuance recebe a nuance quando pede', () => {
  it('pedido explícito (tocar numa frase): o modelo da nuance', async () => {
    const modelos = provedorFalso()
    const res = await traduzir(COM_NUANCE, { nivel: 'nuance' })
    expect(res.statusCode).toBe(200)
    expect(modelos).toEqual([NUANCE])
  })

  it('sem nível (a legenda ao vivo): o modelo rápido — o padrão até o dono decidir diferente', async () => {
    const modelos = provedorFalso()
    await traduzir(COM_NUANCE)
    await traduzir(COM_NUANCE, { nivel: 'rapida' })
    expect(modelos).toEqual([RAPIDO, RAPIDO])
  })

  it('NUANCE_AO_VIVO=1 liga a nuance também na legenda ao vivo', async () => {
    process.env.NUANCE_AO_VIVO = '1'
    const modelos = provedorFalso()
    await traduzir(COM_NUANCE)
    expect(modelos).toEqual([NUANCE])
  })
})

describe('nível fora do contrato da rota', () => {
  it('"polimento" (é da rota de polir, D5) e nomes inventados são 400, sem chamar provedor', async () => {
    const modelos = provedorFalso()
    for (const nivel of ['polimento', 'premium', 'NUANCE', 1]) {
      const res = await traduzir(COM_NUANCE, { nivel })
      expect(res.statusCode, String(nivel)).toBe(400)
    }
    expect(modelos).toEqual([])
  })
})
