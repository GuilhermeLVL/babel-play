/**
 * Guard anti-SSRF (web-foundations/web-security): o proxy encaminha para uma
 * `baseUrl` que o usuário pode cadastrar (provider custom). Antes de chamar,
 * validamos esquema e bloqueamos alvos internos (loopback, IP privado,
 * link-local, metadata 169.254.169.254). Resolve o DNS e checa TODOS os IPs.
 *
 * Nota: a IA local do usuário (Ollama/LM Studio) é chamada pelo CLIENTE, não por
 * este proxy — logo bloquear localhost aqui não a afeta; são caminhos distintos.
 */
import { lookup as lookupComCallback, type LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { Agent } from 'undici'

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal'])

/** IPv4 não roteável na Internet pública. Malformado → bloqueia (fail-closed). */
function isPrivateV4(ip: string): boolean {
  const o = ip.split('.').map(Number)
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b, c] = o
  if (a === 0) return true // "this host"
  if (a === 10) return true // privado
  if (a === 127) return true // loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10 (metadata Alibaba/Oracle)
  if (a === 169 && b === 254) return true // link-local + metadata cloud (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true // privado
  if (a === 192 && b === 0 && c === 0) return true // IETF protocol assignments 192.0.0/24
  if (a === 192 && b === 168) return true // privado
  if (a === 198 && (b === 18 || b === 19)) return true // benchmark 198.18/15
  if (a >= 224) return true // multicast 224/4 + reservado 240/4
  return false
}

/** Dois hextets de 16 bits → IPv4 pontilhado. */
function hextetsParaV4(h1: number, h2: number): string {
  return `${h1 >> 8}.${h1 & 0xff}.${h2 >> 8}.${h2 & 0xff}`
}

/** Expande um IPv6 (com `::` e cauda IPv4 opcional) em 8 hextets numéricos, ou `null`. */
function expandeV6(low: string): number[] | null {
  if (!low.includes(':')) return null
  let s = low
  const cauda = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (cauda) {
    const v4 = cauda[2].split('.').map(Number)
    if (v4.some((o) => o > 255)) return null
    s = `${cauda[1]}${(((v4[0] << 8) | v4[1]) >>> 0).toString(16)}:${(((v4[2] << 8) | v4[3]) >>> 0).toString(16)}`
  }
  const partes = s.split('::')
  if (partes.length > 2) return null
  const head = partes[0] ? partes[0].split(':') : []
  const tail = partes.length === 2 ? (partes[1] ? partes[1].split(':') : []) : null
  let hextets: string[]
  if (tail === null) {
    hextets = head
  } else {
    const faltam = 8 - head.length - tail.length
    if (faltam < 0) return null
    hextets = [...head, ...Array(faltam).fill('0'), ...tail]
  }
  if (hextets.length !== 8) return null
  const nums = hextets.map((h) => parseInt(h || '0', 16))
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null
  return nums
}

/** IPv4 embutido num IPv6 (mapped `::ffff:`, compatible `::`, NAT64 `64:ff9b::`) → IPv4, ou `null`. */
function ipv4Embutido(nums: number[]): string | null {
  const zeros = (ate: number) => nums.slice(0, ate).every((n) => n === 0)
  if (zeros(5) && nums[5] === 0xffff) return hextetsParaV4(nums[6], nums[7]) // ::ffff:0:0/96 (mapped)
  if (nums[0] === 0x64 && nums[1] === 0xff9b && nums.slice(2, 6).every((n) => n === 0)) {
    return hextetsParaV4(nums[6], nums[7]) // 64:ff9b::/96 (NAT64)
  }
  if (zeros(6) && !(nums[6] === 0 && nums[7] <= 1)) return hextetsParaV4(nums[6], nums[7]) // ::a.b.c.d (compatible)
  return null
}

