/**
 * AS MINIATURAS DOS JOGOS SÓ ANIMAM À VISTA (auditoria de desempenho de 10/10/2026, G3).
 *
 * No protótipo, onde não há ponteiro todas as miniaturas andam (`minis.css:33`), inclusive as dos cartões
 * que a rolagem ainda não trouxe: no saguão do Jogar eram 53 animações com 4 dos 18 cartões à vista, e o
 * fio principal trabalhava 507 ms a cada segundo com a tela parada (celular médio).
 *
 * Aqui um `IntersectionObserver` marca o cartão que saiu da vista (`px-fora-da-vista`) e o CSS pausa as
 * animações dele (`styles/polimentoDesempenho.css`). Quando ele volta, cada animação é posta no instante
 * em que estaria se nunca tivesse parado: o que se vê é o mesmo, com as miniaturas no mesmo passo.
 */

const CARTAO = '.q-tile.px-com-mini';
const FORA = 'px-fora-da-vista';
/** A folga em volta da janela: a miniatura já anda antes de a rolagem a mostrar. */
const FOLGA = '160px';

/** Quando cada cartão foi pausado, na linha do tempo do documento. */
const pausadoEm = new WeakMap<Element, number>();

/** As animações da miniatura do cartão (as peças e os `::before` delas), não as do cartão em si. */
const animacoesDe = (cartao: Element): Animation[] => {
  try {
    return (cartao.getAnimations?.({ subtree: true }) ?? []).filter((a) => {
      const alvo = (a.effect as KeyframeEffect | null)?.target;
      return 'animationName' in a && !!alvo?.closest('.px-mini');
    });
  } catch {
    return [];
  }
};

/* PAUSAR NÃO PERGUNTA NADA AO NAVEGADOR: só anota a hora e põe a marca. Ao entrar no Jogar saem da vista
   14 cartões de uma vez; pedir as animações de cada um ali (`getAnimations`) custava 132 a 142 ms no
   celular médio. Quem pergunta é a volta, que acontece na rolagem, um ou dois cartões por vez. */
function pausar(cartao: Element): void {
  if (cartao.classList.contains(FORA)) return;
  const agora = document.timeline?.currentTime;
  if (typeof agora === 'number') pausadoEm.set(cartao, agora);
  cartao.classList.add(FORA);
}

function retomar(cartao: Element): void {
  if (!cartao.classList.contains(FORA)) return;
  cartao.classList.remove(FORA);
  const desde = pausadoEm.get(cartao);
  pausadoEm.delete(cartao);
  const agora = document.timeline?.currentTime;
  if (desde === undefined || typeof agora !== 'number') return;
  /* Cada animação avança o tempo que ficou parada: está onde estaria sem a pausa. */
  for (const a of animacoesDe(cartao)) {
    /* A que o próprio desenho deixa parada (aparelho com mouse, sem o ponteiro em cima) fica como está. */
    if (a.playState === 'paused') continue;
    const instante = a.currentTime;
    if (typeof instante !== 'number') continue;
    try {
      a.currentTime = instante + (agora - desde);
    } catch {
      /* animação que não aceita o salto segue de onde parou */
    }
  }
}

/** Liga a pausa das miniaturas fora da vista enquanto a casca estiver montada. Devolve como desligar. */
export function instalarMinis(): () => void {
  if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return () => undefined;
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.target.isConnected) {
          vigia.unobserve(e.target);
          continue;
        }
        if (e.isIntersecting) retomar(e.target);
        else pausar(e.target);
      }
    },
    { rootMargin: FOLGA },
  );
  /* O cartão que já nasce fora da vista é pausado antes do primeiro quadro dele, e a animação só começa
     a contar nesse quadro. A hora da pausa dele passa a ser a desse quadro: é de lá que as animações dos
     cartões vizinhos, que nunca pararam, estão contando. */
  const vistos = new WeakSet<Element>();
  let recemChegados: Element[] = [];
  const noPrimeiroQuadro = () => {
    const agora = document.timeline?.currentTime;
    const lista = recemChegados;
    recemChegados = [];
    if (typeof agora !== 'number') return;
    for (const cartao of lista) if (pausadoEm.has(cartao)) pausadoEm.set(cartao, agora);
  };
  const observar = (cartao: Element) => {
    vigia.observe(cartao);
    if (vistos.has(cartao)) return;
    vistos.add(cartao);
    if (!recemChegados.length) requestAnimationFrame(noPrimeiroQuadro);
    recemChegados.push(cartao);
  };
  const vigiar = (raiz: ParentNode) => {
    if (raiz instanceof Element && raiz.matches(CARTAO)) observar(raiz);
    for (const cartao of raiz.querySelectorAll(CARTAO)) observar(cartao);
  };
  const observador = new MutationObserver((mudancas) => {
    for (const m of mudancas) for (const n of m.addedNodes) if (n instanceof Element) vigiar(n);
  });
  observador.observe(document.body, { childList: true, subtree: true });
  vigiar(document);
  return () => {
    observador.disconnect();
    vigia.disconnect();
    for (const cartao of document.querySelectorAll(`${CARTAO}.${FORA}`)) cartao.classList.remove(FORA);
  };
}
