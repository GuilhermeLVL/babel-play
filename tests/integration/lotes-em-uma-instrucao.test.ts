/**
 * LOTES EM UMA INSTRUÇÃO (Fase 2, tarefa 2): os lotes grandes deixam de fazer uma ida ao banco por linha.
 *
 * Medido contra o Supabase em us-east-1 (130 ms por ida): reetiquetar 5 000 cartões segurava a trava do
 * usuário por dezenas de segundos e caía em `lock_timeout` (55P03). Aqui a conta é de INSTRUÇÕES, pelo
 * observador de consultas de produção (`registrarObservadorDeConsultas`), que vê as avulsas e as de dentro
 * das transações nos dois drivers — então este arquivo roda no PGlite e, com `TESTE_POSTGRES_URL`, num
 * Postgres real.
 *
 * Também cobra a SEMÂNTICA: o upsert de cartões soma ocorrências e preenche buracos como antes (inclusive
 * com a mesma palavra repetida no lote, que num INSERT só não pode tocar a mesma linha duas vezes), e os
 * VALUES soltos chegam com o tipo da coluna (bigint, boolean), não como texto.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let db: any
let schema: any
let vocabRepo: any
let exerciseResultsRepo: any
let agregadosRepo: any
let lotes: any
let chaveDedup: (p: string, l: string | null) => string
let registrar: (fn: ((o: { instrucoes: string[] }) => void) | undefined) => void

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ exerciseResultsRepo } = await h.load('../../server/db/repositories/exerciseResults'))
  ;({ agregadosRepo } = await h.load('../../server/db/repositories/agregados'))
  lotes = await h.load('../../server/db/lotes')
  ;({ chaveDedup } = await h.load('../../src/core/texto/palavra'))
  ;({ registrarObservadorDeConsultas: registrar } = await h.load('../../server/db/observadorDeConsultas'))
}, 60_000)

afterAll(async () => {
  registrar?.(undefined)
  await h?.cleanup()
})

/** As instruções SQL que o banco recebeu (avulsas e de dentro de transação), em ordem. */
function contarInstrucoes(): { lista: string[]; parar: () => void } {
  const lista: string[] = []
  registrar(({ instrucoes }) => lista.push(...instrucoes))
  return { lista, parar: () => registrar(undefined) }
}

const CONSOANTES = 'bcdfghjklmnpqrstvwxyz'
const consoante = (n: number) => CONSOANTES[n % CONSOANTES.length]
/** Palavra só de letras (a captura recusa dígito e letra repetida três vezes), única por `i` até 9 261. */
const palavra = (prefixo: string, i: number) =>
  `${prefixo}${consoante(Math.floor(i / 441))}a${consoante(Math.floor(i / 21))}e${consoante(i)}`

/** Semeia cartões direto na tabela, sem passar pelo caminho que está sendo medido. */
async function semearCartoes(
  userId: string,
  itens: Array<{
    word: string
    srcLang?: string
    back?: string | null
    sentence?: string | null
    occurrences?: number
    deletedAt?: number | null
  }>,
): Promise<string[]> {
  const agora = Date.now() - 60_000
  const linhas = itens.map((c) => ({
    id: randomUUID(),
    createdAt: agora,
    updatedAt: agora,
    userId,
    word: c.word,
    back: c.back ?? null,
    sentence: c.sentence ?? null,
    srcLang: c.srcLang ?? 'en',
    tgtLang: 'pt',
    box: 1,
    dueAt: agora,
    inDeck: 1,
    addedAt: agora,
    normKey: chaveDedup(c.word, c.srcLang ?? 'en'),
    occurrences: c.occurrences ?? 1,
    firstSeenAt: agora,
    lastSeenAt: agora,
    deletedAt: c.deletedAt ?? null,
  }))
  for (let i = 0; i < linhas.length; i += 1000) await db.insert(schema.vocabCards).values(linhas.slice(i, i + 1000))
  return linhas.map((l) => l.id)
}

