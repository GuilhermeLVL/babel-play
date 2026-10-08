/**
 * A ENTRADA DAS TELAS — na primeira vez que uma tela aparece, os blocos dela sobem em cascata, um
 * depois do outro. Da segunda vez em diante a tela só surge, como sempre.
 *
 * Por que só na primeira: cascata é apresentação. Quem volta à mesma tela dez vezes por dia não quer
 * ser apresentado a ela dez vezes; quer que ela esteja lá.
 *
 * As telas do desenho novo trocam por desmontar e montar (`App.tsx`), sem roteador. Então isto
 * observa um `.q-palco` novo entrar no documento e, se for a primeira visita, marca-o com
 * `data-entrada="cascata"`; o CSS (`questMovimento.css`) faz o resto, e só na faixa rica.
 * A tela é reconhecida pelas classes do palco mais o título: é o que não muda entre duas visitas.
 */
import { movimentoRico } from './animar';

const chaveDaTela = (palco: Element): string =>
  `${palco.className}|${palco.querySelector('h1')?.textContent?.trim() ?? ''}`;

export function instalarEntradaDasTelas(raiz: HTMLElement = document.body): () => void {
  const vistas = new Set<string>();
  const receber = (palco: Element) => {
    const chave = chaveDaTela(palco);
    if (vistas.has(chave)) return;
    vistas.add(chave);
    if (movimentoRico()) palco.setAttribute('data-entrada', 'cascata');
  };
  /* As telas que já estão montadas quando isto se instala contam como vistas, sem cascata. */
  for (const palco of raiz.querySelectorAll('.q-palco')) vistas.add(chaveDaTela(palco));
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      for (const no of m.addedNodes) {
        if (!(no instanceof Element)) continue;
        if (no.matches('.q-palco')) receber(no);
        else for (const palco of no.querySelectorAll('.q-palco')) receber(palco);
      }
    }
  });
  observador.observe(raiz, { subtree: true, childList: true });
  return () => observador.disconnect();
}
