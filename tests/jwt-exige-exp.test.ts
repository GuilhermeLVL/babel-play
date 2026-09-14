/**
 * GAP-021 (auditoria 2026-09-13). O verificador não exigia `exp`: um token sem expiração nunca
 * vencia. Com `requiredClaims: ['exp']`, um token sem `exp` é rejeitado; tokens do Supabase e os de
 * teste sempre trazem `exp`.
 */
import { SignJWT } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'

import { createVerifier } from '../server/lib/auth'

const SEGREDO = 'segredo-de-teste-para-jwt-exp-0001'
const bytes = new TextEncoder().encode(SEGREDO)

async function assina(comExp: boolean): Promise<string> {
  let t = new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setAudience('authenticated').setIssuedAt()
  if (comExp) t = t.setExpirationTime('1h')
  return t.sign(bytes)
}

describe('GAP-021 — JWT exige exp', () => {
  afterEach(() => {
    delete process.env.AUTH_REQUIRED
    delete process.env.SUPABASE_URL
  })

  it('token COM exp é aceito', async () => {
    const verify = createVerifier({ jwtSecret: SEGREDO })
    await expect(verify(await assina(true))).resolves.toBe('user-1')
  })

  it('token SEM exp é rejeitado', async () => {
    const verify = createVerifier({ jwtSecret: SEGREDO })
    await expect(verify(await assina(false))).rejects.toThrow()
  })
})
