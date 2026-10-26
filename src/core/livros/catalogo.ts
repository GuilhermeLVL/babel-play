/**
 * BUSCA, FILTROS E VITRINE DO CATÁLOGO (spec de Livros & Leitura, CAT07–CAT09). Tudo no cliente, sobre o
 * JSON estático: nenhuma consulta vai ao servidor, nenhuma telemetria nova de leitura.
 *
 * A VISIBILIDADE vem antes de tudo: o que um menor não pode ver não aparece na vitrine, na busca, na contagem
 * dos filtros nem por link direto (critério 4). A tela pergunta `visivelPara` e nunca filtra por conta própria.
 */
import { dobrarTexto } from '../texto/palavra';
import { passaNaDefesaDoCliente } from './filtroLegal';
import {
  type CategoriaDoLivro,
  type Classificacao,
  CLASSIFICACOES,
  type FonteDoLivro,
  type LivroDoCatalogo,
  type LivroExcluido,
  NIVEIS_DO_LIVRO,
  type NivelDoLivro,
} from './tipos';

/* ── Quem lê ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * O teto de classificação de quem lê. `'18'` (adulto) vê tudo, inclusive o que ainda não foi revisado;
 * qualquer outro teto esconde o `null` ("a revisar") e o que passar dele.
 */
export type TetoDeClassificacao = Classificacao;

/** O valor é uma classificação conhecida? (`'18+'`, `'adulto'`, `undefined` não são.) */
export const ehClassificacao = (c: unknown): c is Classificacao => (CLASSIFICACOES as readonly unknown[]).includes(c);

/**
 * Falha FECHADA: teto desconhecido não vê nada; classificação desconhecida ou inválida vale como "a revisar"
 * (`null`), que só o adulto vê. Nunca compara `indexOf` cru: o −1 de um valor inválido passaria como "livre".
 */
export function visivelPara(livro: { classificacao?: unknown }, teto: TetoDeClassificacao): boolean {
  if (!ehClassificacao(teto)) return false;
  if (teto === '18') return true;
  const c = livro.classificacao;
  if (!ehClassificacao(c)) return false;
  return CLASSIFICACOES.indexOf(c) <= CLASSIFICACOES.indexOf(teto);
}

/**
 * O catálogo que este leitor pode ver: a defesa dupla do filtro legal (o ano-limite mais restritivo entre o
 * do catálogo e o do relógio do Brasil, e a regra da tradução) e a classificação. É a ÚNICA porta: vitrine,
 * busca, filtros, detalhe e "Meus livros" partem daqui.
 */
export function livrosVisiveis(
  livros: readonly LivroDoCatalogo[],
  teto: TetoDeClassificacao,
  limite: number,
  agora: Date = new Date(),
): LivroDoCatalogo[] {
  return livros.filter((l) => passaNaDefesaDoCliente(l, limite, agora) && visivelPara(l, teto));
}

/* ── Filtros ─────────────────────────────────────────────────────────────────────────────────── */

export type Tamanho = 'curto' | 'medio' | 'longo';

/** Até 20 mil palavras é curto (um conto longo, uma novela); acima de 80 mil, longo. */
export function tamanhoDe(palavras: number): Tamanho {
  return palavras < 20_000 ? 'curto' : palavras <= 80_000 ? 'medio' : 'longo';
}

export interface FiltrosDoCatalogo {
  texto?: string;
  idioma?: string | null;
  niveis?: readonly NivelDoLivro[];
  categoria?: CategoriaDoLivro | null;
  tamanho?: Tamanho | null;
  fonte?: FonteDoLivro | null;
}

const dobrar = (s: string) => dobrarTexto(s, { espacos: 'colapsar' });

/** O texto em que a busca procura: título e nomes de autor e tradutor, sem acento nem caixa. */
function textoBuscavel(l: Pick<LivroDoCatalogo, 'titulo' | 'autores' | 'tradutores'>): string {
  return dobrar([l.titulo, ...l.autores.map((a) => a.nome), ...l.tradutores.map((t) => t.nome)].join(' '));
}

/** Cada palavra da busca precisa aparecer (em qualquer ordem): "machado casmurro" acha Dom Casmurro. */
export function casaComBusca(
  l: Pick<LivroDoCatalogo, 'titulo' | 'autores' | 'tradutores'>,
  texto: string | undefined,
): boolean {
  const termos = dobrar(texto ?? '')
    .split(' ')
    .filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = textoBuscavel(l);
  return termos.every((t) => alvo.includes(t));
}

