/**
 * ONDE O CARTÃO DA PALAVRA FICA — puro (geometria, sem DOM).
 *
 * Computador: ancorado na palavra, ABAIXO quando cabe, ACIMA quando não cabe; sem espaço inteiro nos dois, o
 * lado maior com a altura limitada. Nunca por cima da palavra, e sempre dentro da faixa do leitor (`faixa`: a
 * coluna do livro, sem o menu lateral do app).
 * Celular (≤ 600 px de largura) ou sem o retângulo da palavra: MINI-FOLHA presa embaixo, com no máximo 40% da
 * altura; se embaixo ela cobriria a palavra, vai para o topo. (O texto paginado não rola: uma página é uma
 * página. Trocar de borda é o que garante a palavra à vista.)
 */

export interface Retangulo {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface EntradaDaPosicao {
  /** O retângulo da palavra na janela do app (já somado ao do iframe do capítulo). `null` = desconhecido. */
  palavra: Retangulo | null;
  janela: { largura: number; altura: number };
  /** O tamanho que o cartão quer ter (medido, ou o estimado antes da primeira medida). */
  cartao: { largura: number; altura: number };
  /** A faixa horizontal do leitor na janela (a coluna do livro, sem o menu lateral). Ausente = a janela inteira. */
  faixa?: { esquerda: number; direita: number };
}

export type PosicaoDoCartao =
  | { modo: 'ancorado'; lado: 'abaixo' | 'acima'; top: number; left: number; maxAltura: number }
  | { modo: 'folha'; borda: 'baixo' | 'topo'; maxAltura: number };

export const LARGURA_DO_CELULAR = 600;
const MARGEM = 8;
const VAO = 6;
const FRACAO_DA_FOLHA = 0.4;

export function posicaoDoCartao({ palavra, janela, cartao, faixa }: EntradaDaPosicao): PosicaoDoCartao {
  if (!palavra || janela.largura <= LARGURA_DO_CELULAR) {
    const maxAltura = Math.floor(janela.altura * FRACAO_DA_FOLHA);
    const ocupa = Math.min(cartao.altura, maxAltura) + MARGEM;
    const cobririaEmbaixo = !!palavra && palavra.bottom > janela.altura - ocupa;
    const cabeEmCima = !!palavra && palavra.top > ocupa;
    return { modo: 'folha', borda: cobririaEmbaixo && cabeEmCima ? 'topo' : 'baixo', maxAltura };
  }

  const abaixo = janela.altura - palavra.bottom - VAO - MARGEM;
  const acima = palavra.top - VAO - MARGEM;
  const lado: 'abaixo' | 'acima' =
    cartao.altura <= abaixo ? 'abaixo' : cartao.altura <= acima ? 'acima' : abaixo >= acima ? 'abaixo' : 'acima';
  const maxAltura = Math.max(0, Math.floor(Math.min(cartao.altura, lado === 'abaixo' ? abaixo : acima)));
  const top = lado === 'abaixo' ? palavra.bottom + VAO : palavra.top - VAO - maxAltura;

  const centro = (palavra.left + palavra.right) / 2;
  const minimo = Math.max(0, faixa?.esquerda ?? 0) + MARGEM;
  const maxLeft = Math.max(
    minimo,
    Math.min(janela.largura, faixa?.direita ?? janela.largura) - cartao.largura - MARGEM,
  );
  const left = Math.min(Math.max(centro - cartao.largura / 2, minimo), maxLeft);
  return { modo: 'ancorado', lado, top: Math.round(top), left: Math.round(left), maxAltura };
}
