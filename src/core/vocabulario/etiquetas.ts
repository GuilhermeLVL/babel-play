/**
 * AS ETIQUETAS DE PALAVRAS — o que a legenda pinta em cada palavra, sem rede e sem DOM.
 *
 * Quatro etiquetas, numa ordem que não se discute palavra a palavra:
 *   1. o CADERNO manda: a palavra guardada é `salva` (cartão novo), `aprendendo` ou `dominada`;
 *   2. só fora do caderno vem o ponto `nova-para-voce`: a palavra que o índice de palavras vistas do servidor
 *      (`GET /api/vocab/vistas`) nunca encontrou nas sessões da pessoa.
 *
 * O PONTO É O QUE MAIS PODE MENTIR, e por isso tem cinco portões, todos aqui:
 *   - o sub-ajuste "Marcar palavras novas para você" ligado;
 *   - o índice daquele idioma CARREGADO (sem conta, o servidor responde 501 e não há índice: sem ponto);
 *   - o índice COMPLETO (`truncado: false`). Truncado, uma palavra fora do conjunto pode ter sido vista, e
 *     "nenhum ponto" é melhor que um ponto errado;
 *   - HISTÓRICO SUFICIENTE: pelo menos `SESSOES_MINIMAS_PARA_NOVA` sessões naquele idioma. Numa conta nova
 *     quase tudo é "nova", e o ponto em toda palavra é ruído, não informação;
 *   - a palavra pode ESTAR no índice: o servidor não indexa palavras-função, chaves com dígito nem chaves
 *     curtas (`chaveIndexavel`, a mesma régua dele). Sem este portão, "the" seria nova para sempre.
 *   E a linha precisa estar num idioma que não é o da pessoa: no próprio idioma nada é "novo para você".
 *
 * A chave é a do núcleo (`chaveDaPalavra`: sem acento, sem caixa, sem pontuação), a mesma do `norm_key` do
 * acervo e do índice do servidor — "Água!" na legenda casa com o cartão "agua".
 */
import { PALAVRAS_FUNCIONAIS } from '../harness/palavrasConhecidas';
import type { Layout } from '../legendas/janelaFlutuante';
import { baseLang } from '../texto/idioma';
import { chaveDaPalavra } from '../texto/palavra';

/** O estado do cartão no contrato do servidor (`GET /api/vocab/palavra`). O cliente chama `aprendendo` de "aprendida". */
export type EstadoNoCaderno = 'nova' | 'aprendendo' | 'dominada';

export type Etiqueta = 'salva' | 'aprendendo' | 'dominada' | 'nova-para-voce';

/**
 * QUANTAS SESSÕES NAQUELE IDIOMA antes de o ponto "nova para você" aparecer. Três é uma ESCOLHA, não uma
 * medida: com uma ou duas sessões o índice ainda não viu o vocabulário de todo dia, e quase toda palavra de uma
 * fala nova ganharia o ponto. Medir com contas reais e ajustar aqui (o portão é um número só).
 */
export const SESSOES_MINIMAS_PARA_NOVA = 3;

/** O caderno por idioma (a base ISO: `pt` de `pt-BR`). O balde `''` (cartão sem idioma) vale para todos. */
export type IndiceDoCaderno = ReadonlyMap<string, ReadonlyMap<string, EstadoNoCaderno>>;

/** A ordem de força quando a mesma chave aparece em dois cartões: vale o estado mais avançado. */
const FORCA: Record<EstadoNoCaderno, number> = { nova: 0, aprendendo: 1, dominada: 2 };

export function montarIndiceDoCaderno(
  cartoes: Iterable<{ palavra: string; lang?: string | null; estado: EstadoNoCaderno }>,
): IndiceDoCaderno {
  const indice = new Map<string, Map<string, EstadoNoCaderno>>();
  for (const c of cartoes) {
    const chave = chaveDaPalavra(c.palavra);
    if (!chave) continue;
    const idioma = baseLang(c.lang);
    let balde = indice.get(idioma);
    if (!balde) indice.set(idioma, (balde = new Map()));
    const antes = balde.get(chave);
    if (!antes || FORCA[c.estado] > FORCA[antes]) balde.set(chave, c.estado);
  }
  return indice;
}

/** O estado da chave no caderno: primeiro o balde do idioma, depois o sem idioma. */
export function estadoNoCaderno(indice: IndiceDoCaderno | null, chave: string, lang: string | undefined) {
  if (!indice || !chave) return undefined;
  return indice.get(baseLang(lang))?.get(chave) ?? indice.get('')?.get(chave);
}

/** Escritas sem espaço entre as palavras: lá uma letra já é palavra (a mesma lista do índice do servidor). */
const UMA_LETRA_BASTA = new Set(['ja', 'zh', 'th', 'lo', 'km', 'my']);

