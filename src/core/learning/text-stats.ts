/**
 * Estatísticas de texto DETERMINÍSTICAS (sem IA, sem rede): calcula apenas o que
 * o próprio texto revela — contagens, médias e razões derivadas dos tokens. Puro/
 * isomórfico (sem DOM/Node) — roda igual no cliente e no servidor.
 *
 * É HONESTO por construção: nada é fabricado nem sorteado (sem Math.random). Toda
 * razão protege divisão por zero, e o Flesch Reading Ease só é retornado quando há
 * amostra suficiente (>=10 palavras); abaixo disso devolve `null` em vez de um
 * número inventado sem sinal. Sílabas e legibilidade são HEURÍSTICAS de inglês —
 * aproximações reproduzíveis, não medições linguísticas exatas.
 */

// Stopwords de alta frequência (EN + PT) para densidade lexical. Pequeno de
// propósito: cobre o "ruído" gramatical (artigos, preposições, auxiliares,
// pronomes) que não conta como palavra de conteúdo. keywords.ts mantém sua
// própria lista privada (não exportada), então aqui há um conjunto enxuto local.
const STOPWORDS = new Set<string>([
  // Inglês
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
  'not', 'no', 'so', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this',
  'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  // Português
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se',
  'que', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'por',
  'para', 'com', 'sem', 'não', 'ao', 'à', 'às', 'é', 'são', 'foi', 'era',
  'meu', 'minha', 'seu', 'sua', 'dele', 'dela',
])

export interface TextStats {
  charCount: number
  wordCount: number
  sentenceCount: number
  uniqueWords: number
  /** uniqueWords / wordCount (0..1), 0 se não há palavras — diversidade lexical honesta. */
  typeTokenRatio: number
  /** Média de caracteres por palavra. */
  avgWordLength: number
  /** Média de palavras por frase. */
  avgSentenceLength: number
  /** % de palavras de conteúdo (tokens fora do conjunto de stopwords). */
  lexicalDensityPct: number
  /** Flesch Reading Ease (fórmula EN). `null` quando wordCount<10 — nunca um número falso. */
  readingEase: number | null
  /** Total estimado de sílabas (heurística EN). */
  syllableCount: number
}

/**
 * Estima o número de sílabas de uma palavra por grupos de vogais (heurística EN):
 * conta sequências de vogais, desconta o 'e' final mudo e garante mínimo 1.
 */
export function estimateSyllables(word: string): number {
  const w = (word ?? '').toLowerCase()
  const groups = w.match(/[aeiouy]+/g)
  let count = groups ? groups.length : 0
  // 'e' final costuma ser mudo em inglês ("make", "code") — desconta 1 se sobra.
  if (w.length > 2 && w.endsWith('e') && count > 1) count -= 1
  return Math.max(1, count)
}

/**
 * Uma frase tem palavra COMPLEXA se contém uma palavra longa (≥13 chars) ou polissilábica
 * (≥4 sílabas, heurística EN). Substitui a lista HARDCODED de 4 palavras inglesas do auto-slow
 * (BL-01) — heurística reproduzível, em vez de um placeholder que só reagia a `heuristics/leverage/
 * synergy/volatility`.
 */
export function sentenceHasComplexWord(text: string): boolean {
  const words: string[] = (text ?? '').toLowerCase().match(/[\p{L}]+/gu) ?? []
  return words.some((w) => w.length >= 13 || estimateSyllables(w) >= 4)
}

/** Arredonda para 1 casa decimal (evita ruído de ponto flutuante). */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Calcula estatísticas determinísticas de um texto. Só devolve o que é computável
 * do próprio texto; toda razão protege divisão por zero e `readingEase` é `null`
 * quando não há palavras suficientes para um sinal confiável.
 */
export function computeTextStats(text: string): TextStats {
  const raw = text ?? ''
  const charCount = raw.length

  const words: string[] = raw.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  const wordCount = words.length

  // Frases: separa por pontuação terminal e conta segmentos não vazios. Se há
  // pelo menos uma palavra mas nenhuma pontuação, conta como 1 frase.
  const sentences = raw.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0)
  const sentenceCount = sentences.length > 0 ? sentences.length : (wordCount > 0 ? 1 : 0)

  const unique = new Set(words)
  const uniqueWords = unique.size

  const typeTokenRatio = wordCount > 0 ? uniqueWords / wordCount : 0

  const totalChars = words.reduce((sum, w) => sum + w.length, 0)
  const avgWordLength = wordCount > 0 ? round1(totalChars / wordCount) : 0

  const avgSentenceLength = sentenceCount > 0 ? round1(wordCount / sentenceCount) : 0

  const contentWords = words.filter((w) => !STOPWORDS.has(w)).length
  const lexicalDensityPct = wordCount > 0 ? round1((contentWords / wordCount) * 100) : 0

  const syllableCount = words.reduce((sum, w) => sum + estimateSyllables(w), 0)

  // Flesch Reading Ease: exige amostra mínima; sem ela devolve null (honesto).
  let readingEase: number | null = null
  if (wordCount >= 10 && sentenceCount > 0) {
    const ease = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount)
    readingEase = round1(ease)
  }

  return {
    charCount,
    wordCount,
    sentenceCount,
    uniqueWords,
    typeTokenRatio,
    avgWordLength,
    avgSentenceLength,
    lexicalDensityPct,
    readingEase,
    syllableCount,
  }
}
