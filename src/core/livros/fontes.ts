/**
 * DOS METADADOS DE CADA FONTE PARA OS METADADOS LEGAIS (`filtroLegal.MetadadosLegais`). O script de montagem
 * passa tudo por aqui antes de decidir, e os testes exercitam a decisão sem rede.
 */
import { nomeNaOrdemDireta } from './categorias';
import type { MetadadosLegais } from './filtroLegal';
import type { Pessoa } from './tipos';

/** Uma pessoa como o Gutendex a descreve. */
export interface PessoaDoGutendex {
  name: string;
  birth_year?: number | null;
  death_year?: number | null;
}

/** Um livro como o Gutendex o descreve (só o que a decisão usa). */
export interface LivroDoGutendex {
  id: number;
  authors?: PessoaDoGutendex[];
  translators?: PessoaDoGutendex[];
}

/**
 * Os idiomas em que cada pessoa escrevia, por nome na ordem direta ("Jacob Grimm"). `null` ou ausente =
 * não deu para saber, e aí a obra conta como tradução (falha fechada).
 */
export type IdiomasPorPessoa = ReadonlyMap<string, readonly string[] | null>;

export function pessoaDoGutendex(p: PessoaDoGutendex, idiomas: IdiomasPorPessoa): Pessoa {
  const nome = nomeNaOrdemDireta(p.name);
  const conhecidos = idiomas.get(nome);
  return {
    nome,
    anoMorte: Number.isInteger(p.death_year) ? (p.death_year as number) : null,
    ...(conhecidos?.length ? { idiomas: [...conhecidos] } : {}),
  };
}

/**
 * Os metadados legais de um livro do Gutendex no idioma `idioma`. `traducaoDeclarada`: o texto do livro
 * (já sem a moldura) traz "translated by", "traducción de"… (`core/livros/traducao`).
 */
export function metadadosLegaisDoGutendex(
  b: LivroDoGutendex,
  idioma: string,
  idiomas: IdiomasPorPessoa,
  traducaoDeclarada = false,
): MetadadosLegais {
  return {
    autores: (b.authors ?? []).map((p) => pessoaDoGutendex(p, idiomas)),
    tradutores: (b.translators ?? []).map((p) => pessoaDoGutendex(p, idiomas)),
    idioma,
    traducaoDeclarada,
    fonte: 'gutenberg-curado',
  };
}
