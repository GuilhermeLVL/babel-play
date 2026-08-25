/**
 * SaaS Fatia 1a — o módulo de entitlements SERVER-SIDE é a autoridade do plano. Cobre a ordem de
 * resolução: subscriptions (autoritativa) → settings.ui.plan (fallback) → default por modo
 * (público=free, local=selfhost), e a derivação dos entitlements por tier.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let ent: any
let subs: any
let settingsRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ent = await h.load('../../server/lib/entitlements')
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
  ;({ settingsRepo } = await h.load('../../server/db/repositories/settings'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => { delete process.env.AUTH_REQUIRED })

describe('SaaS Fatia 1a — entitlements server-side', () => {
  it('default por modo: local (AUTH_REQUIRED=0) → selfhost, tudo liberado', async () => {
    process.env.AUTH_REQUIRED = '0'
    const u = asUserId('u-local')
    expect(await ent.getPlanForUser(u)).toBe('selfhost')
    const e = await ent.getEntitlementsForUser(u)
    expect(e).toMatchObject({ managedCloudStt: true, managedCloudLlm: true, youtubeImport: true })
  })

  it('default por modo: público (AUTH_REQUIRED=1) sem assinatura → free, tudo bloqueado', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('u-public-novo')
    expect(await ent.getPlanForUser(u)).toBe('free')
    const e = await ent.getEntitlementsForUser(u)
    expect(e).toMatchObject({ managedCloudStt: false, managedCloudLlm: false, youtubeImport: false })
  })

  it('anti-escalada (público): settings.ui.plan=pro sem assinatura é IGNORADO → free', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('u-settings-pro')
    await settingsRepo.update(u, { ui: { plan: 'pro' } })
    // O blob settings.ui é gravável pelo cliente (PUT /api/settings) → NÃO pode conceder plano (A01).
    expect(await ent.getPlanForUser(u)).toBe('free')
    expect((await ent.getEntitlementsForUser(u)).managedCloudLlm).toBe(false)
  })

  it('assinatura ativa é autoritativa: pro → pro', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('u-sub-pro')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    expect(await ent.getPlanForUser(u)).toBe('pro')
  })

  it('assinatura cancelada → free, mesmo com settings.ui.plan=pro (sub manda)', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('u-sub-cancel')
    await settingsRepo.update(u, { ui: { plan: 'pro' } })
    await subs.upsert(u, { plan: 'pro', status: 'canceled' })
    expect(await ent.getPlanForUser(u)).toBe('free')
  })

  it('past_due dentro da graça → mantém o plano; graça expirada → free', async () => {
    process.env.AUTH_REQUIRED = '1'
    const uGraca = asUserId('u-graca')
    await subs.upsert(uGraca, { plan: 'pro', status: 'past_due', currentPeriodEnd: Date.now() + 60_000 })
    expect(await ent.getPlanForUser(uGraca)).toBe('pro')

    const uExpirado = asUserId('u-expirado')
    await subs.upsert(uExpirado, { plan: 'pro', status: 'past_due', currentPeriodEnd: Date.now() - 60_000 })
    expect(await ent.getPlanForUser(uExpirado)).toBe('free')
  })
})
