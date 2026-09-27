/**
 * A MIGRAÇÃO LEITNER→FSRS DO BOOT NÃO PODE CUSTAR O ACERVO — auditoria de performance do backend
 * (26/09/2026, `openspec/audits/2026-09-26-performance-backend/relatorio.md` §4).
 *
 * `migrarLeitnerParaFsrs` roda a CADA boot, antes do `listen`. Medido no banco semeado da suíte
 * (453.000 cartões, já todos migrados — o estado normal):
 *
 *   - a consulta dos candidatos varria `vocab_cards` inteira: 504 ms de 559 ms de banco no boot,
 *     para devolver ZERO linhas (nenhum índice serve `stability IS NULL AND box > 1`);
 *   - quando HAVIA candidatos, cada um virava um UPDATE avulso aguardado em série: 5.000 idas ao
 *     banco, ~2 s de event loop.
 *
 * Os dois testes abaixo cobram as duas coisas: o plano da consulta dos candidatos usa o índice
 * parcial `idx_vocab_leitner_pendente` (migração 0035), e N candidatos custam UMA leitura e UM batch.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DONO = asUserId('leitner-boot')

let h: EphemeralDb
let db: any, client: any, vocabCards: any, migrarLeitnerParaFsrs: () => Promise<number>
let registrarObservadorDeConsultas: (fn: ((o: { instrucoes: string[] }) => void) | undefined) => void

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db, client } = await h.load<{ db: any; client: any }>('../../server/db/db'))
  ;({ vocabCards } = await h.load<{ vocabCards: any }>('../../server/db/schema'))
  ;({ migrarLeitnerParaFsrs } = await h.load<{ migrarLeitnerParaFsrs: any }>('../../server/db/manutencao'))
  ;({ registrarObservadorDeConsultas } = await h.load<{ registrarObservadorDeConsultas: any }>(
    '../../server/db/observadorDeConsultas',
  ))
})
afterAll(async () => {
  registrarObservadorDeConsultas(undefined)
  await h.cleanup()
})

async function inserirLeitner(n: number) {
  const now = Date.now()
  const linhas = Array.from({ length: n }, (_, i) => ({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    userId: DONO,
    word: `w${i}-${randomUUID().slice(0, 6)}`,
    normKey: `w${i}-${randomUUID().slice(0, 6)}`,
    box: 2 + (i % 4),
    stability: null,
    dueAt: now,
    inDeck: 1,
    addedAt: now,
  }))
  await db.insert(vocabCards).values(linhas)
}

/** Grava cada chamada ao banco (execute ou batch) feita durante `fn`. */
async function observar(fn: () => Promise<unknown>): Promise<string[][]> {
  const chamadas: string[][] = []
  registrarObservadorDeConsultas((o) => chamadas.push(o.instrucoes))
  try {
    await fn()
  } finally {
    registrarObservadorDeConsultas(undefined)
  }
  return chamadas
}

describe('migração Leitner→FSRS do boot', () => {
  it('N candidatos custam uma leitura e um batch, não N idas ao banco', async () => {
    await inserirLeitner(40)
    let migrados = 0
    const chamadas = await observar(async () => {
      migrados = await migrarLeitnerParaFsrs()
    })
    expect(migrados).toBe(40)
    expect(chamadas.length, chamadas.map((c) => c[0]?.slice(0, 40)).join('\n')).toBeLessThanOrEqual(2)
    const r = await client.execute('SELECT count(*) AS n FROM vocab_cards WHERE stability IS NULL AND box > 1')
    expect(Number(r.rows[0].n)).toBe(0)
  })

  it('a consulta dos candidatos usa o índice parcial, sem varrer vocab_cards', async () => {
    const chamadas = await observar(() => migrarLeitnerParaFsrs())
    const leitura = chamadas.flat().find((s) => /^\s*select\b/i.test(s))
    expect(leitura).toBeDefined()
    const params = (leitura!.match(/\?/g) ?? []).map(() => null)
    const plano = await client.execute({ sql: `EXPLAIN QUERY PLAN ${leitura}`, args: params })
    const detalhes = plano.rows.map((l: any) => String(l.detail))
    expect(detalhes.join(' / ')).toMatch(/USING (COVERING )?INDEX idx_vocab_leitner_pendente/)
  })
})
