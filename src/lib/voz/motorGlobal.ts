/**
 * O MOTOR GLOBAL DA FALA — `speak()` (`lib/tts.ts`) é o ponto por onde o intérprete, a conversa virtual, o "Ouvir" de uma
 * palavra e os jogos falam. Com a voz de alta qualidade escolhida (ou a "Automática" com o modelo já baixado) e o
 * idioma do motor (pt, en, es), a fala sai pela Supertonic; em qualquer outro caso, pelo motor de antes. Decidido a
 * CADA fala, como `motorPorPreferencia.ts`: trocar a voz vale para a próxima.
 *
 * Se o motor ainda não carregou nesta página, a fala espera o carregamento (a primeira pode demorar); se ele falhar,
 * a MESMA frase sai pela reserva. Nunca silêncio.
 */
import { nativeTts, setTtsEngine, type TtsEngine } from '../tts';

export interface OpcoesDoMotorGlobal {
  /** A Supertonic lê este idioma agora? (padrão: `vozNoAparelhoLe`) */
  le: (idioma: string) => boolean;
  /** Entrega o motor neural, carregando-o se preciso; `null` se não der. */
  neural: () => Promise<TtsEngine | null>;
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
      if (!opts || !o.le(opts.lang)) {
        ultimo = reserva;
        reserva.speak(texto, opts);
        return;
      }
      void o
        .neural()
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

/** O motor global da página, ligado à voz no aparelho. Importa o módulo leve só ao ser chamado. */
export async function instalarMotorGlobalDaFala(): Promise<boolean> {
  const { raizDoModelo, vozNoAparelhoLe, motorDaVozNoAparelho } = await import('./vozNoAparelho');
  if (!raizDoModelo()) return false;
  setTtsEngine(criarMotorGlobal({ le: vozNoAparelhoLe, neural: motorDaVozNoAparelho }));
  return true;
}
