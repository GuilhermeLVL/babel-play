/**
 * Pontuação de PRONÚNCIA/shadowing DETERMINÍSTICA (sem IA): compara o que o
 * usuário efetivamente falou (transcrito por STT — Web Speech/Whisper) com a
 * frase-alvo, por similaridade de string. Substitui os placares fabricados com
 * `Math.random()`. É honesto: mede a correspondência textual real da tentativa,
 * não "fonemas" que não temos como analisar sem um alinhador acústico.
 *
 * Puro/isomórfico.
 */

export interface PronunciationScore {
  /** 0..100 — similaridade textual (Levenshtein normalizado) com o alvo. */
  accuracy: number
  /** 0..100 — fração de palavras-alvo presentes na tentativa (cobertura). */
  fluency: number
  /** 0..100 — ritmo, se a duração for conhecida; senão espelha a cobertura. */
  speed: number
  /** Texto reconhecido (o que o STT ouviu). */
  transcript: string
  /** Mensagem honesta baseada nos números reais. */
  feedback: string
}

function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos p/ comparação tolerante
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  const n = normalize(s)
  return n ? n.split(' ') : []
}

/** Distância de Levenshtein entre duas strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/**
 * Pontua uma tentativa de shadowing. `durationMs` (opcional) habilita a nota de
 * ritmo comparando o WPM da tentativa a uma faixa alvo confortável (~90–170 wpm).
 */
export function scorePronunciation(
  target: string,
  attempt: string,
  opts?: { durationMs?: number },
): PronunciationScore {
  const tNorm = normalize(target)
  const aNorm = normalize(attempt)
  const tTokens = tokens(target)
  const aSet = new Set(tokens(attempt))

  // Accuracy: 1 - (distância / comprimento do alvo), em %.
  const dist = levenshtein(tNorm, aNorm)
  const accuracy = tNorm.length ? Math.max(0, Math.round((1 - dist / tNorm.length) * 100)) : 0

  // Fluency: cobertura de palavras-alvo faladas.
  const covered = tTokens.filter((w) => aSet.has(w)).length
  const fluency = tTokens.length ? Math.round((covered / tTokens.length) * 100) : 0

  // Speed: se soubermos a duração, compara o WPM a uma faixa confortável.
  let speed = fluency
  if (opts?.durationMs && opts.durationMs > 0 && aSet.size > 0) {
    const wpm = tokens(attempt).length / (opts.durationMs / 60_000)
    // 90–170 wpm = ótimo (100); cai linearmente fora da faixa.
    if (wpm >= 90 && wpm <= 170) speed = 100
    else if (wpm < 90) speed = Math.max(0, Math.round((wpm / 90) * 100))
    else speed = Math.max(0, Math.round((170 / wpm) * 100))
  }

  const overall = Math.round((accuracy + fluency) / 2)
  let feedback: string
  if (!aNorm) feedback = 'Não captei sua fala. Verifique o microfone e tente repetir a frase.'
  else if (overall >= 85) feedback = 'Excelente! Sua fala correspondeu de perto à frase-alvo.'
  else if (overall >= 60) feedback = 'Bom! A maior parte bateu com o alvo — repita para refinar as palavras que faltaram.'
  else feedback = 'Continue praticando: boa parte das palavras-alvo não apareceu na sua fala.'

  return { accuracy, fluency, speed, transcript: attempt, feedback }
}
