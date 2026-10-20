/**
 * Guard anti-SSRF (web-foundations/web-security): o proxy encaminha para uma
 * `baseUrl` que o usuário pode cadastrar (provider custom). Antes de chamar,
 * validamos esquema e bloqueamos alvos internos (loopback, IP privado,
 * link-local, metadata 169.254.169.254). Resolve o DNS e checa TODOS os IPs.
 *
 * Nota: a IA local do usuário (Ollama/LM Studio) é chamada pelo CLIENTE, não por
 * este proxy — logo bloquear localhost aqui não a afeta; são caminhos distintos.
 *
 * DOIS RUNTIMES, UMA PORTA (Fase 2): todo `fetch` para destino do usuário passa por `fetchSeguro`.
 * No Node, o nome é resolvido por `node:dns` e o IP é conferido de novo no `lookup` do socket
 * (`despachanteSeguro`, `undici`). No Worker não há nenhum dos dois: o nome é resolvido por
 * DNS-over-HTTPS (`resolverSeguro`) imediatamente antes de conectar. A lista de bloqueio
 * (`isPrivateIp`) e o erro (`DestinoBloqueado`) são os mesmos nos dois. `node:dns` e `undici` são
 * carregados só no Node, na primeira vez que alguém precisa deles — nunca no import.
 */
import type { LookupAddress } from 'node:dns'
import { isIP } from 'node:net'

import type { Agent, Dispatcher } from 'undici'

import { ehWorker } from '../lib/runtime'

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
  /* Lido NA CHAMADA, e não no import: o Worker não tem `node:dns`, e o DNS falso da suíte de carga
     (`scripts/perf/suite/dns-falso.cjs`) troca a propriedade do módulo depois do boot. */
  process
    .getBuiltinModule('node:dns')
    .lookup(hostname, { ...opcoes, all: true } as never, (err: NodeJS.ErrnoException | null, lista: unknown) => {
      if (err) return callback(err, '')
      const enderecos = lista as LookupAddress[]
      if (enderecos.length === 0) return callback(new DestinoBloqueado('host sem endereço'), '')
      if (enderecos.some((e) => isPrivateIp(e.address))) {
        return callback(new DestinoBloqueado('host resolve para IP interno (SSRF)'), '')
      }
      if (opcoes.all) return callback(null, enderecos)
      return callback(null, enderecos[0].address, enderecos[0].family)
    })
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
export const despachanteSeguro = {
  /* O `Agent` nasce no primeiro pedido, não no import: no Worker o `undici` não existe (e nem é usado —
     `fetchSeguro` tira o `dispatcher` lá). O `fetch` do Node só chama `dispatch` no despachante. */
  dispatch: (opcoes: Dispatcher.DispatchOptions, tratador: Dispatcher.DispatchHandler): boolean =>
    agenteSeguro().dispatch(opcoes, tratador),
  close: (): Promise<void> => agente?.close() ?? Promise.resolve(),
  destroy: (): Promise<void> => agente?.destroy() ?? Promise.resolve(),
}

let agente: Agent | undefined

function agenteSeguro(): Agent {
  if (agente) return agente
  /* `require` síncrono, como o `prom-client` em `server/http/metricas.ts`: no ESM (tsx, vitest) vem do
     `createRequire`; no bundle CJS do servidor ele já existe. */
  const exigir: (id: string) => unknown =
    typeof require === 'function'
      ? require
      : (process.getBuiltinModule('node:module').createRequire(`${process.cwd()}/package.json`) as (
          id: string,
        ) => unknown)
  const { Agent: AgenteDoUndici } = exigir('undici') as typeof import('undici')
  agente = new AgenteDoUndici({ connect: { lookup: lookupSoPublico as never } })
  return agente
}

/**
 * O `RequestInit` do `fetch` global com o `dispatcher` — o tipo do DOM não o declara, e o `undici`
 * do Node aceita. Usar como `fetchSeguro(url, { ..., dispatcher: despachanteSeguro } as InitSeguro)`.
 */
export type InitSeguro = RequestInit & { dispatcher: typeof despachanteSeguro }

/* ───────────────────────── Worker: resolução por DNS-over-HTTPS ───────────────────────── */

const DOH = 'https://cloudflare-dns.com/dns-query'
const TIMEOUT_DO_DOH_MS = 5_000
const TTL_DO_DOH_MS = 60_000
const MAX_NO_CACHE_DE_DOH = 512
/** Resoluções públicas por host, deste isolate (no Node fica vazio: lá quem confere é o `lookup`). */
const cacheDeDoh = new Map<string, { ips: string[]; expiraEm: number }>()

/** As respostas de UM tipo (`A` = 1, `AAAA` = 28) para o nome. NXDOMAIN → lista vazia; outra falha lança. */
async function consultarDoh(host: string, tipo: 'A' | 'AAAA'): Promise<string[]> {
  const r = await fetch(`${DOH}?name=${encodeURIComponent(host)}&type=${tipo}`, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(TIMEOUT_DO_DOH_MS),
  })
  if (!r.ok) throw new Error(`resolução DNS falhou (DoH HTTP ${r.status})`)
  const j = (await r.json()) as { Status?: number; Answer?: Array<{ type?: number; data?: unknown }> }
  if (j.Status === 3) return [] // NXDOMAIN
  if (j.Status !== 0) throw new Error(`resolução DNS falhou (DoH status ${String(j.Status)})`)
  const codigo = tipo === 'A' ? 1 : 28
  /* CNAME (5) vem na mesma resposta, antes dos endereços finais: só os endereços contam. */
  return (j.Answer ?? []).filter((a) => a.type === codigo).map((a) => String(a.data))
}

