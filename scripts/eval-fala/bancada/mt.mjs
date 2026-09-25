/**
 * BANCADA DE TRADUÇÃO — qualidade (chrF++ aqui; COMET e BLEU em `pontuar.py`), latência e custo
 * medidos, por sistema × corpus, com IC de 95% e comparação pareada.
 *
 * Sistemas (`--sistemas`):
 *   groq:openai/gpt-oss-120b            a produção de hoje (sem reasoning_effort → o padrão, "medium")
 *   groq:openai/gpt-oss-20b@low         candidato barato, com raciocínio "low" e oculto
 *   openrouter:google/gemini-2.5-flash-lite   (sempre com provider.zdr = true)
 *   local:opus-mt                       o tradutor do navegador (Xenova/opus-mt-*, q8, beam 2)
 *   local:tc-big                        opus-mt-tc-big-en-pt (repositório privado já convertido)
 * Corpora (`--corpora`):
 *   fleurs:en-pt  fleurs:pt-en  wmt:en-pt  gold:en-pt
 *   cascata:<sistema-stt>:en-pt   o texto que o STT ENTENDEU do áudio em inglês, traduzido e
 *                                 comparado com a referência humana em pt — o que o usuário vê.
 *
 * PROMPT DE PRODUÇÃO (`promptComunicativo.ts`) e temperatura 0: a bancada mede o que o servidor
 * manda, sem variação de amostragem entre execuções.
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import os from 'node:os'

import { bootstrap, bootstrapPareado, mediaEm } from '../../../src/core/eval/bootstrap.ts'
import { chrf } from '../../../src/core/eval/chrf.ts'
import { juntarFrases, separarEmFrases } from '../../../src/core/texto/frases.ts'
import { systemComunicativo, userComunicativo } from '../../../src/lib/traducao/promptComunicativo.ts'
import {
  BANCADA_DIR, cache, chave, comAmostra, comRetentativa, CotaDoProvedor, respeitarRitmo, gastoTotal, gravarResultado, lerJsonl, opt, percentis,
  registrarGasto, TetoDeGasto,
} from './comum.mjs'

/** US$ por 1M tokens (entrada, saída) na Groq — console.groq.com/docs/models, 24/09/2026. */
const PRECO_GROQ = {
  'openai/gpt-oss-20b': [0.075, 0.3],
  'openai/gpt-oss-120b': [0.15, 0.6],
  'qwen/qwen3.8-27b': [0.8, 4],
}
/** Hugging Face Inference Providers (router, sem margem sobre o provedor) — /v1/models, 24/09/2026. */
const PRECO_HF = {
  'google/gemma-3-27b-it:deepinfra': [0.08, 0.16],
  'google/gemma-3-12b-it:deepinfra': [0.05, 0.15],
  'Qwen/Qwen3-235B-A22B-Instruct-2507:deepinfra': [0.09, 0.55],
  'meta-llama/Llama-3.1-8B-Instruct:deepinfra': [0.02, 0.05],
  'openai/gpt-oss-120b:novita': [0.05, 0.25],
  'openai/gpt-oss-20b:novita': [0.04, 0.15],
}

const SISTEMAS = opt('sistemas', 'groq:openai/gpt-oss-120b').split(',').map((s) => s.trim()).filter(Boolean)
const CORPORA = opt('corpora', 'fleurs:en-pt').split(',').map((s) => s.trim()).filter(Boolean)
const LIMITE = Number(opt('limite', '0')) || 0
const CONCORRENCIA = Number(opt('concorrencia', '4')) || 4

function interpretar(s) {
  const i = s.indexOf(':')
  const [modelo, esforco] = s.slice(i + 1).split('@')
  return { id: s, provedor: s.slice(0, i), modelo, esforco: esforco || null }
}

