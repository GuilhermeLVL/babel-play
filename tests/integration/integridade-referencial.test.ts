/**
 * F0-04 / F3-03 / F3-04 / F1-05 — a rede sob a camada de aplicação.
 *
 * O achado que este arquivo fecha não era "faltam FK": era que `PRAGMA foreign_key_check` voltava
 * VAZIO e isso parecia bom. Voltava vazio porque nenhuma das 18 tabelas declarava chave nenhuma —
 * conforto falso. Por isso os testes abaixo não conferem a existência da constraint, e sim que ela
 * REJEITA: cada relação leva um insert de filho com pai inexistente e tem de falhar.
 *
 * Postgres (Fase 1): os `PRAGMA` viraram consultas ao catálogo (`catalogoPg.ts`); a FK do Postgres
 * não se desliga por conexão, e o erro de violação é o SQLSTATE 23503. O `integrity_check` saiu: é
 * a checagem do ARQUIVO do SQLite, sem equivalente aqui.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { chavesEstrangeiras, colunas, existeTabela, orfaos } from '../harness/catalogoPg'
import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let client: ReturnType<typeof clienteSql>
let schema: any
let sessionsRepo: any
let vocabRepo: any
let contaRepo: any

/* As 8 relações do schema. Duas saíram com as tabelas que as declaravam: `memory_embeddings`
   na F1-05 e `analyses` na migração 0026 — as duas por não terem leitor nem escritor. */
const RELACOES: Array<[filho: string, fk: string, pai: string]> = [
  ['utterances', 'session_id', 'sessions'],
  ['vocab_cards', 'session_id', 'sessions'],
  ['vocab_occurrences', 'card_id', 'vocab_cards'],
  ['vocab_occurrences', 'utterance_id', 'utterances'],
  ['review_logs', 'card_id', 'vocab_cards'],
  ['exercise_results', 'session_id', 'sessions'],
  ['exercise_results', 'card_id', 'vocab_cards'],
  ['provider_credentials', 'secret_ref', 'secrets'],
]

const agora = () => Date.now()

beforeAll(async () => {
  h = await setupEphemeralDb()
  const mod = (await h.load('../../server/db/db')) as any
  await mod.dbReady()
  client = clienteSql(mod)
  schema = await h.load('../../server/db/schema')
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ contaRepo } = await h.load('../../server/db/repositories/conta'))
})
afterAll(async () => {
  await h.cleanup()
})

const linhas = async (sql: string, args: any[] = []) => (await client.execute({ sql, args })).rows

/** A violação de FK do Postgres (SQLSTATE 23503), procurada na cadeia de causas do Drizzle. */
const violaFk = (e: any): boolean => {
  for (let x = e; x; x = x.cause) if (x.code === '23503' || /foreign key/i.test(String(x.message))) return true
  return false
}

describe('F0-04 — as FOREIGN KEY estão declaradas', () => {
  it('a checagem de FK está valendo (session_replication_role = origin: os gatilhos de FK disparam)', async () => {
    expect((await linhas('SHOW session_replication_role'))[0]).toEqual({ session_replication_role: 'origin' })
  })

  it('cada relação aparece nas FKs declaradas da tabela filha', async () => {
    for (const [filho, fk, pai] of RELACOES) {
      const declaradas = (await chavesEstrangeiras(client, filho)).map((r) => `${r.colunas.join(',')}→${r.pai}`)
      expect(declaradas, `${filho}.${fk}`).toContain(`${fk}→${pai}`)
    }
  })

  it('nenhum órfão no banco migrado (o foreign_key_check)', async () => {
    expect((await chavesEstrangeiras(client)).length).toBeGreaterThanOrEqual(RELACOES.length)
    expect(await orfaos(client)).toEqual([])
  })

  it('a conferência de órfãos não é vazia por construção: acha a linha que escapou da FK', async () => {
    // `replica` desliga os gatilhos de FK nesta conexão — o caminho de uma carga em massa.
    await client.execute("SET session_replication_role = 'replica'")
    try {
      await client.execute({
        sql: 'INSERT INTO review_logs (id, created_at, updated_at, card_id) VALUES (?, ?, ?, ?)',
        args: ['orfa-de-teste', agora(), agora(), 'cartao-que-nao-existe'],
      })
    } finally {
      await client.execute("SET session_replication_role = 'origin'")
    }
    try {
      expect(await orfaos(client)).toEqual([expect.objectContaining({ tabela: 'review_logs', n: 1 })])
    } finally {
      await client.execute("DELETE FROM review_logs WHERE id = 'orfa-de-teste'")
    }
    expect(await orfaos(client)).toEqual([])
  })
})

