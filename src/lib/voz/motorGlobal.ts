/**
 * O MOTOR GLOBAL DA FALA — `speak()` (`lib/tts.ts`) é o ponto por onde o intérprete, a conversa virtual, o "Ouvir" de uma
 * palavra e os jogos falam. Com a voz de alta qualidade escolhida (ou a "Automática" com o modelo já baixado) e o
 * idioma do motor (pt, en, es), a fala sai pela Supertonic; em qualquer outro caso, pelo motor de antes. Decidido a
 * CADA fala, como `motorPorPreferencia.ts`: trocar a voz vale para a próxima.
 *
 * Se o motor ainda não carregou nesta página, a fala espera o carregamento (a primeira pode demorar); se ele falhar,
 * a MESMA frase sai pela reserva. Nunca silêncio.
 *
 * Com a voz natural do Kitten (flag `voz_kitten`, openspec `voz-natural-no-aparelho-kitten`), quem decide é
 * `vozKitten.quemLe`: a voz natural no aparelho → a Supertonic escolhida → a voz boa do sistema → NENHUMA (sem voz
 * aceita, a fala não sai e `onError` avisa: o texto fica na tela, em vez de uma voz robótica).
 */
import { nativeTts, setTtsEngine, type TtsEngine } from '../tts';

export type QuemFala = 'neural' | 'kitten' | 'reserva' | 'nenhuma';

export interface OpcoesDoMotorGlobal {
  /** A Supertonic lê este idioma agora? (padrão: `vozNoAparelhoLe`) */
  le: (idioma: string) => boolean;
  /** Entrega o motor neural, carregando-o se preciso; `null` se não der. */
  neural: () => Promise<TtsEngine | null>;
  /** Quem fala o idioma (com a voz natural do Kitten). Sem ele, `le` decide entre a Supertonic e a reserva. */
  quem?: (idioma: string) => QuemFala;
  /** Entrega o motor do Kitten, carregando-o se preciso; `null` se não der. */
  kitten?: () => Promise<TtsEngine | null>;
  /** O motor de antes (padrão: o `nativeTts`). */
  reserva?: TtsEngine;
}

export function criarMotorGlobal(o: OpcoesDoMotorGlobal): TtsEngine {
  const reserva = o.reserva ?? nativeTts;
  let vez = 0;
  let ultimo: TtsEngine = reserva;
  return {
    speak(texto, opts) {
      const minha = ++vez;
      const quem: QuemFala = !opts ? 'reserva' : o.quem ? o.quem(opts.lang) : o.le(opts.lang) ? 'neural' : 'reserva';
      if (quem === 'nenhuma') {
        if (ultimo !== reserva) ultimo.cancel();
        ultimo = reserva;
        opts?.onError?.();
        return;
      }
      if (quem === 'reserva' || (quem === 'kitten' && !o.kitten)) {
        ultimo = reserva;
        reserva.speak(texto, opts);
        return;
      }
      void (quem === 'kitten' ? o.kitten!() : o.neural())
        .catch(() => null)
        .then((m) => {
          if (minha !== vez) return; // outra fala (ou um cancelar) veio antes
          ultimo = m ?? reserva;
          ultimo.speak(texto, opts);
        });
    },
    cancel() {
      vez++;
      ultimo.cancel();
      if (ultimo !== reserva) reserva.cancel();
    },
    pause: () => ultimo.pause?.(),
    resume: () => ultimo.resume?.(),
    isSpeaking: () => ultimo.isSpeaking?.() ?? false,
    isPaused: () => ultimo.isPaused?.() ?? false,
  };
}

const PARA_QUEM_FALA = { supertonic: 'neural', kitten: 'kitten', sistema: 'reserva', nenhuma: 'nenhuma' } as const;

/** O motor global da página, ligado às vozes no aparelho. Importa os módulos leves só ao ser chamado. */
export async function instalarMotorGlobalDaFala(): Promise<boolean> {
  const [{ raizDoModelo, vozNoAparelhoLe, motorDaVozNoAparelho }, { raizDoKitten, quemLe, motorDoKitten }] =
    await Promise.all([import('./vozNoAparelho'), import('./vozKitten')]);
  if (!raizDoModelo() && !raizDoKitten()) return false;
  setTtsEngine(
    criarMotorGlobal({
      le: vozNoAparelhoLe,
      neural: motorDaVozNoAparelho,
      quem: (idioma) => PARA_QUEM_FALA[quemLe(idioma)],
      kitten: motorDoKitten,
    }),
  );
  return true;
}
