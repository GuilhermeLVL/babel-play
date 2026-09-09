/**
 * `/api/ai/stt/available` responde POR USUÁRIO, não só por configuração.
 *
 * O DEFEITO QUE ISTO PRENDE. A rota respondia "disponível" para qualquer um se houvesse chave no
 * servidor. Um plano sem STT gerenciado (o Essencial é o caso) era roteado para a nuvem pelo
 * `sttRouter` e só descobria o 402 AO ENVIAR ÁUDIO — no meio da captura ao vivo, a pior hora
 * possível. É o espelho do defeito já corrigido no MT (`serverLlmMt.ts:42-44`).
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let aiRouter: any
let subs: any
let creds: any

/** Encontra o handler GET /stt/available dentro do router do Express. */
function handlerDeAvailable(): (req: any, res: any) => Promise<void> {
  const camada = aiRouter.stack.find(
    (l: any) => l.route?.path === '/stt/available' && l.route?.methods?.get
  )
  if (!camada) throw new Error('rota /stt/available não encontrada no router')
  return camada.route.stack[0].handle
}

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.GROQ_API_KEY = 'chave-de-teste' // nuvem CONFIGURADA no servidor
  ;({ aiRouter } = (await h.load('../../server/routes/ai')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ credentialsRepo: creds } = (await h.load('../../server/db/repositories/credentials')) as any)
  await subs.upsert(asUserId('u-pro'), { plan: 'pro', status: 'active' })
  await subs.upsert(asUserId('u-essencial'), { plan: 'essencial', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.GROQ_API_KEY
  await h.cleanup()
})

describe('/stt/available por plano', () => {
  it('pro → disponível', async () => {
    const res = mockRes()
    await handlerDeAvailable()({ userId: asUserId('u-pro') }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.available).toBe(true)
  })

  it('essencial sem BYOK → INDISPONÍVEL, mesmo com chave no servidor', async () => {
    // É o cenário que motivou a correção: sem isto, o Essencial levava 402 no meio da captura.
    const res = mockRes()
    await handlerDeAvailable()({ userId: asUserId('u-essencial') }, res)
    expect(res.statusCode).toBe(501)
    expect(res.body?.available).toBe(false)
  })

  it('free sem BYOK → indisponível', async () => {
    const res = mockRes()
    await handlerDeAvailable()({ userId: asUserId('u-free') }, res)
    expect(res.statusCode).toBe(501)
    expect(res.body?.available).toBe(false)
  })

  it('essencial COM credencial BYOK → disponível (a chave é dele, o custo é dele)', async () => {
    await creds.create(asUserId('u-essencial'), {
      kind: 'groq', label: 'minha chave', baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'whisper-large-v3-turbo', secret: 'sk-do-usuario',
    })
    const res = mockRes()
    await handlerDeAvailable()({ userId: asUserId('u-essencial') }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.available).toBe(true)
  })
})
