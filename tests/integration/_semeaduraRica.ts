/**
 * SEMEADURA RICA E DETERMINÍSTICA — a base dos testes de equivalência das rotas caras
 * (fix/rotas-caras, auditoria de prontidão Fase 2 §2.1).
 *
 * `semear()` do harness de caracterização grava quatro cartões e uma sessão: pouco para travar a
 * saída de `computeProfile`, que tem ramos para cartão sem estabilidade, fala sem tempo, fala de
 * outra fonte, revisão sem `reviewed_at`, rodada perfeita curta demais, nível CEFR nulo, palavra
 * com acento e caixa alta... Aqui cada um desses ramos tem linha, com ids e carimbos FIXOS
 * (gerador mulberry32 com semente constante, tempo relativo a `AGORA`). Duas execuções gravam o
 * mesmo banco byte a byte — é o que permite comparar o JSON inteiro antes/depois da otimização.
 *
 * Grava direto pelas tabelas do drizzle, e não pelos repositórios: o que se quer congelar é a
 * LEITURA, e os repositórios de escrita carimbam `Date.now()` e `randomUUID()`.
 */
import type { AppDeTeste } from '../caracterizacao/_app'

/** 20/09/2026 15:00 UTC — o "agora" congelado dos testes de equivalência. */
export const AGORA = Date.UTC(2026, 8, 20, 15, 0, 0)
const DIA = 86_400_000

