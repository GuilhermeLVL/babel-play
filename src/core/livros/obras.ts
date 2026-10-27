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

/** Os idiomas das edições, sem repetir, com `primeiro` na frente quando está entre eles. */
export function idiomasDasEdicoes(edicoes: readonly LivroDoCatalogo[], primeiro?: string): string[] {
  const todos = [...new Set(edicoes.map((l) => l.idioma))];
  return primeiro && todos.includes(primeiro) ? [primeiro, ...todos.filter((i) => i !== primeiro)] : todos;
}

const chaveDoTitulo = (s: string) =>
  s
    .replace(/\(.*?\)/g, ' ')
    .split(/\s[:;—–-]\s|[:;]\s/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * O título da edição é o rótulo da obra? Igual depois de tirar acento, caixa, pontuação, parênteses e subtítulo
 * ("El Filibusterismo (Continuación…)" = "El Filibusterismo"), ou o título é o rótulo mais um complemento de
 * mais de uma palavra ("Divina Commedia di Dante" = "Divina Commedia"). A montagem só usa isto DEPOIS de
 * confirmar o autor pela Wikidata: o título sozinho nunca liga duas edições.
 */
export function tituloEquivale(titulo: string, rotulo: string): boolean {
  const a = chaveDoTitulo(titulo);
  const b = chaveDoTitulo(rotulo);
  if (!a || !b) return false;
  return a === b || (b.includes(' ') && a.startsWith(`${b} `));
}

/** Quantos títulos alternativos uma edição leva no JSON (rótulos nos idiomas da trilha e alguns apelidos). */
export const MAX_TITULOS_ALTERNATIVOS = 24;

/**
 * Os rótulos da obra viram `titulosAlternativos`: sem o título da própria edição, sem repetir (dobrados: caixa
 * e acento não distinguem), sem vazio, no máximo `MAX_TITULOS_ALTERNATIVOS`, na ordem em que vieram.
 */
export function montarTitulosAlternativos(rotulos: readonly string[], tituloDaEdicao: string): string[] {
  const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vistos = new Set([dobrar(tituloDaEdicao)]);
  const saida: string[] = [];
  for (const r of rotulos) {
    const limpo = r.replace(/\s+/g, ' ').trim();
    const k = dobrar(limpo);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(limpo);
    if (saida.length >= MAX_TITULOS_ALTERNATIVOS) break;
  }
  return saida;
}
