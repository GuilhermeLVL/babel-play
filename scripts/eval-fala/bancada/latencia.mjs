/**
 * SONDA DE LATÊNCIA — o tempo que o usuário espera, medido do Brasil, uma chamada por vez.
 *
 * A bancada de qualidade roda com ritmo e retentativas para caber na cota, e por isso a latência
 * dela mede a fila. Aqui não há fila: N chamadas sequenciais por configuração, com pausa entre
 * elas para não bater no limite por minuto, e a latência é a da chamada que respondeu. Também mede
 * o primeiro token (streaming) nos LLMs — é o que decide quando a legenda traduzida começa a aparecer.
 *
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/latencia.mjs [--n 25]
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { systemComunicativo, userComunicativo } from '../../../src/lib/traducao/promptComunicativo.ts'
import { BANCADA_DIR, chave, gravarResultado, lerJsonl, opt, percentis, registrarGasto } from './comum.mjs'

const N = Number(opt('n', '25'))
const pausa = (ms) => new Promise((s) => setTimeout(s, ms))

async function sttUmaVez(wav) {
  const fd = new FormData()
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'a.wav')
  fd.append('model', 'whisper-large-v3-turbo')
  fd.append('language', 'pt')
  fd.append('response_format', 'verbose_json')
  fd.append('temperature', '0')
  const t0 = performance.now()
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${chave('GROQ_API_KEY')}` }, body: fd, signal: AbortSignal.timeout(60_000),
  })
  await r.text()
  return r.ok ? performance.now() - t0 : null
}

async function llmUmaVez(modelo, esforco, frase) {
  const corpo = {
    model: modelo, temperature: 0, max_tokens: 400, stream: true,
    messages: [{ role: 'system', content: systemComunicativo('pt', 'en') }, { role: 'user', content: userComunicativo(frase) }],
  }
  if (esforco) { corpo.reasoning_effort = esforco; if (modelo.includes('gpt-oss')) corpo.include_reasoning = false }
  const t0 = performance.now()
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${chave('GROQ_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) { await r.text(); return null }
  let primeiro = null
  const leitor = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    if (primeiro === null && /"content":"[^"]/.test(buf)) primeiro = performance.now() - t0
  }
  registrarGasto(`latencia:${modelo}`, 0.0001)
  return { total: performance.now() - t0, primeiro }
}

async function main() {
  const falas = lerJsonl('stt/fleurs_pt.jsonl').slice(0, N)
  const stt = []
  for (const f of falas) {
    const ms = await sttUmaVez(readFileSync(path.join(BANCADA_DIR, f.arquivo)))
    if (ms !== null) stt.push(ms)
    registrarGasto('latencia:whisper', (Math.max(10, f.duracaoS) / 3600) * 0.04)
    await pausa(3200)
  }
  const [s50, s95] = percentis(stt)
  console.log(`whisper-large-v3-turbo (${stt.length} falas, ~${(falas.reduce((a, f) => a + f.duracaoS, 0) / falas.length).toFixed(1)} s): p50 ${s50.toFixed(0)} ms  p95 ${s95.toFixed(0)} ms`)

  const frases = lerJsonl('mt/fleurs_en_pt.jsonl').slice(0, N).map((p) => p.en)
  const llms = {}
  for (const [modelo, esforco] of [['openai/gpt-oss-120b', null], ['openai/gpt-oss-120b', 'low'], ['openai/gpt-oss-20b', 'low'], ['qwen/qwen3.8-27b', 'none']]) {
    const nome = `${modelo}${esforco ? `@${esforco}` : ''}`
    const tot = [], pri = []
    for (const fr of frases) {
      const r = await llmUmaVez(modelo, esforco, fr)
      if (r) { tot.push(r.total); if (r.primeiro !== null) pri.push(r.primeiro) }
      await pausa(4000)
    }
    const [t50, t95] = percentis(tot)
    const [p50, p95] = percentis(pri)
    llms[nome] = { n: tot.length, totalMs: { p50: t50, p95: t95 }, primeiroTokenMs: { p50, p95 } }
    console.log(`${nome.padEnd(28)} total p50 ${t50?.toFixed(0)} ms p95 ${t95?.toFixed(0)} ms · 1º token p50 ${p50?.toFixed(0)} ms p95 ${p95?.toFixed(0)} ms`)
  }
  console.log(`bruto: ${gravarResultado('latencia', { n: N, origem: 'Brasil (máquina do dono), sequencial, sem fila', stt: { n: stt.length, p50: s50, p95: s95 }, llms })}`)
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
