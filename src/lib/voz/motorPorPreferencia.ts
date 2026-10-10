/**
 * O MOTOR QUE RESPEITA A VOZ ESCOLHIDA, onde há voz da nuvem (o intérprete e a conversa virtual).
 *
 * No plano com a voz natural, a fila de fala lia TUDO pela nuvem. Agora cada fala pergunta pela
 * preferência do idioma DELA (`preferenciaDeVoz.ts`):
 *   · a pessoa escolheu uma voz do aparelho que existe aqui → o aparelho lê, com essa voz, sem ir à rede;
 *   · automática, "voz natural", ou uma voz que sumiu → a nuvem, como sempre (e a reserva dela, o
 *     aparelho, lê com a automática se a nuvem não responder).
 * Decidido a cada fala: os dois lados da conversa falam idiomas diferentes e podem ter vozes diferentes,
 * e trocar a voz no meio vale para a próxima fala.
 *
 * Sem a voz da nuvem não há o que rotear: a fila usa o `nativeTts`, que já lê a preferência.
 */
import { nativeTts, type SpeakOptions, type TtsEngine } from '../tts';
import { prefereVozDoAparelho } from './preferenciaDeVoz';
import type { MotorDaVoz, VozDaNuvem } from './vozDaNuvem';

export function criarMotorPorPreferencia(o: {
  nuvem: VozDaNuvem;
  /** A voz do aparelho (padrão: o `nativeTts`, que resolve a voz preferida do idioma). */
  aparelho?: TtsEngine;
  /** Padrão: a preferência guardada. */
  prefereOAparelho?: (idioma: string) => boolean;
}): VozDaNuvem {
  const aparelho = o.aparelho ?? nativeTts;
  const prefere = o.prefereOAparelho ?? prefereVozDoAparelho;
  let ultima: MotorDaVoz | null = null;
  return {
    speak(texto: string, opts?: SpeakOptions) {
      if (!texto?.trim() || !opts) return;
      if (prefere(opts.lang)) {
        o.nuvem.cancel(); // cala o áudio da nuvem (e a reserva dela) antes de o aparelho ler
        ultima = 'voz-do-aparelho';
        aparelho.speak(texto, opts);
        return;
      }
      ultima = null;
      o.nuvem.speak(texto, opts);
    },
    cancel() {
      o.nuvem.cancel();
      aparelho.cancel();
    },
    isSpeaking: () => (o.nuvem.isSpeaking?.() ?? false) || (aparelho.isSpeaking?.() ?? false),
    motorDaUltimaFala: () => ultima ?? o.nuvem.motorDaUltimaFala(),
  };
}
