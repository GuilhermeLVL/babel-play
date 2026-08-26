import { EDICAO_LEVE } from '../lib/edicao'
/**
 * ROTEADOR DE MODELO STT — a camada inteligente que escolhe o motor de transcrição
 * conforme o IDIOMA da sessão, o dispositivo e a política do usuário.
 *
 * Por que existe (bug de credibilidade): o whisper-tiny é treinado majoritariamente em
 * inglês — em PT-BR (e outros idiomas) ele erra feio ("fellowo americano"). O produto
 * não pode soar quebrado justamente no idioma nativo do usuário. A régua:
 *
 *   EN            → tiny local (rápido e suficiente; custo mínimo).
 *   não-EN / auto → NUVEM primeiRO quando disponível (Groq whisper-large-v3-turbo —
 *                   a melhor qualidade multilíngue, ~1s/trecho), com modelo LOCAL de
 *                   reserva; sem nuvem → small (WebGPU) ou base (WASM: small é lento
 *                   demais para tempo real sem GPU).
 *
 * Honestidades: o perfil Privado/Local NUNCA roteia para a nuvem; o usuário pode
 * sobrepor tudo com a preferência "Qualidade da transcrição" (fast/accurate/cloud);
 * e o selo da UI sempre diz qual motor está de fato em uso.
 */

export type SttQuality = 'auto' | 'fast' | 'accurate' | 'cloud'

export interface SttRouteInput {
  /** ISO-639-1 do idioma do CONTEÚDO (o que será transcrito). '' quando desconhecido. */
  contentLang: string
  /** Modo multi-idioma ligado (detecção por fala) — tratado como não-EN. */
  autoDetect: boolean
  /** Preferência do usuário (settings.ui.sttQuality). */
  quality: SttQuality
  /** navigator.gpu presente (WebGPU) — sem ele, small local é lento demais. */
  hasWebGpu: boolean
  /** O servidor tem STT de nuvem configurado (GET /api/ai/stt/available → 200). */
  cloudAvailable: boolean
  /** Perfil de IA ativo — 'local-private' proíbe nuvem. */
  profileId: string
}

export interface SttRoute {
  /** Modelo local a carregar (sempre definido — é a reserva mesmo no modo nuvem). */
  localModel: string
  /** true = tentar a nuvem (groq-whisper) PRIMEIRO, local como reserva. */
  preferCloud: boolean
  /** Rótulo honesto para o selo da UI. */
  label: string
}

export const WHISPER_MODELS = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
} as const

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
 * `tiny` está medido. `base` e `small` seguem ESTIMADOS pela proporção de parâmetros até que o
 * canário rode para eles (`CANARIO_MODELO=onnx-community/whisper-base npx tsx …/canario-real.mts`).
 */
export const MODEL_DOWNLOAD_MB: Record<string, number> = {
  [WHISPER_MODELS.tiny]: 117,   // medido
  [WHISPER_MODELS.base]: 300,   // estimado (~2,6× tiny, mesma proporção dos valores antigos)
  [WHISPER_MODELS.small]: 880,  // estimado
}

/** O valor de `MODEL_DOWNLOAD_MB` para este modelo foi medido ou estimado? */
export const MODEL_DOWNLOAD_MEDIDO: Record<string, boolean> = {
  [WHISPER_MODELS.tiny]: true,
  [WHISPER_MODELS.base]: false,
  [WHISPER_MODELS.small]: false,
}

export function routeStt(input: SttRouteInput): SttRoute {
  const { autoDetect, quality, hasWebGpu, cloudAvailable, profileId } = input
  const lang = (input.contentLang || '').toLowerCase().split('-')[0]
  const cloudAllowed = cloudAvailable && profileId !== 'local-private'
  const isEnglish = !autoDetect && lang === 'en'
  /** Melhor modelo LOCAL viável para conteúdo não-EN neste dispositivo. */
  const bestLocal = hasWebGpu ? WHISPER_MODELS.small : WHISPER_MODELS.base
  /*
   * EDIÇÃO LEVE (hospedada): rápido por PADRÃO. O `auto` escolhia o `small` (880 MB) em quem tem
   * WebGPU e o `base` em WASM de 1 thread em quem não tem — era a "lentidão" relatada. Aqui `auto`
   * é tiny (inglês) / base (resto), independente de GPU; `accurate` continua existindo, mas só
   * por escolha explícita em Ajustes.
   */
  if (EDICAO_LEVE && (quality === 'auto' || quality === 'cloud')) {
    return isEnglish
      ? { localModel: WHISPER_MODELS.tiny, preferCloud: false, label: 'local · inglês (tiny)' }
      : { localModel: WHISPER_MODELS.base, preferCloud: false, label: 'local · rápido (base)' }
  }

  switch (quality) {
    case 'fast':
      return { localModel: WHISPER_MODELS.tiny, preferCloud: false, label: 'local · modelo rápido (tiny)' }
    case 'accurate':
      return { localModel: bestLocal, preferCloud: false, label: `local · modelo preciso (${bestLocal.split('-').pop()})` }
    case 'cloud':
      if (cloudAllowed) {
        // Reserva local moderada (base): não força um download de 250MB em quem escolheu nuvem.
        return { localModel: isEnglish ? WHISPER_MODELS.tiny : WHISPER_MODELS.base, preferCloud: true, label: 'nuvem (large-v3-turbo) · reserva local' }
      }
      // Nuvem pedida mas indisponível/proibida → degrada honesto para o melhor local.
      return { localModel: bestLocal, preferCloud: false, label: `local (nuvem indisponível) · ${bestLocal.split('-').pop()}` }
    case 'auto':
    default: {
      if (isEnglish) {
        return { localModel: WHISPER_MODELS.tiny, preferCloud: false, label: 'local · inglês (tiny)' }
      }
      if (cloudAllowed) {
        // Reserva base: se a nuvem cair no meio da sessão, a qualidade local não desaba p/ tiny.
        return { localModel: WHISPER_MODELS.base, preferCloud: true, label: 'nuvem (large-v3-turbo) · reserva local' }
      }
      return { localModel: bestLocal, preferCloud: false, label: `local · modelo preciso (${bestLocal.split('-').pop()})` }
    }
  }
}

const QUALITY_KEY = 'babel.sttQuality'

export function getSttQuality(): SttQuality {
  try {
    const v = localStorage.getItem(QUALITY_KEY)
    if (v === 'fast' || v === 'accurate' || v === 'cloud' || v === 'auto') return v
  } catch { /* sem localStorage */ }
  return 'auto'
}

export function setSttQualityMirror(q: SttQuality): void {
  try { localStorage.setItem(QUALITY_KEY, q) } catch { /* best-effort */ }
}