/**
 * Resolve o nome por DoH (A e AAAA) e recusa se QUALQUER endereço for interno — a regra do
 * `lookupSoPublico`, sem `node:dns`. Fail-closed: DoH fora do ar, status de erro ou resposta que não é
 * IP também recusam.
 *
 * JANELA RESIDUAL (documentada em `docs/deploy.md`): o `fetch` do Worker resolve o nome DE NOVO,
 * pelo resolvedor da Cloudflare, e um domínio com TTL 0 pode responder diferente entre as duas
 * consultas — no Worker não há `lookup` de socket para fechar essa janela como no Node. A conferência
 * roda imediatamente antes de cada conexão (`fetchSeguro`, a cada salto de redirect) para a janela
 * ser a menor possível; e a saída do Worker é a rede pública da Cloudflare, sem rede privada nem porta
 * interna do próprio servidor do outro lado.
 *
 * CACHE POR ISOLATE (`cacheDeDoh`): uma resolução bem-sucedida e TODA pública vale `TTL_DO_DOH_MS` (60 s),
 * para a importação não pagar duas consultas DoH a cada salto. Resultado privado, NXDOMAIN e erro nunca
 * são guardados (a próxima chamada consulta de novo); entrada vencida consulta de novo e, se agora for
 * privada, recusa. Isso alarga a janela residual para no máximo 60 s num host que era público na primeira
 * vista — ver `docs/deploy.md`.
 */
async function resolverSeguro(host: string): Promise<string[]> {
  const guardado = cacheDeDoh.get(host)
  if (guardado && guardado.expiraEm > Date.now()) return guardado.ips
  cacheDeDoh.delete(host)
  const [a, aaaa] = await Promise.all([consultarDoh(host, 'A'), consultarDoh(host, 'AAAA')])
  const enderecos = [...a, ...aaaa]
  if (enderecos.length === 0) throw Object.assign(new Error('host não encontrado (DNS)'), { code: 'ENOTFOUND' })
  // Sem o IP na mensagem: o que o chamador precisa saber é que o destino não é permitido.
  if (enderecos.some((e) => isPrivateIp(e))) throw new DestinoBloqueado('host resolve para IP interno (SSRF)')
  /* Só chega aqui o que é todo público. Cheio: sai o mais antigo inserido (o `Map` guarda a ordem). */
  if (cacheDeDoh.size >= MAX_NO_CACHE_DE_DOH) cacheDeDoh.delete(cacheDeDoh.keys().next().value as string)
  cacheDeDoh.set(host, { ips: enderecos, expiraEm: Date.now() + TTL_DO_DOH_MS })
  return enderecos
}

/** Para testes: esvazia o cache de DoH. */
export function esquecerCacheDeDoh(): void {
  cacheDeDoh.clear()
}

/**
 * O `fetch` de TODO destino escolhido pelo usuário (BYOK, teste de provedor, STT e voz com credencial
 * própria, importação de página). Nunca segue redirect: o 3xx volta para quem chamou, e quem segue (a
 * importação de página) chama de novo — cada salto é conferido.
 *
 * - Node: `conferirSemDns` (IP literal, esquema, nome bloqueado) e o `despachanteSeguro`, que confere o IP
 *   do NOME no `lookup` do socket (a resolução conferida é a conectada).
 * - Worker: `assertPublicUrl` (DoH + lista de bloqueio) imediatamente antes de conectar; o `dispatcher`
 *   sai do `init` — o `fetch` do Worker não tem `undici`.
 */
export async function fetchSeguro(url: string, init: RequestInit & { dispatcher?: unknown } = {}): Promise<Response> {
  if (ehWorker()) {
    await assertPublicUrl(url)
    const { dispatcher: _semDespachante, ...semDespachante } = init
    return await fetch(url, { ...semDespachante, redirect: 'manual' })
  }
  /* IP literal, esquema e nome bloqueado ANTES de conectar: o `lookup` do despachante só roda para nome. */
  conferirSemDns(url)
  return await fetch(url, { ...init, redirect: 'manual', dispatcher: despachanteSeguro } as InitSeguro)
}

/**
 * A parte da guarda que NÃO precisa de DNS: URL válida, esquema http(s), host bloqueado pelo nome
 * (`metadata.google.internal`, `localhost` e `*.localhost`) e IP literal interno. Síncrona, para o
 * `fetchSeguro` do Node rodá-la antes de conectar — o `lookup` do socket só confere NOME, e um IP literal
 * (`http://127.0.0.1:9091/`) conectaria direto sem passar por ele.
 *
 * Devolve o NOME a resolver, ou `null` quando o host já é um IP literal público.
 */
function conferirSemDns(raw: string): string | null {
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
  /* RFC 6761: `localhost` e `*.localhost` são loopback por definição. Pelo nome, nos dois runtimes: no
     Worker o DoH público não diria que é loopback. */
  if (/^(.*\.)?localhost\.?$/i.test(host)) throw new DestinoBloqueado('host bloqueado')

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new DestinoBloqueado('IP interno bloqueado (SSRF)')
    return null
  }
  return host
}

/** Lança se a URL não for pública/segura para o proxy chamar. */
export async function assertPublicUrl(raw: string): Promise<void> {
  const host = conferirSemDns(raw)
  if (host === null) return
  if (ehWorker()) {
    await resolverSeguro(host)
    return
  }
  /* Na chamada, não no import: ver `lookupSoPublico`. */
  const resolved = await process.getBuiltinModule('node:dns/promises').lookup(host, { all: true })
  for (const r of resolved) {
    // Sem o IP na mensagem: o que o chamador precisa saber é que o destino não é permitido.
    if (isPrivateIp(r.address)) throw new DestinoBloqueado('host resolve para IP interno (SSRF)')
  }
}
