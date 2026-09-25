/**
 * Listas grandes vindas do usuário contra o teto de variáveis do SQLite (P1 da auditoria de
 * prontidão).
 *
 * O libsql compila o SQLite com `MAX_VARIABLE_NUMBER = 32766`. O schema aceita até 5.000 falas por
 * sessão e o import Anki até 50.000 notas, mas o INSERT de falas usa 17 variáveis por linha — a
 * partir de 1.928 falas a instrução passava do teto e a sessão INTEIRA era recusada com "too many
 * SQL variables". No Anki, o `inArray(guid)` e o `NOT IN` quebravam a partir de ~32 mil notas, e
 * cada nota era uma ida ao banco.
 *
 * Os volumes aqui são os TETOS dos schemas, não números simbólicos: o que o schema aceita, o
 * banco tem de gravar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let sessionsRepo: any
let utterancesRepo: any
let ankiRepo: any
let vocabRepo: any
let db: any
let client: any
let vocabCards: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo } = await h.load('../../server/db/repositories/utterances'))
  ;({ ankiRepo } = await h.load('../../server/db/repositories/anki'))
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ db, client } = await h.load('../../server/db/db'))
  ;({ vocabCards } = await h.load('../../server/db/schema'))
}, 60_000)

afterAll(async () => {
  await h?.cleanup?.()
})

const TETO_DE_FALAS = 5_000

function falas(n: number, prefixo = 'fala') {
  return Array.from({ length: n }, (_, i) => ({
    idx: i,
    tStartMs: i * 1000,
    tEndMs: i * 1000 + 900,
    speakerId: 's1',
    speakerName: 'Ana',
    source: 'mic',
    sourceLang: 'en',
    sourceText: `${prefixo} número ${i}`,
    targetLang: 'pt',
    translatedText: `tradução ${i}`,
    confidence: 0.9,
    engine: 'teste',
  }))
}

async function contar(sqlText: string, args: unknown[]): Promise<number> {
  const r = await client.execute({ sql: sqlText, args })
  return Number(Object.values(r.rows[0])[0])
}

describe('sessões com o teto de falas do schema', () => {
  it('POST: cria sessão com 5.000 falas e relê todas, na ordem', async () => {
    const u = asUserId('lotes-post')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'longa', kind: 'audio' }, falas(TETO_DE_FALAS))
    const lida = await sessionsRepo.getWithUtterances(u, s.id)
    expect(lida.utterances).toHaveLength(TETO_DE_FALAS)
    expect(lida.utterances[0].sourceText).toBe('fala número 0')
    expect(lida.utterances[TETO_DE_FALAS - 1].sourceText).toBe(`fala número ${TETO_DE_FALAS - 1}`)
    expect(lida.utterances.map((x: any) => x.idx)).toEqual(Array.from({ length: TETO_DE_FALAS }, (_, i) => i))
    expect(s.wordCount).toBe(TETO_DE_FALAS * 3)
  }, 60_000)

  it('PUT: troca 5.000 falas por outras 5.000, sem sobrar nenhuma antiga', async () => {
    const u = asUserId('lotes-put')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'retomada', kind: 'audio' }, falas(10, 'velha'))
    const r = await sessionsRepo.replaceUtterances(u, s.id, falas(TETO_DE_FALAS, 'nova'))
    expect(r.wordCount).toBe(TETO_DE_FALAS * 3)
    const lidas = await utterancesRepo.listBySession(u, s.id)
    expect(lidas).toHaveLength(TETO_DE_FALAS)
    expect(lidas.every((x: any) => x.sourceText.startsWith('nova'))).toBe(true)
  }, 60_000)

  it('a atomicidade vale entre os lotes: um lote que falha desfaz a sessão inteira', async () => {
    const u = asUserId('lotes-atomico')
    const antes = await contar('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [u])
    const lote = falas(TETO_DE_FALAS)
    // A ÚLTIMA fala cai no último lote e viola o CHECK/tipo? Não há CHECK — então forçamos a
    // falha por id duplicado: dois lotes com a mesma chave primária.
    const original = utterancesRepo.stmtInsertMany
    utterancesRepo.stmtInsertMany = (...args: unknown[]) => {
      const stmts = original.apply(utterancesRepo, args)
      expect(stmts.length).toBeGreaterThan(1) // o teste só prova algo se houver mais de um lote
      return [...stmts, stmts[0]] // repete o 1º lote no fim → PRIMARY KEY violada no último passo
    }
    try {
      await expect(sessionsRepo.createWithUtterances(u, { title: 'x', kind: 'audio' }, lote)).rejects.toThrow()
    } finally {
      utterancesRepo.stmtInsertMany = original
    }
    expect(await contar('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [u])).toBe(antes)
    expect(await contar('SELECT COUNT(*) FROM utterances WHERE user_id = ?', [u])).toBe(0)
  }, 60_000)

  it('relabel de 5.000 falas (teto do schema) altera todas e só as do dono', async () => {
    const u = asUserId('lotes-relabel-utt')
    const outro = asUserId('lotes-relabel-utt-outro')
    const s = await sessionsRepo.createWithUtterances(u, { title: 'r', kind: 'audio' }, falas(TETO_DE_FALAS))
    const alheia = await sessionsRepo.createWithUtterances(outro, { title: 'r', kind: 'audio' }, falas(1))
    const ids = (await utterancesRepo.listBySession(u, s.id)).map((x: any) => x.id)
    const idAlheio = (await utterancesRepo.listBySession(outro, alheia.id))[0].id
    const itens = [...ids, idAlheio].map((id: string) => ({ id, sourceLang: 'es', targetLang: 'fr' }))
    const changed = await utterancesRepo.relabel(u, itens)
    expect(changed).toBe(TETO_DE_FALAS)
    expect(await contar("SELECT COUNT(*) FROM utterances WHERE user_id = ? AND source_lang = 'es'", [u])).toBe(
      TETO_DE_FALAS,
    )
    expect(await contar("SELECT COUNT(*) FROM utterances WHERE user_id = ? AND source_lang = 'es'", [outro])).toBe(0)
  }, 60_000)
})

describe('vocab: relabel com o teto do schema', () => {
  it('relabel de 5.000 cartões altera todos e só os do dono', async () => {
    const u = asUserId('lotes-relabel-vocab')
    const outro = asUserId('lotes-relabel-vocab-outro')
    const agora = Date.now()
    const linhas = Array.from({ length: TETO_DE_FALAS }, (_, i) => ({
      id: `vc-${i}`,
      createdAt: agora,
      updatedAt: agora,
      userId: u,
      word: `w${i}`,
      srcLang: 'en',
      tgtLang: 'pt',
    }))
    for (let i = 0; i < linhas.length; i += 500) await db.insert(vocabCards).values(linhas.slice(i, i + 500))
    await db
      .insert(vocabCards)
      .values({ id: 'vc-alheio', createdAt: agora, updatedAt: agora, userId: outro, word: 'x' })

    const itens = [...linhas.map((l) => l.id), 'vc-alheio'].map((id) => ({ id, srcLang: 'de', tgtLang: 'it' }))
    const changed = await vocabRepo.relabel(u, itens)
    expect(changed).toBe(TETO_DE_FALAS)
    expect(await contar("SELECT COUNT(*) FROM vocab_cards WHERE user_id = ? AND src_lang = 'de'", [u])).toBe(
      TETO_DE_FALAS,
    )
    expect(await contar("SELECT COUNT(*) FROM vocab_cards WHERE id = 'vc-alheio' AND src_lang IS NULL", [])).toBe(1)
  }, 60_000)
})

describe('import Anki com 40.000 notas (camada de repositório)', () => {
  const N = 40_000
  const notas = (versao: string) =>
    Array.from({ length: N }, (_, i) => ({
      guid: `guid-${i}`,
      notetype: 'Basic',
      frente: `palavra${i}`,
      verso: `tradução ${i} ${versao}`,
      camposBrutos: { Front: `palavra${i}`, Back: `tradução ${i}` },
      tags: 'core',
    }))

  it('grava 40.000, marca ausentes, e a 2ª importação é idempotente', async () => {
    const u = asUserId('lotes-anki')
    const deck = await ankiRepo.criarOuAcharDeck(u, { nome: 'Grande', arquivoOrigem: 'grande.apkg' })
    const imp = await ankiRepo.criarImport(u, { deckId: deck.id, arquivo: 'grande.apkg' })

    const t0 = performance.now()
    const r1 = await ankiRepo.gravarNotas(u, deck.id, imp.id, notas('v1'))
    const ausentes1 = await ankiRepo.marcarAusentes(
      u,
      deck.id,
      notas('v1').map((n) => n.guid),
    )
    const t1 = performance.now()
    console.log(`[lotes] 1ª importação de ${N} notas: ${Math.round(t1 - t0)} ms`)

    expect(r1.novas).toBe(N)
    expect(r1.ids).toHaveLength(N)
    expect(new Set(r1.ids).size).toBe(N)
    expect(ausentes1).toBe(0)
    expect(await contar('SELECT COUNT(*) FROM anki_notes WHERE deck_id = ?', [deck.id])).toBe(N)

    // 2ª importação do MESMO arquivo: nada novo, nada atualizado, mesmos ids, na mesma ordem.
    const t2 = performance.now()
    const r2 = await ankiRepo.gravarNotas(u, deck.id, imp.id, notas('v1'))
    const ausentes2 = await ankiRepo.marcarAusentes(
      u,
      deck.id,
      notas('v1').map((n) => n.guid),
    )
    console.log(`[lotes] 2ª importação (idempotente) de ${N} notas: ${Math.round(performance.now() - t2)} ms`)
    expect(r2).toMatchObject({ novas: 0, atualizadas: 0, iguais: N })
    expect(r2.ids).toEqual(r1.ids)
    expect(ausentes2).toBe(0)
    expect(await contar('SELECT COUNT(*) FROM anki_notes WHERE deck_id = ?', [deck.id])).toBe(N)

    // 3ª: metade muda de conteúdo e as últimas 1.000 somem do arquivo.
    const v1 = notas('v1')
    const v2 = notas('v2')
      .slice(0, N - 1_000)
      .map((n, i) => (i % 2 ? n : { ...n, verso: v1[i].verso }))
    const r3 = await ankiRepo.gravarNotas(u, deck.id, imp.id, v2)
    const ausentes3 = await ankiRepo.marcarAusentes(
      u,
      deck.id,
      v2.map((n) => n.guid),
    )
    expect(r3).toMatchObject({ novas: 0, atualizadas: (N - 1_000) / 2, iguais: (N - 1_000) / 2 })
    expect(ausentes3).toBe(1_000)
    expect(
      await contar("SELECT COUNT(*) FROM anki_notes WHERE deck_id = ? AND estado = 'ausente_no_arquivo'", [deck.id]),
    ).toBe(1_000)

    // Reaparecem: saem de `ausente_no_arquivo` e a contagem de ausentes volta a zero.
    await ankiRepo.gravarNotas(u, deck.id, imp.id, notas('v2'))
    expect(
      await ankiRepo.marcarAusentes(
        u,
        deck.id,
        notas('v2').map((n) => n.guid),
      ),
    ).toBe(0)
    expect(
      await contar("SELECT COUNT(*) FROM anki_notes WHERE deck_id = ? AND estado = 'ausente_no_arquivo'", [deck.id]),
    ).toBe(0)
    expect(await contar('SELECT COUNT(*) FROM anki_notes WHERE deck_id = ?', [deck.id])).toBe(N)
  }, 300_000)
})