export function filtrarLivros(livros: readonly LivroDoCatalogo[], f: FiltrosDoCatalogo): LivroDoCatalogo[] {
  return livros.filter(
    (l) =>
      (!f.idioma || l.idioma === f.idioma) &&
      (!f.niveis?.length || (l.nivel !== null && f.niveis.includes(l.nivel))) &&
      (!f.categoria || l.categorias.includes(f.categoria)) &&
      (!f.tamanho || tamanhoDe(l.palavras) === f.tamanho) &&
      (!f.fonte || l.fonte === f.fonte) &&
      casaComBusca(l, f.texto),
  );
}

/** Ordem de lista: com busca, o título que começa com o termo vem antes; depois, popularidade. */
export function ordenarLivros(livros: readonly LivroDoCatalogo[], texto?: string): LivroDoCatalogo[] {
  const t = dobrar(texto ?? '');
  const peso = (l: LivroDoCatalogo) => (t && dobrar(l.titulo).startsWith(t) ? 1 : 0);
  return [...livros].sort((a, b) => peso(b) - peso(a) || b.popularidade - a.popularidade);
}

/** Quantos livros cada valor de um filtro teria, para o filtro não oferecer opção que dá zero. */
export function contarPor<K extends string>(
  livros: readonly LivroDoCatalogo[],
  chave: (l: LivroDoCatalogo) => readonly K[] | K | null,
): Map<K, number> {
  const m = new Map<K, number>();
  for (const l of livros) {
    const v = chave(l);
    for (const k of Array.isArray(v) ? v : v === null ? [] : [v as K]) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/* ── Vitrine ─────────────────────────────────────────────────────────────────────────────────── */

const indiceDoNivel = (n: NivelDoLivro | null) => (n === null ? 99 : NIVEIS_DO_LIVRO.indexOf(n));

/**
 * "COMECE POR AQUI": os 10 mais populares do A1–A2 do idioma, de classificação livre. Clássico raramente é
 * A1, então a lista completa com os níveis seguintes, do mais fácil para o mais difícil: nunca vazia
 * enquanto houver livro fácil o bastante.
 */
export function comecePorAqui(livros: readonly LivroDoCatalogo[], idioma: string, quantos = 10): LivroDoCatalogo[] {
  const doIdioma = livros.filter((l) => l.idioma === idioma && l.nivel !== null);
  const livres = doIdioma.filter((l) => l.classificacao === 'livre');
  const base = livres.length >= quantos ? livres : doIdioma;
  return [...base]
    .sort((a, b) => indiceDoNivel(a.nivel) - indiceDoNivel(b.nivel) || b.popularidade - a.popularidade)
    .slice(0, quantos);
}

/** "PARA O SEU NÍVEL": o nível da pessoa e o de baixo (ler um pouco abaixo é o que dá fluência). */
export function paraOSeuNivel(
  livros: readonly LivroDoCatalogo[],
  idioma: string,
  nivel: NivelDoLivro,
  quantos = 12,
): LivroDoCatalogo[] {
  const i = NIVEIS_DO_LIVRO.indexOf(nivel);
  const aceitos = new Set(NIVEIS_DO_LIVRO.slice(Math.max(0, i - 1), i + 1));
  return livros
    .filter((l) => l.idioma === idioma && l.nivel !== null && aceitos.has(l.nivel))
    .sort((a, b) => b.popularidade - a.popularidade)
    .slice(0, quantos);
}

/** As prateleiras por categoria do idioma, só as que têm livro, na ordem de `CATEGORIAS_DO_LIVRO`. */
export function prateleiras(
  livros: readonly LivroDoCatalogo[],
  idioma: string,
  ordem: readonly CategoriaDoLivro[],
  porPrateleira = 12,
): Array<{ categoria: CategoriaDoLivro; livros: LivroDoCatalogo[] }> {
  const doIdioma = livros.filter((l) => l.idioma === idioma);
  return ordem
    .map((categoria) => ({
      categoria,
      livros: doIdioma
        .filter((l) => l.categorias.includes(categoria))
        .sort((a, b) => b.popularidade - a.popularidade)
        .slice(0, porPrateleira),
    }))
    .filter((p) => p.livros.length > 0);
}

/* ── "Por que este livro não está?" ──────────────────────────────────────────────────────────── */

/**
 * O que a busca acha entre os EXCLUÍDOS, para a tela dizer o motivo de cada um ("o autor morreu em 1998").
 * Para menor de idade, nada de exclusão por classificação aparece aqui: o catálogo de exclusões só tem os
 * motivos legais, que valem para todos.
 */
export function buscarExcluidos(exclusoes: readonly LivroExcluido[], texto: string, quantos = 5): LivroExcluido[] {
  const termos = dobrar(texto).split(' ').filter(Boolean);
  if (termos.length === 0) return [];
  return exclusoes
    .filter((e) => {
      const alvo = dobrar([e.titulo, ...e.autores].join(' '));
      return termos.every((t) => alvo.includes(t));
    })
    .slice(0, quantos);
}
