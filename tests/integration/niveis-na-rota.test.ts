/**
 * B3 (Fase B, 29/09/2026) — O NÍVEL NA ROTA, E O CACHE PELO MODELO QUE DE FATO RESPONDEU.
 *
 * A regra do nível está em `niveis-de-traducao.test.ts`; aqui, que a tradução e o tutor a seguem.
 *
 * A CORREÇÃO DO CACHE. A chave usava o modelo PLANEJADO (`provedores[0].model`) também na GRAVAÇÃO:
 * com o primário fora, a tradução da reserva — outro modelo, às vezes o barato — ficava guardada 30
 * dias sob a chave do caro, e o pagante recebia a do barato como se fosse a que o plano promete. A
 * leitura continua pelo modelo planejado (é o que o plano promete); a gravação vai para a chave de
 * quem escreveu.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

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
const GROQ = {
  id: 'groq',
  formato: 'openai',
  base: 'https://groq.exemplo/openai/v1',
  chave: 'GROQ_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'] }],
}

let h: EphemeralDb
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let tutorChat: (req: any, res: any) => Promise<void>
let cache: typeof import('../../server/ai/cacheDeTraducao')
let versaoDoPrompt: string
let subs: any

const ENVS = [
  'IA_PROVEDORES',
  'DEEPINFRA_API_KEY',
  'GROQ_API_KEY',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_MODEL_GRANDE',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_MODEL',
  'OPENROUTER_API_KEY',
] as const
const PAGANTE = asUserId('nivel-essencial')

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  return r
}
const respostaOk = (texto: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 30, completion_tokens: 5 },
  }),
})

/** Registra o modelo de cada chamada ao provedor; `falha` diz quais modelos respondem 500. */
function provedorFalso(falha: (modelo: string) => boolean) {
  const modelos: string[] = []
  vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
    const modelo = JSON.parse(init.body).model as string
    modelos.push(modelo)
    return falha(modelo) ? { ok: false, status: 500, text: async () => 'fora' } : respostaOk(`tradução de ${modelo}`)
  })
  return modelos
}

function registroNaRota() {
  process.env.IA_PROVEDORES = JSON.stringify({ provedores: [DEEPINFRA, GROQ] })
  process.env.DEEPINFRA_API_KEY = 'chave-deepinfra-falsa'
  process.env.GROQ_API_KEY = 'chave-groq-falsa'
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy, VERSAO_DO_PROMPT: versaoDoPrompt } = await h.load<any>('../../server/ai/mtProxy'))
  ;({ tutorChat } = await h.load<any>('../../server/routes/tutor'))
  cache = await h.load('../../server/ai/cacheDeTraducao')
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  await subs.upsert(PAGANTE, { plan: 'essencial', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  /* '' e não `delete`: o dotenv repõe a variável apagada a partir do .env de quem roda. */
  for (const e of ENVS) process.env[e] = ''
  await cache.esvaziarCacheDeTraducao()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('a tradução segue o nível do plano', () => {
  it('o pagante recebe o modelo da nuance, e a procedência diz qual', async () => {
    registroNaRota()
    const modelos = provedorFalso(() => false)
    const res = mockRes()
    await mtTranslateProxy({ userId: PAGANTE, body: { text: 'good evening', tgt: 'pt' }, requestId: 'r-n1' }, res)
    expect(res.statusCode).toBe(200)
    expect(modelos).toEqual(['openai/gpt-oss-120b'])
    expect(res.body?.provenance?.origin).toBe('openai/gpt-oss-120b')
  })

  it('o tutor do pagante também começa pelo modelo da nuance', async () => {
    registroNaRota()
    const modelos = provedorFalso(() => false)
    const res = mockRes()
    await tutorChat(
      { userId: PAGANTE, body: { messages: [{ role: 'user', content: 'o que é leverage?' }] }, requestId: 'r-t1' },
      res,
    )
    expect(res.body?.text).toBe('tradução de openai/gpt-oss-120b')
    expect(modelos).toEqual(['openai/gpt-oss-120b'])
  })
})

describe('o cache grava sob o modelo que DE FATO respondeu', () => {
  it('a nuance fora do ar: o barato responde, e a tradução dele não vai para a chave da nuance', async () => {
    registroNaRota()
    const modelos = provedorFalso((m) => m === 'openai/gpt-oss-120b')
    const consulta = { texto: 'see you soon', tgt: 'pt', falada: false, versaoDoPrompt }

    const a = mockRes()
    await mtTranslateProxy({ userId: PAGANTE, body: { text: consulta.texto, tgt: 'pt' }, requestId: 'r-n2' }, a)
    expect(a.body?.provenance?.origin).toBe('openai/gpt-oss-20b')
    expect(modelos).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b'])

    // Guardada sob o barato — que é quem de fato a escreveu…
    const doBarato = await cache.lerTraducao({ ...consulta, modelo: 'openai/gpt-oss-20b' })
    expect(doBarato.guardada).toEqual({ texto: 'tradução de openai/gpt-oss-20b', modelo: 'openai/gpt-oss-20b' })
    // …e NÃO sob o da nuance.
    expect((await cache.lerTraducao({ ...consulta, modelo: 'openai/gpt-oss-120b' })).guardada).toBeNull()

    // O próximo pedido do pagante volta a tentar o modelo que o plano promete.
    modelos.length = 0
    const b = mockRes()
    await mtTranslateProxy({ userId: PAGANTE, body: { text: consulta.texto, tgt: 'pt' }, requestId: 'r-n3' }, b)
    expect(b.body?.cache).toBeUndefined()
    expect(modelos[0]).toBe('openai/gpt-oss-120b')
  })

  it('legado: a reserva que respondeu não contamina a chave do primário', async () => {
    process.env.LLM_API_KEY = 'chave-llm'
    process.env.LLM_MODEL = 'modelo-primario'
    process.env.LLM_RESERVA_BASE_URL = 'https://reserva.exemplo/v1'
    process.env.LLM_RESERVA_API_KEY = 'chave-reserva'
    process.env.LLM_RESERVA_MODEL = 'modelo-da-reserva'
    const modelos = provedorFalso((m) => m === 'modelo-primario')
    await mtTranslateProxy({ userId: PAGANTE, body: { text: 'thanks a lot', tgt: 'pt' }, requestId: 'r-l1' }, mockRes())
    modelos.length = 0
    const b = mockRes()
    await mtTranslateProxy({ userId: PAGANTE, body: { text: 'thanks a lot', tgt: 'pt' }, requestId: 'r-l2' }, b)
    expect(modelos[0]).toBe('modelo-primario')
  })

  it('quem respondeu foi o planejado: o acerto seguinte sai do cache, como sempre', async () => {
    registroNaRota()
    const modelos = provedorFalso(() => false)
    await mtTranslateProxy({ userId: PAGANTE, body: { text: 'good luck', tgt: 'pt' }, requestId: 'r-c1' }, mockRes())
    const b = mockRes()
    await mtTranslateProxy({ userId: PAGANTE, body: { text: 'good luck', tgt: 'pt' }, requestId: 'r-c2' }, b)
    expect(b.body?.cache).toBe(true)
    expect(modelos).toHaveLength(1)
  })
})
