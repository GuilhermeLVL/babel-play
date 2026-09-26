/**
 * DETECÇÃO DE IDIOMA PELO ÁUDIO no Whisper local — o que o transformers.js não faz.
 *
 * Com "Detectar", o pipeline manda o trecho SEM `language`. O transformers.js 4.2.0
 * (`models/whisper/modeling_whisper.js`, `_retrieve_init_tokens`) tem um TODO no lugar da detecção:
 * loga "No language specified - defaulting to English (en)" e força `<|en|>`. Whisper multilíngue
 * forçado a `<|en|>` sobre fala em português não transcreve, TRADUZ para inglês — era a legenda em
 * inglês que aparecia antes da tradução num vídeo todo em português (reproduzido em Node com FLEURS
 * pt: "Alguns cruzeiros mostram Berlim…" → "Some cross-shops show Berlin…").
 *
 * A detecção aqui é a do Whisper original (`detect_language`): um passo do decoder a partir de
 * `<|startoftranscript|>` e softmax só entre os tokens de idioma. Custa um passe do encoder a mais,
 * e só enquanto o idioma da sessão é desconhecido: quando o perfil adaptativo converge, o pipeline
 * passa a mandar a dica e este passo some.
 *
 * Medido (whisper-base híbrido, CPU, 20 falas FLEURS por idioma): fala inteira 20/20 em pt e en;
 * 3 s, 18/20 pt e 20/20 en; 1,5 s, só 12/20 pt. Por isso a confiança volta ao chamador — trecho
 * curto ou incerto entra como evidência fraca no perfil (`pesoDaDeteccao`).
 */

export interface IdiomaDetectado {
  /** Código do Whisper (ISO-639-1 na maioria: 'pt', 'en', 'es'…). */
  idioma: string;
  /** Probabilidade do idioma vencedor entre os tokens de idioma (0..1). */
  confianca: number;
}

/**
 * Idioma mais provável a partir dos logits do PRIMEIRO passo do decoder (posição após
 * `<|startoftranscript|>`). `langToId` é o `generation_config.lang_to_id` do modelo
 * (`{'<|pt|>': 50267, …}`).
 */
export function idiomaDosLogits(logits: ArrayLike<number>, langToId: Record<string, number>): IdiomaDetectado | null {
  const candidatos = Object.entries(langToId).filter(([, id]) => id < logits.length);
  if (!candidatos.length) return null;
  let max = -Infinity;
  for (const [, id] of candidatos) max = Math.max(max, logits[id]);
  let soma = 0;
  let melhor = { token: '', e: -1 };
  for (const [token, id] of candidatos) {
    const e = Math.exp(logits[id] - max);
    soma += e;
    if (e > melhor.e) melhor = { token, e };
  }
  const idioma = melhor.token.replace(/^<\|/, '').replace(/\|>$/, '');
  return idioma ? { idioma, confianca: melhor.e / soma } : null;
}

/** O pedaço do pipeline ASR do transformers.js que a detecção usa (tipado à mão: a lib é `any` aqui). */
interface AsrWhisper {
  processor: (pcm: Float32Array) => Promise<{ input_features: unknown }>;
  model: ((entrada: Record<string, unknown>) => Promise<{ logits: { data: ArrayLike<number> } }>) & {
    generation_config?: {
      is_multilingual?: boolean;
      decoder_start_token_id?: number;
      lang_to_id?: Record<string, number>;
    };
  };
}

type FabricaDeTensor = new (tipo: 'int64', dados: BigInt64Array, dims: number[]) => unknown;

/**
 * Detecta o idioma do trecho. `null` = o modelo não é multilíngue (um `.en`, que não aceita
 * `language` de qualquer forma) — aí o chamador decodifica sem idioma, como sempre.
 */
export async function detectarIdiomaDoAudio(
  asr: AsrWhisper,
  pcm: Float32Array,
  Tensor: FabricaDeTensor,
): Promise<IdiomaDetectado | null> {
  const gc = asr.model.generation_config;
  if (!gc?.is_multilingual || !gc.lang_to_id || gc.decoder_start_token_id == null) return null;
  const { input_features } = await asr.processor(pcm);
  const inicio = new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
  const { logits } = await asr.model({ input_features, decoder_input_ids: inicio });
  // Uma posição só no decoder (o <|startoftranscript|>): os logits dela são o vetor inteiro.
  return idiomaDosLogits(logits.data, gc.lang_to_id);
}