describe('F0-04 — a FK REJEITA de verdade', () => {
  /** Colunas NOT NULL mínimas de cada filho, fora a própria FK. */
  const molde: Record<string, { cols: string[]; vals: any[] }> = {
    utterances: { cols: ['created_at', 'updated_at'], vals: [agora(), agora()] },
    vocab_cards: { cols: ['created_at', 'updated_at', 'word'], vals: [agora(), agora(), 'x'] },
    vocab_occurrences: {
      cols: ['created_at', 'updated_at', 'user_id', 'occurred_at', 'origin_kind'],
      vals: [agora(), agora(), 'u', agora(), 'manual'],
    },
    review_logs: { cols: ['created_at', 'updated_at'], vals: [agora(), agora()] },
    exercise_results: { cols: ['created_at', 'updated_at'], vals: [agora(), agora()] },
    provider_credentials: { cols: ['created_at', 'updated_at'], vals: [agora(), agora()] },
  }

  it.each(RELACOES)('insert em %s com %s apontando para %s inexistente FALHA', async (filho, fk, pai) => {
    const m = molde[filho]
    // `vocab_occurrences.card_id` é NOT NULL; para testar `utterance_id` o card precisa existir.
    const extraCols: string[] = []
    const extraVals: any[] = []
    if (filho === 'vocab_occurrences' && fk === 'utterance_id') {
      const cardId = `card-fk-${Math.random()}`
      await client.execute({
        sql: 'INSERT INTO vocab_cards (id, created_at, updated_at, word) VALUES (?,?,?,?)',
        args: [cardId, agora(), agora(), 'ancora'],
      })
      extraCols.push('card_id')
      extraVals.push(cardId)
    }
    const cols = ['id', ...m.cols, ...extraCols, fk]
    const vals = [`orfa-${filho}-${fk}-${Math.random()}`, ...m.vals, ...extraVals, `PAI-QUE-NAO-EXISTE-EM-${pai}`]

    await expect(
      client.execute({
        sql: `INSERT INTO ${filho} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        args: vals,
      }),
    ).rejects.toSatisfy(violaFk)

    // E a linha não entrou.
    expect(await linhas(`SELECT id FROM ${filho} WHERE ${fk} = ?`, [`PAI-QUE-NAO-EXISTE-EM-${pai}`])).toEqual([])
  })

  it('FK OPCIONAL aceita NULL — cartão sem sessão continua válido (é o caso das 46 linhas da F3-03)', async () => {
    const id = `card-sem-sessao-${Math.random()}`
    await client.execute({
      sql: 'INSERT INTO vocab_cards (id, created_at, updated_at, word, session_id) VALUES (?,?,?,?,NULL)',
      args: [id, agora(), agora(), 'solta'],
    })
    expect(await linhas('SELECT id FROM vocab_cards WHERE id = ?', [id])).toHaveLength(1)
  })

  it('ON DELETE NO ACTION: apagar o PAI com filho vivo é recusado', async () => {
    const u = asUserId('fk-no-action')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'pai' }, [{ idx: 0, sourceText: 'oi' }])
    await expect(client.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [s.id] })).rejects.toSatisfy(violaFk)
    expect(await linhas('SELECT id FROM sessions WHERE id = ?', [s.id])).toHaveLength(1)
  })
})

describe('F1-05 — memory_embeddings não existe mais', () => {
  it('a tabela sumiu do banco e do schema', async () => {
    expect(await existeTabela(client, 'memory_embeddings')).toBe(false)
    expect(await existeTabela(client, 'sessions')).toBe(true) // a pergunta funciona
    expect(schema.memoryEmbeddings).toBeUndefined()
  })
})

describe('F3-04 — as colunas que faltavam para o apagamento em cascata', () => {
  it('vocab_occurrences ganhou created_at, updated_at e deleted_at', async () => {
    const cols = await colunas(client, 'vocab_occurrences')
    expect(cols).toEqual(expect.arrayContaining(['created_at', 'updated_at', 'deleted_at', 'user_id']))
  })

  it('secrets ganhou user_id e deleted_at', async () => {
    const cols = await colunas(client, 'secrets')
    expect(cols).toEqual(expect.arrayContaining(['user_id', 'deleted_at']))
  })

  it('remover a sessão propaga o soft delete para as falas', async () => {
    const u = asUserId('cascata-sessao')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'some' }, [
      { idx: 0, sourceText: 'uma' },
      { idx: 1, sourceText: 'duas' },
    ])
    expect(await sessionsRepo.remove(u, s.id)).toBe(true)
    const vivas = await linhas('SELECT id FROM utterances WHERE session_id = ? AND deleted_at IS NULL', [s.id])
    expect(vivas).toHaveLength(0)
  })

  it('remover o cartão propaga o soft delete para ocorrências e review_logs', async () => {
    const u = asUserId('cascata-cartao')
    const { cards } = await vocabRepo.bulkAdd(u, [{ word: 'leverage', back: 'alavanca', srcLang: 'en' }])
    const card = cards[0]
    await vocabRepo.review(u, card.id, 3)

    expect(await vocabRepo.remove(u, card.id)).toBe(true)
    expect(
      await linhas('SELECT id FROM vocab_occurrences WHERE card_id = ? AND deleted_at IS NULL', [card.id]),
    ).toHaveLength(0)
    expect(await linhas('SELECT id FROM review_logs WHERE card_id = ? AND deleted_at IS NULL', [card.id])).toHaveLength(
      0,
    )
    // Soft delete: as linhas continuam no banco, só invisíveis.
    expect(await linhas('SELECT id FROM review_logs WHERE card_id = ?', [card.id])).toHaveLength(1)
  })

  it('a exclusão FÍSICA da conta atravessa a árvore inteira sem esbarrar nas FK', async () => {
    const u = asUserId('exclusao-com-fk')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'tudo' }, [{ idx: 0, sourceText: 'fala' }])
    const { cards } = await vocabRepo.bulkAdd(u, [
      { word: 'threshold', back: 'limiar', srcLang: 'en', sessionId: s.id },
    ])
    await vocabRepo.review(u, cards[0].id, 3)

    const relatorio = await contaRepo.excluir(u)
    expect(relatorio.totalDeLinhas).toBeGreaterThan(0)
    for (const t of ['sessions', 'utterances', 'vocab_cards', 'vocab_occurrences', 'review_logs']) {
      expect(await linhas(`SELECT id FROM ${t} WHERE user_id = ?`, [u]), t).toEqual([])
    }
    expect(await orfaos(client)).toEqual([])
  })
})