// ------------------------------------------------------------------ corpora
function carregarCorpus(specComAmostra) {
  const { nome: spec, n: amostra } = comAmostra(specComAmostra)
  const partes = spec.split(':')
  const [src, tgt] = partes.at(-1).split('-')
  let casos
  if (partes[0] === 'fleurs') {
    casos = lerJsonl('mt/fleurs_en_pt.jsonl').map((p) => ({ id: p.id, origem: p[src], referencia: p[tgt] }))
  } else if (partes[0] === 'wmt') {
    casos = lerJsonl('mt/wmt24pp_en_ptbr.jsonl').map((p) => ({ id: p.id, origem: p.en, referencia: p.pt, categoria: p.dominio }))
  } else if (partes[0] === 'gold') {
    casos = readFileSync('tests/eval/fixtures/gold-traducao-v1.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      .map((g) => ({ id: g.id, origem: g.origem, referencia: g.referencia, contexto: g.contexto ?? [], categoria: g.categoria }))
  } else if (partes[0] === 'cascata') {
    const sisStt = partes.slice(1, -1).join(':')
    const arq = path.join(BANCADA_DIR, 'cache', `${`stt_${sisStt}_fleurs_${src}`.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`)
    const hip = JSON.parse(readFileSync(arq, 'utf8'))
    const pares = new Map(lerJsonl('mt/fleurs_en_pt.jsonl').map((p) => [p.floresId, p]))
    casos = Object.entries(hip).map(([id, r]) => {
      const floresId = Number(id.split('_').at(-1))
      return { id: `fleurs_${floresId}`, origem: r.texto, referencia: pares.get(floresId)?.[tgt], origemHumana: pares.get(floresId)?.[src] }
    }).filter((c) => c.referencia && c.origem)
  } else throw new Error(`corpus desconhecido: ${spec}`)
  const n = amostra || LIMITE
  if (n && n < casos.length) {
    // ESTRATIFICADA quando há categoria (domínio do WMT, fenômeno do gold): cortar o topo do arquivo
    // pegaria só os primeiros domínios e mediria outro corpus.
    const cats = [...new Set(casos.map((c) => c.categoria ?? ''))]
    const porCat = Math.ceil(n / cats.length)
    casos = cats.flatMap((cat) => casos.filter((c) => (c.categoria ?? '') === cat).slice(0, porCat)).slice(0, n)
  }
  return { src, tgt, casos }
}

// ------------------------------------------------------------------ nuvem
async function traduzirNuvem(sis, caso, src, tgt) {
  const base = { groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1', hf: 'https://router.huggingface.co/v1' }[sis.provedor]
  const k = sis.provedor === 'hf' ? tokenHf() : chave(sis.provedor === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY')
  const corpo = {
    model: sis.modelo,
    temperature: 0,
    max_tokens: 1200, // o teto de funcoesDeIa.ts para tradução
    messages: [
      { role: 'system', content: systemComunicativo(tgt, src) },
      { role: 'user', content: userComunicativo(caso.origem, caso.contexto) },
    ],
  }
  if (sis.provedor === 'hf' && sis.esforco) corpo.reasoning_effort = sis.esforco
  if (sis.provedor === 'groq' && sis.esforco) { corpo.reasoning_effort = sis.esforco; corpo.include_reasoning = false }
  if (sis.provedor === 'openrouter') {
    corpo.provider = { zdr: true }
    corpo.usage = { include: true }
    if (sis.esforco) corpo.reasoning = sis.esforco === 'off' ? { enabled: false } : { effort: sis.esforco, exclude: true }
  }
  await respeitarRitmo(`LLM_${sis.modelo.replace(/[^a-z0-9]/gi, '')}`, 16)
  const t0 = performance.now()
  const r = await comRetentativa(() => fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  }), sis.id)
  const j = await r.json()
  const ms = r.ms
  const u = j.usage ?? {}
  let usd = Number(u.cost)
  if (!Number.isFinite(usd)) {
    const p = (sis.provedor === 'hf' ? PRECO_HF : PRECO_GROQ)[sis.modelo]
    usd = p ? ((u.prompt_tokens ?? 0) * p[0] + (u.completion_tokens ?? 0) * p[1]) / 1e6 : 0
  }
  registrarGasto(sis.id, usd)
  const texto = String(j.choices?.[0]?.message?.content ?? '').replace(/^["“]|["”]$/g, '').trim()
  return { texto, ms, tokensEntrada: u.prompt_tokens ?? null, tokensSaida: u.completion_tokens ?? null, usd, provedorReal: j.provider ?? null }
}

function tokenHf() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN
  return readFileSync(path.join(os.homedir(), '.cache/huggingface/token'), 'utf8').trim()
}

