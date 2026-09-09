/**
 * DISJUNTOR E RETENTATIVA NAS CHAMADAS DE IA (Fase 5).
 *
 * O que já existia foi MEDIDO antes de escrever código, e está registrado no topo de
 * `server/ai/disjuntor.ts`: timeout existe (`llmClient.ts:107`), cascata existe
 * (`mtProxy.ts:136`, contrato em `mt-cascata-reserva.test.ts`). O que faltava era memória entre
 * requisições — com o primário fora do ar, CADA tradução pagava os 12 s de timeout dele antes de
 * chegar à reserva.
 *
 * Os contratos presos aqui:
 *  1. cinco falhas seguidas abrem o disjuntor do provedor;
 *  2. a sexta chamada NÃO toca nele — cai direto na reserva, sem socket aberto;
 *  3. passada a janela, uma sondagem é liberada e o sucesso fecha o disjuntor;
 *  4. o 413 (prompt grande demais, conferido antes de qualquer rede) não conta como falha do
 *     provedor;
 *  5. o STT, que NÃO tem cascata, retenta 429/5xx com espera crescente — e não retenta timeout.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  deveRetentar,
  esperaDaRetentativa,
  esquecerDisjuntores,
  estadoDoDisjuntor,
  JANELA_ABERTA_MS,
} from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let mtTranslateProxy: any
let subs: any

const ENVS = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_RESERVA_API_KEY',
  'LLM_RESERVA_BASE_URL',
  'LLM_RESERVA_MODEL',
  'GROQ_API_KEY',
] as const

const BASE_PRIMARIO = 'https://primario-disjuntor.exemplo/v1'
const BASE_RESERVA = 'https://reserva-disjuntor.exemplo/v1'

function mockReq(userId: any, texto = 'hello there'): any {
  return { userId, body: { text: texto, tgt: 'pt', falada: true }, requestId: 'req-disjuntor' }
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
  await subs.upsert(asUserId('disjuntor'), { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) delete process.env[e]
  await h.cleanup()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  /* O disjuntor é estado de PROCESSO, de propósito (ver o módulo). Num arquivo de teste isso vira
     acoplamento entre casos: cinco falhas de um caso abririam o disjuntor do seguinte. */
  esquecerDisjuntores()
})

function configurarCascata() {
  process.env.LLM_API_KEY = 'chave-primaria'
  process.env.LLM_BASE_URL = BASE_PRIMARIO
  process.env.LLM_MODEL = 'modelo-barato'
  process.env.LLM_RESERVA_API_KEY = 'chave-reserva'
  process.env.LLM_RESERVA_BASE_URL = BASE_RESERVA
  process.env.LLM_RESERVA_MODEL = 'modelo-pago'
}

/** O `fetch` falso: o primário responde `statusPrimario`, a reserva sempre entrega. */
function fetchComPrimarioQuebrado(chamadas: string[], statusPrimario = 500) {
  vi.stubGlobal('fetch', async (url: any) => {
    chamadas.push(String(url))
    if (String(url).includes('primario-disjuntor')) {
      return { ok: false, status: statusPrimario, text: async () => 'fora do ar' }
    }
    return respostaOk('a reserva entrega')
  })
}

const U = () => asUserId('disjuntor')

