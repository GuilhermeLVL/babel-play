/**
 * O PAINEL NASCE DE ONDE A PESSOA TOCOU — o painel "Mais", um diálogo, uma folha: em vez de surgir
 * no meio da tela vindo de lugar nenhum, cresce a partir do botão que o abriu. É o que liga, para o
 * olho, a causa (o toque) ao efeito (o painel).
 *
 * Instalado uma vez, com a casca: guarda o último toque e, quando um painel entra no documento logo
 * depois dele, põe a origem do crescimento naquele ponto e marca o painel com `data-nasce`. O CSS
 * (`questMovimento.css`) anima só quem tem a marca.
 *
 * QUEM ABRE PELO TECLADO NÃO ANIMA. Uma tecla apaga o toque guardado: a busca com Ctrl K, o Enter
 * num botão, o Esc. Atalho é para quem tem pressa; o painel está lá na hora.
 */
import { movimentoRico } from './animar';

/** O que conta como painel: o "Mais", o `<dialog>` nativo e quem se declara diálogo. */
const PAINEL = ".q-mais, dialog, [role='dialog'], [role='alertdialog']";
/** Um painel que aparece mais de 700 ms depois do toque não foi aberto por ele. */
const JANELA_MS = 700;

export function instalarNascerDoToque(raiz: HTMLElement = document.body): () => void {
  let toque: { x: number; y: number; quando: number } | null = null;
  const aoTocar = (e: PointerEvent) => {
    toque = { x: e.clientX, y: e.clientY, quando: performance.now() };
  };
  const aoTeclar = () => {
    toque = null;
  };
  const receber = (painel: Element) => {
    if (!(painel instanceof HTMLElement) || painel.hasAttribute('data-nasce')) return;
    if (!toque || performance.now() - toque.quando > JANELA_MS || !movimentoRico()) return;
    const r = painel.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    painel.style.transformOrigin = `${Math.round(toque.x - r.left)}px ${Math.round(toque.y - r.top)}px`;
    painel.setAttribute('data-nasce', '');
    /* A marca sai no fim, para o painel poder nascer de novo se for reaberto sem desmontar. */
    painel.addEventListener(
      'animationend',
      () => {
        painel.removeAttribute('data-nasce');
        painel.style.transformOrigin = '';
      },
      { once: true },
    );
  };
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'attributes') {
        const alvo = m.target as Element;
        if (alvo.hasAttribute('open')) receber(alvo);
        continue;
      }
      for (const no of m.addedNodes) {
        if (!(no instanceof Element)) continue;
        if (no.matches(PAINEL)) receber(no);
        else for (const painel of no.querySelectorAll(PAINEL)) receber(painel);
      }
    }
  });
  observador.observe(raiz, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('pointerdown', aoTocar, { capture: true, passive: true });
  window.addEventListener('keydown', aoTeclar, { capture: true });
  return () => {
    observador.disconnect();
    window.removeEventListener('pointerdown', aoTocar, { capture: true });
    window.removeEventListener('keydown', aoTeclar, { capture: true });
  };
}
