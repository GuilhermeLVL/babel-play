import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * ONDE UM POPUP DEVE ABRIR — a conta feita uma vez só.
 *
 * POR QUE ISTO EXISTE. Dois defeitos do mesmo tipo apareceram em telas diferentes, e o segundo
 * só foi encontrado porque procuramos o PADRÃO depois de consertar o primeiro:
 *
 *   · a lista de idiomas abria dentro de um `.card-panel` (que tem `overflow: hidden`) e era
 *     espremida nos 56px da barra — sobrava um retângulo cortado, sem lista;
 *   · o menu "..." de cada mídia da Biblioteca vazava 101px para fora do card e tinha metade dos
 *     itens invisível e inclicável.
 *
 * A causa é sempre a mesma: um popup posicionado DENTRO da árvore fica à mercê de qualquer
 * ancestral que recorte. E a correção também: renderizar no `body` (por portal), com
 * `position: fixed` e coordenadas de viewport. Este módulo é a parte da conta que dava para
 * compartilhar — a terceira ocorrência não precisa redescobrir nada.
 *
 * O QUE ELE NÃO FAZ: o portal em si. Cada componente chama `createPortal` no lugar dele, porque
 * o conteúdo, o foco e o fechamento são de cada um.
 */

export interface CaixaFlutuante {
  top: number;
  left: number;
  largura: number;
}

export interface OpcoesFlutuante {
  /** Largura em px, ou `'ancora'` para copiar a do gatilho (menus de campo inteiro). */
  largura?: number | 'ancora';
  /** Altura aproximada, usada só para decidir se abre para baixo ou para cima. */
  alturaEstimada?: number;
  /** Folga da borda da janela. */
  margem?: number;
}

/**
 * Calcula a posição enquanto `aberto` for verdadeiro, e reage a rolagem e redimensionamento.
 *
 * A ORDEM DE TENTATIVA na horizontal: alinhar pela DIREITA do gatilho (é o que se espera de um
 * menu que sai de um botão no canto), alinhar pela esquerda se aquilo sair da tela, e por último
 * encostar na borda. Fixar um dos lados no código foi exatamente o que quebrou quando o mesmo
 * componente mudou de canto.
 */
export function usePosicaoFlutuante(
  aberto: boolean,
  ancora: { current: HTMLElement | null },
  opts: OpcoesFlutuante = {},
): CaixaFlutuante | null {
  const { largura = 288, alturaEstimada = 240, margem = 8 } = opts;
  const [caixa, setCaixa] = useState<CaixaFlutuante | null>(null);

  const calcular = useCallback(() => {
    const g = ancora.current?.getBoundingClientRect();
    if (!g) return;
    const w = largura === 'ancora' ? g.width : largura;

    let esquerda = largura === 'ancora' ? g.left : g.right - w;
    if (esquerda < margem) esquerda = g.left;
    if (esquerda + w > window.innerWidth - margem) esquerda = window.innerWidth - w - margem;

    // Abre para baixo quando cabe; para cima quando não cabe. Sem isto, um gatilho no pé da tela
    // abre um menu que nasce fora dela.
    const cabeAbaixo = g.bottom + 4 + alturaEstimada <= window.innerHeight - margem;
    const topo = cabeAbaixo
      ? g.bottom + 4
      : Math.max(margem, g.top - alturaEstimada - 4);

    setCaixa({ top: topo, left: Math.max(margem, esquerda), largura: w });
  }, [ancora, largura, alturaEstimada, margem]);

  // Antes de pintar: um quadro na posição errada é visível e parece defeito.
  useLayoutEffect(() => { if (aberto) calcular(); }, [aberto, calcular]);

  useEffect(() => {
    if (!aberto) return;
    const refazer = () => calcular();
    window.addEventListener('resize', refazer);
    // `true` para pegar a rolagem de containers internos, não só a da janela.
    window.addEventListener('scroll', refazer, true);
    return () => {
      window.removeEventListener('resize', refazer);
      window.removeEventListener('scroll', refazer, true);
    };
  }, [aberto, calcular]);

  return aberto ? caixa : null;
}

export interface PosPopover { top: number; left: number }

/**
 * Posição de um POPOVER DE PALAVRA (hover na Análise/Leitura): centraliza no termo, respeita as
 * bordas (margem) e abre para CIMA quando não cabe abaixo. Extraído porque estava DUPLICADO
 * byte-a-byte em Analysis e Reading (M-08) — duas telas que precisavam concordar sobre o mesmo
 * cálculo e podiam divergir a cada ajuste. Pure (sem DOM): recebe rect + viewport, devolve {top,left}.
 */
export function posicaoPopoverPalavra(
  rect: { left: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  opts: { largura?: number; alturaEstimada?: number; margem?: number } = {},
): PosPopover {
  const largura = opts.largura ?? 320;
  const alturaEstimada = opts.alturaEstimada ?? 360;
  const margem = opts.margem ?? 16;
  const centro = rect.left + rect.width / 2;
  let left = centro - largura / 2;
  left = Math.max(margem, Math.min(viewport.width - largura - margem, left));
  let top = rect.bottom + 8;
  if (top + alturaEstimada > viewport.height && rect.top - alturaEstimada - 8 > 0) {
    top = rect.top - alturaEstimada - 8;
  }
  return { top, left };
}
