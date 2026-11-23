#!/usr/bin/env node
/**
 * GERA O TEMPO POR PALAVRA do fixture da bancada (change `parciais-incrementais`, D1, tarefa 1.5).
 *
 *   node scripts/perf/latencia-legenda/gerar-palavras-do-roteiro.mjs [--fixture tests/fixtures/bancada-captura/fleurs-en-8.json]
 *        [--modelo onnx-community/whisper-medium.en_timestamped] [--dtype fp32] [--idioma en] [--minimo-casado 0.9] [--saida outro.json]
 *
 * Alinhamento forçado OFFLINE, sem dependência nova: o `@huggingface/transformers` (já dependência, já usado em Node por
 * `scripts/eval-fala/bancada/stt.mjs`) roda um Whisper maior que o do app (`small`) com `return_timestamps: 'word'` (atenção
 * cruzada + DTW) sobre cada clipe do fixture. MODELO: precisa de um export COM atenções cruzadas e `alignment_heads`. O
 * `onnx-community/whisper-small` (o do app, decoder q4 mesclado) NÃO serve ("Model outputs must contain cross attentions");
 * a 2ª tentativa, `whisper-small_timestamped`, funciona mas casa só 4 de 8 falas a 90% (erros de transcrição do small); o
 * `whisper-medium.en_timestamped` (fp32, só inglês, ~1,5 GB baixados uma vez) casa 6 de 8. É o padrão. As palavras do Whisper são casadas ao texto de REFERÊNCIA do FLEURS por
 * Levenshtein por palavra (`casarComOFinal`); cada palavra de referência casada leva o tempo da palavra do Whisper.
 * Fala com menos de 90% das palavras casadas fica marcada `foraDoCalculo` e é contada à parte no relatório.
 *
 * Grava no JSON do fixture, por fala: `palavras: [{ t, iniS, fimS }]` (tempo RELATIVO AO INÍCIO DO CLIPE, em segundos; `t` é a
 * palavra de referência normalizada) e `alinhamento: { modelo, dtype, casadas, total, fracao, foraDoCalculo }`.
 * `montar-audio.mjs` soma o deslocamento da fala e leva isso ao roteiro da bancada. O WAV não muda.
 * Atenção: `montar-audio.mjs --gerar-fixture` reescreve o JSON sem `palavras`; rode este script depois dele.
 *
 * Precisão esperada: ~100 a 200 ms por palavra (limite do DTW); `validar-alinhamento.mjs` mede o desvio contra as fronteiras
 * de voz do próprio roteiro. O erro é igual nos dois lados de um A/B e cancela na diferença pareada.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { casarComOFinal, tokenizar } from '../../../src/core/legendas/medidasDeParcial.ts'
import { lerWav } from './wav.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..', '..', '..')
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
}
const FIXTURE = path.resolve(
  opt('fixture', path.join(RAIZ, 'tests', 'fixtures', 'bancada-captura', 'fleurs-en-8.json')),
)
const MODELO = opt('modelo', 'onnx-community/whisper-medium.en_timestamped')
const REPO = MODELO.includes('/') ? MODELO : `onnx-community/whisper-${MODELO}`
const DTYPE = opt('dtype', 'fp32')
const IDIOMA = opt('idioma', 'en')
const MINIMO = Number(opt('minimo-casado', 0.9))
const SAIDA = path.resolve(opt('saida', FIXTURE))
const SR = 16000

/** As palavras do Whisper (um item por palavra normalizada) com o tempo de cada uma. */
export function palavrasDoWhisper(chunks) {
  const saida = []
  for (const c of chunks ?? []) {
    const [ini, fim] = c.timestamp ?? []
    if (!Number.isFinite(ini)) continue
    const f = Number.isFinite(fim) ? fim : ini
    for (const t of tokenizar(c.text ?? '')) saida.push({ t, iniS: ini, fimS: f })
  }
  return saida
}

/** Casa o Whisper com a referência e devolve `{ palavras, casadas, total, fracao }` (palavras só das casadas, em ordem). */
export function alinharComAReferencia(referencia, doWhisper, minimo = MINIMO) {
  const ref = tokenizar(referencia)
  const casou = casarComOFinal(
    ref,
    doWhisper.map((p) => p.t),
  )
  const palavras = []
  casou.forEach((j, i) => {
    if (j >= 0) palavras.push({ t: ref[i], iniS: +doWhisper[j].iniS.toFixed(3), fimS: +doWhisper[j].fimS.toFixed(3) })
  })
  const fracao = ref.length ? palavras.length / ref.length : 0
  return {
    palavras,
    casadas: palavras.length,
    total: ref.length,
    fracao: +fracao.toFixed(3),
    foraDoCalculo: fracao < minimo,
  }
}

if (process.argv[1] && process.argv[1].endsWith('gerar-palavras-do-roteiro.mjs')) {
  const mapa = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const x = lerWav(readFileSync(path.join(path.dirname(FIXTURE), mapa.wav)), { sr: SR }).amostras
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  const dtype = DTYPE === 'hibrido' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : DTYPE
  console.log(`[palavras] carregando ${REPO} (${JSON.stringify(dtype)})`)
  const asr = await pipeline('automatic-speech-recognition', REPO, { dtype, device: 'cpu' })
  for (const f of mapa.falas) {
    const pcm = x.slice(f.amostra, f.amostra + f.amostras)
    // Modelo só de inglês (`*.en`) recusa `language`/`task`.
    const idioma = REPO.includes('.en') ? {} : { language: IDIOMA, task: 'transcribe' }
    const out = await asr(pcm, { ...idioma, return_timestamps: 'word', num_beams: 1, do_sample: false })
    const al = alinharComAReferencia(f.referencia, palavrasDoWhisper(out.chunks))
    f.palavras = al.palavras
    f.alinhamento = {
      modelo: REPO,
      dtype: DTYPE,
      casadas: al.casadas,
      total: al.total,
      fracao: al.fracao,
      foraDoCalculo: al.foraDoCalculo,
    }
    console.log(
      `[palavras] ${f.id}: ${al.casadas}/${al.total} casadas (${(al.fracao * 100).toFixed(0)}%)${al.foraDoCalculo ? ' FORA DO CÁLCULO' : ''} | whisper: "${(out.text ?? '').trim()}"`,
    )
  }
  mapa.palavrasGeradasPor = `scripts/perf/latencia-legenda/gerar-palavras-do-roteiro.mjs (${REPO}, return_timestamps: 'word')`
  writeFileSync(SAIDA, JSON.stringify(mapa, null, 2) + '\n')
  const fora = mapa.falas.filter((f) => f.alinhamento.foraDoCalculo).map((f) => f.id)
  console.log(
    `[palavras] ${SAIDA}: ${mapa.falas.length - fora.length}/${mapa.falas.length} falas com >= ${MINIMO * 100}% casadas; fora do cálculo: ${fora.join(', ') || 'nenhuma'}`,
  )
}
