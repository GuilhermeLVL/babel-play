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
 *
 * Postgres (Fase 1): o batch é uma transação (`emLote`), contada como uma ida por
 * `contadorDeConsultas.ts`; o plano é o `EXPLAIN (FORMAT JSON)` com `enable_seqscan = off` (com a
 * tabela pequena o planejador prefere varrer; a pergunta é se o índice parcial SERVE à consulta).
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { clienteSql } from '../harness/clienteSql'
import { contarConsultas, SO_PGLITE } from '../harness/contadorDeConsultas'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DONO = asUserId('leitner-boot')

let h: EphemeralDb
let db: any, client: ReturnType<typeof clienteSql>, vocabCards: any, migrarLeitnerParaFsrs: () => Promise<number>

beforeAll(async () => {
  h = await setupEphemeralDb()
  const mod = await h.load<any>('../../server/db/db')
  db = mod.db
  client = clienteSql(mod)
  ;({ vocabCards } = await h.load<{ vocabCards: any }>('../../server/db/schema'))
  ;({ migrarLeitnerParaFsrs } = await h.load<{ migrarLeitnerParaFsrs: any }>('../../server/db/manutencao'))
})
afterAll(async () => {
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

/** Grava as idas ao banco (consulta avulsa ou transação) e as instruções feitas durante `fn`. */
async function observar(fn: () => Promise<unknown>): Promise<{ idas: number; instrucoes: string[] }> {
  const contador = await contarConsultas(h.load)
  try {
    await fn()
    return { idas: contador.idas, instrucoes: [...contador.instrucoes] }
  } finally {
    contador.parar()
  }
}

describe.skipIf(SO_PGLITE)('migração Leitner→FSRS do boot', () => {
  it('N candidatos custam uma leitura e um batch, não N idas ao banco', async () => {
    await inserirLeitner(40)
    let migrados = 0
    const { idas, instrucoes } = await observar(async () => {
      migrados = await migrarLeitnerParaFsrs()
    })
    expect(migrados).toBe(40)
    expect(idas, instrucoes.map((c) => c.slice(0, 40)).join('\n')).toBeLessThanOrEqual(2)
    // E as 40 atualizações foram de fato para o banco, dentro da transação.
    expect(instrucoes.filter((x) => /^\s*update\b/i.test(x))).toHaveLength(40)
    const r = await client.execute('SELECT count(*) AS n FROM vocab_cards WHERE stability IS NULL AND box > 1')
    expect(Number(r.rows[0].n)).toBe(0)
  })

  it('a consulta dos candidatos usa o índice parcial, sem varrer vocab_cards', async () => {
    const { instrucoes } = await observar(() => migrarLeitnerParaFsrs())
    const leitura = instrucoes.find((s) => /^\s*select\b/i.test(s))
    expect(leitura).toBeDefined()
    // O único parâmetro é o teto (`limit $1`).
    const comValores = leitura!.replace(/\$\d+/g, '5000')
    await client.execute('SET enable_seqscan = off')
    let json: unknown
    try {
      json = (await client.execute(`EXPLAIN (FORMAT JSON) ${comValores}`)).rows[0]['QUERY PLAN']
    } finally {
      await client.execute('SET enable_seqscan = on')
    }
    type No = { 'Node Type': string; 'Index Name'?: string; Plans?: No[] }
    const nos = (n: No): No[] => [n, ...(n.Plans ?? []).flatMap(nos)]
    const plano = nos(((typeof json === 'string' ? JSON.parse(json) : json) as Array<{ Plan: No }>)[0].Plan)
    const desc = plano.map((n) => `${n['Node Type']} ${n['Index Name'] ?? ''}`).join(' / ')
    expect(
      plano.some((n) => n['Node Type'] === 'Seq Scan'),
      desc,
    ).toBe(false)
    expect(
      plano.some(
        (n) =>
          /^(Index Scan|Index Only Scan|Bitmap Index Scan)$/.test(n['Node Type']) &&
          n['Index Name'] === 'idx_vocab_leitner_pendente',
      ),
      desc,
    ).toBe(true)
  })
})
