/**
 * MOONSHINE — o STT local de INGLÊS (licença MIT, só inglês), no lugar do whisper-tiny.
 *
 * Por que trocou (bancada 2026-09-24, FLEURS en_us, 300 falas, mesmo decode e filtros da produção;
 * `scripts/eval-fala/bancada/stt.mjs`, resultados em `docs/auditoria/eval/bancada-2026-09/`):
 *
 *   whisper-tiny (híbrido)   WER 19,7%   alucina em 70,6% dos 126 trechos sem fala   117 MB
 *   moonshine-base q8        WER 10,9%   alucina em ~0,8%                             ~67 MB
 *   moonshine-tiny q8        WER 15,5%   alucina em 0,0%                              ~32 MB
 *
 * Metade do erro, quase zero invenção em silêncio e metade do download. A contrapartida é que ele
 * NÃO é multilíngue: fala em português decodificada por ele vira inglês inventado. Por isso o
 * roteador (`sttRouter.ts`) só o escolhe quando TODAS as fontes são inglês, e o adapter tem uma
 * guarda que troca para o whisper-base se uma dica de outro idioma aparecer mesmo assim.
 *
 * Funções puras aqui para o worker e o adapter usarem a MESMA régua — e para os testes a verem sem
 * subir um Web Worker.
 */

/**
 * dtype do moonshine: `q8` uniforme, o que a bancada mediu (10,9% de WER no base). O `hybrid` do
 * Whisper (encoder fp32 + decoder q4) é uma escolha sobre o encoder do WHISPER, que degrada com
 * quantização; não vale como regra para outra arquitetura, e baixaria ~4× mais.
 */
export const DTYPE_MOONSHINE = 'q8';

/**
 * Opções de SESSÃO do ONNX Runtime para o moonshine: otimização de grafo só `basic`.
 *
 * MEDIDO no Chromium (WASM, transformers.js 4.2, 2026-09-24): com o nível padrão (`all`) — e também
 * com `extended` — a sessão do `decoder_model_merged_quantized` NEM ABRE: a fusão
 * `TransposeDQWeightsForMatMulNBits` do ORT-web procura uma escala que o grafo q8 do Hub não tem
 * ("Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale"). O mesmo erro com
 * `int8` e `uint8`. Com `basic` a sessão abre e o texto sai igual ao da bancada (que rodou no
 * onnxruntime-node, onde a fusão não quebra). Sem isto, o inglês local simplesmente não carregaria.
 */
export const SESSAO_MOONSHINE = { graphOptimizationLevel: 'basic' } as const;

/**
 * Backend do moonshine: SEMPRE WASM. O q8 foi validado em WASM (acima); no WebGPU do ORT-web os
 * pesos int8 não têm kernel nativo de GPU e o caminho não pôde ser medido aqui (o Chromium headless
 * desta máquina não obtém adaptador WebGPU nem para o whisper-tiny de controle). Em WASM 1 thread o
 * decode já é bem mais rápido que o tempo real (RTF ~0,1 no Chromium), então não há o que ganhar
 * arriscando um caminho sem medição. Vence o override `babel.whisperDevice`.
 */
export const DEVICE_MOONSHINE = 'wasm' as const;

/** O id do modelo é da família Moonshine? */
export function ehMoonshine(modelId?: string | null): boolean {
  return /moonshine/i.test(modelId || '');
}

/**
 * O moonshine pode decodificar um trecho com esta dica de idioma? Só inglês. Dica AUSENTE conta
 * como aceita: a rota que o escolheu já exigiu conteúdo e microfone em inglês, e o adapter não
 * recebe dica em todo caminho.
 */
export function moonshineAceita(languageHint?: string): boolean {
  const l = (languageHint || '').toLowerCase().split('-')[0];
  return !l || l === 'en';
}

/**
 * Opções de decode do moonshine: SÓ `max_new_tokens`. O pipeline do transformers.js repassa as
 * opções direto ao `generate` — `language`/`task`/`return_timestamps`/`num_beams` são do Whisper e
 * não significam nada aqui. O teto segue a régua anti-alucinação do Whisper (~15 tokens por segundo
 * de áudio, folgado para fala em inglês; piso 8 para parcial curtíssimo, teto 128). Sem o teto, o
 * pipeline usa o padrão dele (6 tokens × segundos INTEIROS), que zera em trecho < 1 s e trunca fala
 * rápida.
 */
export function opcoesDeDecodeMoonshine(audioSec: number): { max_new_tokens: number } {
  return { max_new_tokens: Math.max(8, Math.min(128, Math.round(audioSec * 15))) };
}
