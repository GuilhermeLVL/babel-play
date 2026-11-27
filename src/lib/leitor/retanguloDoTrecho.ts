/**
 * ONDE O TRECHO ESTÁ NA JANELA DO APP (openspec `leitura-assistida`, fatia B): a caixa do `Range` vive no documento do
 * iframe do capítulo; o balão da tradução vive fora dele. Soma o deslocamento do iframe e devolve a caixa que cobre todas as
 * linhas do trecho. Sem caixa (trecho fora da tela), `null`: o balão não aparece e a barra segue sendo o caminho.
 */
import type { Caixa } from '../../core/leitura/balaoDaTraducao';

export function retanguloDoTrecho(range: Range): Caixa | null {
  try {
    const caixas = Array.from(range.getClientRects()).filter((c) => c.width > 0 && c.height > 0);
    if (!caixas.length) return null;
    const esquerda = Math.min(...caixas.map((c) => c.left));
    const topo = Math.min(...caixas.map((c) => c.top));
    const direita = Math.max(...caixas.map((c) => c.right));
    const fundo = Math.max(...caixas.map((c) => c.bottom));
    const quadro = range.startContainer.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();
    const dx = quadro?.left ?? 0;
    const dy = quadro?.top ?? 0;
    return { x: esquerda + dx, y: topo + dy, w: direita - esquerda, h: fundo - topo };
  } catch {
    return null;
  }
}

/** O texto do bloco (parágrafo, item…) que contém o trecho, para "traduzir o parágrafo". */
export function paragrafoDoTrecho(range: Range): string {
  const no = range.startContainer;
  const el = no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement;
  const bloco = el?.closest('p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, div');
  return (bloco?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
