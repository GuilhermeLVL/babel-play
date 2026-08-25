/**
 * F4 — MÉTRICAS COM ESCOPO DE SESSÃO.
 *
 * A CAUSA-RAIZ da divergência dos espelhos não era copy-paste: era ausência de endpoint.
 * `GET /api/metrics/profile` chamava `computeProfile(req.userId)` e não aceitava `sessionId` em
 * NENHUM ponto da cadeia. A aba de métricas da Sessão, sem ter o que chamar, preenchia o vazio
 * com estatística do texto MAIS `metrics.vocabByWeek` — dado da CONTA INTEIRA renderizado dentro
 * de um painel cujo cabeçalho é uma gravação específica (`Analysis.tsx:597-607`).
 *
 * Unificar os componentes das duas telas sem isto seria impossível, e a divergência voltaria.
 *
 * O padrão seguido já existe no repositório, no caminho dos jogos:
 *   `FonteDeItens` (src/core/minigames/source.ts:23-33)
 *   `GET /api/vocab/para-jogo?fonte=sessao&fonteRef=<id>` (server/routes/vocab.ts:19-34)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const OWNER = asUserId('f4-owner')
const SESSAO_A = 'sess-a'
const SESSAO_B = 'sess-b'

let h: EphemeralDb
let computeProfile: (userId: ReturnType<typeof asUserId>, opts?: { sessionId?: string | null }) => Promise<any>

beforeAll(async () => {
  h = await setupEphemeralDb()
  const schema = await h.load<Record<string, any>>('../../server/db/schema')
  const { db } = await h.load<Record<string, any>>('../../server/db/db')
  ;({ computeProfile } = await h.load<{ computeProfile: typeof computeProfile }>('../../server/db/repositories/metrics'))

  const agora = Date.now()
  const meta = { userId: OWNER, createdAt: agora, updatedAt: agora, deletedAt: null }

  await db.insert(schema.sessions).values([
    { id: SESSAO_A, ...meta, title: 'Sessão A', durationMs: 60_000, wordCount: 100 },
    { id: SESSAO_B, ...meta, title: 'Sessão B', durationMs: 60_000, wordCount: 40 },
  ])

  // 3 cartões da sessão A, 1 da B — números propositalmente diferentes.
  await db.insert(schema.vocabCards).values([
    { id: 'c1', ...meta, sessionId: SESSAO_A, word: 'alpha', back: 'alfa', normKey: 'alpha', inDeck: 1, addedAt: agora, dueAt: agora },
    { id: 'c2', ...meta, sessionId: SESSAO_A, word: 'bravo', back: 'bravo', normKey: 'bravo', inDeck: 1, addedAt: agora, dueAt: agora },
    { id: 'c3', ...meta, sessionId: SESSAO_A, word: 'charlie', back: 'charlie', normKey: 'charlie', inDeck: 1, addedAt: agora, dueAt: agora },
    { id: 'c4', ...meta, sessionId: SESSAO_B, word: 'delta', back: 'delta', normKey: 'delta', inDeck: 1, addedAt: agora, dueAt: agora },
  ])

  await db.insert(schema.utterances).values([
    { id: 'u1', ...meta, sessionId: SESSAO_A, idx: 0, tStartMs: 0, tEndMs: 10_000, sourceText: 'one two three four five' },
    { id: 'u2', ...meta, sessionId: SESSAO_B, idx: 0, tStartMs: 0, tEndMs: 10_000, sourceText: 'six seven' },
  ])
})

afterAll(async () => { await h.cleanup() })

describe('computeProfile aceita escopo de sessão', () => {
  it('o escopo global continua vendo tudo — nenhuma regressão para a tela Vocabulário', async () => {
    const g = await computeProfile(OWNER)
    expect(g.deckSize).toBe(4)
    expect(g.sessions).toBe(2)
    expect(g.escopo).toBe('global')
  })

  it('o escopo de sessão devolve números DIFERENTES do global, para a mesma conta', async () => {
    const g = await computeProfile(OWNER)
    const a = await computeProfile(OWNER, { sessionId: SESSAO_A })
    expect(a.deckSize).toBe(3)
    expect(a.deckSize).not.toBe(g.deckSize)
    expect(a.sessions).toBe(1)
    expect(a.escopo).toBe('sessao')
  })

  it('duas sessões diferentes não se contaminam', async () => {
    const a = await computeProfile(OWNER, { sessionId: SESSAO_A })
    const b = await computeProfile(OWNER, { sessionId: SESSAO_B })
    expect(a.deckSize).toBe(3)
    expect(b.deckSize).toBe(1)
  })

  it('só conta a fala DA sessão — o tempo de fala não vaza entre escopos', async () => {
    const g = await computeProfile(OWNER)
    const a = await computeProfile(OWNER, { sessionId: SESSAO_A })
    expect(g.speakingMs).toBe(20_000)
    expect(a.speakingMs).toBe(10_000)
  })

  it('`base` diz sobre quantos itens a métrica foi calculada', async () => {
    const a = await computeProfile(OWNER, { sessionId: SESSAO_A })
    expect(a.base).toBeDefined()
    expect(a.base.total).toBe(3)
    expect(a.base.considerados).toBeLessThanOrEqual(a.base.total)
  })

  it('sessão inexistente devolve zeros — não devolve o global disfarçado', async () => {
    const x = await computeProfile(OWNER, { sessionId: 'nao-existe' })
    expect(x.deckSize).toBe(0)
    expect(x.sessions).toBe(0)
    expect(x.escopo).toBe('sessao')
  })
})
