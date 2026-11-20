/**
 * AS POSIÇÕES DE LEITURA DESTE APARELHO ("continuar de onde parei"), no `localStorage`. Por aparelho, por
 * enquanto (decisão 5 da spec). Um armazém só para o leitor, a estante e "Meus livros" (que esquece a posição
 * quando a pessoa remove o livro).
 */
import { criarArmazemDePosicoes } from '../../core/leitura/posicao';

export const posicoes = criarArmazemDePosicoes({
  ler: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sem armazenamento: a posição vale só nesta abertura */
    }
  },
  apagar: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* idem */
    }
  },
});
