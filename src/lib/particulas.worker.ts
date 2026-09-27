/**
 * O WORKER DAS PARTÍCULAS — o laço de `motorDeParticulas.ts` desenhando num `OffscreenCanvas`, fora
 * da thread principal (ver o porquê, com os números, no topo daquele arquivo).
 *
 * A primeira mensagem traz o canvas transferido (`transferControlToOffscreen`); as seguintes são as
 * `MensagemDoLaco` que a página manda. `requestAnimationFrame` existe em Worker dedicado no Chrome,
 * no Edge e no Firefox; onde não existir, um temporizador de ~60 Hz faz o papel dele.
 */
import { criarLacoDeParticulas, type MensagemDoLaco } from './motorDeParticulas';

type Laco = ReturnType<typeof criarLacoDeParticulas>;
let laco: Laco | null = null;

/* Os tipos do projeto são os da janela (lib DOM), como nos outros workers; em tempo de execução
   estes nomes globais são os do escopo do Worker. */
const temRaf = typeof globalThis.requestAnimationFrame === 'function';
const pedirQuadro = (fn: (ts: number) => void): number =>
  temRaf ? requestAnimationFrame(fn) : (setTimeout(() => fn(performance.now()), 16) as unknown as number);
const cancelarQuadro = (id: number) => (temRaf ? cancelAnimationFrame(id) : clearTimeout(id));

self.onmessage = (e: MessageEvent<{ tipo: 'iniciar'; canvas: OffscreenCanvas } | MensagemDoLaco>) => {
  const m = e.data;
  if (m.tipo === 'iniciar') {
    const ctx = m.canvas.getContext('2d');
    if (!ctx) return;
    laco = criarLacoDeParticulas({
      canvas: m.canvas,
      ctx,
      pedirQuadro,
      cancelarQuadro,
      criarCanvas: (lado) => new OffscreenCanvas(lado, lado),
    });
    return;
  }
  laco?.receber(m);
};
