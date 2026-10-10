/**
 * Cloze automático (srs-fsrs): gera uma carta de LACUNA a partir da frase real
 * de onde a palavra veio (`Flashcard.sentence`) — cartas em contexto retêm mais
 * que frente→verso isoladas, e o Babel já tem a sentença de graça. Puro/sem IA.
 */

const PLACEHOLDER = '_____'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface Cloze {
  /** A frase com a palavra-alvo oculta pela lacuna. */
  prompt: string
  /** A palavra exata removida (a resposta esperada). */
  answer: string
}

/** Escritas que não separam as palavras por espaço: só o segmentador sabe onde cada uma começa. */
const ESCRITA_SEM_ESPACO = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

/** Um caractere que faz parte de uma palavra: letra, número ou marca (a vogal do hindi é uma marca). */
const DE_PALAVRA = '[\\p{L}\\p{N}\\p{M}]'

type Segmento = { segment: string; index: number; isWordLike?: boolean }

/** Onde a palavra aparece como PALAVRA INTEIRA numa frase sem espaços; -1 se não aparece assim. */
function posicaoSemEspaco(frase: string, palavra: string): number {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<Segmento> }
    }
  ).Segmenter
  // Sem segmentador não há como saber onde a palavra começa: sem lacuna, em vez de cortar no meio.
  if (!Segmenter) return -1
  for (const s of new Segmenter(undefined, { granularity: 'word' }).segment(frase)) {
    if (s.isWordLike && s.segment === palavra) return s.index
  }
  return -1
}

/**
 * Oculta a palavra-alvo (e flexões comuns) na frase. Retorna null quando não há
 * contexto utilizável (sem frase, ou a palavra não aparece) — o chamador então
 * cai no fallback frente→verso.
 *
 * EM QUALQUER ESCRITA. A borda da palavra era `\b`, que só conhece letras ASCII: "été", "qué" e
 * "машину" nunca casavam, e a lacuna saía em 0% das frases da Trilha de russo, árabe, hindi,
 * coreano, chinês e japonês (medido em 10/10/2026). Agora a borda é "não há letra, número nem marca
 * ao lado", e nas escritas sem espaço (chinês, japonês, tailandês) a palavra precisa ser um
 * segmento inteiro da frase — "成交" não é palavra dentro de "造成交通事故".
 */
export function makeCloze(sentence: string, word: string): Cloze | null {
  const s = (sentence ?? '').trim()
  const w = (word ?? '').trim()
  if ([...s].length < 5 || !w) return null

  let inicio: number
  let answer: string
  if (ESCRITA_SEM_ESPACO.test(w)) {
    inicio = posicaoSemEspaco(s, w)
    if (inicio < 0) return null
    answer = w
  } else {
    // palavra-alvo com sufixos de flexão comuns (plural/verbo), respeitando os limites da palavra
    const re = new RegExp(`(?<!${DE_PALAVRA})(${escapeRegExp(w)}(?:s|es|ed|ing|d|r|ly)?)(?!${DE_PALAVRA})`, 'iu')
    const m = re.exec(s)
    if (!m || m.index === undefined) return null
    inicio = m.index
    answer = m[1]
  }
  const prompt = s.slice(0, inicio) + PLACEHOLDER + s.slice(inicio + answer.length)
  // sanity: a lacuna não pode cobrir a frase inteira (frase == só a palavra)
  if (prompt.replace(PLACEHOLDER, '').trim().length === 0) return null
  return { prompt, answer }
}