describe('lotes em uma instrução', () => {
  it('reetiquetar 5 000 cartões faz no máximo 12 instruções no banco e mantém a trava do usuário', async () => {
    const u = `lote-relabel-${randomUUID()}`
    const ids = await semearCartoes(
      u,
      Array.from({ length: 5000 }, (_, i) => ({ word: palavra('termo', i), back: 'x' })),
    )

    const contador = contarInstrucoes()
    let n: number
    try {
      n = await vocabRepo.relabel(
        u,
        ids.map((id) => ({ id, srcLang: 'en-US', tgtLang: 'pt-BR' })),
      )
    } finally {
      contador.parar()
    }

    expect(n).toBe(5000)
    expect(contador.lista.length).toBeLessThanOrEqual(12)
    const trava = contador.lista.findIndex((s) => /pg_advisory_xact_lock/i.test(s))
    const update = contador.lista.findIndex((s) => /^\s*update\s+"?vocab_cards"?/i.test(s))
    expect(trava).toBeGreaterThanOrEqual(0)
    expect(update).toBeGreaterThan(trava) // a trava vem antes de qualquer UPDATE de cartão

    const cartoes = await vocabRepo.list(u)
    expect(cartoes).toHaveLength(5000)
    expect(cartoes.every((c: any) => c.srcLang === 'en-US' && c.tgtLang === 'pt-BR')).toBe(true)
  }, 120_000)

  it('upsert de 500 cartões com conflito em uq_vocab_user_norm é uma instrução e mantém o merge', async () => {
    const u = `lote-upsert-${randomUUID()}`
    const [idA, idB, idC, idE] = await semearCartoes(u, [
      { word: 'casaco', back: '', sentence: 'frase antiga', occurrences: 2 }, // A: verso vazio é preenchido
      { word: 'janela', back: 'velho', sentence: null, occurrences: 1 }, // B: verso bom fica, frase entra
      { word: 'cadeira', back: 'apagado', deletedAt: Date.now() - 1000 }, // C: apagado, não conta no índice
      { word: 'mesa', back: '', sentence: null, occurrences: 5 }, // E: repetida no lote, contra existente
    ])

    const repetidos = [
      { word: 'casaco', srcLang: 'en', tgtLang: 'pt', back: 'coat' },
      { word: 'janela', srcLang: 'en', tgtLang: 'pt', back: 'novo', sentence: 'frase de janela' },
      { word: 'cadeira', srcLang: 'en', tgtLang: 'pt', back: 'chair' },
      // D: três vezes no mesmo lote, sem cartão anterior.
      { word: 'lampada', srcLang: 'en', tgtLang: 'pt', back: null, sentence: 'primeira frase' },
      { word: 'lampada', srcLang: 'en', tgtLang: 'pt', back: 'lamp', sentence: 'segunda frase' },
      { word: 'lampada', srcLang: 'en', tgtLang: 'pt', back: 'lamp three', sentence: null },
      // E: duas vezes no lote; a primeira sem verso.
      { word: 'mesa', srcLang: 'en', tgtLang: 'pt', back: '', sentence: 'frase de mesa' },
      { word: 'mesa', srcLang: 'en', tgtLang: 'pt', back: 'table' },
    ]
    const novos = Array.from({ length: 500 - repetidos.length }, (_, i) => ({
      word: palavra('novo', i),
      srcLang: 'en',
      tgtLang: 'pt',
      back: `tradução de ${palavra('novo', i)}`,
    }))

    const contador = contarInstrucoes()
    let r: any
    try {
      r = await vocabRepo.bulkAdd(u, [...repetidos, ...novos])
    } finally {
      contador.parar()
    }

    const insertsDeCartao = contador.lista.filter((s) => /^\s*insert\s+into\s+"?vocab_cards"?/i.test(s))
    expect(insertsDeCartao).toHaveLength(1)
    expect(r.skipped).toEqual([])
    // Novos: os 492 frescos + `cadeira` (o cartão vivo é outro: o apagado fica apagado).
    expect(r.cards).toHaveLength(novos.length + 1)
    expect(new Set(r.repetidas)).toEqual(new Set(['casaco', 'janela', 'lampada', 'mesa']))

    const porPalavra = new Map<string, any>((await vocabRepo.list(u)).map((c: any) => [c.word, c]))
    const a = porPalavra.get('casaco')
    expect([a.id, a.back, a.sentence, a.occurrences]).toEqual([idA, 'coat', 'frase antiga', 3])
    const b = porPalavra.get('janela')
    expect([b.id, b.back, b.sentence, b.occurrences]).toEqual([idB, 'velho', 'frase de janela', 2])
    const c = porPalavra.get('cadeira')
    expect(c.id).not.toBe(idC)
    expect([c.back, c.occurrences]).toEqual(['chair', 1])
    const orm = await h.load<any>('drizzle-orm')
    const [apagado] = await db.select().from(schema.vocabCards).where(orm.eq(schema.vocabCards.id, idC))
    expect(apagado.back).toBe('apagado')
    expect(apagado.deletedAt).not.toBeNull()
    const d = porPalavra.get('lampada')
    expect([d.back, d.sentence, d.occurrences]).toEqual(['lamp', 'primeira frase', 3])
    const e = porPalavra.get('mesa')
    expect([e.id, e.back, e.sentence, e.occurrences]).toEqual([idE, 'table', 'frase de mesa', 7])
    expect(porPalavra.size).toBe(novos.length + 5)

    // Uma ocorrência por item aceito, inclusive as repetidas.
    const { eq, sql } = await h.load<any>('drizzle-orm')
    const [{ n }] = await db
      .select({ n: sql`count(*)` })
      .from(schema.vocabOccurrences)
      .where(eq(schema.vocabOccurrences.userId, u))
    expect(Number(n)).toBe(500)
  }, 60_000)

  it('VALUES tipados: coluna bigint recebe number e boolean recebe true/false (CAST por coluna)', async () => {
    const { flags } = schema
    const { inArray } = await h.load<any>('drizzle-orm')
    const p = `lote-flag-${randomUUID()}`
    const chaves = [`${p}-a`, `${p}-b`, `${p}-c`]
    const grande = 9_007_199_254_740_991 // Number.MAX_SAFE_INTEGER: bigint de verdade, não int4

    const ins = await lotes.inserirEmLotes(
      db,
      flags,
      chaves.map((chave) => ({ chave, habilitada: false, atualizadoEm: 1 })),
    )
    expect(ins).toEqual({ instrucoes: 1, linhas: 3 })

    const up = await lotes.atualizarEmLotes(
      db,
      flags,
      [
        { chave: chaves[0], habilitada: true, atualizadoEm: grande },
        { chave: chaves[1], habilitada: false, atualizadoEm: 1_700_000_000_123 },
        { chave: chaves[2], habilitada: true, atualizadoEm: 2 },
      ],
      { chave: 'chave', tamanho: 2 },
    )
    expect(up).toEqual({ instrucoes: 2, linhas: 3 })

    const lidas = await db.select().from(flags).where(inArray(flags.chave, chaves)).orderBy(flags.chave)
    expect(lidas.map((l: any) => [l.habilitada, l.atualizadoEm])).toEqual([
      [true, grande],
      [false, 1_700_000_000_123],
      [true, 2],
    ])

    // Conflito: DO UPDATE só nas colunas pedidas; as outras ficam como estavam.
    const ups = await lotes.inserirEmLotes(
      db,
      flags,
      [
        { chave: chaves[0], habilitada: false, atualizadoEm: 5, descricao: 'não entra' },
        { chave: `${p}-d`, habilitada: true, atualizadoEm: 6, descricao: 'nova' },
      ],
      { conflito: { alvo: [flags.chave], atualizar: ['atualizadoEm'] } },
    )
    expect(ups).toEqual({ instrucoes: 1, linhas: 2 })
    const [a] = await db
      .select()
      .from(flags)
      .where(inArray(flags.chave, [chaves[0]]))
    expect([a.habilitada, a.atualizadoEm, a.descricao]).toEqual([true, 5, ''])

    // O teto de parâmetros vale também para um `tamanho` pedido à mão.
    await expect(
      lotes.atualizarEmLotes(db, flags, [{ chave: chaves[0], habilitada: true }], { chave: 'chave', tamanho: 40_000 }),
    ).rejects.toThrow(/parâmetros/)
  }, 60_000)

  it('recalcular a dificuldade toma a trava do usuário e faz um UPDATE só', async () => {
    const u = `lote-dific-${randomUUID()}`
    const ids = await semearCartoes(
      u,
      Array.from({ length: 300 }, (_, i) => ({ word: palavra('dific', i), back: 'x' })),
    )
    const contador = contarInstrucoes()
    let n: number
    try {
      n = await vocabRepo.recalcularDificuldade(u, ids)
    } finally {
      contador.parar()
    }
    expect(n).toBe(300)
    const trava = contador.lista.findIndex((s) => /pg_advisory_xact_lock/i.test(s))
    const updates = contador.lista.filter((s) => /^\s*update\s+"?vocab_cards"?/i.test(s))
    // 4 colunas por linha (id, score, carimbo, updated_at): 300 cartões cabem em ceil(300 / tamanhoDoLote(4)) = 1.
    expect(updates).toHaveLength(Math.ceil(300 / lotes.tamanhoDoLote(4)))
    expect(trava).toBeGreaterThanOrEqual(0)
    expect(trava).toBeLessThan(contador.lista.findIndex((s) => /^\s*update\s+"?vocab_cards"?/i.test(s)))
    const cartoes = await vocabRepo.list(u)
    expect(cartoes.every((c: any) => typeof c.difficultyScore === 'number')).toBe(true)
  }, 60_000)

  it('recalcular a dificuldade e revisar do mesmo usuário ao mesmo tempo, 5 vezes: sem deadlock', async () => {
    const u = `lote-dific-conc-${randomUUID()}`
    const ids = await semearCartoes(
      u,
      Array.from({ length: 200 }, (_, i) => ({ word: palavra('conc', i), back: 'x' })),
    )
    for (let i = 0; i < 5; i++) {
      // A revisão trava o SEU cartão e depois sobe a linha de versão do usuário; o UPDATE em lote faz o
      // contrário (todos os cartões, depois os gatilhos). Sem a trava do usuário primeiro: 40P01.
      const [n] = await Promise.all([
        vocabRepo.recalcularDificuldade(u, ids),
        ...ids.slice(-4).map((id) => vocabRepo.review(u, id, 3)),
      ])
      expect(n).toBe(200)
    }
  }, 60_000)

  it('atualizarEmLotes com a chave repetida: vale a última, e conta uma linha', async () => {
    const { flags } = schema
    const { eq } = await h.load<any>('drizzle-orm')
    const chave = `lote-rep-${randomUUID()}`
    await lotes.inserirEmLotes(db, flags, [{ chave, habilitada: false, atualizadoEm: 1 }])
    const r = await lotes.atualizarEmLotes(
      db,
      flags,
      [
        { chave, habilitada: true, atualizadoEm: 10 },
        { chave, habilitada: false, atualizadoEm: 20 },
      ],
      { chave: 'chave' },
    )
    expect(r).toEqual({ instrucoes: 1, linhas: 1 })
    const [l] = await db.select().from(flags).where(eq(flags.chave, chave))
    expect([l.habilitada, l.atualizadoEm]).toEqual([false, 20])
  }, 60_000)

  it('rodada de 40 itens: o estado por item vai numa instrução e soma como antes', async () => {
    const u = `lote-rodada-${randomUUID()}`
    const ids = await semearCartoes(
      u,
      Array.from({ length: 40 }, (_, i) => ({ word: palavra('rodada', i), back: 'x' })),
    )
    // O primeiro cartão aparece duas vezes: erra e depois acerta (o último resultado vale).
    const itens = [
      { itemRef: 'r0', cardId: ids[0], correct: 0, attempts: 1, kind: 'srs' },
      ...ids.map((id, i) => ({ itemRef: `r${i}`, cardId: id, correct: i % 3 === 0 ? 1 : 0, attempts: 1, kind: 'srs' })),
    ]
    const contador = contarInstrucoes()
    let r: any
    try {
      r = await exerciseResultsRepo.addRodada(u, {
        roundId: `r-${randomUUID()}`,
        exerciseKind: 'memory',
        origem: 'baralho',
        score: 10,
        itens,
      })
    } finally {
      contador.parar()
    }
    expect(r.gravados).toBe(41)
    expect(contador.lista.filter((s) => /insert\s+into\s+estado_por_item/i.test(s))).toHaveLength(1)
    expect(contador.lista.length).toBeLessThanOrEqual(10)

    const e0 = await agregadosRepo.estadoPorItem(u, ids[0])
    expect(e0).toEqual([expect.objectContaining({ jogo: 'memory', acertos: 1, erros: 1, ultimoResultado: 1 })])
    const e1 = await agregadosRepo.estadoPorItem(u, ids[1])
    expect(e1).toEqual([expect.objectContaining({ jogo: 'memory', acertos: 0, erros: 1, ultimoResultado: 0 })])

    // O que a reconstrução do bruto conta é o mesmo que o lote somou.
    const antes = await agregadosRepo.celulas(u)
    await agregadosRepo.reconstruir(u)
    expect(await agregadosRepo.celulas(u)).toEqual(antes)
  }, 60_000)
})