// ------------------------------------------------------------------ local
const pipes = new Map()
async function tradutorLocal(nome, src, tgt) {
  const chaveP = `${nome}:${src}-${tgt}`
  if (pipes.has(chaveP)) return pipes.get(chaveP)
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  try { process.env.HF_TOKEN ||= readFileSync(path.join(os.homedir(), '.cache/huggingface/token'), 'utf8').trim() } catch { /* sem token: só modelos públicos */ }
  let modelo, tokenId
  if (nome === 'tc-big') {
    if (!(src === 'en' && tgt === 'pt')) throw new Error('tc-big só cobre en→pt')
    modelo = 'GuilhermeLVL/opus-mt-tc-big-en-pt-onnx'
  } else if (src === 'en' && tgt === 'pt') { modelo = 'Xenova/opus-mt-en-ROMANCE'; tokenId = 51 }
  else if (src === 'pt' && tgt === 'en') modelo = 'Xenova/opus-mt-ROMANCE-en'
  else throw new Error(`opus-mt não cobre ${src}→${tgt}`)
  const pipe = await pipeline('translation', modelo, { dtype: 'q8', device: 'cpu' })
  // tc-big precisa do token de variante no texto: >>por<< (pt-BR é o padrão do par en-pt do Tatoeba).
  const p = { pipe, tokenId, prefixo: nome === 'tc-big' ? '>>por<< ' : '' }
  pipes.set(chaveP, p)
  return p
}

async function traduzirLocal(sis, caso, src, tgt) {
  const { Tensor } = await import('@huggingface/transformers')
  const { pipe, tokenId, prefixo } = await tradutorLocal(sis.modelo, src, tgt)
  const GERACAO = { num_beams: 2, max_length: 256, no_repeat_ngram_size: 3, early_stopping: true } // = mtWorker.ts
  const t0 = performance.now()
  const partes = []
  for (const frase of separarEmFrases(caso.origem)) {
    if (typeof tokenId === 'number') {
      const enc = pipe.tokenizer(frase)
      const ids = [BigInt(tokenId), ...Array.from(enc.input_ids.data)]
      const input_ids = new Tensor('int64', BigInt64Array.from(ids), [1, ids.length])
      const attention_mask = new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length])
      const gen = await pipe.model.generate({ input_ids, attention_mask, ...GERACAO })
      partes.push(pipe.tokenizer.batch_decode(gen, { skip_special_tokens: true })[0] ?? '')
    } else {
      const out = await pipe(prefixo + frase, GERACAO)
      partes.push((Array.isArray(out) ? out[0]?.translation_text : out?.translation_text) ?? '')
    }
  }
  return { texto: juntarFrases(partes).trim(), ms: performance.now() - t0, usd: 0 }
}

