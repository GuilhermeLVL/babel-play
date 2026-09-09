/**
 * Guard anti-SSRF (web-foundations/web-security): o proxy encaminha para uma
 * `baseUrl` que o usuário pode cadastrar (provider custom). Antes de chamar,
 * validamos esquema e bloqueamos alvos internos (loopback, IP privado,
 * link-local, metadata 169.254.169.254). Resolve o DNS e checa TODOS os IPs.
 *
 * Nota: a IA local do usuário (Ollama/LM Studio) é chamada pelo CLIENTE, não por
 * este proxy — logo bloquear localhost aqui não a afeta; são caminhos distintos.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

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

/**
 * A RECUSA DO GUARD PRECISA SER RECONHECÍVEL — achado da Fase 4.
 *
 * O guard só lançava `Error` genérico, e quem chamava não tinha como distingui-lo de uma falha de
 * rede. Em `/api/ai/providers/test` a consequência era medida: a recusa por SSRF saía como HTTP
 * **200** com `{ ok: false, message: 'erro interno' }`, porque `erroDeRota` trocava a causa pela
 * mensagem genérica e o status de sucesso apagava o resto. Quem cadastrou a URL não ficava sabendo
 * que foi o guard que barrou, e um monitor não conseguia contar recusas de destino.
 *
 * Com uma classe própria, a rota decide: destino bloqueado é 400 com `code`, o resto continua
 * genérico. A MENSAGEM segue sem o IP resolvido de propósito — dizer "resolve para 10.0.0.7"
 * transformaria o guard num scanner de rede interna para quem está do outro lado.
 */
export class DestinoBloqueado extends Error {
  /** O `code` do envelope de erro (`server/lib/respostaDeErro.ts`). */
  readonly code = 'destino_bloqueado'
  constructor(motivo: string) {
    super(motivo)
    this.name = 'DestinoBloqueado'
  }
}

/** `true` quando o erro veio do guard, e não da rede/do provedor. */
export function ehDestinoBloqueado(err: unknown): err is DestinoBloqueado {
  return err instanceof DestinoBloqueado
}

/** Lança se a URL não for pública/segura para o proxy chamar. */
export async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new DestinoBloqueado('URL inválida')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new DestinoBloqueado('esquema não permitido (só http/https)')
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) throw new DestinoBloqueado('host bloqueado')

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new DestinoBloqueado('IP interno bloqueado (SSRF)')
    return
  }
  const resolved = await lookup(host, { all: true })
  for (const r of resolved) {
    // Sem o IP na mensagem: o que o chamador precisa saber é que o destino não é permitido.
    if (isPrivateIp(r.address)) throw new DestinoBloqueado('host resolve para IP interno (SSRF)')
  }
}
