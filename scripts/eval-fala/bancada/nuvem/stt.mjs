/**
 * MEDIÇÃO 1 — transcrição pela nuvem (OpenRouter) nas MESMAS falas medidas no aparelho.
 *
 * `POST /api/v1/audio/transcriptions`, formulário no formato do `sttProxy.ts` da produção: `file`
 * (o WAV 16 kHz mono da bancada), `model`, `language`, `temperature: 0`,
 * `response_format: verbose_json`. Mais o `provider` de retenção zero (`zdr` + `data_collection:
 * deny`), que a produção mandaria. Um pedido por vez; a latência é a do pedido inteiro (envio do
 * áudio + resposta lida), sem espera de ritmo nem tentativa falha.
 *
 * Uso:
 *   node scripts/eval-fala/bancada/nuvem/stt.mjs [--limite 3] [--conjuntos fleurs_pt,fleurs_en,fleurs_es]
 *        [--modelo openai/whisper-large-v3-turbo] [--so-provedor groq] [--ganho]
 * Retoma de onde parou (o bruto guarda cada fala). Pontuação: `pontuar.mjs`.
 */
/* global FormData, Blob, AbortSignal */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  autorizacao,
  BANCADA_DIR,
  BASE,
  bruto,
  conferirLote,
  flag,
  gastoTotal,
  lerJsonl,
  limpar,
  opt,
  TetoDeGasto,
  umaTentativaAMais,
} from './comum.mjs'

const MODELO = opt('modelo', 'openai/whisper-large-v3-turbo')
const CONJUNTOS = opt('conjuntos', 'fleurs_pt,fleurs_en,fleurs_es').split(',')
const LIMITE = Number(opt('limite', '0')) || 0
const RAIZ = path.join(BANCADA_DIR, 'navegador')
/**
 * Pior caso por segundo de áudio: o endpoint de retenção zero MAIS CARO do modelo em
 * `GET /api/v1/endpoints/zdr` (consultado em 09/10/2026): Groq, US$ 0,0000111111/s (= 0,04/h), que
 * fatura no mínimo 10 s por pedido. O mais barato é DeepInfra, US$ 0,00000333/s (= 0,012/h).
 */
const PIOR_USD_POR_S = { 'openai/whisper-large-v3-turbo': 0.0000111111 }
const MINIMO_S = 10
/**
 * `--so-provedor groq`: tenta prender o pedido a UM provedor (`only`). MEDIDO em 09/10/2026: o
 * endpoint de transcrição IGNORA o campo (3 falas pedidas com `only: ['groq']` foram atendidas e
 * cobradas pela DeepInfra). O `provider` da transcrição só aceita `zdr`, `data_collection` e
 * `options` (docs do SDK, `STTRequestProvider`). Fica aqui para repetir a sonda, não para medir.
 *
 * `--ganho`: DIAGNÓSTICO, fora da comparação com o aparelho. Normaliza o pico do WAV para −3 dBFS em
 * memória antes de enviar. As falas de inglês do FLEURS são gravadas muito baixo (mediana de −60 dBFS
 * contra −25 em português) e a rota padrão devolve texto cortado nelas; isto separa "o modelo não
 * entende" de "o provedor descarta áudio baixo".
 */
const SO_PROVEDOR = opt('so-provedor', '')
const GANHO = flag('ganho')
const PROVIDER = {
  zdr: true,
  data_collection: 'deny',
  ...(SO_PROVEDOR ? { only: [SO_PROVEDOR], allow_fallbacks: false } : {}),
}

if (!PIOR_USD_POR_S[MODELO]) throw new Error(`${MODELO}: sem preço de pior caso — sem preço não há teto`)
const piorCaso = (duracaoS) => Math.max(MINIMO_S, duracaoS) * PIOR_USD_POR_S[MODELO]

/** Pico em −3 dBFS. WAV PCM16 com cabeçalho de 44 bytes (o que `preparar-audio.py` grava). */
function normalizarPico(wav) {
  const saida = Buffer.from(wav)
  let pico = 1
  for (let i = 44; i + 1 < saida.length; i += 2) pico = Math.max(pico, Math.abs(saida.readInt16LE(i)))
  const g = (32767 * 10 ** (-3 / 20)) / pico
  for (let i = 44; i + 1 < saida.length; i += 2)
    saida.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(saida.readInt16LE(i) * g))), i)
  return { wav: saida, ganhoDb: 20 * Math.log10(g) }
}

