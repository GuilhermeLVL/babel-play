#!/usr/bin/env node
/**
 * FUMAÇA REMOTA (Fase 4, T6): confere um Worker já publicado (versão em preview ou deploy final).
 *   node scripts/cloudflare/fumaca-remota.mjs <url-base> <sha-do-commit>
 *
 *   1. GET <url>/api/ready → 200 (até 10 tentativas, 3 s entre elas: a versão nova pode demorar a propagar);
 *   2. GET <url>/api/health → JSON com `status: 'ok'` e `versao` terminando em `+<7 primeiros do sha>`
 *      (é o `GIT_SHA` passado por `--var` no upload; prova que a versão servida é a deste commit). Versão de
 *      outro commit tenta de novo (mesmas tentativas e espera): a borda leva segundos para trocar de versão.
 *
 * Sai com 1 e uma mensagem clara em qualquer falha. Não usa nem imprime segredo; cada requisição tem 10 s.
 */
import { fileURLToPath } from 'node:url'

const TEMPO_LIMITE_MS = 10_000
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function pegar(url) {
  const r = await fetch(url, { signal: globalThis.AbortSignal.timeout(TEMPO_LIMITE_MS) })
  return { status: r.status, corpo: await r.text() }
}

/** Resolve com o corpo de `/api/health`; rejeita com a causa da falha. */
export async function verificarRemoto(base, sha, { tentativas = 10, esperaMs = 3000 } = {}) {
  const url = base.replace(/\/+$/, '')
  const sha7 = String(sha).slice(0, 7)
  if (sha7.length < 7) throw new Error(`sha inválido: "${sha}"`)

  let ultimo = 'sem resposta'
  let pronto = false
  for (let i = 1; i <= tentativas && !pronto; i++) {
    try {
      const r = await pegar(`${url}/api/ready`)
      if (r.status === 200) pronto = true
      else ultimo = `${r.status} ${r.corpo.slice(0, 200)}`
    } catch (e) {
      ultimo = e?.message ?? String(e)
    }
    if (!pronto && i < tentativas) await esperar(esperaMs)
  }
  if (!pronto) throw new Error(`GET ${url}/api/ready não ficou 200 em ${tentativas} tentativas (última: ${ultimo})`)

  // A versão de outro commit é a única falha que se repete: logo depois do `versions deploy`, a borda ainda
  // serve a versão anterior por alguns segundos (o `/api/ready` dela já dá 200). Status, JSON e saúde falham na hora.
  for (let i = 1; ; i++) {
    const h = await pegar(`${url}/api/health`)
    let corpo
    try {
      corpo = JSON.parse(h.corpo)
    } catch {
      throw new Error(`GET ${url}/api/health devolveu ${h.status} sem JSON: ${h.corpo.slice(0, 200)}`)
    }
    if (h.status !== 200) throw new Error(`GET ${url}/api/health: ${h.status} ${h.corpo.slice(0, 200)}`)
    if (corpo.status !== 'ok') throw new Error(`/api/health com status "${corpo.status}" (esperado "ok")`)
    if (typeof corpo.versao === 'string' && corpo.versao.endsWith(`+${sha7}`)) return corpo
    if (i >= tentativas)
      throw new Error(`versão servida "${corpo.versao}" não termina em +${sha7} (commit esperado ${sha7})`)
    await esperar(esperaMs)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, sha] = process.argv.slice(2)
  if (!base || !sha) {
    console.error('uso: node scripts/cloudflare/fumaca-remota.mjs <url-base> <sha>')
    process.exit(1)
  }
  try {
    const h = await verificarRemoto(base, sha)
    console.log(`✔ ${base}: /api/ready 200; /api/health ok, versão ${h.versao}`)
  } catch (e) {
    console.error(`✘ fumaça remota: ${e.message}`)
    process.exit(1)
  }
}
