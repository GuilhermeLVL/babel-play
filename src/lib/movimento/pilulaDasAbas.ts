/**
 * A PÍLULA DAS ABAS — a marca da aba escolhida DESLIZA até a nova, em vez de apagar numa e acender
 * na outra. É o que diz ao olho "você saiu dali e veio para cá".
 *
 * As abas do desenho novo (`.q-abas` > `.q-aba`) são escritas à mão em mais de trinta lugares, com
 * `aria-selected`, `aria-pressed`, `aria-current` ou `aria-checked`. Em vez de trocar cada um por um
 * componente, isto se instala uma vez, com a casca, e cuida de todas: observa a escolha mudar, põe
 * uma pílula (`.q-pilula`) como último filho do grupo e a leva até a aba escolhida. O fundo e a borda
 * da aba escolhida passam para a pílula (`questMovimento.css`); o resto da aba não muda.
 *
 * Só na faixa rica do movimento. Na contida não há pílula, e a aba se pinta sozinha como sempre.
 * Grupo com mais de uma escolhida (filtros que somam) também fica sem pílula.
 */
import { movimentoRico } from './animar';

const ESCOLHIDA =
  ":scope > .q-aba:is([aria-selected='true'], [aria-pressed='true'], [aria-current='page'], [aria-checked='true'])";
const ATRIBUTOS = ['aria-selected', 'aria-pressed', 'aria-current', 'aria-checked'];

function semPilula(grupo: HTMLElement): void {
  grupo.querySelector(':scope > .q-pilula')?.remove();
  delete grupo.dataset.pilula;
}

/** Leva a pílula de um grupo até a aba escolhida (ou a tira, se não houver exatamente uma). */
export function posicionarPilula(grupo: HTMLElement): void {
  const escolhidas = grupo.querySelectorAll<HTMLElement>(ESCOLHIDA);
  if (!movimentoRico() || escolhidas.length !== 1) return semPilula(grupo);
  const aba = escolhidas[0];
  let pilula = grupo.querySelector<HTMLElement>(':scope > .q-pilula');
  const nova = !pilula;
  if (!pilula) {
    pilula = document.createElement('i');
    pilula.className = 'q-pilula';
    pilula.setAttribute('aria-hidden', 'true');
    grupo.append(pilula);
    grupo.dataset.pilula = '';
  }
  /* A primeira posição é sem transição: a pílula nasce no lugar, não viaja do canto até lá. */
  if (nova) pilula.dataset.pousando = '';
  pilula.style.width = `${aba.offsetWidth}px`;
  pilula.style.height = `${aba.offsetHeight}px`;
  pilula.style.transform = `translate(${aba.offsetLeft}px, ${aba.offsetTop}px)`;
  if (nova) {
    void pilula.offsetWidth;
    delete pilula.dataset.pousando;
  }
}

/**
 * Cuida de todas as `.q-abas` dentro de `raiz` enquanto durar. Reage à escolha mudar, a abas que
 * entram e saem da tela, ao tamanho da janela e à faixa de movimento. Devolve como desinstalar.
 */
export function instalarPilulaDasAbas(raiz: HTMLElement = document.body): () => void {
  let pedido = 0;
  const atualizar = () => {
    pedido = 0;
    for (const grupo of raiz.querySelectorAll<HTMLElement>('.q-abas')) posicionarPilula(grupo);
  };
  const pedir = () => {
    if (!pedido) pedido = requestAnimationFrame(atualizar);
  };
  const observador = new MutationObserver((mudancas) => {
    /* A própria pílula entrando ou saindo não é motivo para medir tudo de novo. */
    const soPilula = mudancas.every(
      (m) =>
        m.type === 'childList' &&
        [...m.addedNodes, ...m.removedNodes].every((n) => n instanceof Element && n.classList.contains('q-pilula')),
    );
    if (!soPilula) pedir();
  });
  observador.observe(raiz, { subtree: true, childList: true, attributes: true, attributeFilter: ATRIBUTOS });
  /* A faixa de movimento é uma marca no <html>: quando ela muda, as pílulas entram ou saem. */
  const daFaixa = new MutationObserver(pedir);
  daFaixa.observe(document.documentElement, { attributes: true, attributeFilter: ['data-movimento'] });
  window.addEventListener('resize', pedir);
  document.fonts?.ready.then(pedir).catch(() => undefined);
  pedir();
  return () => {
    observador.disconnect();
    daFaixa.disconnect();
    window.removeEventListener('resize', pedir);
    if (pedido) cancelAnimationFrame(pedido);
    for (const grupo of raiz.querySelectorAll<HTMLElement>('.q-abas')) semPilula(grupo);
  };
}
