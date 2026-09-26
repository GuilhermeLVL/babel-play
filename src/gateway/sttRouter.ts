/**
 * ROTEADOR DE MODELO STT — a camada inteligente que escolhe o motor de transcrição
 * conforme o IDIOMA da sessão, o dispositivo e a política do usuário.
 *
 * Por que existe (bug de credibilidade): o whisper-tiny é treinado majoritariamente em
 * inglês — em PT-BR (e outros idiomas) ele erra feio ("fellowo americano"). O produto
 * não pode soar quebrado justamente no idioma nativo do usuário. A régua:
 *
 *   EN            → moonshine-base local (só inglês, MIT; na bancada FLEURS 2026-09-24: 10,9% de
 *                   WER contra 19,7% do whisper-tiny, ~0% de alucinação em silêncio contra 70,6%,
 *                   e ~67 MB contra 117 MB — ver `adapters/moonshine.ts`).
 *   não-EN / auto → NUVEM primeiRO quando disponível (Groq whisper-large-v3-turbo —
 *                   a melhor qualidade multilíngue, ~1s/trecho), com modelo LOCAL de
 *                   reserva; sem nuvem → small (WebGPU) ou base (WASM: small é lento
 *                   demais para tempo real sem GPU).
 *
 * Honestidades: o perfil Privado/Local NUNCA roteia para a nuvem; o usuário pode
 * sobrepor tudo com a preferência "Qualidade da transcrição" (fast/accurate/cloud);
 * e o selo da UI sempre diz qual motor está de fato em uso.
 */

import { edicaoEstatica } from '../lib/edicaoEstatica';

export type SttQuality = 'auto' | 'fast' | 'accurate' | 'cloud';

export interface SttRouteInput {
  /** ISO-639-1 do idioma do CONTEÚDO (o que será transcrito). '' quando desconhecido. */
  contentLang: string;
  /** Modo multi-idioma ligado (detecção por fala) — tratado como não-EN. */
  autoDetect: boolean;
  /** Preferência do usuário (settings.ui.sttQuality). */
  quality: SttQuality;
  /**
   * Há um ADAPTADOR WebGPU (`temAdaptadorWebGpu`, não `!!navigator.gpu`) — sem ele, small local é
   * lento demais (18,6 s por legenda no WASM, auditoria de latência 2026-09-26).
   */
  hasWebGpu: boolean;
  /** O servidor tem STT de nuvem configurado (GET /api/ai/stt/available → 200). */
  cloudAvailable: boolean;
  /** Perfil de IA ativo — 'local-private' proíbe nuvem. */
  profileId: string;
  /**
   * Idioma que VOCÊ fala ao MICROFONE, quando o mic está ligado (cenários conversa/mic). Um só
   * modelo decodifica as duas fontes — se você fala PT enquanto ouve EN, o tiny "de inglês" é
   * quem transcreve o seu português, e erra feio. Vazio/undefined = mic desligado.
   */
  micLang?: string;
}

export interface SttRoute {
  /** Modelo local a carregar (sempre definido — é a reserva mesmo no modo nuvem). */
  localModel: string;
  /** true = tentar a nuvem (groq-whisper) PRIMEIRO, local como reserva. */
  preferCloud: boolean;
  /** Rótulo honesto para o selo da UI. */
  label: string;
}

export const WHISPER_MODELS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
} as const;

/**
 * Moonshine — SÓ INGLÊS. Nunca entra numa rota em que alguma fonte (sistema ou microfone) possa
 * ser de outro idioma: decodificaria português como inglês inventado. O tiny só aparece no
 * "rápido" em inglês (é o menor de todos: ~32 MB e 15,5% de WER, ainda melhor que o whisper-tiny).
 */
export const MOONSHINE_MODELS = {
  tiny: 'onnx-community/moonshine-tiny-ONNX',
  base: 'onnx-community/moonshine-base-ONNX',
} as const;

/**
 * Tamanho do download, para informar o usuário ANTES de baixar.
 *
 * ATENÇÃO — o tamanho depende do DTYPE, não só do modelo. Os valores antigos (33/85/250) descreviam
 * um dtype quantizado; o padrão do app é `hybrid` (encoder fp32 + decoder q4), que baixa bem mais.
 *
 * MEDIDO pelo canário de payload real (`results/R1-canario-real.json`, 2026-08-08): o agregado que
 * a própria lib reporta para `whisper-tiny` no dtype padrão é **116,72 MB** — 3,5× o valor que
 * estava aqui. Como este número agora aparece no onboarding, subestimá-lo é mentir para o usuário
 * exatamente onde a F1 se propôs a ser honesta.
 *
 * `tiny` está medido. `base` e `small` eram ESTIMADOS pela proporção de parâmetros (300 e 880 MB), e
 * o do small errava para cima em 50%: a auditoria de latência (2026-09-26) mediu **588,7 MB** baixados
 * na primeira carga do small. Agora os dois são a soma dos bytes do Hub no dtype `hybrid` — os mesmos
 * arquivos que o navegador pede, e que batem com o download medido:
 *   small: encoder_model.onnx 352,83 MB + decoder_model_merged_q4.onnx 233,15 MB + tokenizer/configs 2,78 MB = 588,8 MB
 *   base:  encoder_model.onnx  82,47 MB + decoder_model_merged_q4.onnx 123,60 MB + tokenizer/configs 2,77 MB = 208,8 MB
 *
 * Moonshine: dtype `q8` (não o `hybrid` — ver `adapters/moonshine.ts`), então o tamanho é o dos
 * arquivos `_quantized` e NÃO se compara pela proporção do Whisper. Somado da listagem de bytes do
 * Hub no commit fixado (2026-09-24): pesos + tokenizer.json (3,76 MB) + configs. Contamos como
 * MEDIDO porque são os bytes exatos que o navegador pede, não uma proporção.
 *   base: encoder_model_quantized 20,51 MB + decoder_model_merged_quantized 42,50 MB + 3,90 MB = 66,9 MB
 *   tiny: encoder_model_quantized  7,94 MB + decoder_model_merged_quantized 20,24 MB + 3,90 MB = 32,1 MB
 */
