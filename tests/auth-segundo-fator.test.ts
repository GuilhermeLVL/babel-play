/**
 * Segunda etapa do login (Fase 6 — 2FA de verdade), lado do cliente.
 *
 * O servidor passou a recusar as rotas sensíveis a quem tem 2FA e sessão `aal1`
 * (`server/lib/aal.ts`). O cliente precisa perceber isso LOGO depois do login e pedir o código,
 * senão a pessoa só descobre o 2FA num 403 no meio de um cancelamento.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { auth } = vi.hoisted(() => ({
  auth: {
    signOut: vi.fn(),
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challenge: vi.fn(), verify: vi.fn() },
  },
}))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth }, authRequired: true, getAccessToken: async () => null }))

import * as svc from '../src/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('precisaDoSegundoFator', () => {
  it('conta com fator e sessão aal1 → precisa', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    expect(await svc.precisaDoSegundoFator()).toBe(true)
  })

  it('sessão já aal2 → não precisa', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
    expect(await svc.precisaDoSegundoFator()).toBe(false)
  })

  it('conta sem fator → não precisa', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    expect(await svc.precisaDoSegundoFator()).toBe(false)
  })

  it('erro do provedor não tranca a pessoa (o servidor continua sendo a barreira)', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('rede'))
    expect(await svc.precisaDoSegundoFator()).toBe(false)
  })
})

describe('verificarSegundoFator', () => {
  it('usa o fator VERIFICADO, desafia e verifica com o código', async () => {
    auth.mfa.listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'pendente', status: 'unverified' },
          { id: 'ativo', status: 'verified' },
        ],
      },
    })
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'desafio-1' }, error: null })
    auth.mfa.verify.mockResolvedValue({ error: null })
    expect(await svc.verificarSegundoFator('123456')).toEqual({ ok: true })
    expect(auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'ativo' })
    expect(auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'ativo', challengeId: 'desafio-1', code: '123456' })
  })

  it('código errado → mensagem genérica', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'ativo', status: 'verified' }] } })
    auth.mfa.challenge.mockResolvedValue({ data: { id: 'd' }, error: null })
    auth.mfa.verify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } })
    expect(await svc.verificarSegundoFator('000000')).toEqual({ ok: false, message: 'Código inválido. Tente de novo.' })
  })

  it('sem fator verificado → não chama o desafio', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { totp: [] } })
    const r = await svc.verificarSegundoFator('123456')
    expect(r.ok).toBe(false)
    expect(auth.mfa.challenge).not.toHaveBeenCalled()
  })
})
