/**
 * @deprecated APOSENTADO em 2026-08-08 (F2 / Ajuste 1). **Não tem chamadores.**
 * Use `src/core/learning/cefrWordlist.ts:nivelCefr`.
 *
 * POR QUE FOI APOSENTADO — medido no banco real, não suposto:
 *  - **2.082 de 2.116 cartões vivos (98,4%)** ficaram com `confidence < 0,5`;
 *  - a distribuição saiu **invertida**: A1 com 100 palavras contra B1 com 736 e C1 com 278,
 *    porque o comprimento da palavra era o sinal dominante e palavra longa virava nível alto.
 *
 * Ou seja: produzia um campo que a UI e o modelo de dificuldade leriam como CEFR, e que era
 * comprimento de string. O substituto faz lookup em wordlist real (CEFR-J Vocabulary Profile 1.5
 * + Octanove) e, para palavra fora da lista, devolve nível `null` — "não sei" em vez de um chute.
 *
 * Mantido no repositório, sem chamadores, para não quebrar imports de terceiros e para que o
 * histórico do defeito continue legível. Medição em `results/F2-impacto-cefr.json`.
 *
 * Puro/isomórfico.
 */

import type { CefrLevel } from './contract'

export interface CefrEstimate {
  level: CefrLevel
  /** 0..1 — sempre baixa: é heurística, não medição. */
  confidence: number
}

// Palavras muito comuns (inglês). Não exaustivo de propósito — é só o "piso" que
// impede palavras curtíssimas frequentes de subir de nível pelo comprimento.
const COMMON = new Set<string>([
  'time', 'people', 'year', 'work', 'day', 'thing', 'man', 'world', 'life',
  'hand', 'part', 'child', 'eye', 'woman', 'place', 'week', 'case', 'point',
  'company', 'number', 'group', 'problem', 'fact', 'home', 'water', 'room',
  'money', 'story', 'month', 'book', 'word', 'business', 'game', 'night',
  'family', 'today', 'friend', 'need', 'name', 'idea', 'team', 'hour', 'line',
  'help', 'talk', 'call', 'move', 'like', 'want', 'know', 'make', 'take',
  'come', 'think', 'look', 'give', 'find', 'tell', 'feel', 'good', 'great',
  'small', 'large', 'next', 'early', 'young', 'important', 'public', 'able',
])

/** Estima o nível CEFR de uma palavra (heurística de baixa confiança). */
export function estimateCefr(word: string): CefrEstimate {
  const w = (word ?? '').toLowerCase().trim()
  if (!w) return { level: 'A1', confidence: 0 }
  if (COMMON.has(w)) return { level: w.length <= 4 ? 'A1' : 'A2', confidence: 0.35 }

  const len = w.length
  let level: CefrLevel
  if (len <= 4) level = 'A2'
  else if (len <= 6) level = 'B1'
  else if (len <= 8) level = 'B2'
  else if (len <= 10) level = 'C1'
  else level = 'C2'
  return { level, confidence: 0.3 }
}
