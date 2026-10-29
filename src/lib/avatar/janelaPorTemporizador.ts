/**
 * UMA "JANELA" DE MENTIRA PARA O MOTOR, movida a temporizador. O PiP de vídeo (Safari) mostra a legenda num vídeo por
 * cima de outros apps enquanto a PÁGINA fica em segundo plano: lá o `requestAnimationFrame` para, e o avatar que a ponte
 * copia para o quadro do vídeo congelaria. Com esta janela o motor desenha por `setTimeout` a `hz` quadros por segundo,
 * sem depender da visibilidade da aba, e sem o laço duplicado de um rAF ao lado de um temporizador.
 *
 * Limite: navegadores podem espaçar temporizadores de abas ocultas; se o avatar andar mais devagar no PiP de vídeo, o
 * texto continua certo (o avatar é complemento). Não provado em Safari real.
 */
import type { JanelaDoMotor } from './renderer';

export function janelaPorTemporizador(hz = 15, doc: Document = document): JanelaDoMotor {
  const passo = Math.max(16, Math.round(1000 / hz));
  return {
    requestAnimationFrame: (cb) => window.setTimeout(() => cb(performance.now()), passo),
    cancelAnimationFrame: (id) => window.clearTimeout(id),
    devicePixelRatio: 1,
    document: {
      // A aba oculta é o caso de uso: para o motor, a "janela" nunca está oculta.
      hidden: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      createElement: ((tag: string) => doc.createElement(tag)) as Document['createElement'],
    },
  };
}
