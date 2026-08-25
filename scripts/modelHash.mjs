/**
 * Verificação de integridade dos pesos de modelo (S-09), estilo TOFU (trust-on-first-use).
 *
 * fetch-models.mjs baixava de huggingface.co SEM verificar nada. Aqui: cada arquivo tem seu SHA-256
 * comparado a um manifesto committado (`scripts/models-hashes.json`). Se o hash BATE → ok; se DIVERGE
 * → adulteração/mudança upstream (o build falha); se é NOVO → fixa no manifesto (o operador commita
 * após um download confiável, virando pinning real).
 */
import { createHash } from 'node:crypto'

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * @returns {{ status: 'ok'|'mismatch'|'new', hex: string }}
 */
export function checkModelHash(key, buf, manifest) {
  const hex = sha256(buf)
  const pinned = manifest?.[key]
  if (!pinned) return { status: 'new', hex }
  return { status: pinned === hex ? 'ok' : 'mismatch', hex }
}
