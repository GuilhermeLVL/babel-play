/**
 * CLIENTE da impressão de voz (ver speakerIdWorker.ts). Contrato best-effort DELIBERADO:
 * a identificação de falante é um EXTRA da captura — se o modelo não carregar (offline no
 * primeiro uso, browser sem WASM), a captura segue normal com o falante genérico. Por isso
 * `embedUtterance` devolve `null` em qualquer falha e NUNCA rejeita.
 */

/**
 * Enunciado mais curto que isto não tem voz suficiente para identificar (herda o falante anterior).
 *
 * Era 0.8s e foi elevado depois de uma conversa de DUAS pessoas ser dividida em seis: trechos de
 * ~1s ("ou se fosse feito") produzem embeddings instáveis, e cada instabilidade virava uma pessoa
 * nova. Herdar a voz anterior num trecho curto erra menos do que inventar gente — na fala real,
 * um fragmento curto quase sempre é a mesma pessoa terminando a frase.
 */
const MIN_EMBED_SECONDS = 1.2

let worker: Worker | null = null
let broken = false // modelo falhou nesta sessão → não insiste (evita spam de erro)
let seq = 0
const pending = new Map<number, { resolve: (v: Float32Array | null) => void }>()

function getWorker(): Worker | null {
  if (broken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./speakerIdWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    broken = true
    return null
  }
  worker.onmessage = (e: MessageEvent) => {
    const { type, id, embedding, error } = e.data as {
      type: string; id: number; embedding?: Float32Array; error?: string
    }
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (type === 'embedding' && embedding) p.resolve(embedding)
    else {
      if (error) console.warn('[speakerId] falha no embedding:', error)
      p.resolve(null)
    }
  }
  worker.onerror = (e) => {
    console.warn('[speakerId] worker morreu — identificação de voz desativada nesta sessão:', e.message)
    broken = true
    for (const p of pending.values()) p.resolve(null)
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/**
 * Pré-carrega o modelo (6,7MB, cacheado) em background. `false` = indisponível — o painel
 * Falantes usa isso para avisar honestamente que a identificação automática não vai rolar.
 */
export function preloadSpeakerId(): Promise<boolean> {
  const w = getWorker()
  if (!w) return Promise.resolve(false)
  const id = ++seq
  return new Promise((resolve) => {
    // Listener PRÓPRIO (fora do mapa de pendências — aquele é só dos embeddings).
    const onMsg = (e: MessageEvent) => {
      if (e.data?.id !== id) return
      w.removeEventListener('message', onMsg)
      if (e.data.type === 'loaded') resolve(true)
      else { broken = true; resolve(false) }
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ type: 'load', id })
  })
}

/** Embedding (256 dims) da voz de um enunciado; `null` = curto demais / modelo indisponível. */
export function embedUtterance(pcm: Float32Array, sr: number): Promise<Float32Array | null> {
  if (!pcm || pcm.length / (sr || 16000) < MIN_EMBED_SECONDS) return Promise.resolve(null)
  const w = getWorker()
  if (!w) return Promise.resolve(null)
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, { resolve })
    // Cópia própria: o PCM original segue vivo no pipeline do Whisper (transfer o clonaria fora).
    const copy = pcm.slice()
    w.postMessage({ type: 'embed', id, pcm: copy, sr }, [copy.buffer])
  })
}

/** Derruba o worker (fim da sessão de captura) — libera memória do modelo. */
export function disposeSpeakerId(): void {
  worker?.terminate()
  worker = null
  broken = false
  for (const p of pending.values()) p.resolve(null)
  pending.clear()
}
