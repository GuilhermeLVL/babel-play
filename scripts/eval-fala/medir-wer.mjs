/**
 * Mede WER/CER do STT sobre o corpus pt-BR — com as MESMAS opções de decode da produção.
 *
 * A fidelidade ao que roda no navegador é o que dá valor ao número. As opções abaixo espelham
 * `src/gateway/adapters/whisperWorker.ts:184-194` linha a linha (greedy, sem timestamps,
 * `max_new_tokens` dinâmico, travas anti-repetição) e o pós-processamento passa pelo MESMO
 * `filtrarAlucinacao` de produção. Medir com opções melhores que as reais produziria um número
 * bonito e inútil.
 *
 * O QUE ESTE SCRIPT EXISTE PARA RESPONDER: o português é mal transcrito por causa do MODELO ou da
 * SEGMENTAÇÃO? Por isso ele compara variantes (modelo × dica de idioma) e reporta por faixa de
 * duração. Se a faixa curta for muito pior que a longa no mesmo modelo, o gargalo é o VAD cortando
 * fala — e a correção é agrupar enunciados, não baixar um modelo maior.
 *
 * Uso:
 *   node scripts/eval-fala/medir-wer.mjs                       # tiny e base, com e sem dica de pt
 *   node scripts/eval-fala/medir-wer.mjs --modelos tiny,base,small
 *   node scripts/eval-fala/medir-wer.mjs --limite 20           # amostra menor, para iterar rápido
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { pipeline, env } from '@huggingface/transformers'
import { agregar, agregarPorFaixa } from '../../src/core/eval/wer.ts'
import { filtrarAlucinacao } from '../../src/gateway/alucinacao.ts'

env.allowLocalModels = false

const MANIFESTO = 'tests/fixtures/corpus-pt-br.jsonl'
const RAIZ_AUDIO = 'tests/fixtures/audio'
const SAIDA = 'docs/auditoria/eval/resultados-wer.json'

const args = process.argv.slice(2)
const opt = (n, p) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : p }

const MODELOS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
}

/**
 * As variantes são o experimento.
 *
 * `dica` reproduz `langs()` de `LiveCapture.tsx:998`: hoje o microfone em detecção automática manda
 * SEMPRE `hint: ''`. A variante `sem-dica` é portanto a configuração REAL de produção para a voz do
 * usuário, e a `com-dica-pt` é a correção proposta (H2). A diferença entre as duas é a medida
 * exata do que essa correção vale.
 */
function variantes(modelos) {
  const v = []
  for (const m of modelos) {
    v.push({ nome: `${m}/sem-dica`, modelo: m, idioma: undefined })
    v.push({ nome: `${m}/com-dica-pt`, modelo: m, idioma: 'pt' })
  }
  return v
}

/** Lê um WAV PCM 16-bit e devolve Float32 mono na taxa nativa, mais a taxa. */
function lerWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('não é um WAV RIFF')
  }
  let pos = 12, fmt = null, dados = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    const corpo = pos + 8
    if (id === 'fmt ') fmt = { canais: buf.readUInt16LE(corpo + 2), taxa: buf.readUInt32LE(corpo + 4), bits: buf.readUInt16LE(corpo + 14) }
    else if (id === 'data') dados = buf.subarray(corpo, Math.min(corpo + tam, buf.length))
    pos = corpo + tam + (tam % 2)
  }
  if (!fmt || !dados) throw new Error('WAV sem fmt ou data')
  if (fmt.bits !== 16) throw new Error(`esperado PCM 16-bit, veio ${fmt.bits}`)

  const amostras = dados.length / 2 / fmt.canais
  const out = new Float32Array(amostras)
  for (let i = 0; i < amostras; i++) {
    // Mistura os canais: o pipeline do produto é mono.
    let soma = 0
    for (let c = 0; c < fmt.canais; c++) soma += dados.readInt16LE((i * fmt.canais + c) * 2)
    out[i] = soma / fmt.canais / 32768
  }
  return { pcm: out, taxa: fmt.taxa }
}

/**
 * Reamostragem linear para 16 kHz.
 *
 * O produto entrega 16 kHz ao Whisper por convenção do VAD (`systemAudio.ts:251` passa 16000
 * fixo). Reamostrar aqui mantém a paridade; sem isso o áudio seria interpretado na taxa errada e
 * o WER mediria a reamostragem, não o modelo.
 */
function para16k(pcm, taxa) {
  if (taxa === 16000) return pcm
  const razao = taxa / 16000
  const n = Math.floor(pcm.length / razao)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * razao
    const i0 = Math.floor(x)
    const i1 = Math.min(i0 + 1, pcm.length - 1)
    out[i] = pcm[i0] + (pcm[i1] - pcm[i0]) * (x - i0)
  }
  return out
}

