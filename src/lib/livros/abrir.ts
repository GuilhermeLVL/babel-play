/**
 * O PONTO DE ENCONTRO ENTRE O CATÁLOGO (L1) E O LEITOR (L2).
 *
 * Toda tela que quer "ler este livro" chama `abrirLivroNoLeitor` e só ela: o botão "Ler" do detalhe, os
 * recentes de "Meus livros", o "Trazer o seu" depois de importar. Hoje ela leva à LEITURA PROVISÓRIA
 * (`/livros/<id>/ler`, `components/views/livros/LeituraProvisoria.tsx`): o texto do livro, buscado direto da
 * fonte pelo navegador, sem paginação nem grifos. A L2 troca o corpo desta função (e a tela da rota) pelo
 * leitor de verdade; quem chama não muda.
 */
import { navegarPara } from '../rotas';

export interface LivroParaAbrir {
  /** O id do catálogo, ou o `meu-…` de um livro trazido (ver `meusLivros.ts`). */
  id: string;
}

export function abrirLivroNoLeitor(livro: LivroParaAbrir): void {
  navegarPara({ view: 'livros', livroId: livro.id, lendo: true });
}

/** O detalhe de um livro do catálogo (créditos, licença, nível, "Ler"). */
export function abrirDetalheDoLivro(livro: LivroParaAbrir): void {
  navegarPara({ view: 'livros', livroId: livro.id });
}

/** De volta ao catálogo. */
export function voltarAoCatalogo(): void {
  navegarPara({ view: 'livros' });
}
