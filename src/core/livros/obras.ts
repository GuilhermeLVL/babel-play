/**
 * OBRAS E EDIÇÕES. Cada `LivroDoCatalogo` é UMA EDIÇÃO (um texto, num idioma, de uma fonte); a OBRA é o que
 * as edições têm em comum (o mesmo "Dom Quixote" em espanhol, inglês e português). A ligação é a chave `obra`
 * (QID da Wikidata), gravada pela montagem. Sem QID, a obra é local ao idioma e nunca se junta com outro.
 *
 * Função pura. A VISIBILIDADE vem de fora: quem chama passa só o que este leitor pode ver
 * (`livrosVisiveis`), então uma edição irmã que não passa no filtro legal ou na faixa etária nunca aparece
 * como "outro idioma" de um livro que aparece. Nada aqui afrouxa essa regra.
 */
import { livrosVisiveis, type TetoDeClassificacao } from './catalogo';
import { slug } from './categorias';
import type { LivroDoCatalogo } from './tipos';

/** A chave é um QID da Wikidata? (só ela liga edições entre idiomas) */
export const ehObraDaWikidata = (obra: unknown): obra is string => typeof obra === 'string' && /^Q\d+$/.test(obra);

/** A obra de um livro sem QID: local ao idioma (`local:pt:machado-de-assis-dom-casmurro`). */
export function obraLocal(l: Pick<LivroDoCatalogo, 'idioma' | 'titulo' | 'autores'>): string {
  const autor = slug(l.autores[0]?.nome ?? 'anonimo');
  return `local:${l.idioma}:${autor}-${slug(l.titulo.replace(/\(.*?\)/g, ''))}`;
}

/** A chave de agrupamento: o QID, ou (catálogo antigo/sem QID) a própria edição. */
export const chaveDaObra = (l: Pick<LivroDoCatalogo, 'id' | 'obra'>): string =>
  ehObraDaWikidata(l.obra) ? l.obra : `edicao:${l.id}`;

/** Os livros por obra, na ordem em que a obra aparece pela primeira vez na lista. */
export function agruparPorObra(livros: readonly LivroDoCatalogo[]): Map<string, LivroDoCatalogo[]> {
  const m = new Map<string, LivroDoCatalogo[]>();
  for (const l of livros) {
    const k = chaveDaObra(l);
    const grupo = m.get(k);
    if (grupo) grupo.push(l);
    else m.set(k, [l]);
  }
  return m;
}

/**
 * Todas as edições da mesma obra dentro de `catalogo` (o próprio livro primeiro, se estiver nele) e as outras
 * por popularidade. `catalogo` deve ser o que o leitor PODE ver.
 */
export function edicoesDaObra(livro: LivroDoCatalogo, catalogo: readonly LivroDoCatalogo[]): LivroDoCatalogo[] {
  const k = chaveDaObra(livro);
  const todas = catalogo.filter((l) => chaveDaObra(l) === k);
  const proprio = todas.filter((l) => l.id === livro.id);
  const outras = todas.filter((l) => l.id !== livro.id).sort((a, b) => b.popularidade - a.popularidade);
  return [...proprio, ...outras];
}

/**
 * As OUTRAS edições visíveis da obra, em OUTROS idiomas. O filtro legal e a classificação valem edição por
 * edição: um irmão que o leitor não pode ver não é devolvido, e um menor sem classificação aprovada não vê nada.
 */
export function edicoesEmOutrosIdiomas(
  livro: LivroDoCatalogo,
  catalogo: readonly LivroDoCatalogo[],
  teto: TetoDeClassificacao,
  limite: number,
  agora: Date = new Date(),
): LivroDoCatalogo[] {
  return edicoesDaObra(livro, livrosVisiveis(catalogo, teto, limite, agora)).filter(
    (l) => l.id !== livro.id && l.idioma !== livro.idioma,
  );
}

/** Uma obra na vitrine: a edição que a representa (a do idioma preferido) e todas as edições da obra. */
export interface ObraDaVitrine {
  obra: string;
  principal: LivroDoCatalogo;
  edicoes: LivroDoCatalogo[];
}

/**
 * Agrupa por obra, sem repetir a obra. A edição principal é a do `idiomaPreferido`; sem ela, a mais popular.
 * A ordem das obras segue a do primeiro livro de cada grupo (a lista já vem ordenada por quem chama).
 */
export function obrasDaVitrine(livros: readonly LivroDoCatalogo[], idiomaPreferido: string): ObraDaVitrine[] {
  return [...agruparPorObra(livros)].map(([obra, edicoes]) => {
    const principal =
      edicoes.find((l) => l.idioma === idiomaPreferido) ??
      [...edicoes].sort((a, b) => b.popularidade - a.popularidade)[0];
    return { obra, principal, edicoes };
  });
}

/** Os idiomas das edições, sem repetir, com `primeiro` na frente quando está entre eles. */
export function idiomasDasEdicoes(edicoes: readonly LivroDoCatalogo[], primeiro?: string): string[] {
  const todos = [...new Set(edicoes.map((l) => l.idioma))];
  return primeiro && todos.includes(primeiro) ? [primeiro, ...todos.filter((i) => i !== primeiro)] : todos;
}
