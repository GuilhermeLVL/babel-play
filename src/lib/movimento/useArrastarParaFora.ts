/**
 * ARRASTAR PARA FORA — o aviso (ou qualquer peça que flutua) acompanha o dedo e, solto, decide:
 * se o gesto IA para fora, sai; se não, volta ao lugar com mola.
 *
 * Três detalhes que fazem parecer um objeto e não um botão de fechar disfarçado:
 *   - quem decide é para onde o gesto ia (posição + o que a velocidade ainda levaria), não só onde o
 *     dedo parou: um peteleco curto e rápido basta;
 *   - para o lado errado a peça cede cada vez menos (`elastico`), em vez de travar;
 *   - enquanto o dedo segura, quem usa o gancho sabe (`segurando`) e pode parar o relógio.
 *
 * Só na faixa rica do movimento; fora dela os gestos não fazem nada e a peça fecha como sempre.
 */
import { type PointerEvent, useRef, useState } from 'react';

import { movimentoRico } from './animar';
import { elastico, MOLA_SUAVE, projetar, SAIDA, velocidadeDoGesto } from './mola';

interface Gesto {
  x0: number;
  ponteiro: number;
  amostras: Array<[number, number]>;
}

/** Quanto do próprio tamanho a peça precisa "ir" para sair. */
const FRACAO_PARA_SAIR = 0.5;

export function useArrastarParaFora(aoSair: () => void, ativo = true) {
  const gesto = useRef<Gesto | null>(null);
  const [segurando, setSegurando] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    /* Um toque num botão de dentro (a ação do aviso, o "x") é do botão, não do arrasto. */
    if (!ativo || !movimentoRico() || (e.target as Element).closest('button, a')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesto.current = { x0: e.clientX, ponteiro: e.pointerId, amostras: [[e.clientX, e.timeStamp]] };
    e.currentTarget.style.transition = 'none';
    setSegurando(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesto.current;
    if (!g || e.pointerId !== g.ponteiro) return;
    const dx = e.clientX - g.x0;
    g.amostras.push([e.clientX, e.timeStamp]);
    if (g.amostras.length > 5) g.amostras.shift();
    e.currentTarget.style.transform = `translateX(${dx > 0 ? dx : elastico(dx)}px)`;
  };

  const soltar = (e: PointerEvent<HTMLElement>) => {
    const g = gesto.current;
    if (!g || e.pointerId !== g.ponteiro) return;
    gesto.current = null;
    setSegurando(false);
    const el = e.currentTarget;
    const destino = e.clientX - g.x0 + projetar(velocidadeDoGesto(g.amostras));
    if (destino > el.offsetWidth * FRACAO_PARA_SAIR) {
      el.style.transition = `transform 220ms ${SAIDA}, opacity 220ms ${SAIDA}`;
      el.style.transform = `translateX(${el.offsetWidth + 40}px)`;
      el.style.opacity = '0';
      window.setTimeout(aoSair, 200);
      return;
    }
    el.style.transition = `transform 420ms ${MOLA_SUAVE}`;
    el.style.transform = '';
    el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true });
  };

  return {
    segurando,
    gestos: { onPointerDown, onPointerMove, onPointerUp: soltar, onPointerCancel: soltar },
  };
}

/** Devolve a peça ao estado de fábrica (para quando o conteúdo dela troca: o próximo aviso). */
export function soltarEstilosDoArrasto(el: HTMLElement | null): void {
  if (!el) return;
  el.style.transform = '';
  el.style.opacity = '';
  el.style.transition = '';
}
