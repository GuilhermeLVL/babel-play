/**
 * Web Worker de TRADUÇÃO local (opus-mt via Transformers.js), rodando em WASM (CPU) de
 * propósito: mantém a GPU livre para o Whisper (sem contenção) e elimina a latência de rede
 * do MyMemory (que medimos em ~476ms p50 / ~1900ms p95). Modelos pequenos, carregados sob
 * demanda por direção. Espelha o padrão do whisperWorker.
 */
import { pipeline } from '@huggingface/transformers'
import { configureModelDelivery } from './transformersEnv'
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress'
import { registrarModeloBaixado } from '../modelManifest'

// Entrega dos pesos: cache do navegador (padrão) ou self-host same-origin (VITE_SELF_HOST_MODELS).
configureModelDelivery()

/**
 * Progresso de download do opus-mt (~113 MB no int8).
 *
 * A versão anterior tratava `progress` (percentual DO ARQUIVO) e `progress_total` (o agregado)
 * no mesmo ramo, e `done` (que é por arquivo e nem carrega `total`) como 100%. Resultado medido:
 * a barra oscilava para trás continuamente — 46, 52, 47, 53, 47, 54… — e batia 100% aos 0,75 s.
 * Ver docs/discovery/A-model-download.md (A-P0-2) e tests/modelProgress.test.ts.
 *
 * Estado por carga: cada dtype do cascade tem arquivos e total diferentes.
 */
function novoProgresso(rotulo: string) {
  // Ver whisperWorker: o total agregado vira `bytesEsperados` do manifesto.
  let bytesEsperados = 0
  const rastrear = criarRastreadorDeProgresso((p) => {
    if (p.total > 0) bytesEsperados = p.total
    self.postMessage({
      type: 'progress',
      progress: p.progress,
      loaded: p.loaded,
      total: p.total,
      label: rotuloDeBytes(p.loaded, p.total) ?? rotulo,
    })
  })
  return Object.assign(rastrear, { get bytesEsperados() { return bytesEsperados } })
}

// Direção → (modelo opus-mt, token de idioma-alvo do grupo ROMANCE quando aplicável).
// ids verificados no HF Hub. Os modelos *-ROMANCE cobrem PT/ES/FR/IT/... via prefixo >>xx<<.
interface DirCfg { model: string; prefix?: string }
function dirConfig(src: string, tgt: string): DirCfg | null {
  const s = src.toLowerCase().split('-')[0]
  const t = tgt.toLowerCase().split('-')[0]
  const ROMANCE = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl'])
  if (s === 'en' && ROMANCE.has(t)) return { model: 'Xenova/opus-mt-en-ROMANCE', prefix: `>>${t}<<` }
  if (ROMANCE.has(s) && t === 'en') return { model: 'Xenova/opus-mt-ROMANCE-en' }
  return null // par não coberto → o gateway cai para o próximo adapter (MyMemory)
}

const pipes = new Map<string, any>()
// Modelos que JÁ falharam a criação de sessão nesta máquina/navegador (ex.: o erro real observado
// em produção: "Can't create a session … qdq_actions.cc:137" — o ORT não consegue criar a sessão
// ONNX do opus-mt quantizado neste ambiente). Sem este cache, cada tradução re-tentava o download
// + o cascade de dtypes e falhava de novo, inundando o console e gastando ciclos. Falhou uma vez →
// falha rápido para sempre → o gateway cai limpo para o próximo adapter (Chrome/Edge Translator).
const failedModels = new Map<string, string>()
// Ordem de dtype: int8 (menor, ~113MB) → fp16 (~223MB, sempre funciona). EVITAMOS q8/q4/bnb4/
// q4f16 desses opus-mt: usam quant de 4-bit "NBits" que quebra a criação de sessão no ORT atual
// ("MatMulNBits Missing required scale"). WASM (CPU) p/ não disputar a GPU com o Whisper.
const MT_DTYPES = ['int8', 'fp16'] as const
async function getPipe(model: string): Promise<any> {
  let p = pipes.get(model)
  if (p) return p
  const prevFail = failedModels.get(model)
  if (prevFail) {
    // Fail-fast: já sabemos que este modelo não carrega aqui — não re-tenta o cascade.
    throw new Error(`opus-mt indisponível neste ambiente (falha anterior: ${prevFail})`)
  }
  let lastErr: unknown = null
  for (const dtype of MT_DTYPES) {
    try {
      const progresso = novoProgresso('Tradutor (opus-mt)')
      p = await pipeline('translation', model, { device: 'wasm', dtype, progress_callback: progresso })
      pipes.set(model, p)
      console.log(`[mt:worker] ${model} carregado (dtype=${dtype})`)
      // Manifesto com o dtype que REALMENTE venceu o cascade (int8 ou fp16 baixam arquivos
      // diferentes — a versao antiga classificava os dois como "em cache").
      void registrarModeloBaixado(model, dtype, 'wasm', progresso.bytesEsperados)
      return p
    } catch (e) {
      lastErr = e
      console.warn(`[mt:worker] dtype ${dtype} falhou: ${String((e as Error)?.message || e).slice(0, 80)}`)
    }
  }
  const msg = String((lastErr as Error)?.message || lastErr).slice(0, 120)
  failedModels.set(model, msg)
  console.warn(`[mt:worker] ${model} DESATIVADO nesta sessão (todos os dtypes falharam) — usando tradutor de fallback.`)
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, text, src, tgt } = e.data

  // PRELOAD: carrega o modelo da direção em background (o adapter só roteia p/ cá quando 'ready').
  if (type === 'preload') {
    const cfg = dirConfig(src, tgt)
    if (!cfg) { self.postMessage({ type: 'loadError', model: `${src}->${tgt}` }); return }
    try { await getPipe(cfg.model); self.postMessage({ type: 'ready', model: cfg.model }) }
    catch (err) { self.postMessage({ type: 'loadError', model: cfg.model, message: err instanceof Error ? err.message : String(err) }) }
    return
  }

  if (type !== 'translate') return
  try {
    const cfg = dirConfig(src, tgt)
    if (!cfg) {
      self.postMessage({ type: 'error', id, message: `par ${src}->${tgt} não suportado pelo opus-mt` })
      return
    }
    const pipe = await getPipe(cfg.model)
    const input = cfg.prefix ? `${cfg.prefix} ${text}` : text
    const out = await pipe(input)
    console.log('[mt:worker] out shape:', JSON.stringify(out).slice(0, 200))
    const translated = Array.isArray(out) ? out[0]?.translation_text : out?.translation_text
    self.postMessage({ type: 'result', id, text: (translated ?? '').trim() })
  } catch (err) {
    console.error('[mt:worker] ERRO:', err instanceof Error ? (err.stack || err.message) : String(err))
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
