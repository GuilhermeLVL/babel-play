#!/usr/bin/env node
/**
 * O BUILD DO WORKER DE ANÚNCIOS `frasy-anuncios` (ruling R35) — `npm run anuncios:build`.
 *
 * A página de anúncios NUNCA sai no `dist` do app: ela mora em `anuncios/` (fora de `public/`) e vira
 * `dist-anuncios/`, servido por um Worker só de assets (`wrangler.anuncios.jsonc`), numa origem que não é a
 * do app. Este script:
 *   1. copia `anuncios/*` para `dist-anuncios/`;
 *   2. grava `config.js` com o código da rede (`VITE_ANUNCIOS_REDE_CONTA`) e a origem do app (`APP_URL`) —
 *      os dois vêm do BUILD, nunca da query da página. Nada aqui é segredo;
 *   3. grava `_headers`: SEM COOP/COEP/DIP, a CSP larga da página (só nesta origem), `nosniff` e
 *      `Referrer-Policy`. `frame-ancestors` é só a origem do app; sem `APP_URL`, `'none'` (falha fechada:
 *      ninguém consegue embutir a página).
 *
 *   APP_URL=https://frasy.com.br VITE_ANUNCIOS_REDE_CONTA=123 npm run anuncios:build
 *   npx wrangler deploy -c wrangler.anuncios.jsonc [--env staging]
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORIGEM = join(RAIZ, 'anuncios')
const DESTINO = join(RAIZ, 'dist-anuncios')

/**
 * Os hosts do Google que a página usa (pesquisa `docs/pesquisa/2026-10-21-rede-de-anuncios.md` §4). O Google
 * NÃO garante lista de hosts (só CSP por nonce): conferir no console da bancada (Task 6); pode mudar sem aviso.
 */
const HOSTS_DO_GOOGLE = [
  'https://securepubads.g.doubleclick.net',
  'https://pagead2.googlesyndication.com',
  'https://tpc.googlesyndication.com',
  'https://googleads.g.doubleclick.net',
  'https://www.googletagservices.com',
  'https://ep1.adtrafficquality.google',
  'https://adservice.google.com',
  'https://www.google.com',
]

/** A origem (`https://host[:porta]`) de uma URL http(s), ou `null`. */
export function origemDe(valor) {
  const v = valor?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

/** Só dígitos, ou vazio (sem rede, a página não pede nada ao Google). */
export function redeDe(valor) {
  const v = valor?.trim() ?? ''
  return /^[0-9]{1,20}$/.test(v) ? v : ''
}

/**
 * A CSP DA PÁGINA DE ANÚNCIOS — LARGA, e só nesta origem. `'unsafe-inline'` em `script-src` é aceito AQUI:
 * o GPT injeta scripts em linha e o Google só documenta CSP por nonce (que exigiria HTML gerado por
 * requisição). A página não tem dado do app nem sessão (o quadro é `credentialless`, sem cookies), e o app
 * a enxerga só por `postMessage` com a origem conferida. `frame-src`/`img-src` em `https:` porque os
 * criativos vêm de CDNs de anunciantes.
 */
export function cspDaPaginaDeAnuncios(env = process.env) {
  const app = origemDe(env.APP_URL)
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${HOSTS_DO_GOOGLE.join(' ')}`,
    `connect-src 'self' ${HOSTS_DO_GOOGLE.join(' ')} https://*.doubleclick.net https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google`,
    "img-src 'self' https: data:",
    'frame-src https:',
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${app ?? "'none'"}`,
  ].join('; ')
}

/** O `_headers` do Worker de anúncios: nenhum cabeçalho de isolamento. */
export function gerarCabecalhosDosAnuncios(env = process.env) {
  return [
    '# Gerado por scripts/anuncios/build.mjs (ruling R35). Sem COOP/COEP/DIP: o GPT não os suporta.',
    '/*',
    `  Content-Security-Policy: ${cspDaPaginaDeAnuncios(env)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Cache-Control: public, max-age=300',
    '',
  ].join('\n')
}

/** O `config.js`: a rede e a origem do app, do build. Público por natureza (vai a todo navegador). */
export function gerarConfig(env = process.env) {
  const cfg = { rede: redeDe(env.VITE_ANUNCIOS_REDE_CONTA), app: origemDe(env.APP_URL) ?? '' }
  return `/* Gerado por scripts/anuncios/build.mjs: o código da rede e a origem do app, do build. */\nwindow.FRASY_ANUNCIOS = Object.freeze(${JSON.stringify(cfg)});\n`
}

export function construir(env = process.env, destino = DESTINO) {
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  for (const nome of readdirSync(ORIGEM)) copyFileSync(join(ORIGEM, nome), join(destino, nome))
  writeFileSync(join(destino, 'config.js'), gerarConfig(env))
  writeFileSync(join(destino, '_headers'), gerarCabecalhosDosAnuncios(env))
  return destino
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const destino = construir()
  if (!origemDe(process.env.APP_URL)) {
    console.warn("anuncios:build: sem APP_URL, frame-ancestors fica 'none' (nenhum app consegue embutir).")
  }
  if (!redeDe(process.env.VITE_ANUNCIOS_REDE_CONTA)) {
    console.warn('anuncios:build: sem VITE_ANUNCIOS_REDE_CONTA, a página não pede anúncio nenhum.')
  }
  console.log(`anuncios:build: ${destino}`)
}
