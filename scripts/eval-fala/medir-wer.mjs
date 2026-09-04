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
    /* `nuvem` só faz sentido com dica: é o que o `sttProxy` manda, e é a configuração que o plano
       pago entrega. Gerar a variante sem dica gastaria dinheiro para medir algo que não existe. */
    if (m === 'nuvem') { v.push({ nome: 'nuvem/com-dica-pt', modelo: m, idioma: 'pt', nuvem: true }); continue }
    v.push({ nome: `${m}/sem-dica`, modelo: m, idioma: undefined })
    v.push({ nome: `${m}/com-dica-pt`, modelo: m, idioma: 'pt' })
  }
  return v
}

/** Chave do STT de nuvem, do ambiente ou do `.env`. Nunca impressa. */
function chaveDaNuvem() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY
  for (const arquivo of ['.env', '../TradutorWeb/.env']) {
    try {
      const m = readFileSync(new URL(`../../${arquivo}`, import.meta.url), 'utf8').match(/^GROQ_API_KEY=(.+)$/m)
      if (m) return m[1].trim()
    } catch { /* ausente é normal */ }
  }
  throw new Error('GROQ_API_KEY não encontrada — a variante `nuvem` precisa dela')
}

/** Empacota PCM float32 de 16 kHz num WAV 16-bit — o formato que `server/ai/sttProxy.ts` recebe. */
function montarWav(pcm) {
  const bytes = pcm.length * 2
  const buf = Buffer.alloc(44 + bytes)
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(16000, 24); buf.writeUInt32LE(32000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(bytes, 40)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

/**
 * Transcreve pela NUVEM, espelhando `server/ai/sttProxy.ts:87-103`: multipart para
 * `/audio/transcriptions`, com `model` e `language`.
 *
 * POR QUE ESTA VARIANTE EXISTE. O plano pago promete "IA de nuvem, melhor que a local" — e isso
 * nunca foi medido. Sem o número, a promessa é marketing, e o preço não tem em que se apoiar.
 */
async function transcreverNaNuvem(chave, pcm, idioma) {
  const base = process.env.STT_BASE_URL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  const modelo = process.env.STT_MODEL || 'whisper-large-v3-turbo'

  /* ESPERA PROGRESSIVA NO 429, e ela é obrigatória para o número ser verdadeiro.
     Em 8 áudios seguidos a nuvem deu WER 23,4% sem nenhuma falha; em 48, vinte e oito voltaram
     vazias e o WER "medido" foi 64,7% — pior que o modelo local. Não era qualidade, era limite de
     requisição por minuto: cada recusa virava transcrição vazia, ou seja, deleção total. Um
     harness que engole 429 mede a cota do provedor e chama isso de acurácia do modelo. */
  for (let tentativa = 0; ; tentativa++) {
    const fd = new FormData()
    fd.append('file', new Blob([montarWav(pcm)], { type: 'audio/wav' }), 'audio.wav')
    fd.append('model', modelo)
    if (idioma) fd.append('language', idioma)
    fd.append('response_format', 'json')
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}` },
      body: fd,
      signal: AbortSignal.timeout(60_000),
    })
    if (r.ok) return ((await r.json()).text ?? '').trim()
    const corpo = (await r.text()).slice(0, 160)
    if ((r.status === 429 || r.status >= 500) && tentativa < 5) {
      // O provedor costuma dizer quanto esperar; quando não diz, dobra a partir de 2 s.
      const sugerido = Number(r.headers.get('retry-after')) * 1000
      const espera = Number.isFinite(sugerido) && sugerido > 0 ? sugerido : 2000 * 2 ** tentativa
      await new Promise((s) => setTimeout(s, espera))
      continue
    }
    throw new Error(`HTTP ${r.status}: ${corpo}`)
  }
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

  const nomesDeModelo = opt('modelos', 'tiny,base').split(',').map((s) => s.trim())
    .filter((m) => MODELOS[m] || m === 'nuvem')
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
    // A variante de nuvem não carrega modelo nenhum: o trabalho acontece do outro lado da rede.
    const asr = v.nuvem ? null : await pipeline('automatic-speech-recognition', MODELOS[v.modelo], { dtype: 'q8', device: 'cpu' })
    const chaveNuvem = v.nuvem ? chaveDaNuvem() : null
    const casos = []
    /** Casos EXCLUÍDOS por falha de infraestrutura — não entram na média, e são reportados. */
    const falhasDeInfra = []
    let msTotal = 0, audioTotalS = 0

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i]
      const pcm = audios.get(it.id)
      const audioSec = pcm.length / 16000
      const t0 = Date.now()
      let texto = ''
      try {
        if (v.nuvem) {
          /* SEM filtro de alucinação, porque a produção também não filtra esta rota: o adaptador
             `groqWhisper.ts:79` devolve `json.text` cru. Aplicá-lo aqui compararia dois
             pós-processamentos, não dois transcritores.
             E não é hipótese: na primeira versão eu apliquei o filtro SEM passar o idioma, o que
             baixa o teto de 8 para 6 palavras/segundo (o valor calibrado em inglês). A nuvem, que
             transcreve rápido e completo, estourava o teto e era descartada como alucinação — 31 de
             48 saídas viraram vazio, e a medição dizia que a nuvem era PIOR que o modelo local. */
          texto = await transcreverNaNuvem(chaveNuvem, pcm, v.idioma)
        } else {
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
          /* O IDIOMA importa e faltava: `whisperWorker.ts:204` passa `language`, e sem ele o teto
             de palavras/segundo cai de 8 (pt) para 6 (o valor de inglês) — descartando transcrição
             legítima de fala rápida como se fosse alucinação. */
          texto = filtrarAlucinacao((out.text ?? '').trim(), audioSec, v.idioma)
        }
      } catch (e) {
        /* Falha de DECODE conta como transcrição vazia — é o que o usuário veria na tela.
           Falha de INFRAESTRUTURA, não: cota estourada e servidor fora do ar não são propriedades
           do modelo, e contá-las como deleção mede o provedor no lugar da acurácia. Foi assim que
           a nuvem apareceu como PIOR que o modelo local (64,7% contra 57,2%) quando na verdade era
           muito melhor (23,4% num lote que coube na cota). */
        const infra = /HTTP (4[0-9]{2}|5[0-9]{2})/.test(e.message)
        console.warn(`\n  ! ${it.id}: ${e.message}`)
        if (infra) { falhasDeInfra.push({ id: it.id, erro: e.message }); continue }
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

    resultados.push({ variante: v.nome, modelo: v.modelo, idioma: v.idioma ?? null, geral, porFaixa, rtf, casos, falhasDeInfra })
    const nota = falhasDeInfra.length ? `  (${falhasDeInfra.length} de ${itens.length} FORA por falha de infra)` : ''
    console.log(`\r${v.nome}: WER ${(geral.wer * 100).toFixed(1)}%  CER ${(geral.cer * 100).toFixed(1)}%  RTF ${rtf.toFixed(2)}${nota}          `)
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
