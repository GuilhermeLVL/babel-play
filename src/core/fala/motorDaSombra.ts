/**
 * QUEM TRANSCREVE A FALA DA PESSOA NA PRÁTICA DE PRONÚNCIA (openspec `sombra-sem-web-speech`, tarefa 2.1). Puro.
 *
 * Três regras, nesta ordem:
 *  1. Web Speech do navegador, quando existe E o perfil pode usá-lo (`webSpeechPermitido`, a régua `rapidoDoMicPermitido`:
 *     no Chrome ele manda o áudio ao fabricante do navegador, então perfil protegido sem o responsável NUNCA o usa).
 *  2. Sem ele, o motor LOCAL (o áudio nunca sai do aparelho), só com a flag `sombra_local` e num idioma já liberado.
 *  3. Senão, `nenhum`: a tela fica com a gravação comparável, sem nota.
 *
 * O perfil protegido nunca escolhe nuvem: não existe motor de nuvem nesta função.
 */

/** Idiomas liberados no motor local. Só inglês no começo (decisão assumida em 25/11; pt/es/fr dependem da régua 5.1). */
export const IDIOMAS_DA_SOMBRA_LOCAL: readonly string[] = ['en'];

export type MotorDaSombra =
  | 'web-speech'
  | 'local-moonshine-tiny'
  | 'local-moonshine-base'
  | 'local-whisper-base'
  | 'nenhum';

export type MotivoDaSombra =
  | 'web-speech-permitido'
  | 'local-aparelho-leve'
  | 'local-padrao'
  | 'sem-flag'
  | 'idioma-fora-do-local';

export interface EntradaDaSombra {
  /** O navegador tem `SpeechRecognition`/`webkitSpeechRecognition` e o recurso do aparelho o declara. */
  webSpeechExiste: boolean;
  /** `rapidoDoMicPermitido()`: falso para o perfil protegido sem o responsável. */
  webSpeechPermitido: boolean;
  /** Idioma da frase (BCP-47). */
  idioma: string;
  /** Celular fraco ou Quest: o modelo pequeno. */
  aparelhoFraco: boolean;
  economiaDeDados: boolean;
  /** Flag `sombra_local`. */
  flag: boolean;
}

export interface EscolhaDaSombra {
  motor: MotorDaSombra;
  motivo: MotivoDaSombra;
}

const base = (idioma: string): string => (idioma || '').toLowerCase().split('-')[0] ?? '';

export function motorDaSombra(e: EntradaDaSombra): EscolhaDaSombra {
  if (e.webSpeechExiste && e.webSpeechPermitido) return { motor: 'web-speech', motivo: 'web-speech-permitido' };
  if (!e.flag) return { motor: 'nenhum', motivo: 'sem-flag' };
  const lang = base(e.idioma);
  if (!IDIOMAS_DA_SOMBRA_LOCAL.includes(lang)) return { motor: 'nenhum', motivo: 'idioma-fora-do-local' };
  if (lang === 'en') {
    const leve = e.aparelhoFraco || e.economiaDeDados;
    return leve
      ? { motor: 'local-moonshine-tiny', motivo: 'local-aparelho-leve' }
      : { motor: 'local-moonshine-base', motivo: 'local-padrao' };
  }
  return { motor: 'local-whisper-base', motivo: 'local-padrao' };
}

/** O motor é local (decodifica no aparelho)? */
export const motorEhLocal = (m: MotorDaSombra): boolean => m.startsWith('local-');

/** Tamanho do download de cada motor local, em MB (medido no Hub, q8; igual a `MODEL_SIZES_MB` do gateway). */
export const MB_DO_MOTOR_LOCAL: Readonly<
  Record<'local-moonshine-tiny' | 'local-moonshine-base' | 'local-whisper-base', number>
> = {
  'local-moonshine-tiny': 32,
  'local-moonshine-base': 67,
  'local-whisper-base': 117,
};
