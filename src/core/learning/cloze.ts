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

/**
 * Oculta a palavra-alvo (e flexões comuns) na frase. Retorna null quando não há
 * contexto utilizável (sem frase, ou a palavra não aparece) — o chamador então
 * cai no fallback frente→verso.
 */
export function makeCloze(sentence: string, word: string): Cloze | null {
  const s = (sentence ?? '').trim()
  const w = (word ?? '').trim()
  if (s.length < 5 || !w) return null
  // palavra-alvo com sufixos de flexão comuns (plural/verbo), respeitando limites
  const re = new RegExp(`\\b(${escapeRegExp(w)}(?:s|es|ed|ing|d|r|ly)?)\\b`, 'i')
  const m = re.exec(s)
  if (!m || m.index === undefined) return null
  const answer = m[1]
  const prompt = s.slice(0, m.index) + PLACEHOLDER + s.slice(m.index + answer.length)
  // sanity: a lacuna não pode cobrir a frase inteira (frase == só a palavra)
  if (prompt.replace(PLACEHOLDER, '').trim().length === 0) return null
  return { prompt, answer }
}

/** Há contexto suficiente p/ uma carta cloze? (heurística do tipo de carta) */
export function hasClozeContext(sentence: string, word: string): boolean {
  return makeCloze(sentence, word) !== null
}
