/**
 * BANCADA DO INTÉRPRETE NO CELULAR (conversa-de-verdade, 5.3 e 3.3) — em Node, com as MESMAS opções de decode do
 * `whisperWorker.ts` (greedy, travas anti-repetição, teto de tokens pela duração) e o mesmo filtro de alucinação.
 *
 * Mede, no conjunto `tests/fixtures/interprete/` (10 pt + 10 en em 2 vozes, 3 es):
 *   - WER por idioma e frases CONSTRANGEDORAS (`constrangedoras.json`), por modelo candidato do celular;
 *   - o tempo de decode por frase (CPU deste computador — NÃO é o tempo de um celular; serve para comparar modelos);
 *   - a CONFERÊNCIA DE IDIOMA do turno (`idiomaDoWhisper.ts` + `idiomaForaDoPar.ts`): quantas falas do par seriam
 *     bloqueadas (falso bloqueio) e quantas em es, no lado do inglês, seriam pegas, por limiar.
 *
 * Uso: node scripts/eval-fala/medir-interprete.mjs [--modelos base@q8,small@q8,small@q4,parakeet] [--saida <json>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { env, pipeline, Tensor } from '@huggingface/transformers'

import { wer } from '../../src/core/eval/wer.ts'
import { detectarIdiomaDoAudio } from '../../src/gateway/adapters/idiomaDoWhisper.ts'
import { filtrarAlucinacao } from '../../src/gateway/alucinacao.ts'
import { idiomaForaDoPar } from '../../src/lib/captura/idiomaForaDoPar.ts'
import { lerWav } from './bancada/comum.mjs'
import { transcreverParakeet } from './bancada/parakeet.mjs'

env.allowLocalModels = false

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const DIR = path.join(RAIZ, 'tests/fixtures/interprete')
const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : p
}
const MODELOS = opt('modelos', 'base@q8,small@q8,parakeet').split(',')
const SAIDA = opt('saida', '')
const LIMIARES = [0.6, 0.7, 0.8, 0.9]

const conjunto = JSON.parse(readFileSync(path.join(DIR, 'frases.json'), 'utf8')).frases.map((f) => ({
  ...f,
  wav: path.join(DIR, 'falas', `${f.id}.wav`),
}))
/* As falas da AUDITORIA (`--auditoria <pasta falas>`, 17/11/2026), limpas e com ruído de restaurante: entram na
   conferência de idioma (o limiar precisa valer também com ruído) e no WER. */
const AUDITORIA = opt('auditoria', '')
const TEXTOS_DA_AUDITORIA = {
  pt1: 'Boa noite! Que bom que você veio jantar com a gente.',
  en1: 'Thank you so much for inviting me. The food smells amazing.',
  pt2: 'Você prefere vinho tinto ou suco de uva?',
  en2: 'Red wine, please. Where did you learn to cook like this?',
  pt3: 'Minha avó me ensinou quando eu era criança.',
  en3: 'That is beautiful. Could you pass me the salt, please?',
  es1: 'Perdón, ¿alguien quiere más pan?',
}
if (AUDITORIA)
  for (const [id, texto] of Object.entries(TEXTOS_DA_AUDITORIA))
    for (const sufixo of ['', '.ruido'])
      conjunto.push({
        id: `aud-${id}${sufixo}`,
        idioma: id.slice(0, 2),
        texto,
        wav: path.join(AUDITORIA, `${id}${sufixo}.wav`),
      })
