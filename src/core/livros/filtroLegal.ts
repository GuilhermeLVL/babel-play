/**
 * O FILTRO LEGAL DO CATÁLOGO (spec de Livros & Leitura, Design §1). Função pura, sem relógio.
 *
 * No Brasil a obra entra em domínio público 70 anos contados de 1º de janeiro do ano seguinte à morte do
 * autor (Lei 9.610, art. 41). Morto em 1955, a obra é livre desde 1º/1/2026; morto em 1956, só em 2027.
 * Daí `anoLimite = ano − 71`. A tradução tem direito próprio (art. 14): o tradutor obedece à mesma regra.
 * "Domínio público nos EUA" não basta, e por isso nada aqui confia no rótulo da fonte.
 *
 * As regras, na ordem em que a primeira que falha vira o motivo:
 *   1. a fonte é uma das aceitas;
 *   2. há autor (obra anônima só entra pela lista de exceções revisada, que o chamador aplica antes);
 *   3. todo autor tem ano de morte, e ele é ≤ `anoLimite`;
 *   4. a obra marcada como tradução tem tradutor identificado;
 *   5. todo tradutor tem ano de morte, e ele é ≤ `anoLimite`.
 * Sem ano de morte, FORA: na dúvida, o livro não entra.
 */
import { FONTES_DO_LIVRO, type MotivoDeExclusao, type Pessoa } from './tipos';

/** O ano de morte mais recente que entra no catálogo montado no ano `ano`. */
export function anoLimite(ano: number): number {
  return ano - 71;
}

export interface MetadadosLegais {
  autores: readonly Pessoa[];
  tradutores: readonly Pessoa[];
  /** A fonte (ou o texto) diz que é tradução: `translators` no Gutendex, "translated by" no texto, `trl` no OPF. */
  ehTraducao: boolean;
  fonte: string;
}

export type Veredito = { entra: true } | { entra: false; motivo: MotivoDeExclusao; detalhe: string };

const lista = (ps: readonly Pessoa[]) => ps.map((p) => p.nome).join(', ');

export function avaliarLegalidade(m: MetadadosLegais, ano: number): Veredito {
  const limite = anoLimite(ano);
  if (!(FONTES_DO_LIVRO as readonly string[]).includes(m.fonte)) {
    return { entra: false, motivo: 'fonte-nao-aceita', detalhe: `fonte "${m.fonte}" fora da lista` };
  }
  if (m.autores.length === 0) {
    return { entra: false, motivo: 'sem-autor', detalhe: 'obra sem autor identificado' };
  }
  const autorSemAno = m.autores.filter((a) => a.anoMorte == null);
  if (autorSemAno.length) {
    return {
      entra: false,
      motivo: 'autor-sem-ano-de-morte',
      detalhe: `sem o ano de morte de ${lista(autorSemAno)}`,
    };
  }
  const autorProtegido = m.autores.find((a) => (a.anoMorte as number) > limite);
  if (autorProtegido) {
    return {
      entra: false,
      motivo: 'autor-protegido',
      detalhe: `${autorProtegido.nome} morreu em ${autorProtegido.anoMorte}; a obra fica livre no Brasil em ${(autorProtegido.anoMorte as number) + 71}`,
    };
  }
  if (m.ehTraducao && m.tradutores.length === 0) {
    return { entra: false, motivo: 'traducao-sem-tradutor', detalhe: 'tradução sem tradutor identificado' };
  }
  const tradutorSemAno = m.tradutores.filter((t) => t.anoMorte == null);
  if (tradutorSemAno.length) {
    return {
      entra: false,
      motivo: 'tradutor-sem-ano-de-morte',
      detalhe: `sem o ano de morte do tradutor (${lista(tradutorSemAno)})`,
    };
  }
  const tradutorProtegido = m.tradutores.find((t) => (t.anoMorte as number) > limite);
  if (tradutorProtegido) {
    return {
      entra: false,
      motivo: 'tradutor-protegido',
      detalhe: `o tradutor ${tradutorProtegido.nome} morreu em ${tradutorProtegido.anoMorte}; a tradução fica livre no Brasil em ${(tradutorProtegido.anoMorte as number) + 71}`,
    };
  }
  return { entra: true };
}

/** Atalho booleano. */
export function entraNoCatalogo(m: MetadadosLegais, ano: number): boolean {
  return avaliarLegalidade(m, ano).entra;
}

/**
 * A DEFESA DUPLA DO CLIENTE: o catálogo publicado guarda `anoLimite`, e o cliente recusa o livro cujo ano de
 * morte (de autor ou tradutor) passe dele ou falte. Um JSON adulterado ou montado com `--ano` errado não
 * publica obra protegida.
 */
export function respeitaOLimite(
  livro: { autores: readonly Pessoa[]; tradutores: readonly Pessoa[] },
  limite: number,
): boolean {
  if (livro.autores.length === 0) return false;
  return [...livro.autores, ...livro.tradutores].every((p) => p.anoMorte != null && p.anoMorte <= limite);
}
