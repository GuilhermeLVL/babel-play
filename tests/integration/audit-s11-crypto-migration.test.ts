/**
 * REGRESSÃO — S-11/M-05: segredo cifrado com a LEGACY_KEY (que está no código-fonte) não era
 * migrado até o usuário reeditar a credencial. Correção: decryptSecretEx devolve um migratedBlob
 * re-cifrado com a chave atual, e o repo persiste no 1º uso. (server/crypto.ts)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createCipheriv, scryptSync, randomBytes } from 'node:crypto'

// Replica a cifragem LEGADA de crypto.ts (mesma passphrase/salt) para fabricar um blob legado.
const LEGACY = scryptSync('dev-only-insecure-key-change-me', 'babel-play-web:secrets', 32)
function encLegacy(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', LEGACY, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.')
}

let decryptSecretEx: (b: string) => { value: string; migratedBlob: string | null }
let encryptSecret: (p: string) => string

beforeAll(async () => {
  // Chave atual determinística (evita depender do data/secret.key real).
  process.env.SECRET_KEY = 'chave-de-teste-fixa-para-o-S11-abc'
  ;({ decryptSecretEx, encryptSecret } = await import('../../server/crypto'))
})

describe('S-11 — migração de segredo legado', () => {
  it('segredo legado: decifra E sinaliza migratedBlob (re-cifrado com a chave atual)', () => {
    const legacyBlob = encLegacy('sk-segredo-legado')
    const { value, migratedBlob } = decryptSecretEx(legacyBlob)
    expect(value).toBe('sk-segredo-legado')
    expect(migratedBlob).not.toBeNull()

    // idempotente: o blob migrado já está na chave atual → próxima leitura não migra de novo
    const again = decryptSecretEx(migratedBlob!)
    expect(again.value).toBe('sk-segredo-legado')
    expect(again.migratedBlob).toBeNull()
  })

  it('segredo já na chave atual não sinaliza migração', () => {
    const { value, migratedBlob } = decryptSecretEx(encryptSecret('sk-atual'))
    expect(value).toBe('sk-atual')
    expect(migratedBlob).toBeNull()
  })
})