const vergonha = JSON.parse(readFileSync(path.join(DIR, 'constrangedoras.json'), 'utf8'))
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const constrangedora = (id, texto) => {
  const t = ` ${semAcento(texto).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const termos = [...vergonha.termos, ...(vergonha.porFrase[id] ?? [])].map(semAcento)
  return termos.find((x) => t.includes(` ${x.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `)) ?? null
}

/** Espelho de `tokensPorSegundo` do worker: pt/es tokenizam pior que en. */
const tokensPorSegundo = (idioma) => (idioma === 'en' ? 15 : 22)

async function whisper(nome, dtype) {
  const asr = await pipeline('automatic-speech-recognition', `onnx-community/whisper-${nome}`, { dtype, device: 'cpu' })
  return {
    async transcrever(pcm, idioma) {
      const dur = pcm.length / 16000
      const t0 = performance.now()
      const out = await asr(pcm, {
        language: idioma,
        task: 'transcribe',
        return_timestamps: false,
        num_beams: 1,
        do_sample: false,
        max_new_tokens: Math.max(8, Math.min(idioma === 'en' ? 128 : 160, Math.round(dur * tokensPorSegundo(idioma)))),
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.15,
      })
      return { texto: filtrarAlucinacao((out.text ?? '').trim(), dur, idioma), ms: performance.now() - t0 }
    },
    async detectar(pcm) {
      const t0 = performance.now()
      const d = await detectarIdiomaDoAudio(asr, pcm, Tensor)
      return { ...d, ms: performance.now() - t0 }
    },
  }
}

function parakeet() {
  return {
    async transcrever(pcm, idioma) {
      const t0 = performance.now()
      const texto = await transcreverParakeet('v3-int8', pcm, [])
      return { texto: filtrarAlucinacao(texto.trim(), pcm.length / 16000, idioma), ms: performance.now() - t0 }
    },
    detectar: null,
  }
}

const med = (xs) => {
  const v = [...xs].sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : null
}

const resultado = { quando: new Date().toISOString(), modelos: {} }
for (const m of MODELOS) {
  const [nome, dtype] = m.split('@')
  const dtypeDoWhisper = dtype === 'hibrido' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : dtype || 'q8'
  const motor = nome === 'parakeet' ? parakeet() : await whisper(nome, dtypeDoWhisper)
  const linhas = []
  for (const f of conjunto) {
    const pcm = lerWav(readFileSync(f.wav))
    const audioMs = Math.round((pcm.length / 16000) * 1000)
    /* As frases em es são do teste da conferência: no Intérprete elas chegam no lado do inglês. */
    const ladoDe = f.idioma === 'es' ? 'en' : f.idioma
    const r = await motor.transcrever(pcm, ladoDe)
    const det = motor.detectar ? await motor.detectar(pcm) : null
    const e = f.idioma === 'es' ? null : wer(f.texto, r.texto)
    linhas.push({
      id: f.id,
      idioma: f.idioma,
      audioMs,
      referencia: f.texto,
      saida: r.texto,
      wer: e ? +e.taxa.toFixed(3) : null,
      constrangedora: f.idioma === 'es' ? null : constrangedora(f.id, r.texto),
      decodeMs: Math.round(r.ms),
      deteccao: det ? { idioma: det.idioma, confianca: +det.confianca.toFixed(3), ms: Math.round(det.ms) } : null,
    })
    console.log(m, f.id, JSON.stringify(r.texto).slice(0, 90), e ? `wer ${e.taxa.toFixed(2)}` : '', det?.idioma ?? '')
  }
  const doIdioma = (i) => linhas.filter((l) => l.idioma === i && !l.id.startsWith('aud-'))
  const werAgregado = (i) => {
    let erros = 0
    let ref = 0
    for (const l of doIdioma(i)) {
      const e = wer(l.referencia, l.saida)
      erros += e.distancia
      ref += e.unidadesNaReferencia
    }
    return ref ? +(erros / ref).toFixed(3) : null
  }
  const conferencia = {}
  if (motor.detectar)
    for (const limiar of LIMIARES) {
      const bloqueia = (l) =>
        !!idiomaForaDoPar({
          esperado: l.idioma === 'es' ? 'en' : l.idioma,
          conferido: l.deteccao,
          audioMs: l.audioMs,
          limiar,
        })
      conferencia[limiar] = {
        falsosBloqueiosNoPar: linhas.filter((l) => l.idioma !== 'es' && bloqueia(l)).map((l) => l.id),
        esPegos: linhas.filter((l) => l.idioma === 'es' && bloqueia(l)).map((l) => l.id),
      }
    }
  resultado.modelos[m] = {
    werPt: werAgregado('pt'),
    werEn: werAgregado('en'),
    constrangedoras: linhas.filter((l) => l.constrangedora).map((l) => `${l.id}: ${l.saida}`),
    decodeP50Ms: med(linhas.map((l) => l.decodeMs)),
    deteccaoP50Ms: motor.detectar ? med(linhas.map((l) => l.deteccao.ms)) : null,
    rss: Math.round(process.memoryUsage().rss / 2 ** 20),
    conferencia,
    linhas,
  }
  console.log(m, JSON.stringify({ ...resultado.modelos[m], linhas: undefined }))
}
if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado, null, 1))