async function transcrever(wav, idioma) {
  const fd = new FormData()
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
  fd.append('model', MODELO)
  fd.append('language', idioma)
  fd.append('temperature', '0')
  fd.append('response_format', 'verbose_json')
  fd.append('provider', JSON.stringify(PROVIDER))
  const t0 = performance.now()
  const r = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: autorizacao(),
    body: fd,
    signal: AbortSignal.timeout(60_000),
  })
  const corpo = await r.text()
  return { ok: r.ok, status: r.status, corpo, ms: performance.now() - t0 }
}

const sistema = `openrouter:${MODELO}${SO_PROVEDOR ? `@${SO_PROVEDOR}` : ''}${GANHO ? '+ganho' : ''}`
let parar = null
for (const conj of CONJUNTOS) {
  if (parar) break
  const itens = lerJsonl(path.join(RAIZ, 'stt', `${conj}.jsonl`)).slice(0, LIMITE || undefined)
  const b = bruto(`stt_${sistema}_${conj}`)
  Object.assign(b.dados, { sistema, conjunto: conj, modelo: MODELO, provider: PROVIDER, temperatura: 0 })
  const faltam = itens.filter((it) => !b.dados.casos[it.id]?.ok)
  try {
    conferirLote(
      `${conj} (${faltam.length} falas)`,
      faltam.reduce((s, it) => s + piorCaso(it.duracaoS), 0),
    )
  } catch (e) {
    parar = e.message
    break
  }
  let feitos = 0
  for (const it of faltam) {
    const original = readFileSync(path.join(RAIZ, it.arquivo))
    const { wav, ganhoDb } = GANHO ? normalizarPico(original) : { wav: original, ganhoDb: 0 }
    let r
    try {
      r = await umaTentativaAMais(sistema, piorCaso(it.duracaoS), () => transcrever(wav, it.idioma))
    } catch (e) {
      if (e instanceof TetoDeGasto) {
        parar = e.message
        break
      }
      throw e
    }
    if (r.erro) {
      b.dados.casos[it.id] = { ok: false, erro: r.erro, tentativas: r.tentativas }
      b.salvar()
      console.error(`\n  ${it.id}: ${r.erro}`)
      // Recusa de formato, de modelo ou de retenção zero vale para todas as falas: não insiste.
      if (/^HTTP 4/.test(r.erro) && !/^HTTP 429/.test(r.erro)) {
        parar = `o endpoint recusou o pedido (${r.erro}) — medição interrompida`
        break
      }
      continue
    }
    let j = null
    try {
      j = JSON.parse(r.corpo)
    } catch {
      /* corpo que não é JSON: cobra o reservado e registra */
    }
    const custo = typeof j?.usage?.cost === 'number' ? j.usage.cost : Number.NaN
    r.acertar(custo)
    b.dados.casos[it.id] = {
      ok: typeof j?.text === 'string',
      texto: typeof j?.text === 'string' ? j.text : '',
      ms: Math.round(r.ms),
      tentativas: r.tentativas,
      ...(GANHO ? { ganhoDb: Math.round(ganhoDb * 10) / 10 } : {}),
      usd: Number.isFinite(custo) ? custo : null,
      usdReservado: piorCaso(it.duracaoS),
      uso: j?.usage ?? null,
      idiomaDevolvido: j?.language ?? null,
      duracaoDevolvidaS: j?.duration ?? null,
      provedorReal: typeof j?.provider === 'string' ? j.provider : null,
      camposDaResposta: j ? Object.keys(j) : null,
      segmentos: Array.isArray(j?.segments)
        ? j.segments.map((s) => ({
            start: s.start,
            end: s.end,
            avg_logprob: s.avg_logprob,
            no_speech_prob: s.no_speech_prob,
            compression_ratio: s.compression_ratio,
          }))
        : null,
      ...(j ? {} : { corpoCru: limpar(r.corpo).slice(0, 300) }),
    }
    b.salvar()
    process.stdout.write(
      `\r  ${sistema} × ${conj}: ${++feitos}/${faltam.length}  gasto US$ ${gastoTotal().toFixed(5)}   `,
    )
  }
  b.dados.geradoEm = new Date().toISOString()
  b.salvar()
  console.log()
}
if (parar) {
  console.error(`PARADO: ${limpar(parar)}`)
  process.exitCode = 2
}
console.log(`livro-caixa: US$ ${gastoTotal().toFixed(6)}`)
