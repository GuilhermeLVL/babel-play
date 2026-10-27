/**
 * A REDE DOS SCRIPTS DE LIVROS, educada de propósito: o catálogo é montado por uma pessoa, uma vez, e quem
 * nos serve (Gutendex, Standard Ebooks, Wikisource, Wikidata, o espelho do Gutenberg) é gente que mantém
 * serviço público de graça.
 *
 *   · User-Agent identificado (nome, versão, repositório), como pedem a Wikimedia e o Gutenberg;
 *   · uma requisição por vez por host, com intervalo mínimo entre elas (1,2 s; 2 s no espelho e no SE);
 *   · 429 e 5xx: espera o `Retry-After` (ou 5, 15, 45 s) e tenta de novo até 3 vezes;
 *   · CACHE EM DISCO (`data/livros-cache/`, fora do git): rodar de novo não baixa de novo;
 *   · nunca `gutenberg.org`: metadado vem do Gutendex, texto vem do espelho (`gutenberg.pglaf.org`).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TextDecoder } from 'node:util'

export const USER_AGENT =
  'FrasyCatalogo/1.0 (montagem manual do catálogo de livros; +https://github.com/GuilhermeLVL/babel-play)'

const INTERVALO_POR_HOST = {
  'gutenberg.pglaf.org': 2000,
  'mirrors.xmission.com': 2000,
  'standardebooks.org': 2000,
  'gutendex.com': 1200,
  'query.wikidata.org': 1500,
}
const INTERVALO_PADRAO = 1200

const ultimoPedido = new Map()
const fila = new Map()

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/** Hosts que o script nunca toca (a política de robôs do Gutenberg: só por espelho). */
const PROIBIDOS = [/(^|\.)gutenberg\.org$/i]

let dirDoCache = null
export function usarCache(dir) {
  mkdirSync(dir, { recursive: true })
  dirDoCache = dir
}

function caminhoNoCache(url, tipo) {
  const h = createHash('sha256').update(url).digest('hex').slice(0, 32)
  return join(dirDoCache, `${h}.${tipo}`)
}

/** Um pedido por vez por host, com o intervalo mínimo entre eles. */
async function naVez(host, f) {
  const antes = fila.get(host) ?? Promise.resolve()
  let soltar
  const minha = new Promise((r) => (soltar = r))
  fila.set(
    host,
    antes.then(() => minha),
  )
  await antes
  try {
    const intervalo = INTERVALO_POR_HOST[host] ?? INTERVALO_PADRAO
    const falta = (ultimoPedido.get(host) ?? 0) + intervalo - Date.now()
    if (falta > 0) await esperar(falta)
    return await f()
  } finally {
    ultimoPedido.set(host, Date.now())
    soltar()
  }
}

/** O que já está no cache em disco, sem nunca ir à rede: `null` quando falta (ou quando a fonte não tinha). */
export function lerDoCache(url, tipo = 'binario') {
  if (!dirDoCache) return null
  const arq = caminhoNoCache(url, tipo === 'json' ? 'json' : tipo === 'binario' ? 'bin' : 'txt')
  if (!existsSync(arq)) return null
  const b = readFileSync(arq)
  if (b.length === 0) return null
  return tipo === 'json' ? JSON.parse(b.toString('utf8')) : new Uint8Array(b)
}

/** Apaga a entrada do cache (resposta cortada ou corrompida) para a próxima chamada baixar de novo. */
export function esquecerDoCache(url, tipo = 'json') {
  if (!dirDoCache) return
  const arq = caminhoNoCache(url, tipo === 'json' ? 'json' : tipo === 'binario' ? 'bin' : 'txt')
  if (existsSync(arq)) unlinkSync(arq)
}

export let pedidosFeitos = 0

/**
 * GET com cache. `tipo`: 'json' | 'texto' | 'binario'. Devolve `null` em 404 (a fonte não tem), lança no resto.
 */
export async function baixar(url, tipo = 'texto', { aceitar, tentativas = 3 } = {}) {
  const u = new URL(url)
  if (PROIBIDOS.some((re) => re.test(u.hostname)))
    throw new Error(`host proibido pela política de robôs: ${u.hostname}`)
  const ext = tipo === 'json' ? 'json' : tipo === 'binario' ? 'bin' : 'txt'
  const arq = dirDoCache ? caminhoNoCache(url, ext) : null
  if (arq && existsSync(arq)) {
    const b = readFileSync(arq)
    if (b.length === 0) return null
    return tipo === 'json'
      ? JSON.parse(b.toString('utf8'))
      : tipo === 'binario'
        ? new Uint8Array(b)
        : b.toString('utf8')
  }
  for (let tentativa = 0; ; tentativa++) {
    /* O corpo é lido DENTRO da vez do host: o prazo vale para a resposta inteira, e um corpo que trava
       conta como erro de rede (com nova tentativa), não como falha do script. */
    const r = await naVez(u.hostname, async () => {
      pedidosFeitos++
      const resposta = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...(aceitar ? { Accept: aceitar } : {}) },
        redirect: 'follow',
        signal: globalThis.AbortSignal.timeout(150_000),
      })
      const corpo = resposta.ok ? new Uint8Array(await resposta.arrayBuffer()) : null
      return { status: resposta.status, ok: resposta.ok, headers: resposta.headers, corpo }
    }).catch((e) => ({ erroDeRede: e }))
    if (r.erroDeRede) {
      if (tentativa >= tentativas) throw new Error(`${url}: ${r.erroDeRede.message}`)
      await esperar(5000 * 3 ** tentativa)
      continue
    }
    if (r.status === 404 || r.status === 410) {
      if (arq) writeFileSync(arq, '')
      return null
    }
    if (r.status === 429 || r.status >= 500) {
      if (tentativa >= tentativas) throw new Error(`${url}: HTTP ${r.status}`)
      const pedido = Number(r.headers.get('retry-after'))
      await esperar(Number.isFinite(pedido) && pedido > 0 ? pedido * 1000 : 5000 * 3 ** tentativa)
      continue
    }
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
    const buf = r.corpo
    if (arq) writeFileSync(arq, buf)
    const texto = () => new TextDecoder('utf-8').decode(buf)
    return tipo === 'json' ? JSON.parse(texto()) : tipo === 'binario' ? buf : texto()
  }
}
