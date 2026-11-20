/**
 * O AVISO DO PDF (LEI05): escaneado (sem camada de texto) ou de duas colunas (a ordem de leitura do
 * texto selecionável pode sair embaralhada). Heurística pura sobre a amostra das primeiras páginas que
 * o PDF.js devolve (`getTextContent`): posição horizontal e largura de cada item de texto.
 */

export interface ItemDeTextoDoPdf {
  /** x do começo do item, em unidades da página. */
  x: number;
  largura: number;
  texto: string;
}

export interface PaginaDaAmostra {
  largura: number;
  itens: ItemDeTextoDoPdf[];
}

export interface DiagnosticoDoPdf {
  escaneado: boolean;
  duasColunas: boolean;
}

/** Abaixo disto (caracteres por página, na média), o PDF é tratado como imagem. */
const MIN_CARACTERES_POR_PAGINA = 40;

export function diagnosticarPdf(paginas: readonly PaginaDaAmostra[]): DiagnosticoDoPdf {
  if (!paginas.length) return { escaneado: false, duasColunas: false };
  const caracteres = paginas.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.texto.trim().length, 0), 0);
  const escaneado = caracteres / paginas.length < MIN_CARACTERES_POR_PAGINA;
  if (escaneado) return { escaneado, duasColunas: false };
  /* Duas colunas: a maior parte das linhas com texto começa ou na metade esquerda ou na direita, quase
     nenhuma atravessa o meio, e as duas metades têm volume parecido. */
  let esquerda = 0;
  let direita = 0;
  let atravessam = 0;
  for (const p of paginas) {
    const meio = p.largura / 2;
    for (const i of p.itens) {
      if (i.texto.trim().length < 3) continue;
      const fim = i.x + i.largura;
      if (i.x < meio - p.largura * 0.02 && fim > meio + p.largura * 0.02) atravessam++;
      else if (fim <= meio + p.largura * 0.02) esquerda++;
      else direita++;
    }
  }
  const total = esquerda + direita + atravessam;
  const duasColunas =
    total >= 20 &&
    atravessam / total < 0.15 &&
    Math.min(esquerda, direita) / Math.max(1, Math.max(esquerda, direita)) > 0.4;
  return { escaneado, duasColunas };
}
