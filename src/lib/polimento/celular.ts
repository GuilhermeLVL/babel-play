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
 * O destino do trilho que a barra de cinco não mostra e que passa a morar no começo do "Mais"
 * (`maisCel`, `cartoes3.js:14-15`). Desde a navegação de 10/10/2026 o trilho é Início, Capturar,
 * Intérprete, Biblioteca, Cartões, Jogar, e a barra é Início, Praticar, Capturar, Intérprete, Mais:
 * a Biblioteca sai da barra; Cartões e Jogar ficam atrás do "Praticar" (`PRATICAR`, abaixo).
 * Estatísticas e Personalizar já moram no "Mais" em todo aparelho.
 */
export const NO_MAIS_NO_CELULAR = ['library'] as const;

/** As duas telas atrás do "Praticar" da barra de cinco (`cartoes3.js:72, 93-96`). */
export const PRATICAR = ['cartoes', 'play'] as const;
export type TelaDePraticar = (typeof PRATICAR)[number];

const CHAVE_DE_PRATICAR = 'babel.praticar';

/** A última das duas que a pessoa abriu: é a que o "Praticar" abre (`CT.praticar`, `cartoes3.js:87`). */
export function ultimaPratica(): TelaDePraticar {
  try {
    return localStorage.getItem(CHAVE_DE_PRATICAR) === 'play' ? 'play' : 'cartoes';
  } catch {
    return 'cartoes';
  }
}

export function lembrarPratica(tela: TelaDePraticar): void {
  try {
    localStorage.setItem(CHAVE_DE_PRATICAR, tela);
  } catch {
    /* sem armazenamento: o "Praticar" abre os Cartões */
  }
}

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
