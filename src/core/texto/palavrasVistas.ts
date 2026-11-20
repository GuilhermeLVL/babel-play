/**
 * PALAVRAS VISTAS — as chaves de palavra que uma fala contém, contadas (etiquetas de palavras).
 *
 * O servidor guarda, por sessão, quantas vezes cada palavra apareceu nas falas (`palavras_vistas`), e
 * a legenda pergunta "já vi esta palavra?" a cada token. As duas pontas têm de cortar o texto do MESMO
 * jeito, então a regra mora aqui, pura:
 *
 *   · tokens por `palavrasDoTexto` (ICU com o idioma da fala, clítico e elisão) — a mesma função que a
 *     legenda usa para separar as palavras na tela;
 *   · chave por `chaveDaPalavra` (sem acento, sem caixa, sem pontuação) — com o idioma BASE, ela casa
 *     com `vocab_cards.norm_key` (`chaveDedup` = `lang|chave`);
 *   · fora: palavra funcional do idioma (`PALAVRAS_FUNCIONAIS`, "the", "de"), chave com algarismo e
 *     chave curta demais (menos de 2 caracteres; 1 basta nos idiomas escritos sem espaço, em que um
 *     ideograma é palavra).
 *
 * Sem idioma (fala e sessão sem `sourceLang`), nada é contado: a chave sem idioma não casa com cartão
 * nenhum e a legenda sempre pergunta com um idioma.
 */
import { PALAVRAS_FUNCIONAIS } from '../harness/palavrasConhecidas';
import { baseLang } from './idioma';
import { chaveDaPalavra } from './palavra';
import { escreveSemEspaco, frasesDoTexto, palavrasDoTexto } from './segmentacao';

/** O idioma base em que a palavra é guardada (`pt-BR` → `pt`), o mesmo de `chaveDedup`. */
export const idiomaBase = baseLang;

const funcionaisPorIdioma = new Map<string, ReadonlySet<string>>();
function funcionais(lang: string): ReadonlySet<string> {
  let s = funcionaisPorIdioma.get(lang);
  if (!s) {
    s = new Set((PALAVRAS_FUNCIONAIS[lang] ?? []).map(chaveDaPalavra));
    funcionaisPorIdioma.set(lang, s);
  }
  return s;
}

const TEM_ALGARISMO = /\p{N}/u;

/** A chave conta como palavra vista neste idioma (base)? */
export function chaveContavel(chave: string, lang: string): boolean {
  if (!chave || TEM_ALGARISMO.test(chave)) return false;
  if ([...chave].length < (escreveSemEspaco(lang) ? 1 : 2)) return false;
  return !funcionais(lang).has(chave);
}

/** As chaves contáveis de um texto, na ordem, COM repetição. `idioma` é o da fala (BCP-47 ou base). */
export function chavesDoTexto(texto: string | null | undefined, idioma: string | null | undefined): string[] {
  const lang = idiomaBase(idioma);
  if (!lang) return [];
  const saida: string[] = [];
  for (const p of palavrasDoTexto(texto, lang)) {
    const chave = chaveDaPalavra(p);
    if (chaveContavel(chave, lang)) saida.push(chave);
  }
  return saida;
}

/** Uma fala para contar: o texto, o idioma que vale para ela (o da fala ou o da sessão) e o `idx`. */
export interface FalaParaContar {
  texto: string | null | undefined;
  idioma: string | null | undefined;
  idx: number | null | undefined;
}

/** A contagem de uma chave: quantas vezes, e o `idx` de uma fala em que ela aparece (a primeira). */
export interface ContagemDeChave {
  lang: string;
  chave: string;
  vezes: number;
  idx: number | null;
}

/** A chave do mapa de contagem: idioma e chave juntos (a mesma palavra em dois idiomas são duas). */
export const chaveDaContagem = (lang: string, chave: string): string => `${lang}|${chave}`;

/** Conta as chaves de um conjunto de falas. O `idx` guardado é o da fala de menor `idx` que a contém. */
export function contarChaves(falas: Iterable<FalaParaContar>): Map<string, ContagemDeChave> {
  const mapa = new Map<string, ContagemDeChave>();
  for (const f of falas) {
    const lang = idiomaBase(f.idioma);
    if (!lang) continue;
    const idx = typeof f.idx === 'number' ? f.idx : null;
    for (const chave of chavesDoTexto(f.texto, lang)) {
      const k = chaveDaContagem(lang, chave);
      const atual = mapa.get(k);
      if (!atual) mapa.set(k, { lang, chave, vezes: 1, idx });
      else {
        atual.vezes += 1;
        if (idx !== null && (atual.idx === null || idx < atual.idx)) atual.idx = idx;
      }
    }
  }
  return mapa;
}

/**
 * O que muda no índice quando as falas `saem` dão lugar às que `entram`: uma linha por chave cujo total
 * mudou, com o delta (negativo quando a palavra sumiu ou apareceu menos). Chave com delta zero não vem.
 * O `idx` é o da fala que entra (ou `null` quando a chave só saiu).
 */
export function diferencaDeChaves(
  saem: ReadonlyMap<string, ContagemDeChave>,
  entram: ReadonlyMap<string, ContagemDeChave>,
): ContagemDeChave[] {
  const saida: ContagemDeChave[] = [];
  for (const [k, e] of entram) {
    const delta = e.vezes - (saem.get(k)?.vezes ?? 0);
    if (delta !== 0) saida.push({ ...e, vezes: delta });
  }
  for (const [k, s] of saem) {
    if (!entram.has(k)) saida.push({ ...s, vezes: -s.vezes, idx: null });
  }
  return saida;
}

/**
 * A frase do texto que contém a chave (o exemplo de "onde eu vi"), ou `null` se o texto não a contém
 * mais (a fala foi corrigida depois de indexada).
 */
export function fraseComAChave(texto: string | null | undefined, chave: string, idioma: string): string | null {
  const lang = idiomaBase(idioma);
  if (!chavesDoTexto(texto, lang).includes(chave)) return null;
  const frases = frasesDoTexto(texto, lang);
  return frases.find((f) => chavesDoTexto(f, lang).includes(chave)) ?? (texto ?? '').trim();
}