function gerador(semente: number) {
  let s = semente
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALAVRAS = ['harvest', 'Água', 'água', 'ÉCOLE', 'école', 'bridge', 'Garden', 'straße', 'naïve', 'rain']
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', null]
const JOGOS = ['memory', 'termo', 'bingo', 'karuta', 'blitz', null]

export interface Semeado {
  sessoes: string[]
  cartoes: string[]
}

export async function semearRico(s: AppDeTeste, userId: string, semente = 0x5eed): Promise<Semeado> {
  const rnd = gerador(semente)
  const { db } = await s.load('../../server/db/db')
  const t = await s.load('../../server/db/schema')
  const p = userId.replace(/[^a-z0-9]/gi, '')

  const sessoes: string[] = []
  for (let i = 0; i < 5; i++) {
    const id = `ses-${p}-${i}`
    const em = AGORA - Math.floor(rnd() * 12 * DIA)
    sessoes.push(id)
    await db.insert(t.sessions).values({
      id,
      createdAt: em,
      updatedAt: em,
      userId,
      deletedAt: i === 4 ? em + 1000 : null,
      title: `Sessão ${i}`,
      kind: 'live',
      sourceLang: [null, 'en', 'es', 'en', 'fr'][i],
      targetLang: 'pt',
      durationMs: [0, 600_000, 5_400_000, null, 120_000][i],
      wordCount: [null, 40, 900, 12, 7][i],
      status: 'done',
    })
  }

  for (let i = 0; i < 80; i++) {
    const sessao = sessoes[i % 4]
    const ini = rnd() < 0.1 ? null : Math.floor(rnd() * 100_000)
    const fim = ini == null ? null : rnd() < 0.1 ? ini - 5 : ini + Math.floor(rnd() * 9000)
    await db.insert(t.utterances).values({
      id: `fala-${p}-${i}`,
      createdAt: AGORA - DIA,
      updatedAt: AGORA - DIA,
      userId,
      deletedAt: i % 17 === 0 ? AGORA - 10 : null,
      sessionId: sessao,
      idx: i,
      tStartMs: ini,
      tEndMs: fim,
      source: i % 5 === 0 ? null : i % 2 ? 'mic' : 'tab',
      sourceLang: 'en',
      sourceText: i % 9 === 0 ? null : `  palavra  ${'x '.repeat(i % 7)}\tfim\n${i}  `,
      targetLang: 'pt',
      translatedText: 'tradução',
    })
  }

  const cartoes: string[] = []
  for (let i = 0; i < 120; i++) {
    const id = `card-${p}-${String(i).padStart(3, '0')}`
    const adicionado = AGORA - (i * 3 + 1) * 3_600_000 - Math.floor(rnd() * 1000)
    const revisado = rnd() < 0.6
    cartoes.push(id)
    await db.insert(t.vocabCards).values({
      id,
      createdAt: adicionado - 5,
      updatedAt: adicionado,
      userId,
      deletedAt: i % 29 === 0 ? AGORA - 1 : null,
      sessionId: i % 3 === 0 ? null : sessoes[i % 4],
      word: `${PALAVRAS[i % PALAVRAS.length]}${i % 11 === 0 ? '' : i}`,
      back: i % 13 === 0 ? null : `tradução ${i}`,
      phonetics: null,
      sentence: i % 7 === 0 ? null : `Frase de exemplo ${i}.`,
      srcLang: i % 4 === 0 ? 'es' : 'en',
      tgtLang: 'pt',
      inDeck: i % 10 === 0 ? 0 : i % 23 === 0 ? null : 1,
      box: 1 + (i % 5),
      dueAt: revisado ? AGORA + Math.floor((rnd() - 0.4) * 20 * DIA) : i % 2 ? null : AGORA - DIA,
      stability: revisado ? 0.3 + rnd() * 40 : null,
      difficulty: revisado ? 1 + rnd() * 9 : null,
      reps: revisado ? Math.floor(rnd() * 12) : 0,
      lapses: revisado ? Math.floor(rnd() * 4) : null,
      lastReview: revisado ? (rnd() < 0.2 ? null : AGORA - Math.floor(rnd() * 30 * DIA)) : null,
      clozePrompt: `Frase ___ ${i}`,
      clozeAnswer: `x${i}`,
      cefrLevel: NIVEIS[i % NIVEIS.length],
      cefrConfidence: i % 6 === 0 ? null : rnd(),
      addedAt: i % 19 === 0 ? null : adicionado,
      normKey: `${i % 4 === 0 ? 'es' : 'en'}|k${i}`,
      occurrences: 1 + (i % 4),
      firstSeenAt: adicionado,
      lastSeenAt: adicionado + DIA,
      cefrSource: i % 3 ? 'wordlist' : 'curado',
      difficultyScore: i % 8 === 0 ? null : rnd(),
    })
    const origens: Array<[string, string | null]> = []
    if (i % 5 === 0) origens.push(['trilha', 'en'])
    if (i % 3 === 1) origens.push(['anki', `deck-${i % 2}`], ['anki', `deck-${i % 2}`])
    if (i % 9 === 4) origens.push(['anki', 'deck-9'])
    if (i % 4 === 2) origens.push(['sessao', sessoes[i % 4]])
    for (const [k, [kind, ref]] of origens.entries()) {
      await db.insert(t.vocabOccurrences).values({
        id: `occ-${p}-${i}-${k}`,
        createdAt: adicionado,
        updatedAt: adicionado,
        userId,
        deletedAt: i % 31 === 7 ? AGORA - 5 : null,
        cardId: id,
        occurredAt: adicionado,
        originKind: kind,
        originRef: ref,
        sentence: null,
      })
    }
  }

  for (let i = 0; i < 260; i++) {
    const dia = i < 40 ? Math.floor(i / 8) : Math.floor(rnd() * 40)
    const em = AGORA - dia * DIA - Math.floor(rnd() * 3_600_000)
    await db.insert(t.reviewLogs).values({
      id: `rev-${p}-${i}`,
      createdAt: em,
      updatedAt: em,
      userId,
      cardId: cartoes[(i * 7) % 40],
      reviewedAt: i % 37 === 0 ? null : em,
      grade: i % 41 === 0 ? null : 1 + Math.floor(rnd() * 4),
    })
  }

  for (let i = 0; i < 180; i++) {
    const rodada = `rod-${p}-${Math.floor(i / 6)}`
    const em = AGORA - Math.floor(rnd() * 20 * DIA)
    await db.insert(t.exerciseResults).values({
      id: `exe-${p}-${i}`,
      createdAt: em,
      updatedAt: em,
      userId,
      deletedAt: i % 53 === 0 ? em : null,
      kind: i % 4 === 0 ? 'srs' : 'drill',
      correct: i % 19 === 0 ? null : Math.floor(i / 6) % 3 === 0 ? 1 : rnd() < 0.7 ? 1 : 0,
      score: 50,
      exerciseKind: JOGOS[Math.floor(i / 6) % JOGOS.length],
      roundId: i % 25 === 0 ? null : rodada,
      itemRef: `item${i}`,
      origem: i % 3 === 0 ? `sessao:${sessoes[1]}` : 'baralho',
      cardId: cartoes[i % 120],
    })
  }

  /* O razão de moedas. `spend_id` fora da ordem de inserção, para a ordem de leitura depender do
     índice e não da inserção (é assim que `itensComprados` chega na resposta). */
  const gastos: Array<[string, number, string]> = [
    ['z-1', 60, 'loja:tema-linear'],
    ['a-2', 40, 'pular-rodada'],
    ['m-3', 10, 'croma:tema:azul'],
    ['b-4', 15, 'aprimoramento:dica:2'],
    ['c-5', 15, 'aprimoramento:dica:1'],
    ['k-6', 45, 'loja:posicao-right'],
  ]
  for (const [k, [spend, amount, reason]] of gastos.entries()) {
    await db.insert(t.seedSpends).values({
      id: `gasto-${p}-${k}`,
      createdAt: AGORA - k * DIA,
      updatedAt: AGORA - k * DIA,
      userId,
      spendId: spend,
      amount,
      reason,
    })
  }
  for (let k = 0; k < 3; k++) {
    await db.insert(t.seedCredits).values({
      id: `cred-${p}-${k}`,
      createdAt: AGORA - k * DIA,
      updatedAt: AGORA - k * DIA,
      userId,
      creditoId: `conquista:teste-${k}`,
      amount: 10 * (k + 1),
      xp: 25 * k,
      reason: `conquista:teste-${k}`,
    })
  }
  const { diaLocal } = await import('../../src/core/learning/economia')
  for (const d of [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 20]) {
    await db.insert(t.presencas).values({
      id: `pres-${p}-${d}`,
      createdAt: AGORA - d * DIA,
      updatedAt: AGORA - d * DIA,
      userId,
      dia: diaLocal(AGORA - d * DIA),
    })
  }
  return { sessoes, cartoes }
}
