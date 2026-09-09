/**
 * CARACTERIZACAO — planos, entitlements e quotas por HTTP, no modo publico (AUTH_REQUIRED=1).
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1). As chaves de IA gerenciada sao
 * REMOVIDAS do ambiente para o arquivo: o que se caracteriza e o servidor sem provedor
 * configurado, que e o estado de qualquer CI — e as respostas mudam com a chave presente.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { PLAN_MATRIX } from '../../src/core/planos'
import { type AppDeTeste,resposta, subirApp } from './_app'

const CHAVES_DE_IA = ['LLM_API_KEY', 'GROQ_API_KEY', 'STT_API_KEY', 'PRO_MONTHLY_MANAGED_CALLS'] as const
const salvo: Partial<Record<(typeof CHAVES_DE_IA)[number], string | undefined>> = {}

const CORPO_MT = { text: 'good morning', tgt: 'pt' }

describe('planos e quotas (modo publico)', () => {
  let s: AppDeTeste
  let tokenA: string
  let tokenB: string
  const A = 'usuario-free'
  const B = 'usuario-livre'

  beforeAll(async () => {
    for (const k of CHAVES_DE_IA) { salvo[k] = process.env[k]; delete process.env[k] }
    s = await subirApp({ modo: 'publico' })
    tokenA = await s.token(A)
    tokenB = await s.token(B)
  })
  afterAll(async () => {
    await s.encerrar()
    for (const k of CHAVES_DE_IA) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k] }
  })

  it('GET /api/me/entitlements de conta nova: plano free com a forma conhecida', async () => {
    const r = await s.get('/api/me/entitlements', tokenA)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ plan: 'free', ...PLAN_MATRIX.free.entitlements })
    expect(corpo.armazenamento).toEqual({ usados: 0, teto: PLAN_MATRIX.free.quotas.armazenamentoMb! * 1024 * 1024 })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.me.entitlements.json')
  })

  it('GET /api/me/uso de conta free: tetos da matriz, tudo zerado', async () => {
    const r = await s.get('/api/me/uso', tokenA)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({
      plano: 'free',
      chamadas: { usado: 0, teto: PLAN_MATRIX.free.quotas.chamadasMes },
      segundosDeAudio: { usado: 0, teto: PLAN_MATRIX.free.quotas.sttSegundosMes },
      tokensDeLlm: { usado: 0, teto: null },
    })
    expect(corpo.janela).toMatch(/^\d{4}-\d{2}$/)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.me.uso.json')
  })

  it('free: POST /api/ai/mt e 402 pelo entitlement, antes de qualquer provedor', async () => {
    const r = await s.post('/api/ai/mt', CORPO_MT, tokenA)
    expect(r.status).toBe(402)
    // caracterizacao: comportamento atual — a recusa por plano nao usa o envelope `code`; traz
    // `entitlement` solto no topo, diferente do 402 de quota que usa `code: 'quota_exceeded'`
    expect(await r.clone().json()).toEqual({ error: 'tradução por IA gerenciada requer plano Pro', entitlement: 'managedCloudLlm' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.ai.mt.402.json')
  })

  it('free: GET /api/ai/stt/available sem chave no servidor e 501 available=false', async () => {
    const r = await s.get('/api/ai/stt/available', tokenA)
    expect(r.status).toBe(501)
    expect(await r.clone().json()).toEqual({ available: false })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.ai.stt.available.json')
  })

  it('settings.ui.plan="pro" gravado pelo cliente NAO muda os entitlements', async () => {
    const put = await s.put('/api/settings', { ui: { plan: 'pro' } }, tokenB)
    expect(put.status).toBe(200)
    // caracterizacao: `ui` volta como a STRING JSON da coluna (ver tema-e-posse.test.ts)
    expect(JSON.parse(String((await put.json()).ui))).toMatchObject({ plan: 'pro' })
    const ent = await (await s.get('/api/me/entitlements', tokenB)).json()
    expect(ent.plan).toBe('free')
    expect(ent.managedCloudLlm).toBe(false)
    expect((await (await s.get('/api/me/uso', tokenB)).json()).plano).toBe('free')
  })

  it('assinatura pro ativa em `subscriptions` muda os entitlements e o uso', async () => {
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await subscriptionsRepo.upsert(asUserId(A), { plan: 'pro', status: 'active', currentPeriodEnd: Date.now() + 30 * 86_400_000 })

    const ent = await (await s.get('/api/me/entitlements', tokenA)).json()
    expect(ent).toMatchObject({ plan: 'pro', managedCloudLlm: true, managedCloudStt: true, youtubeImport: true, largerModels: true })
    expect(ent.armazenamento.teto).toBe(PLAN_MATRIX.pro.quotas.armazenamentoMb! * 1024 * 1024)

    const uso = await (await s.get('/api/me/uso', tokenA)).json()
    expect(uso).toMatchObject({ plano: 'pro', chamadas: { usado: 0, teto: PLAN_MATRIX.pro.quotas.chamadasMes } })
  })

  it('pro: GET /api/ai/stt/available continua 501 sem chave no servidor', async () => {
    // caracterizacao: comportamento atual — sem LLM_API_KEY/GROQ_API_KEY/STT_API_KEY o plano nao
    // importa; a resposta e a mesma do free (501, available=false)
    const r = await s.get('/api/ai/stt/available', tokenA)
    expect(r.status).toBe(501)
    expect(await r.json()).toEqual({ available: false })
  })

  it('pro sem provedor configurado: POST /api/ai/mt e 501, e nao consome quota', async () => {
    const r = await s.post('/api/ai/mt', CORPO_MT, tokenA)
    expect(r.status).toBe(501)
    expect(await r.clone().json()).toEqual({ error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.ai.mt.501.json')
    expect((await (await s.get('/api/me/uso', tokenA)).json()).chamadas.usado).toBe(0)
  })

  it('teto mensal de chamadas: no cap, reserveManagedCall recusa; abaixo dele, reserva e conta', async () => {
    const { usageCountersRepo } = await s.load('../../server/db/repositories/usageCounters')
    const { reserveManagedCall, capForPlan, METRIC_MANAGED } = await s.load('../../server/lib/usageQuota')
    const { asUserId } = await s.load('../../server/lib/authContext')
    const U = asUserId(A)
    const janela = new Date().toISOString().slice(0, 7)
    const cap = capForPlan('pro')
    expect(cap).toBe(PLAN_MATRIX.pro.quotas.chamadasMes)

    expect(await reserveManagedCall(U)).toBe(true)
    expect((await (await s.get('/api/me/uso', tokenA)).json()).chamadas.usado).toBe(1)

    await usageCountersRepo.increment(U, METRIC_MANAGED, janela, cap - 1) // contador = cap
    expect(await usageCountersRepo.get(U, METRIC_MANAGED, janela)).toBe(cap)
    expect(await reserveManagedCall(U)).toBe(false)
    expect(await usageCountersRepo.get(U, METRIC_MANAGED, janela)).toBe(cap)

    const uso = await (await s.get('/api/me/uso', tokenA)).json()
    expect(uso.chamadas).toEqual({ usado: cap, teto: cap })

    // caracterizacao: comportamento atual — por HTTP, sem provedor configurado, o 501 vem ANTES
    // da reserva (mtProxy confere a configuracao antes da quota), entao o cap nunca vira 402 aqui
    const r = await s.post('/api/ai/mt', CORPO_MT, tokenA)
    expect(r.status).toBe(501)
  })

  it('free: o teto e zero e a reserva recusa mesmo com contador zerado', async () => {
    const { reserveManagedCall, capForPlan } = await s.load('../../server/lib/usageQuota')
    const { asUserId } = await s.load('../../server/lib/authContext')
    expect(capForPlan('free')).toBe(0)
    expect(await reserveManagedCall(asUserId(B))).toBe(false)
  })

  it('assinatura cancelada volta a free; past_due com periodo vigente ainda concede', async () => {
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await subscriptionsRepo.upsert(asUserId(A), { status: 'past_due', currentPeriodEnd: Date.now() + 86_400_000 })
    expect((await (await s.get('/api/me/entitlements', tokenA)).json()).plan).toBe('pro')
    await subscriptionsRepo.upsert(asUserId(A), { status: 'canceled' })
    expect((await (await s.get('/api/me/entitlements', tokenA)).json()).plan).toBe('free')
  })
})