// ------------------------------------------------------------------ execução
async function rodar(sis, spec) {
  const { src, tgt, casos } = carregarCorpus(spec)
  const c = cache(`mt_${sis.id}_${comAmostra(spec).nome}`)
  const saida = new Array(casos.length)
  let feitos = 0
  const trabalho = async (i) => {
    const caso = casos[i]
    const k = `${caso.id}|${caso.origem}`
    let r = c.get(k)
    if (!r) {
      try {
        r = sis.provedor === 'local' ? await traduzirLocal(sis, caso, src, tgt) : await traduzirNuvem(sis, caso, src, tgt)
      } catch (e) {
        if (e instanceof TetoDeGasto || e instanceof CotaDoProvedor) throw e
        r = { texto: '', ms: NaN, erro: String(e.message).slice(0, 200) }
      }
      if (!r.erro) c.set(k, r)
    }
    saida[i] = { ...caso, hipotese: r.texto, ms: r.ms, usd: r.usd ?? 0, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, erro: r.erro }
    process.stdout.write(`\r  ${sis.id} × ${spec}: ${++feitos}/${casos.length}   `)
  }
  // Local é CPU: um por vez. Nuvem: poucos em paralelo (a latência medida é por chamada).
  const conc = sis.provedor === 'local' ? 1 : CONCORRENCIA
  let proximo = 0
  await Promise.all(Array.from({ length: conc }, async () => {
    while (proximo < casos.length) await trabalho(proximo++)
  }))
  c.salvar()
  const notas = saida.map((x) => chrf(x.referencia, x.hipotese).chrf * 100)
  const q = bootstrap(saida.length, mediaEm(notas))
  const falhas = saida.filter((x) => x.erro).length
  const [p50, p95] = percentis(saida.map((x) => x.ms))
  const usd = saida.reduce((s, x) => s + (x.usd || 0), 0)
  const palavras = saida.reduce((s, x) => s + x.origem.split(/\s+/).length, 0)
  // Custo por HORA DE FALA: ~9.000 palavras por hora de conversa (ritmo médio de 150 palavras/min).
  const usdPorHora = palavras ? (usd / palavras) * 9000 : 0
  console.log(`\r  ${sis.id} × ${spec}: chrF++ ${q.valor.toFixed(1)} [${q.ic95[0].toFixed(1)}–${q.ic95[1].toFixed(1)}]  p50 ${p50?.toFixed(0)} ms  p95 ${p95?.toFixed(0)} ms  US$ ${usdPorHora.toFixed(4)}/h de fala${falhas ? `  (${falhas} falhas)` : ''}`)
  return {
    sistema: sis.id, corpus: spec, n: saida.length, falhas, chrf: q, latenciaMs: { p50, p95 }, usdTotal: usd, usdPorHoraDeFala: usdPorHora,
    casos: saida.map((x, i) => ({ id: x.id, categoria: x.categoria, origem: x.origem, origemHumana: x.origemHumana, referencia: x.referencia, hipotese: x.hipotese, chrf: notas[i], ms: Math.round(x.ms), tokensSaida: x.tokensSaida, erro: x.erro })),
  }
}

async function main() {
  const resultados = []
  try {
    for (const spec of CORPORA) for (const s of SISTEMAS) resultados.push(await rodar(interpretar(s), spec))
  } catch (e) {
    if (!(e instanceof TetoDeGasto || e instanceof CotaDoProvedor)) throw e
    console.error(`\n${e.message} — resultados parciais gravados.`)
  }
  const comparacoes = []
  for (const spec of CORPORA) {
    const doCorpus = resultados.filter((r) => r.corpus === spec)
    const base = doCorpus[0]
    for (const outro of doCorpus.slice(1)) {
      const n = Math.min(base.casos.length, outro.casos.length)
      const d = bootstrapPareado(n, mediaEm(outro.casos.map((x) => x.chrf)), mediaEm(base.casos.map((x) => x.chrf)))
      comparacoes.push({ corpus: spec, sistema: outro.sistema, contra: base.sistema, diferencaChrf: d })
      console.log(`  Δ chrF++ ${spec}: ${outro.sistema} − ${base.sistema} = ${d.valor.toFixed(2)} [${d.ic95[0].toFixed(2)}, ${d.ic95[1].toFixed(2)}]${d.significativo ? ' *significativo*' : ' (empate)'}`)
    }
  }
  const nome = `mt_${CORPORA.join('-')}_${SISTEMAS.length}sis_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const saida = gravarResultado(nome, { sistemas: SISTEMAS, corpora: CORPORA, gastoTotalUsd: gastoTotal(), resultados, comparacoes })
  console.log(`\ngasto acumulado da bancada: US$ ${gastoTotal().toFixed(4)}\nbruto: ${saida}`)
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
