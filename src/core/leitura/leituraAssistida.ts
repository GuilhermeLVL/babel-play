/**
 * O CONTRATO DA LEITURA ASSISTIDA (openspec `leitura-assistida`): os tipos que as fatias A (seleção), B (tradução),
 * C (vocabulário) e D (ajustar nível) combinam entre si. Puro: sem React, sem rede, sem DOM.
 *
 * Esta cópia traz só o que a Fatia A publica (`TrechoDoLeitor` e `BarramentoDaSelecao`); a Fatia 0 acrescenta o resto
 * (`statusDaPalavra`, `abrirAjustarNivel`, `lerEmVozAlta`) neste mesmo arquivo, sem mudar o que está aqui.
 */
import type { CitacaoDoTexto } from './anotacao';

export type NivelCefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Escopo = 'palavra' | 'trecho' | 'paragrafo' | 'capitulo';

/** O trecho selecionado, igual para todas as fatias. Sempre em bordas de palavra e dentro de UM bloco (a Fatia A garante). */
export interface TrechoDoLeitor {
  texto: string;
  frase: string;
  /** O texto do bloco (parágrafo, item…) que contém o trecho. */
  paragrafo: string;
  idioma: string;
  cfi: string;
  citacao: CitacaoDoTexto;
  /** Em pixels da janela do app (já fora do iframe do livro); `coluna` = 0 da esquerda. */
  rect: { x: number; y: number; w: number; h: number; coluna: number };
}

export type OrigemDaSelecao = 'toque' | 'duplo' | 'longo' | 'alca' | 'arrasto';

/** A publica; B, C e D assinam. Cada `aoXxx` devolve o cancelamento da assinatura. */
export interface BarramentoDaSelecao {
  aoSelecionar(f: (t: TrechoDoLeitor, origem: OrigemDaSelecao) => void): () => void;
  aoLimpar(f: () => void): () => void;
}
