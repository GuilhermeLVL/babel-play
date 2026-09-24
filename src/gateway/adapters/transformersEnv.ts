import { env } from '@huggingface/transformers';

import { urlFixadaDoModelo } from '../revisoesDosModelos';

/**
 * Configuração de ENTREGA DOS PESOS, compartilhada pelos workers (Whisper + opus-mt + WeSpeaker).
 * Chamar uma vez no topo de cada worker.
 *
 * `VITE_SELF_HOST_MODELS` decide DE ONDE vêm os pesos:
 *
 *  - ausente: do Hugging Face Hub, guardados no Cache Storage do navegador;
 *  - `1` (self-host / imagem Docker): de `/models` no MESMO domínio (rode antes
 *    `node scripts/fetch-models.mjs`, que baixa para `public/models`). Same-origin = asset estático,
 *    imune à partição do Cache Storage e cacheável pelo HTTP cache. O remoto fica de reserva;
 *  - uma URL `https://…` (produção, Fase 5): do bucket R2 público com os pesos publicados por
 *    `scripts/modelos/publicar-no-r2.ts` no layout `<modelo>/<sha>/<arquivo>`. Egress zero no R2 e
 *    nenhuma dependência do Hub no caminho do usuário.
 *
 * EM TODOS OS CASOS a revisão é FIXADA (GAP-014): o `fetch` do transformers.js passa por
 * `urlFixadaDoModelo`, que troca `resolve/main` pelo commit de `revisoesDosModelos.ts` — ou pelo
 * caminho do bucket. `main` é um ponteiro que o dono do repositório no Hub move quando quer.
 */
export function configureModelDelivery(): void {
  const flag = String((import.meta as { env?: Record<string, unknown> })?.env?.VITE_SELF_HOST_MODELS ?? '').trim();
  const mesmoDominio = flag === '1' || flag === 'true';
  const bucket = /^https:\/\//.test(flag) ? flag : undefined;

  if (mesmoDominio) {
    env.allowLocalModels = true;
    env.localModelPath = '/models/';
    env.allowRemoteModels = true; // fallback p/ HF se algum peso não estiver self-hosted
  } else {
    env.allowLocalModels = false;
  }
  env.useBrowserCache = true;

  const buscar = env.fetch ?? globalThis.fetch.bind(globalThis);
  env.fetch = (entrada: string | URL, init?: RequestInit) =>
    buscar(
      typeof entrada === 'string' || entrada instanceof URL ? urlFixadaDoModelo(String(entrada), bucket) : entrada,
      init,
    );
}
