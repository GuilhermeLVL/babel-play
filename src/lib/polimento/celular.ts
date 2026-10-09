/**
 * O JEITO DE CELULAR DA CASCA — porte de `prototipo.js:406-424` (a barra de cinco destinos e os dois que
 * passam a morar no "Mais") e de `sentidos.js:279-291, 300-304` (a barra sai do caminho ao rolar).
 *
 * O corte é o do protótipo e do app: `@media (max-width: 720px)`. A aba sempre à vista e o deslizar de
 * lado entre abas (`sentidos.js:292-329`) não moram aqui.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: E2, E4, E5.
 */
import { useSyncExternalStore } from 'react';

import { polido } from './base';

/** `mqCel` de `prototipo.js:406`. */
const CORTE = '(max-width: 720px)';

/** `celular()` de `prototipo.js:407`. */
export const celular = (): boolean => typeof window !== 'undefined' && (window.matchMedia?.(CORTE).matches ?? false);

/**
 * `celular() && polido()`: a condição de `completarMais` (`prototipo.js:412`) e de `marcarTrilho`
 * (`prototipo.js:243`). É quando a barra tem cinco destinos, e Estatísticas e Personalizar vão para o
 * "Mais".
 */
export const barraDeCinco = (): boolean => celular() && polido();

function assinar(aoMudar: () => void): () => void {
  const mq = window.matchMedia?.(CORTE);
  mq?.addEventListener?.('change', aoMudar);
  /* A marca `data-px` liga e desliga com o interruptor das animações (`base.ts`). */
  const daMarca = new MutationObserver(aoMudar);
  daMarca.observe(document.documentElement, { attributes: true, attributeFilter: ['data-px'] });
  return () => {
    mq?.removeEventListener?.('change', aoMudar);
    daMarca.disconnect();
  };
}

/** `barraDeCinco()` para componentes: muda ao girar o aparelho, encolher a janela ou desligar a camada. */
export function useBarraDeCinco(): boolean {
  return useSyncExternalStore(assinar, barraDeCinco, () => false);
}

/**
 * Os dois destinos do trilho que a barra de cinco não mostra (`celular.css:62`), na ordem em que entram
 * no começo da grade do "Mais": `completarMais` põe Personalizar e depois Estatísticas, sempre na frente,
 * então Estatísticas fica primeiro (`prototipo.js:414-423`).
 */
export const NO_MAIS_NO_CELULAR = ['estatisticas', 'loja'] as const;

const ROLAGEM = '.q-palco, .rolagem';

/**
 * A barra some quando a pessoa rola para ler e volta quando ela sobe (`sentidos.js:279-291`); em toda
 * troca de tela ela reaparece (`sentidos.js:300-303`). Devolve como desligar.
 */
export function instalarCelular(): () => void {
  let ultimaRolagem = 0;
  const trilho = () => document.querySelector('.q-trilho');

  const aoRolar = (e: Event) => {
    const alvo = e.target;
    if (!(alvo instanceof HTMLElement) || !alvo.matches(ROLAGEM) || !alvo.closest('main')) return;
    if (!celular() || !polido()) return;
    const y = alvo.scrollTop;
    const fim = y + alvo.clientHeight >= alvo.scrollHeight - 24;
    if (y > ultimaRolagem + 6 && y > 90 && !fim) trilho()?.classList.add('px-some');
    else if (y < ultimaRolagem - 6 || fim) trilho()?.classList.remove('px-some');
    ultimaRolagem = y;
  };

  /* `trocar` do protótipo é a troca de tela inteira. No app quem troca é o React: a tela nova é o palco
     que monta dentro de `main` (a navegação, e também as telas de dentro do Jogar). */
  const voltar = () => {
    ultimaRolagem = 0;
    trilho()?.classList.remove('px-some');
  };
  const ehPalco = (n: Node) =>
    n instanceof HTMLElement &&
    !n.matches('dialog, .q-mais-fundo') &&
    (n.matches(ROLAGEM) || !!n.querySelector(ROLAGEM));
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (!(m.target instanceof Element) || !m.target.closest('main')) continue;
      if (m.target.closest('dialog, .q-mais-fundo')) continue;
      for (const n of m.addedNodes) if (ehPalco(n)) return voltar();
    }
  });
  observador.observe(document.body, { subtree: true, childList: true });
  document.addEventListener('scroll', aoRolar, { capture: true, passive: true });
  return () => {
    observador.disconnect();
    document.removeEventListener('scroll', aoRolar, { capture: true });
    trilho()?.classList.remove('px-some');
  };
}