describe('disjuntor por provedor na cascata de tradução', () => {
  it('cinco falhas seguidas abrem; a SEXTA chamada não toca o primário e a reserva serve na hora', async () => {
    configurarCascata()
    const chamadas: string[] = []
    fetchComPrimarioQuebrado(chamadas)

    for (let i = 0; i < 5; i++) {
      const res = mockRes()
      await mtTranslateProxy(mockReq(U()), res)
      expect(res.statusCode, `a reserva atende enquanto o disjuntor não abre (chamada ${i + 1})`).toBe(200)
    }
    // 5 falhas × (primário + reserva) = 10 chamadas de rede.
    expect(chamadas.filter((u) => u.includes('primario-disjuntor'))).toHaveLength(5)
    expect(estadoDoDisjuntor(`${BASE_PRIMARIO}·modelo-barato`)).toBe('aberto')

    chamadas.length = 0
    const res = mockRes()
    await mtTranslateProxy(mockReq(U()), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.text).toBe('a reserva entrega')
    expect(
      chamadas.filter((u) => u.includes('primario-disjuntor')),
      'a sexta chamada não pode nem abrir socket contra o provedor caído',
    ).toHaveLength(0)
    expect(chamadas.filter((u) => u.includes('reserva-disjuntor'))).toHaveLength(1)
  })

  it('passada a janela, uma sondagem é liberada e o sucesso FECHA o disjuntor', async () => {
    configurarCascata()
    const chamadas: string[] = []
    fetchComPrimarioQuebrado(chamadas)
    for (let i = 0; i < 5; i++) await mtTranslateProxy(mockReq(U()), mockRes())
    expect(estadoDoDisjuntor(`${BASE_PRIMARIO}·modelo-barato`)).toBe('aberto')

    /* O relógio anda por `Date.now()`, então mover o relógio é o suficiente — sem `useFakeTimers`,
       que congelaria também os temporizadores internos do cliente do banco usado pela quota. */
    const agora = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(agora + JANELA_ABERTA_MS + 1)
    expect(estadoDoDisjuntor(`${BASE_PRIMARIO}·modelo-barato`)).toBe('meio-aberto')

    // O primário voltou: a sondagem passa por ele e entrega.
    chamadas.length = 0
    vi.stubGlobal('fetch', async (url: any) => {
      chamadas.push(String(url))
      return respostaOk('o primário voltou')
    })
    const res = mockRes()
    await mtTranslateProxy(mockReq(U()), res)
    expect(res.body?.text).toBe('o primário voltou')
    expect(chamadas.filter((u) => u.includes('primario-disjuntor'))).toHaveLength(1)
    expect(estadoDoDisjuntor(`${BASE_PRIMARIO}·modelo-barato`)).toBe('fechado')
  })

  it('a sondagem que FALHA reabre a janela em vez de liberar o tráfego todo', async () => {
    configurarCascata()
    const chamadas: string[] = []
    fetchComPrimarioQuebrado(chamadas)
    for (let i = 0; i < 5; i++) await mtTranslateProxy(mockReq(U()), mockRes())

    const agora = Date.now()
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora + JANELA_ABERTA_MS + 1)
    chamadas.length = 0
    await mtTranslateProxy(mockReq(U()), mockRes()) // a sondagem, que falha de novo
    expect(
      chamadas.filter((u) => u.includes('primario-disjuntor')),
      'só UMA sondagem por janela',
    ).toHaveLength(1)

    chamadas.length = 0
    await mtTranslateProxy(mockReq(U()), mockRes())
    expect(
      chamadas.filter((u) => u.includes('primario-disjuntor')),
      'a janela reabriu',
    ).toHaveLength(0)
    relogio.mockReturnValue(agora + 2 * JANELA_ABERTA_MS + 2)
    expect(estadoDoDisjuntor(`${BASE_PRIMARIO}·modelo-barato`)).toBe('meio-aberto')
  })

  it('413 (prompt grande demais, conferido ANTES da rede) não abre disjuntor de provedor saudável', async () => {
    /* O 413 vem de `llmClient.ts:88`, ANTES de qualquer socket: é o nosso teto de tamanho de
       prompt, não uma falha do provedor. Contá-lo deixaria alguém colando um texto enorme cinco
       vezes tirar do ar, para todos os usuários daquele processo, um provedor que está saudável —
       e a reserva receberia o mesmo prompt e o mesmo 413. */
    const { registrarFalha } = await import('../../server/ai/disjuntor')
    const chave = `${BASE_PRIMARIO}·modelo-barato`
    for (let i = 0; i < 5; i++) registrarFalha(chave, 413)
    expect(estadoDoDisjuntor(chave)).toBe('fechado')

    // A mesma quantidade de falhas DE VERDADE abre — a exceção é do 413, não do contador.
    for (let i = 0; i < 5; i++) registrarFalha(chave, 500)
    expect(estadoDoDisjuntor(chave)).toBe('aberto')
  })
})

describe('política de retentativa', () => {
  it('429 e 5xx repetem; timeout, rede e 4xx não', () => {
    expect(deveRetentar(429)).toBe(true)
    expect(deveRetentar(500)).toBe(true)
    expect(deveRetentar(503)).toBe(true)
    // `status 0` é timeout/rede (llmClient.ts:150): a requisição pode ter sido processada — e
    // cobrada — do outro lado. Repetir seria pagar duas vezes pela mesma transcrição.
    expect(deveRetentar(0)).toBe(false)
    expect(deveRetentar(undefined)).toBe(false)
    expect(deveRetentar(401)).toBe(false)
    expect(deveRetentar(404)).toBe(false)
  })

  it('a espera CRESCE — insistir no mesmo ritmo é o que mantém o provedor no chão', () => {
    expect(esperaDaRetentativa(1)).toBe(500)
    expect(esperaDaRetentativa(2)).toBe(1_500)
    expect(esperaDaRetentativa(2)).toBeGreaterThan(esperaDaRetentativa(1))
  })
})
