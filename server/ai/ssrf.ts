/**
 * Guard anti-SSRF (web-foundations/web-security): o proxy encaminha para uma
 * `baseUrl` que o usuário pode cadastrar (provider custom). Antes de chamar,
 * validamos esquema e bloqueamos alvos internos (loopback, IP privado,
 * link-local, metadata 169.254.169.254). Resolve o DNS e checa TODOS os IPs.
 *
 * Nota: a IA local do usuário (Ollama/LM Studio) é chamada pelo CLIENTE, não por
 * este proxy — logo bloquear localhost aqui não a afeta; são caminhos distintos.
 */
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal'])

function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 127) return true // "this host" / loopback
    if (a === 10) return true // privado
    if (a === 172 && b >= 16 && b <= 31) return true // privado
    if (a === 192 && b === 168) return true // privado
    if (a === 169 && b === 254) return true // link-local + metadata cloud
    return false
  }
  if (kind === 6) {
    const low = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (low === '::1' || low === '::') return true // loopback / unspecified
    if (low.startsWith('fe80')) return true // link-local
    if (low.startsWith('fc') || low.startsWith('fd')) return true // ULA
    if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7)) // IPv4-mapped
    return false
  }
  return false
}

/** Lança se a URL não for pública/segura para o proxy chamar. */
export async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('URL inválida')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('esquema não permitido (só http/https)')
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) throw new Error('host bloqueado')

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('IP interno bloqueado (SSRF)')
    return
  }
  const resolved = await lookup(host, { all: true })
  for (const r of resolved) {
    if (isPrivateIp(r.address)) throw new Error('host resolve para IP interno (SSRF)')
  }
}
