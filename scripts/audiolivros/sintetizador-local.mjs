/**
 * Adaptadores `Sintetizador` dos motores LOCAIS (CPU) avaliados na Tarefa A1: Supertonic 3 e Pocket TTS.
 * Cada um fala o contrato HTTP de `criarSintetizadorHttp` com o servidor de `scripts/audiolivros/spike/`
 * (`servidor-supertonic.py`, `servidor-pocket-tts.py`), em 127.0.0.1.
 *
 * Clonagem de voz é VEDADA no projeto: a voz tem de estar na lista fechada do motor (nada de caminho de
 * áudio) e qualquer campo de referência de áudio no pedido lança antes de qualquer rede.
 *
 * Licença das vozes do Pocket TTS: `VOZES_POCKET_TTS` traz só as de licença documentada que permite uso
 * comercial (CC0/CC-BY). `rafael` (pt) e `lola` (es) NÃO têm licença documentada: entram só em
 * `VOZES_POCKET_TTS_NAO_VERIFICADAS`, para a escuta de avaliação (ver docs/pesquisa).
 */
import { criarSintetizadorHttp } from './sintetizador.mjs'

/** Presets do Supertonic 3 (F1-F5, M1-M5). */
export const VOZES_SUPERTONIC = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']

/** Pocket TTS com licença documentada (CC0: doações, voice-zero; CC-BY: VCTK, alba). Sem Expresso/EARS (NC). */
export const VOZES_POCKET_TTS = [
  'marius',
  'javert',
  'alba',
  'anna',
  'vera',
  'fantine',
  'charles',
  'paul',
  'eponine',
  'azelma',
  'george',
  'mary',
  'jane',
  'michael',
  'eve',
  'bill_boerst',
  'peter_yearsley',
  'stuart_bell',
  'caro_davy',
]

/** Vozes pt/es do Pocket TTS sem licença documentada: SÓ avaliação, nunca produção. */
export const VOZES_POCKET_TTS_NAO_VERIFICADAS = ['rafael', 'lola']

const CAMPOS_DE_REFERENCIA = ['reference_audio', 'audio_prompt', 'ref_audio', 'voice_clone', 'clone', 'speaker_wav']

/**
 * Embrulha um sintetizador HTTP com a lista fechada de vozes e a recusa de clonagem.
 * @param {import('./sintetizador.mjs').Sintetizador} base
 * @param {readonly string[]} permitidas
 * @returns {import('./sintetizador.mjs').Sintetizador}
 */
function comVozesFechadas(base, permitidas) {
  return {
    ...base,
    async sintetizar(texto, o) {
      for (const chave of Object.keys(o)) {
        if (CAMPOS_DE_REFERENCIA.includes(chave)) throw new Error(`campo de clonagem de voz no pedido: ${chave}`)
      }
      if (!permitidas.includes(o.voz)) throw new Error(`${base.id}: voz "${o.voz}" fora da lista fechada`)
      return base.sintetizar(texto, o)
    },
  }
}

/**
 * Supertonic 3 (ONNX, CPU). Pesos OpenRAIL-M.
 * @param {{ url?: string, versao?: string, limiteDeCaracteres?: number }} [cfg]
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export function criarSintetizadorSupertonic(cfg = {}, deps = {}) {
  const http = criarSintetizadorHttp(
    {
      id: 'supertonic-3',
      versao: cfg.versao ?? 'supertonic-3@724fb5abbf55',
      url: cfg.url ?? 'http://127.0.0.1:8801',
      idiomas: ['pt', 'en', 'es'],
      limiteDeCaracteres: cfg.limiteDeCaracteres ?? 280,
    },
    deps,
  )
  return comVozesFechadas(http, VOZES_SUPERTONIC)
}

/**
 * Pocket TTS (Kyutai, CPU), sem codificador de clonagem. Pesos CC-BY-4.0.
 * @param {{ url?: string, versao?: string, limiteDeCaracteres?: number, incluirNaoVerificadas?: boolean }} [cfg]
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export function criarSintetizadorPocketTts(cfg = {}, deps = {}) {
  const http = criarSintetizadorHttp(
    {
      id: 'pocket-tts',
      versao: cfg.versao ?? 'pocket-tts-without-voice-cloning@a7056f505a4a',
      url: cfg.url ?? 'http://127.0.0.1:8802',
      idiomas: ['pt', 'es', 'en'],
      limiteDeCaracteres: cfg.limiteDeCaracteres ?? 300,
    },
    deps,
  )
  const permitidas = cfg.incluirNaoVerificadas
    ? [...VOZES_POCKET_TTS, ...VOZES_POCKET_TTS_NAO_VERIFICADAS]
    : VOZES_POCKET_TTS
  return comVozesFechadas(http, permitidas)
}
