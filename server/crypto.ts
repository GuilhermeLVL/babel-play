/**
 * Cifra de segredos em repouso (AES-256-GCM) — substitui o `safeStorage`/DPAPI do
 * desktop. Formato do blob: `iv.tag.ciphertext` (base64), tudo junto.
 *
 * ORIGEM DA CHAVE (achado da auditoria — o fallback hardcoded antigo tornava os
 * segredos efetivamente públicos se `SECRET_KEY` faltasse em produção):
 *   1. `SECRET_KEY` no env, quando definida (recomendado em produção; OBRIGATÓRIA lá).
 *   2. Local/dev: chave aleatória gerada na 1ª execução e persistida em `data/secret.key`
 *      (fora do git — `data/` já é ignorado). Estável entre restarts; por máquina.
 *   3. `NODE_ENV=production` sem `SECRET_KEY` → aborta com instrução clara, em vez de
 *      cifrar com chave adivinhável.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const KEY_FILE = path.join(process.cwd(), 'data', 'secret.key')

function resolveRawKey(): string {
  const fromEnv = process.env.SECRET_KEY?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECRET_KEY ausente em produção. Defina a variável de ambiente SECRET_KEY (32+ chars aleatórios) — ' +
      'sem ela os segredos cifrados não podem ser protegidos.',
    )
  }
  try {
    if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, 'utf8').trim()
    mkdirSync(path.dirname(KEY_FILE), { recursive: true })
    const fresh = randomBytes(32).toString('hex')
    writeFileSync(KEY_FILE, fresh, { encoding: 'utf8' })
    console.log('[crypto] chave local de segredos gerada em data/secret.key (1ª execução)')
    return fresh
  } catch (err) {
    throw new Error(`não consegui criar/ler data/secret.key: ${String((err as Error)?.message || err)}`)
  }
}

const KEY = scryptSync(resolveRawKey(), 'babel-play-web:secrets', 32)

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

// Chave do fallback antigo — só para LER segredos cifrados antes desta correção.
// Nunca é usada para cifrar de novo.
const LEGACY_KEY = scryptSync('dev-only-insecure-key-change-me', 'babel-play-web:secrets', 32)

function decryptWith(key: Buffer, ivB: string, tagB: string, encB: string): string {
  // authTagLength explícito (achado Semgrep gcm-no-tag-length): sem ele, um tag truncado
  // de 4 bytes seria aceito, enfraquecendo a autenticação do GCM.
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'), { authTagLength: 16 })
  const tag = Buffer.from(tagB, 'base64')
  if (tag.length !== 16) throw new Error('segredo malformado (tag)')
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Decifra e sinaliza migração (S-11). Se o blob estava cifrado com a `LEGACY_KEY`, devolve também um
 * `migratedBlob` re-cifrado com a KEY atual — o caller (repo) persiste, migrando no PRIMEIRO uso em
 * vez de esperar o usuário reeditar a credencial (o que podia nunca acontecer, deixando o segredo
 * decifrável por quem tivesse o banco, já que a LEGACY_KEY está no código-fonte).
 */
export function decryptSecretEx(blob: string): { value: string; migratedBlob: string | null } {
  const [ivB, tagB, encB] = blob.split('.')
  if (!ivB || !tagB || !encB) throw new Error('segredo malformado')
  try {
    return { value: decryptWith(KEY, ivB, tagB, encB), migratedBlob: null }
  } catch {
    const value = decryptWith(LEGACY_KEY, ivB, tagB, encB)
    return { value, migratedBlob: encryptSecret(value) }
  }
}

export function decryptSecret(blob: string): string {
  return decryptSecretEx(blob).value
}
