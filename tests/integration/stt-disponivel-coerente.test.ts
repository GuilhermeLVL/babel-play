/**
 * B0 (Fase B, 29/09/2026) — AS DUAS ROTAS DO STT DIZEM A MESMA COISA.
 *
 * O DEFEITO, REPRODUZIDO AQUI. `GET /api/ai/stt/available` lia a configuração por
 * `sttDeNuvemConfigurado` (`LLM_API_KEY || GROQ_API_KEY || STT_API_KEY`), e a porta da transcrição
 * (`portaDoStt`, antes do `raw()`) lia por um `sttGerenciado` próprio (`GROQ_API_KEY ?? STT_API_KEY`).
 * Duas leituras do mesmo fato, e elas discordavam em dois casos que acontecem de verdade:
 *
 *   1. o `.env.production.example` configura SÓ `LLM_API_KEY` (com a base da Groq) — a
 *      disponibilidade respondia 200, o roteador do cliente mandava o áudio para a nuvem, e TODA
 *      transcrição voltava 501. Em produção, o STT de nuvem estava desligado sem ninguém saber;
 *   2. `GROQ_API_KEY=` vazia (o jeito que os testes e muitos `.env` "desligam" a variável) com
 *      `STT_API_KEY` definida: o `??` tomava a string vazia como chave e a porta respondia 501.
 *
 * O contrato que este arquivo prende é o que vale para qualquer ambiente: a disponibilidade
 * responde 200 SE E SÓ SE a porta deixa a transcrição seguir (em vez de 501).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let aiRouter: any
let portaDoStt: any
let subs: any

/** As variáveis que decidem o STT gerenciado. Vazias (e não apagadas): o dotenv não as repõe. */
const VARIAVEIS_DO_STT = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'GROQ_API_KEY',
  'GROQ_BASE_URL',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
] as const

function handlerDeAvailable(): (req: any, res: any) => Promise<void> {
  const camada = aiRouter.stack.find((l: any) => l.route?.path === '/stt/available' && l.route?.methods?.get)
  if (!camada) throw new Error('rota /stt/available não encontrada no router')
  return camada.route.stack[0].handle
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false, fechar: [] as Array<() => void> }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  r.on = (ev: string, fn: () => void) => {
    if (ev === 'close') r.fechar.push(fn)
    return r
  }
  return r
}

function configurar(env: Partial<Record<(typeof VARIAVEIS_DO_STT)[number], string>>) {
  for (const n of VARIAVEIS_DO_STT) process.env[n] = env[n] ?? ''
}

/** O que cada rota decidiu para o MESMO ambiente e o MESMO usuário. */
async function asDuasRotas(userId: string): Promise<{ disponivel: number; portaSeguiu: boolean; portaStatus: number }> {
  const disp = mockRes()
  await handlerDeAvailable()({ userId }, disp)

  const res = mockRes()
  let seguiu = false
  const req = { userId, header: () => undefined, path: '/stt', requestId: 'r-coerencia' }
  await portaDoStt(req, res, () => {
    seguiu = true
  })
  for (const f of res.fechar) f() // solta a vaga em voo, como o `close` da resposta real
  return { disponivel: disp.statusCode, portaSeguiu: seguiu, portaStatus: res.statusCode }
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ aiRouter } = await h.load<any>('../../server/routes/ai'))
  ;({ portaDoStt } = await h.load<any>('../../server/ai/sttProxy'))
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  await subs.upsert(asUserId('u-pro-coerente'), { plan: 'pro', status: 'active' })
})
afterEach(() => {
  esquecerAdmissao()
  configurar({})
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  configurar({})
  await h.cleanup()
})

describe('B0 — /stt/available e a porta da transcrição concordam', () => {
  it('só LLM_API_KEY com a base da Groq (o .env.production.example): as duas dizem que HÁ STT', async () => {
    configurar({ LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'https://api.groq.com/openai/v1' })
    const r = await asDuasRotas('u-pro-coerente')
    expect(r.disponivel).toBe(200)
    // Antes: 501 "STT de nuvem não configurado" — com a disponibilidade dizendo 200.
    expect(r.portaStatus).not.toBe(501)
    expect(r.portaSeguiu).toBe(true)
  })

  it('GROQ_API_KEY vazia com STT_API_KEY: as duas dizem que HÁ STT', async () => {
    configurar({ GROQ_API_KEY: '', STT_API_KEY: 'chave-stt-falsa', STT_BASE_URL: 'http://203.0.113.20/v1' })
    const r = await asDuasRotas('u-pro-coerente')
    expect(r.disponivel).toBe(200)
    expect(r.portaSeguiu).toBe(true)
  })

  it('chave de um LLM que não é a Groq: as duas dizem que NÃO há STT (501 e 501)', async () => {
    configurar({ LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'http://llm-falso.local/v1' })
    const r = await asDuasRotas('u-pro-coerente')
    expect(r.disponivel).toBe(501)
    expect(r.portaSeguiu).toBe(false)
    expect(r.portaStatus).toBe(501)
  })

  it('em toda a matriz: disponível (200) ⇔ a porta deixa seguir', async () => {
    const matriz: Array<Partial<Record<(typeof VARIAVEIS_DO_STT)[number], string>>> = [
      {},
      { GROQ_API_KEY: 'chave-groq-falsa' },
      { STT_API_KEY: 'chave-stt-falsa' },
      { GROQ_API_KEY: '', STT_API_KEY: 'chave-stt-falsa' },
      { LLM_API_KEY: 'chave-llm-falsa' },
      { LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'https://api.groq.com/openai/v1' },
      { LLM_API_KEY: 'chave-llm-falsa', LLM_BASE_URL: 'https://openrouter.ai/api/v1' },
    ]
    for (const env of matriz) {
      configurar(env)
      const r = await asDuasRotas('u-pro-coerente')
      expect(r.disponivel === 200, JSON.stringify(env)).toBe(r.portaSeguiu)
      esquecerAdmissao()
    }
  })
})
