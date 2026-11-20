import { env } from '@huggingface/transformers';

import { baseDoWasm } from '../baseDoWasm';
import { criarCacheDePesos, NOME_DO_CACHE } from '../cacheDePesos';
import { urlFixadaDoModelo } from '../revisoesDosModelos';
import { comPoliticaDoHub } from '../semReferer';

type WasmPaths = string | URL | { mjs?: string | URL; wasm?: string | URL } | undefined;

/**
 * Os `wasmPaths` que a transformers.js definiu (objeto `{ mjs, wasm }` no jsDelivr, com a variante certa para o
 * navegador) com a MESMA variante na base do Frasy. Sem objeto (ninguém definiu), a base inteira.
 */
export function wasmPathsNaBase(atual: WasmPaths, base: string): WasmPaths {
  const naBase = (u: string | URL | undefined) => (u ? base + String(u).split('/').pop() : u);
  if (atual instanceof URL) return base;
  if (atual && typeof atual === 'object') return { ...atual, mjs: naBase(atual.mjs), wasm: naBase(atual.wasm) };
  return base;
}

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

  /* O CACHE QUE SE CONFERE (DISP-01, `cacheDePesos.ts`): o mesmo `transformers-cache` de antes, mas o peso
     truncado ou trocado não é gravado, e a cópia envenenada de antes é apagada na leitura. */
  if (typeof caches !== 'undefined') {
    env.useCustomCache = true;
    env.customCache = criarCacheDePesos({ abrir: () => caches.open(NOME_DO_CACHE) });
  }

  /* O RUNTIME DO ONNX DO PRÓPRIO FRASY (DISP-05): sem isto a transformers.js busca `ort-wasm-*` no jsDelivr
     (`backends/onnx.js`). Mesmos arquivos que ela escolheria (asyncify; o simples no Safari), na base do app
     (`/`, copiados por `scripts/copiar-assets-runtime.mjs`) ou no R2 (`VITE_ORT_WASM_URL`). */
  try {
    const wasm = env.backends?.onnx?.wasm;
    if (wasm) wasm.wasmPaths = wasmPathsNaBase(wasm.wasmPaths, baseDoWasm()) as typeof wasm.wasmPaths;
  } catch {
    // ambiente sem o backend ONNX (testes): nada a trocar
  }

  // Busca ao Hub vai SEM referer (`semReferer.ts`): o Hub recusa a origem `*.workers.dev` do staging.
  const buscar = env.fetch ?? globalThis.fetch.bind(globalThis);
  env.fetch = (entrada: string | URL, init?: RequestInit) => {
    if (typeof entrada !== 'string' && !(entrada instanceof URL)) return buscar(entrada, init);
    const url = urlFixadaDoModelo(String(entrada), bucket);
    return buscar(url, comPoliticaDoHub(url, init));
  };
}
