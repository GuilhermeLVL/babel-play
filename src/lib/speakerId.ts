/**
 * CLIENTE da impressão de voz (ver speakerIdWorker.ts). Contrato best-effort DELIBERADO:
 * a identificação de falante é um EXTRA da captura — se o modelo não carregar (offline no
 * primeiro uso, browser sem WASM), a captura segue normal com o falante genérico. Por isso
 * `embedUtterance` devolve `null` em qualquer falha e NUNCA rejeita.
 */

/**
 * Enunciado mais curto que isto não tem voz suficiente para identificar (herda o falante anterior).
 *
 * Era 0.8s e foi elevado para 1.2s depois de uma conversa de DUAS pessoas ser dividida em seis:
 * trechos de ~1s produzem embeddings instáveis, e cada instabilidade virava uma pessoa nova.
 *
 * MEDIDO EM 2026-08-30, e o piso de 1,2s tem a falha OPOSTA, que é pior. No cenário
 * `turnos-curtos` (réplicas curtas alternando entre duas pessoas — a conversa real, com "sim",
 * "não", "entendi"), herdar o falante anterior funde as DUAS PESSOAS NUMA SÓ: DER 49%, pureza
 * 50%, um único cluster para dois falantes. Varredura do piso, mesmos cenários:
 *
 *   1,2s → DER 49%  pureza  50%  1 cluster p/ 2 pessoas   (FUNDE — o pior para o usuário)
 *   0,8s → DER 44%  pureza  50%  2 clusters
 *   0,5s → DER 19%  pureza 100%  3 clusters p/ 2 pessoas  (fragmenta de leve)
 *   0,3s → idêntico a 0,5s
 *
 * A ESCOLHA DE 0,5s É UMA TROCA CONSCIENTE: fusão por fragmentação. Fundir dá o mesmo nome a duas
 * pessoas e o usuário não tem como desfazer; fragmentar aparece como uma pessoa a mais, que o
 * `mergeThreshold` do agrupador reconcilia sozinho quando chega uma fala melhor, e que o painel
 * Falantes permite renomear. DER médio nos sete cenários: 16,5% → 12,2%.
 *
 * Tentativa que NÃO funcionou, registrada para ninguém repetir: deixar a fala curta ser embedada
 * mas sem poder criar falante novo. Resultado idêntico ao de herdar — se todas as falas são
 * curtas, nenhuma cria ninguém e todas caem na primeira pessoa. O mesmo colapso por outro caminho.
 *
 * Ver docs/auditoria/eval-diarizacao-baseline-v1.md.
 */
const MIN_EMBED_SECONDS = 0.5

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
    console.warn('[speakerId] worker morreu, identificação de voz desativada nesta sessão:', e.message)
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
