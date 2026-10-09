/**
 * O CURSOR DO APP: ponto com anel (opção D de `docs/prototipos/cursor-opcoes.html`, escolhida pelo dono
 * em 09/10/2026, que recusou a versão com mola, abraço e faíscas: "é o suficiente").
 *
 * Um ponto de 6 px e um anel de 24 px na cor do acento seguem o mouse; sobre o que é clicável o anel
 * cresce e ganha um fundo leve, e no aperto encolhe. Só isso.
 *
 * Só existe com mouse, no computador, e com a camada de polimento ligada: no Modo desempenho, com as
 * animações desligadas, no toque, na caneta e no headset o cursor é o do sistema.
 */
import '../../styles/polimentoCursor.css';

import { noHeadset } from '../dispositivo/telaNovaDoQuest';
import { polido } from './base';

const CLICAVEL =
  'button, a[href], summary, label, select, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [role="link"], input[type="checkbox"], input[type="radio"], input[type="range"], [data-cursor="clicavel"]';
const PARADO = ':disabled, [aria-disabled="true"]';

export function instalarCursor(): () => void {
  if (typeof document === 'undefined' || noHeadset()) return () => undefined;
  const mouse = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  if (!mouse?.matches) return () => undefined;

  const raiz = document.documentElement;
  /* Numa caixa `popover`: ela sobe à camada de cima do navegador, a mesma dos diálogos modais. Sem
     isso o cursor ficava POR BAIXO de todo diálogo, com o do sistema escondido. */
  const caixa = document.createElement('div');
  caixa.className = 'px-cursor';
  caixa.setAttribute('aria-hidden', 'true');
  const comPopover = typeof caixa.showPopover === 'function';
  if (comPopover) caixa.setAttribute('popover', 'manual');
  const anel = document.createElement('div');
  anel.className = 'px-cursor-anel';
  const ponto = document.createElement('div');
  ponto.className = 'px-cursor-ponto';
  caixa.append(anel, ponto);

  let ligado = false;
  const subir = () => {
    if (!comPopover || !caixa.isConnected) return;
    try {
      if (caixa.matches(':popover-open')) caixa.hidePopover();
      caixa.showPopover();
    } catch {
      /* sem a camada de cima o cursor segue valendo fora dos diálogos */
    }
  };
  const ligar = (sim: boolean) => {
    if (sim === ligado) return;
    ligado = sim;
    raiz.classList.toggle('px-com-cursor', sim);
    if (sim) {
      document.body.append(caixa);
      caixa.dataset.fora = '';
      subir();
    } else caixa.remove();
  };
  const conferir = () => ligar(polido() && mouse.matches);

  const mover = (e: PointerEvent) => {
    if (!ligado) return;
    if (e.pointerType !== 'mouse') {
      caixa.dataset.fora = '';
      return;
    }
    delete caixa.dataset.fora;
    ponto.style.translate = anel.style.translate = `${e.clientX}px ${e.clientY}px`;
    const alvo = e.target instanceof Element ? e.target.closest(CLICAVEL) : null;
    anel.classList.toggle('sobre', !!alvo && !alvo.matches(PARADO));
  };
  const apertar = (e: PointerEvent) => e.pointerType === 'mouse' && anel.classList.add('aperta');
  const soltar = () => anel.classList.remove('aperta');
  const sair = () => {
    caixa.dataset.fora = '';
  };

  /* Um diálogo modal que abre depois passa por cima: o cursor sobe de novo. */
  const dialogos = new MutationObserver((mudancas) => {
    if (ligado && mudancas.some((m) => m.target instanceof HTMLDialogElement && m.target.open)) subir();
  });
  dialogos.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  const camada = new MutationObserver(conferir);
  camada.observe(raiz, { attributes: true, attributeFilter: ['data-px'] });

  window.addEventListener('pointermove', mover, { passive: true });
  window.addEventListener('pointerdown', apertar, { passive: true });
  window.addEventListener('pointerup', soltar, { passive: true });
  window.addEventListener('pointercancel', soltar, { passive: true });
  window.addEventListener('blur', sair);
  raiz.addEventListener('pointerleave', sair);
  mouse.addEventListener('change', conferir);
  conferir();

  return () => {
    dialogos.disconnect();
    camada.disconnect();
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerdown', apertar);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    window.removeEventListener('blur', sair);
    raiz.removeEventListener('pointerleave', sair);
    mouse.removeEventListener('change', conferir);
    ligar(false);
  };
}