export const MODEL_DOWNLOAD_MB: Record<string, number> = {
  [WHISPER_MODELS.tiny]: 117, // medido
  [WHISPER_MODELS.base]: 209, // medido (bytes do Hub, hybrid)
  [WHISPER_MODELS.small]: 589, // medido (bytes do Hub, hybrid; download real 588,7 MB)
  [MOONSHINE_MODELS.base]: 67, // medido (bytes do Hub, q8)
  [MOONSHINE_MODELS.tiny]: 32, // medido (bytes do Hub, q8)
};

/** O valor de `MODEL_DOWNLOAD_MB` para este modelo foi medido ou estimado? */
export const MODEL_DOWNLOAD_MEDIDO: Record<string, boolean> = {
  [WHISPER_MODELS.tiny]: true,
  [WHISPER_MODELS.base]: true,
  [WHISPER_MODELS.small]: true,
  [MOONSHINE_MODELS.base]: true,
  [MOONSHINE_MODELS.tiny]: true,
};

/**
 * Nome legível do modelo para o selo/lista da captura: "Whisper small", "Moonshine base". O id do
 * Hub (`moonshine-base-ONNX`) carrega o sufixo do formato, que não diz nada a quem usa o app.
 */
export function nomeLegivelDoModelo(id: string): string {
  const nome = (id.split('/').pop() ?? id).replace(/-ONNX$/i, '');
  return nome
    .replace(/^whisper-/i, 'Whisper ')
    .replace(/^moonshine-/i, 'Moonshine ')
    .replace(/[-_]/g, ' ');
}

/**
 * Modelo local da transcrição OFFLINE de arquivo (importação sem legenda), quando o idioma pede um
 * específico: inglês → moonshine-base. `null` = não escolhe, fica o Whisper de sempre do adapter.
 * (A importação não passa pelo `routeStt` para o modelo local: ela já roda fora do tempo real.)
 */
export function modeloLocalDaImportacao(idioma?: string): string | null {
  return (idioma || '').toLowerCase().split('-')[0] === 'en' ? MOONSHINE_MODELS.base : null;
}

export function routeStt(input: SttRouteInput): SttRoute {
  const { autoDetect, quality, hasWebGpu, cloudAvailable, profileId } = input;
  const lang = (input.contentLang || '').toLowerCase().split('-')[0];
  const micLang = (input.micLang || '').toLowerCase().split('-')[0];
  // Edição estática (Pages, sem servidor): a nuvem não existe, diga o que disser a sondagem.
  const cloudAllowed = cloudAvailable && profileId !== 'local-private' && !edicaoEstatica();
  // "Inglês" só quando TODAS as fontes ativas são inglês: o modelo é um só para sistema e mic.
  const isEnglish = !autoDetect && lang === 'en' && (!micLang || micLang === 'en');
  /** Melhor modelo LOCAL viável para conteúdo não-EN neste dispositivo. */
  const bestLocal = hasWebGpu ? WHISPER_MODELS.small : WHISPER_MODELS.base;
  switch (quality) {
    case 'fast':
      // "Rápido" = o MENOR modelo que serve ao idioma. Em inglês, o moonshine-tiny (~32 MB, 15,5% de
      // WER) é menor E melhor que o whisper-tiny; fora do inglês, só o Whisper serve.
      if (isEnglish) {
        return {
          localModel: MOONSHINE_MODELS.tiny,
          preferCloud: false,
          label: 'local · modelo rápido (moonshine tiny, inglês)',
        };
      }
      return { localModel: WHISPER_MODELS.tiny, preferCloud: false, label: 'local · modelo rápido (tiny)' };
    case 'accurate':
      return {
        localModel: bestLocal,
        preferCloud: false,
        label: `local · modelo preciso (${bestLocal.split('-').pop()})`,
      };
    case 'cloud':
      if (cloudAllowed) {
        // Reserva local moderada (base): não força um download de 250MB em quem escolheu nuvem.
        return {
          localModel: isEnglish ? MOONSHINE_MODELS.base : WHISPER_MODELS.base,
          preferCloud: true,
          label: 'nuvem (large-v3-turbo) · reserva local',
        };
      }
      // Nuvem pedida mas indisponível/proibida → degrada honesto para o melhor local.
      return {
        localModel: bestLocal,
        preferCloud: false,
        label: `local (nuvem indisponível) · ${bestLocal.split('-').pop()}`,
      };
    case 'auto':
    default: {
      if (isEnglish) {
        return { localModel: MOONSHINE_MODELS.base, preferCloud: false, label: 'local · inglês (moonshine)' };
      }
      if (cloudAllowed) {
        // Reserva base: se a nuvem cair no meio da sessão, a qualidade local não desaba p/ tiny.
        return { localModel: WHISPER_MODELS.base, preferCloud: true, label: 'nuvem (large-v3-turbo) · reserva local' };
      }
      return {
        localModel: bestLocal,
        preferCloud: false,
        label: `local · modelo preciso (${bestLocal.split('-').pop()})`,
      };
    }
  }
}

const QUALITY_KEY = 'babel.sttQuality';

export function getSttQuality(): SttQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === 'fast' || v === 'accurate' || v === 'cloud' || v === 'auto') return v;
  } catch {
    /* sem localStorage */
  }
  return 'auto';
}

export function setSttQualityMirror(q: SttQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* best-effort */
  }
}
