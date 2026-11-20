/**
 * OS NOMES DAS PERSONAGENS PARA O ELENCO (M5): saem da ficha do livro do CATÁLOGO (arquivo estático do próprio Frasy,
 * `public/catalogo/fichas/<id>.json`), pela MESMA porta de quem vê o quê (`carregarFicha` → `fichaParaLeitor`): livro
 * fora da faixa de quem lê, ficha ausente ou fora da forma = lista vazia (só narrador). Livro trazido pela pessoa NUNCA
 * consulta nada: a lista é vazia e o texto não sai do aparelho.
 */
import { readAgeProfile } from '../profile';
import { carregarCatalogo } from './catalogo';
import { carregarFicha } from './fichas';
import { tetoDoLeitor } from './quemLe';

export async function personagensDoLivro(livroId: string, origem: string | undefined): Promise<string[]> {
  if (origem !== 'catalogo' || !livroId.startsWith('cat:') || livroId.length <= 4) return [];
  const id = livroId.slice(4);
  try {
    const catalogo = await carregarCatalogo();
    const livro = catalogo.livros.find((l) => l.id === id);
    if (!livro) return [];
    const ficha = await carregarFicha(livro, {
      teto: tetoDoLeitor(readAgeProfile()),
      mostrarSpoilers: false,
      livroVisivel: () => false,
    });
    return ficha ? ficha.personagens.map((p) => p.nome) : [];
  } catch {
    return [];
  }
}