/** `true` se o IP não é destino público seguro para o proxy chamar. */
function isPrivateIp(ip: string): boolean {
  const bare = ip.toLowerCase().replace(/^\[|\]$/g, '')
  const kind = isIP(bare)
  if (kind === 4) return isPrivateV4(bare)
  if (kind === 6) {
    if (bare === '::1' || bare === '::') return true // loopback / unspecified
    if (bare.startsWith('fe80')) return true // link-local
    if (/^f[cd]/.test(bare)) return true // ULA fc00::/7
    const nums = expandeV6(bare)
    if (nums) {
      const v4 = ipv4Embutido(nums)
      if (v4) return isPrivateV4(v4) // IPv4 disfarçado de IPv6 → checa como IPv4
    }
    return false // IPv6 global unicast comum: permitido
  }
  return true // não é IP reconhecível → fail-closed
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

/**
 * `true` quando o erro veio do guard, e não da rede/do provedor.
 *
 * Olha também a `cause`: quando a recusa acontece no `lookup` do socket (`despachanteSeguro`), o
 * `fetch` a embrulha num `TypeError('fetch failed')` e o `DestinoBloqueado` vem um nível abaixo.
 */
export function ehDestinoBloqueado(err: unknown): err is DestinoBloqueado {
  if (err instanceof DestinoBloqueado) return true
  const causa = (err as { cause?: unknown } | null)?.cause
  return causa instanceof DestinoBloqueado
}

type CallbackDeLookup = (
  err: NodeJS.ErrnoException | null,
  endereco: string | LookupAddress[],
  familia?: number,
) => void

/**
 * O `lookup` do SOCKET, que recusa IP interno NA HORA DE CONECTAR (auditoria de segurança
 * 2026-09-26, DNS rebinding).
 *
 * `assertPublicUrl` resolve o nome e confere — e o `fetch` resolvia o nome DE NOVO para conectar.
 * Entre as duas respostas, um domínio com TTL 0 troca o IP público pelo 127.0.0.1, pela rede
 * privada do Fly (`fdaa::/16`, coberta por `fc00::/7`) ou pela porta interna de métricas: a guarda
 * aprova um endereço e a conexão vai para outro. Aqui a conferência e a conexão usam a MESMA
 * resolução, então não há janela entre elas.
 *
 * TODOS os endereços precisam ser públicos, e não só o escolhido: com `autoSelectFamily` o Node
 * tenta a lista inteira, e um nome que devolve um IP público e um privado é, ele mesmo, suspeito.
 */
export function lookupSoPublico(
  hostname: string,
  opcoes: { all?: boolean; family?: number | string },
  callback: CallbackDeLookup,
): void {
  lookupComCallback(
    hostname,
    { ...opcoes, all: true } as never,
    (err: NodeJS.ErrnoException | null, lista: unknown) => {
      if (err) return callback(err, '')
      const enderecos = lista as LookupAddress[]
      if (enderecos.length === 0) return callback(new DestinoBloqueado('host sem endereço'), '')
      if (enderecos.some((e) => isPrivateIp(e.address))) {
        return callback(new DestinoBloqueado('host resolve para IP interno (SSRF)'), '')
      }
      if (opcoes.all) return callback(null, enderecos)
      return callback(null, enderecos[0].address, enderecos[0].family)
    },
  )
}

/**
 * O `dispatcher` de todo `fetch` para URL ESCOLHIDA PELO USUÁRIO (BYOK, teste de provedor, STT com
 * credencial própria, importação de página). Use SEMPRE junto com `assertPublicUrl`: a guarda de
 * nome continua recusando cedo, com mensagem clara, o caso comum (IP literal privado, esquema
 * errado, host bloqueado); o despachante fecha a janela que ela não alcança.
 *
 * Um IP LITERAL não passa pelo `lookup` — e é por isso que a guarda de nome continua obrigatória:
 * é ela que recusa `http://127.0.0.1/` antes de qualquer conexão.
 */
export const despachanteSeguro = new Agent({ connect: { lookup: lookupSoPublico as never } })

/**
 * O `RequestInit` do `fetch` global com o `dispatcher` — o tipo do DOM não o declara, e o `undici`
 * do Node aceita. Usar como `fetch(url, { ..., dispatcher: despachanteSeguro } as InitSeguro)`.
 */
export type InitSeguro = RequestInit & { dispatcher: typeof despachanteSeguro }

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
