/**
 * O BARRAMENTO DA SELEÇÃO (openspec `leitura-assistida`, contrato `BarramentoDaSelecao`): a Fatia A PUBLICA o trecho firmado
 * (`TrechoDoLeitor`) e as fatias B (tradução), C (vocabulário) e D (ajustar nível) ASSINAM. Em memória, só no aparelho; nada
 * aqui toca a rede nem grava.
 *
 * Além do trecho, guarda o `Range` vivo e o documento do livro (`selecaoAtual`), que só a camada das alças usa: o contrato
 * público não expõe DOM.
 */
import type { BarramentoDaSelecao, OrigemDaSelecao, TrechoDoLeitor } from '../../core/leitura/leituraAssistida';
import { citacaoDoRange, fraseDoRange } from './selecao';

export interface SelecaoViva {
  trecho: TrechoDoLeitor;
  doc: Document;
  range: Range;
  /** O índice da seção no livro (para o CFI das alças). */
  indice: number;
}

export interface BarramentoCompleto extends BarramentoDaSelecao {
  publicar(viva: SelecaoViva, origem: OrigemDaSelecao): void;
  limpar(): void;
  selecaoAtual(): SelecaoViva | null;
}

export function criarBarramento(): BarramentoCompleto {
  const aoSel = new Set<(t: TrechoDoLeitor, o: OrigemDaSelecao) => void>();
  const aoLimp = new Set<() => void>();
  let atual: SelecaoViva | null = null;
  const chamar = <A extends unknown[]>(fs: Set<(...a: A) => void>, ...a: A) => {
    /* Um assinante que falha não derruba os outros nem o gesto. */
    for (const f of [...fs]) {
      try {
        f(...a);
      } catch {
        /* o assinante cuida de si */
      }
    }
  };
  return {
    aoSelecionar(f) {
      aoSel.add(f);
      return () => void aoSel.delete(f);
    },
    aoLimpar(f) {
      aoLimp.add(f);
      return () => void aoLimp.delete(f);
    },
    publicar(viva, origem) {
      atual = viva;
      chamar(aoSel, viva.trecho, origem);
    },
    limpar() {
      if (!atual) return;
      atual = null;
      chamar(aoLimp);
    },
    selecaoAtual: () => atual,
  };
}

/** O barramento do leitor (um só por aba). */
export const barramentoDaSelecao: BarramentoCompleto = criarBarramento();

/** A coluna do trecho: o índice da coluna do documento (a largura da coluna vem do CSS do próprio livro). */
function colunaDe(doc: Document, esquerda: number): number {
  const el = doc.documentElement;
  const cs = doc.defaultView?.getComputedStyle(el);
  const largura = cs ? parseFloat(cs.columnWidth) + parseFloat(cs.columnGap || '0') : NaN;
  return largura > 0 && Number.isFinite(largura) ? Math.max(0, Math.floor(esquerda / largura)) : 0;
}

/**
 * O `TrechoDoLeitor` do `Range` (já firmado: bordas de palavra, dentro de um bloco). O `rect` sai em pixels da JANELA DO APP:
 * a caixa do trecho dentro do iframe somada à posição do iframe.
 */
export function montarTrecho(range: Range, idioma: string, cfi: string): TrechoDoLeitor {
  const doc = range.startContainer.ownerDocument!;
  const moldura = doc.defaultView?.frameElement?.getBoundingClientRect();
  const c = range.getBoundingClientRect();
  const bloco = (
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  )?.closest('p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, div, section, body');
  return {
    texto: range.toString().trim(),
    frase: fraseDoRange(range, idioma),
    paragrafo: (bloco?.textContent ?? range.toString()).replace(/\s+/g, ' ').trim(),
    idioma,
    cfi,
    citacao: citacaoDoRange(range),
    rect: {
      x: (moldura?.left ?? 0) + c.left,
      y: (moldura?.top ?? 0) + c.top,
      w: c.width,
      h: c.height,
      coluna: colunaDe(doc, c.left),
    },
  };
}