const funcionaisPorIdioma = new Map<string, ReadonlySet<string>>();
function funcionais(idioma: string): ReadonlySet<string> {
  let s = funcionaisPorIdioma.get(idioma);
  if (!s) funcionaisPorIdioma.set(idioma, (s = new Set((PALAVRAS_FUNCIONAIS[idioma] ?? []).map(chaveDaPalavra))));
  return s;
}

/**
 * A chave pode estar no índice de palavras vistas? A MESMA régua do servidor ao indexar: fora as palavras-função
 * do idioma, as chaves com dígito e as curtas (menos de 2 letras; 1 basta em japonês, chinês e afins).
 */
export function chaveIndexavel(chave: string, lang: string | undefined): boolean {
  const idioma = baseLang(lang);
  if (!chave || /\p{N}/u.test(chave)) return false;
  if ([...chave].length < (UMA_LETRA_BASTA.has(idioma) ? 1 : 2)) return false;
  return !funcionais(idioma).has(chave);
}

/** O índice de palavras vistas de UM idioma, como o cliente o guarda. */
export interface VistasDoIdioma {
  chaves: ReadonlySet<string>;
  /** O servidor cortou a lista: o conjunto é parcial e não prova que uma palavra é nova. */
  truncado: boolean;
  /** Quantas sessões a pessoa tem naquele idioma (o portão do histórico suficiente). */
  sessoes: number;
}

export interface OpcoesDaEtiqueta {
  /** O sub-ajuste "Marcar palavras novas para você" E o layout que mostra o ponto. */
  nova: boolean;
  /** O idioma da pessoa: nas linhas dele nada é novo. */
  langDaPessoa?: string;
  /** As vistas do idioma da linha: `undefined`/`null` = sem índice (convidado, ainda carregando, falhou). */
  vistas?: VistasDoIdioma | null;
}

/** O ponto "nova para você" pode aparecer nesta linha? (Os portões que não dependem da palavra.) */
export function novaPossivel(lang: string | undefined, o: OpcoesDaEtiqueta): boolean {
  const v = o.vistas;
  if (!o.nova || !v || v.truncado || v.sessoes < SESSOES_MINIMAS_PARA_NOVA) return false;
  const idioma = baseLang(lang);
  return !!idioma && idioma !== baseLang(o.langDaPessoa);
}

/** A etiqueta de uma chave já normalizada. Uma consulta de `Map` no caso comum. */
export function etiquetaDaChave(
  chave: string,
  lang: string | undefined,
  caderno: IndiceDoCaderno | null,
  o: OpcoesDaEtiqueta,
): Etiqueta | undefined {
  if (!chave) return undefined;
  const estado = estadoNoCaderno(caderno, chave, lang);
  if (estado) return estado === 'nova' ? 'salva' : estado;
  if (!novaPossivel(lang, o) || o.vistas!.chaves.has(chave)) return undefined;
  return chaveIndexavel(chave, lang) ? 'nova-para-voce' : undefined;
}

export function etiquetaDaPalavra(
  palavra: string,
  lang: string | undefined,
  caderno: IndiceDoCaderno | null,
  o: OpcoesDaEtiqueta,
): Etiqueta | undefined {
  return etiquetaDaChave(chaveDaPalavra(palavra), lang, caderno, o);
}

/** O que cada layout da janela flutuante pinta. A FAIXA (jogo) fica com as tintas e perde o ponto (ruído no jogo). */
export function etiquetasNoLayout(layout: Layout | undefined): { tintas: true; nova: boolean } {
  return { tintas: true, nova: layout !== 'faixa' };
}

/** As palavras de uma linha em cada grupo (a primeira forma de cada uma): é o que a `aria-description` da linha lê. */
export interface ResumoDasEtiquetas {
  salvas: string[];
  aprendendo: string[];
  novas: string[];
}

/**
 * O resumo de uma linha. `dominada` fica de fora: é a palavra que a pessoa já sabe, e citá-la em toda linha seria
 * ruído no leitor de tela. Palavras repetidas entram uma vez.
 */
export function resumoDasEtiquetas(
  pares: Iterable<readonly [palavra: string, etiqueta: Etiqueta | undefined]>,
): ResumoDasEtiquetas {
  const vistas = new Set<string>();
  const r: ResumoDasEtiquetas = { salvas: [], aprendendo: [], novas: [] };
  for (const [palavra, e] of pares) {
    if (!e || e === 'dominada') continue;
    const k = chaveDaPalavra(palavra);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    const limpa = palavra.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    (e === 'salva' ? r.salvas : e === 'aprendendo' ? r.aprendendo : r.novas).push(limpa);
  }
  return r;
}
