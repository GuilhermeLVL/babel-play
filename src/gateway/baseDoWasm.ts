/**
 * DE ONDE O `onnxruntime-web` BUSCA O RUNTIME (`ort-wasm-*.{wasm,mjs}`): o valor de `ort.env.wasm.wasmPaths`
 * nos quatro lugares que o configuram (VAD ao vivo e em lote, fim de fala, Parakeet).
 *
 * Sem `VITE_ORT_WASM_URL` é `/`: os arquivos que o build copia para a raiz (`scripts/copiar-assets-runtime.mjs`).
 * Com ela, uma base absoluta num R2/CDN (`scripts/modelos/publicar-no-r2.ts --prefixo ort/<versão>`); a CSP
 * abre essa origem em `server/http/csp.ts`. O ORT concatena o nome do arquivo à base, daí a barra final.
 *
 * Valor inválido derruba na hora, com o nome da variável: um caminho relativo ou sem esquema viraria 404
 * silencioso no meio da captura. Módulo sem import de pacote: os workers o importam por caminho relativo.
 */
export function baseDoWasm(): string {
  const bruto = (import.meta.env?.VITE_ORT_WASM_URL as string | undefined)?.trim() ?? '';
  if (!bruto) return '/';
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new Error(
      `VITE_ORT_WASM_URL inválida: "${bruto}" não é uma URL absoluta (ex.: https://modelos.frasy.com.br/ort/)`,
    );
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error(`VITE_ORT_WASM_URL inválida: "${bruto}" precisa ser https:// (http:// só em localhost)`);
  return bruto.endsWith('/') ? bruto : `${bruto}/`;
}
