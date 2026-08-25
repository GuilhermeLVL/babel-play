import { env } from '@huggingface/transformers'

/**
 * Configuração de ENTREGA DOS PESOS, compartilhada pelos workers (Whisper + opus-mt).
 * Chamar uma vez no topo de cada worker.
 *
 * PADRÃO (sem VITE_SELF_HOST_MODELS): baixa os pesos do HF Hub e os guarda no Cache Storage
 * do navegador. Robusto em deploy same-origin (o cache é estável); a impressão de "re-download"
 * era só a barra reaparecendo em cache-hit — tratada na UI via modelCache.isModelCached.
 *
 * SELF-HOST (VITE_SELF_HOST_MODELS=1 — distribuição em escala / imagem Docker): serve os pesos
 * de `/models` no MESMO domínio (rode antes: `node scripts/fetch-models.mjs`, que baixa para
 * `public/models`). Same-origin = asset estático, IMUNE à partição do Cache Storage (o bug do
 * iframe do AI Studio) e cacheável pelo HTTP cache do navegador/CDN. Mantemos o remoto como rede
 * de segurança: se um arquivo não estiver self-hosted, o transformers.js cai para o HF Hub.
 */
export function configureModelDelivery(): void {
  const flag = (import.meta as any)?.env?.VITE_SELF_HOST_MODELS
  const selfHost = flag === '1' || flag === 'true'
  if (selfHost) {
    env.allowLocalModels = true
    env.localModelPath = '/models/'
    env.allowRemoteModels = true // fallback p/ HF se algum peso não estiver self-hosted
  } else {
    env.allowLocalModels = false
  }
  env.useBrowserCache = true
}
