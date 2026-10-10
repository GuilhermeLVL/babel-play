/**
 * O INTÉRPRETE DO PROTÓTIPO — o movimento da conversa (`telas2.js:184-279, 569-582`) e o que a tela
 * pronta combina com a conversa em curso. (O inverter em arco de `prototipo.js:1096-1130` era da tela de
 * preparo, que não existe mais: a conversa virtual começa por uma folha.)
 *
 * Cada função é a do protótipo, com os mesmos números; o comentário diz a linha de onde veio. O motor
 * (microfone, reconhecimento, tradução, voz) não passa por aqui: isto é só o que se vê.
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: D19 a D31.
 */
import { anima, MOLA, MOLA_SUAVE, polido, reduz } from './base';
import { sentir, vibrar } from './sentidos';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];

const anda = () => polido() && !reduz();

/** A entrada da conversa: metades, faixa e os botões de falar (`telas2.js:275-278`). */
export function entradaDaConversa(raiz: ParentNode): void {
  if (!anda()) return;
  $$('.int-metade', raiz).forEach((m, i) =>
    anima(
      m,
      [
        { opacity: 0, transform: `translateY(${i ? 60 : -60}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 700, e: MOLA_SUAVE },
    ),
  );
  const faixa = $('.int-faixa', raiz);
  if (faixa)
    anima(
      faixa,
      [
        { opacity: 0, transform: 'scaleX(0.6)' },
        { opacity: 1, transform: 'scaleX(1)' },
      ],
      { d: 600, atraso: 150 },
    );
  $$('.int-falar', raiz).forEach((b, i) =>
    anima(b, [{ transform: 'scale(0.4)' }, { transform: 'scale(1)' }], { d: 700, atraso: 300 + i * 120, e: MOLA }),
  );
}

/** Uma palavra nova da fala em andamento (`telas2.js:206`). */
export function palavraNova(w: Element): void {
  if (!anda()) return;
  anima(
    w,
    [
      { opacity: 0, filter: 'blur(5px)', transform: 'translateY(5px)' },
      { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' },
    ],
    { d: 300 },
  );
}

/** Quanto tempo a metade de quem ouve fica marcada como "lendo" (`telas2.js:229`). */
export const TEMPO_LENDO = 1700;

/**
 * A tradução chegou do lado de quem escuta (`telas2.js:220-227`): o aparelho vibra, a faixa do meio
 * dá um clarão, a tradução sobe e o original aparece depois. Devolve como tirar a marca da metade.
 */
export function traducaoChegou(raiz: ParentNode, metade: HTMLElement): () => void {
  sentir('chega'); /* `telas2.js:237` */
  if (!anda()) return () => undefined;
  vibrar(8);
  const faixa = $('.int-faixa', raiz);
  if (faixa)
    anima(
      faixa,
      [
        { boxShadow: 'inset 0 0 0 0 transparent' },
        { boxShadow: 'inset 0 0 40px 0 color-mix(in srgb, var(--accent) 60%, transparent)' },
        { boxShadow: 'inset 0 0 0 0 transparent' },
      ],
      { d: 700, e: 'ease' },
    );
  const traducao = $('.int-traducao', metade);
  if (traducao)
    anima(
      traducao,
      [
        { opacity: 0, transform: 'translateY(26px) scale(0.94)', filter: 'blur(10px)' },
        { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
      ],
      { d: 620, e: MOLA_SUAVE },
    );
  const original = $('.int-original', metade);
  if (original) anima(original, [{ opacity: 0 }, { opacity: 1 }], { d: 400, atraso: 260, e: 'ease' });
  metade.classList.add('px-lendo');
  const relogio = window.setTimeout(() => metade.classList.remove('px-lendo'), TEMPO_LENDO);
  return () => {
    window.clearTimeout(relogio);
    metade.classList.remove('px-lendo');
  };
}

/** As bolhas da lista entram pelo lado de quem falou (`telas2.js:256`). */
export function entradaDasBolhas(raiz: ParentNode): void {
  if (!anda()) return;
  $$('.int-bolha', raiz).forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: `translateX(${x.dataset.lado === 'meu' ? 30 : -30}px) scale(0.96)` },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ],
      { d: 460, atraso: i * 70, e: MOLA_SUAVE },
    ),
  );
}

/** O botão do automático treme para quem não o tem no plano (`telas2.js:263`). */
export function tremer(b: Element): void {
  if (!anda()) return;
  anima(
    b,
    [0, -5, 5, -3, 3, 0].map((v) => ({ transform: `translateX(${v}px)` })),
    { d: 360, e: 'ease-out' },
  );
}

/** Onde cada metade está agora: a primeira parte do FLIP de trocar os lados (`telas2.js:570-572`). */
export function topoDasMetades(raiz: ParentNode): Map<string, number> {
  return new Map($$('.int-metade', raiz).map((m) => [m.dataset.lado ?? '', m.getBoundingClientRect().top]));
}

/** As metades já trocaram de lugar: cada uma parte de onde estava (`telas2.js:577-580`). */
export function trocaDeLados(raiz: ParentNode, antes: Map<string, number>): void {
  if (!anda()) return;
  /* A ordem do protótipo: primeiro a que estava em cima, depois a de baixo. */
  const metades = $$('.int-metade', raiz).sort(
    (a, b) => (antes.get(a.dataset.lado ?? '') ?? 0) - (antes.get(b.dataset.lado ?? '') ?? 0),
  );
  for (const m of metades) {
    const topo = antes.get(m.dataset.lado ?? '');
    if (topo === undefined) continue;
    anima(m, [{ translate: `0 ${topo - m.getBoundingClientRect().top}px` }, { translate: '0 0' }], {
      d: 620,
      e: MOLA_SUAVE,
    });
  }
}

/* ---- O que a tela pronta combina com a conversa em curso ------------------------------------------ */

/** O toque que abriu a conversa: o lado tocado, ou a escuta do modo automático. */
export type PedidoDaConversa = 'meu' | 'outro' | 'ouvir';

/** Depois disto o toque já passou: a conversa abre parada (a folha do início pode ter ficado aberta). */
const VALIDADE_DO_PEDIDO = 60_000;
let pedido: { acao: PedidoDaConversa; em: number } | null = null;

/** A tela pronta guarda o toque; a conversa o toma quando monta e começa por ele. */
export function pedirConversa(acao: PedidoDaConversa): void {
  pedido = { acao, em: Date.now() };
}

export function tomarPedidoDaConversa(): PedidoDaConversa | null {
  const p = pedido;
  pedido = null;
  return p && Date.now() - p.em < VALIDADE_DO_PEDIDO ? p.acao : null;
}

/**
 * O que as duas telas veem igual: se a conversa em curso está na frente (a tela pronta, por baixo, se
 * esconde), se os lados estão trocados e se a folha da conversa virtual está aberta.
 */
export interface EstadoDaTela {
  emCurso: boolean;
  trocados: boolean;
  /** A folha "Conversa virtual" (o aceite e o fone) está aberta por cima da conversa. */
  folhaVirtual: boolean;
  /**
   * Para onde ir quando a sessão em curso encerrar: o X volta à tela de origem e "Conhecer o Premium"
   * abre os Planos (numa conversa em que ninguém falou); "Virtual" abre a folha da conversa virtual
   * (com falas, o Encerrar decide antes). Quem age é a tela pronta.
   */
  depois: 'voltar' | 'planos' | 'virtual' | null;
}
let estado: EstadoDaTela = { emCurso: false, trocados: false, folhaVirtual: false, depois: null };
const ouvintes = new Set<() => void>();

export const estadoDaTela = (): EstadoDaTela => estado;
export function mudarEstadoDaTela(parte: Partial<EstadoDaTela>): void {
  const novo = { ...estado, ...parte };
  if (
    novo.emCurso === estado.emCurso &&
    novo.trocados === estado.trocados &&
    novo.folhaVirtual === estado.folhaVirtual &&
    novo.depois === estado.depois
  )
    return;
  estado = novo;
  for (const o of ouvintes) o();
}
export function aoMudarEstadoDaTela(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => void ouvintes.delete(cb);
}