async function main() {
  if (!existsSync(MANIFESTO)) {
    console.error(`manifesto ausente: ${MANIFESTO}\nRode antes: node scripts/eval-fala/baixar-corpus.mjs`)
    process.exit(1)
  }
  let itens = readFileSync(MANIFESTO, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const limite = Number(opt('limite', '0'))
  if (limite > 0) itens = itens.slice(0, limite)
  itens = itens.filter((o) => existsSync(path.join(RAIZ_AUDIO, o.arquivo)))

  if (itens.length === 0) {
    console.error('nenhum áudio do manifesto está no disco — sem corpus não há medição.')
    process.exit(1)
  }

  const nomesDeModelo = opt('modelos', 'tiny,base').split(',').map((s) => s.trim()).filter((m) => MODELOS[m])
  const vs = variantes(nomesDeModelo)
  console.log(`corpus: ${itens.length} itens · variantes: ${vs.map((v) => v.nome).join(', ')}\n`)

  // Carrega o áudio uma vez só: decodificar WAV a cada variante seria puro desperdício.
  const audios = new Map()
  for (const it of itens) {
    const { pcm, taxa } = lerWav(readFileSync(path.join(RAIZ_AUDIO, it.arquivo)))
    audios.set(it.id, para16k(pcm, taxa))
  }

  const resultados = []
  for (const v of vs) {
    process.stdout.write(`${v.nome}: carregando…`)
    const asr = await pipeline('automatic-speech-recognition', MODELOS[v.modelo], { dtype: 'q8', device: 'cpu' })
    const casos = []
    let msTotal = 0, audioTotalS = 0

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      const pcm = audios.get(it.id)
      const audioSec = pcm.length / 16000
      const t0 = Date.now()
      let texto = ''
      try {
        const out = await asr(pcm, {
          // ESPELHO EXATO de whisperWorker.ts:184-194.
          language: v.idioma,
          task: 'transcribe',
          return_timestamps: false,
          num_beams: 1,
          do_sample: false,
          max_new_tokens: Math.max(8, Math.min(128, Math.round(audioSec * 15))),
          no_repeat_ngram_size: 3,
          repetition_penalty: 1.15,
        })
        texto = filtrarAlucinacao((out.text ?? '').trim(), audioSec)
      } catch (e) {
        // Falha de decode conta como transcrição vazia (deleção total) — é o que o usuário veria.
        console.warn(`\n  ! ${it.id}: ${e.message}`)
      }
      msTotal += Date.now() - t0
      audioTotalS += audioSec
      casos.push({ id: it.id, referencia: it.referencia, hipotese: texto, faixa: it.faixa, qualidade: it.qualidade })
      process.stdout.write(`\r${v.nome}: ${i + 1}/${itens.length}            `)
    }

    const geral = agregar(casos)
    const porFaixa = agregarPorFaixa(casos)
    // RTF (real-time factor): < 1 significa que decodifica mais rápido que o tempo real. É a
    // metade "custo" da troca — sem ela, um WER melhor com modelo maior pareceria de graça.
    const rtf = audioTotalS > 0 ? msTotal / 1000 / audioTotalS : 0

    resultados.push({ variante: v.nome, modelo: v.modelo, idioma: v.idioma ?? null, geral, porFaixa, rtf, casos })
    console.log(`\r${v.nome}: WER ${(geral.wer * 100).toFixed(1)}%  CER ${(geral.cer * 100).toFixed(1)}%  RTF ${rtf.toFixed(2)}          `)
  }

  mkdirSync(path.dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({ geradoEm: new Date().toISOString(), corpus: itens.length, resultados }, null, 2))

  console.log(`\n${'variante'.padEnd(22)} ${'WER'.padStart(7)} ${'CER'.padStart(7)} ${'RTF'.padStart(6)}   sub/ins/del`)
  for (const r of resultados) {
    const g = r.geral
    console.log(`${r.variante.padEnd(22)} ${(g.wer * 100).toFixed(1).padStart(6)}% ${(g.cer * 100).toFixed(1).padStart(6)}% ${r.rtf.toFixed(2).padStart(6)}   ${g.substituicoes}/${g.insercoes}/${g.delecoes}`)
  }

  console.log(`\nWER por faixa de duração (a resposta a "é o modelo ou a segmentação?"):`)
  const faixas = Object.keys(resultados[0].porFaixa)
  console.log(`${''.padEnd(22)}${faixas.map((f) => f.split(' ')[0].padStart(9)).join('')}`)
  for (const r of resultados) {
    const linha = faixas.map((f) => {
      const a = r.porFaixa[f]
      return (a.casos === 0 ? '—' : `${(a.wer * 100).toFixed(0)}%`).padStart(9)
    }).join('')
    console.log(`${r.variante.padEnd(22)}${linha}`)
  }
  console.log(`\nresultado bruto: ${SAIDA}`)
}

main().catch((e) => { console.error('\nfalhou:', e); process.exit(1) })
