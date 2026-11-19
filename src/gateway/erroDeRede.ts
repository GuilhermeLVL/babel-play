import { PADROES_DE_REDE } from '../core/falhas/mensagemDeFalha';

/**
 * A mensagem de erro é de REDE (download que não veio), e não do motor? (correção C do diagnóstico
 * do Safari, 22/10/2026.)
 *
 * Cada navegador escreve a falha do `fetch` de um jeito: WebKit/Safari `Load failed`, Chromium
 * `Failed to fetch`, Firefox `NetworkError when attempting to fetch resource.`. O transformers.js, num
 * 404, diz `Could not locate file`. A carga do Whisper no WebGPU que falhava por rede era lida como
 * "GPU ruim" e recriada em WASM — que falhava de novo, sem aviso. Rede que falha pede "Tentar de novo",
 * não outro motor.
 */
export function pareceErroDeRede(mensagem: string): boolean {
  // A marca do worker (`comMarcaDeFalha`): o cache recusou o arquivo cortado, é rede e não GPU.
  return PADROES_DE_REDE.test(mensagem) || mensagem.startsWith('[falha:download-interrompido]');
}
