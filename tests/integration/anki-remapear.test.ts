/**
 * REMAPEAR SEM REIMPORTAR — `POST /api/anki/decks/:id/remapear` e `GET /api/anki/decks/:id/estruturas`
 * (openspec `motor-anki-mapeador`, bloco 5).
 *
 * O baralho é semeado direto pelo repositório (o mesmo que o protocolo em lotes grava), com `campos_brutos` por nome.
 * O que se prova: a nota descartada que passa a servir perde `motivo_descarte`, a que deixa de servir ganha, a nota
 * ATIVADA nunca perde o cartão nem o histórico (SRS intacto, texto preservado), baralho alheio responde 404, e o
 * servidor recusa mapeamento sem palavra ou sem tradução.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let ankiRepo: any
let db: any
let eqFn: any
let ankiNotes: any
let vocabCards: any
let reviewLogs: any
let asUserId: (id: string) => any

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
  ;({ ankiRepo } = await s.load('../../server/db/repositories/anki'))
  ;({ db } = await s.load('../../server/db/db'))
  ;({ eq: eqFn } = await s.load('drizzle-orm'))
  ;({ ankiNotes, vocabCards, reviewLogs } = await s.load('../../server/db/schema'))
  ;({ asUserId } = await s.load('../../server/lib/authContext'))
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

const DONO = () => asUserId(process.env.LOCAL_OWNER_ID || 'local-owner')
const HASH = 'estrutura-num-word-meaning'
/** Os papéis do tipo `Num / Word / Meaning`: o número não é nada, o resto é o par de sempre. */
const PAPEIS = ['nenhum', 'palavra', 'significado']

function campos(num: string, word: string, meaning: string, extra: Record<string, string> = {}) {
  return JSON.stringify({
    campos: { Num: num, Word: word, Meaning: meaning, ...extra },
    midia: undefined,
    lacunas: undefined,
  })
}

/** Um baralho do usuário com as notas dadas, gravadas pelo repositório. */
async function semear(userId: any, nome: string, notas: Array<Record<string, unknown>>) {
  const deck = await ankiRepo.criarOuAcharDeck(userId, { nome, arquivoOrigem: `${nome}.apkg` })
  const imp = await ankiRepo.criarImport(userId, { deckId: deck.id, arquivo: `${nome}.apkg`, bytes: 1 })
  await ankiRepo.gravarNotas(
    userId,
    deck.id,
    imp.id,
    notas.map((n) => ({ notetype: 'Vocab', estruturaHash: HASH, ...n })) as any,
  )
  return deck as { id: string }
}

async function notaPorGuid(deckId: string, guid: string) {
  const { itens } = await ankiRepo.listarNotas(DONO(), deckId, { limite: 500 })
  return itens.find((n: any) => n.guid === guid)
}

const remapear = (deckId: string, corpo: unknown) => s.post(`/api/anki/decks/${deckId}/remapear`, corpo)

describe('POST /api/anki/decks/:id/remapear', () => {
  it('nota descartada que passa a servir perde o motivo; a que deixa de servir ganha', async () => {
    const deck = await semear(DONO(), 'remapear-regua', [
      // Lida errado: a frente era o número. Com a palavra no campo certo, serve.
      {
        guid: 'ruim',
        frente: '12',
        verso: 'ledger',
        camposBrutos: campos('12', 'ledger', 'livro-razão'),
        motivoDescarte: 'frente-so-numero',
      },
      // Servia, mas com a escolha nova a "tradução" é igual à palavra: a régua recusa.
      {
        guid: 'boa',
        frente: 'orbit',
        verso: 'órbita',
        camposBrutos: campos('orbit', 'orbit', 'orbit'),
        motivoDescarte: null,
      },
    ])
    const r = await remapear(deck.id, { mapeamentos: [{ estruturaHash: HASH, papeis: PAPEIS }] })
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ simulado: false, notas: 2, mudaram: 2, passaramAServir: 1, deixaramDeServir: 1 })

    const ruim = await notaPorGuid(deck.id, 'ruim')
    expect(ruim.frente).toBe('ledger')
    expect(ruim.verso).toBe('livro-razão')
    expect(ruim.motivoDescarte).toBeNull()
    const boa = await notaPorGuid(deck.id, 'boa')
    expect(boa.motivoDescarte).toBeTruthy()
    // O estado não é do remapear: a nota continua arquivada.
    expect(ruim.estado).toBe('arquivada')
  })

  it('repetir o mesmo mapeamento não muda nada (idempotente)', async () => {
    const deck = await semear(DONO(), 'remapear-idempotente', [
      { guid: 'a', frente: '1', verso: 'x', camposBrutos: campos('1', 'ledger', 'livro-razão'), motivoDescarte: 'x' },
    ])
    const corpo = { mapeamentos: [{ estruturaHash: HASH, papeis: PAPEIS }] }
    expect((await (await remapear(deck.id, corpo)).json()).mudaram).toBe(1)
    expect((await (await remapear(deck.id, corpo)).json()).mudaram).toBe(0)
  })

  it('simular só conta: nada é gravado', async () => {
    const deck = await semear(DONO(), 'remapear-simular', [
      { guid: 'a', frente: '1', verso: 'x', camposBrutos: campos('1', 'ledger', 'livro-razão'), motivoDescarte: 'x' },
    ])
    const r = await remapear(deck.id, { mapeamentos: [{ estruturaHash: HASH, papeis: PAPEIS }], simular: true })
    expect(await r.json()).toMatchObject({ simulado: true, mudaram: 1 })
    expect((await notaPorGuid(deck.id, 'a')).frente).toBe('1')
  })

  it('cartão ativado e revisado: texto, vínculo e SRS ficam intactos; só o exemplo vazio é preenchido', async () => {
    const U = DONO()
    const deck = await semear(U, 'remapear-ativada', [
      {
        guid: 'ativa',
        frente: 'orbit',
        verso: 'órbita',
        camposBrutos: campos('9', 'outra', 'coisa', { Sentence: 'sem uso' }),
        motivoDescarte: null,
      },
    ])
    const cardId = 'card-remapear-ativada'
    const antesDoCartao = {
      id: cardId,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      userId: U,
      word: 'orbit',
      normKey: 'en|orbit',
      occurrences: 1,
    }
    await db.insert(vocabCards).values(antesDoCartao)
    await db.insert(reviewLogs).values({
      id: 'log-remapear-ativada',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: U,
      cardId,
      reviewedAt: Date.now(),
      grade: 3,
    })
    const n0 = await notaPorGuid(deck.id, 'ativa')
    await db.update(ankiNotes).set({ estado: 'ativa', projectedCardId: cardId }).where(eqFn(ankiNotes.id, n0.id))
    const cartaoAntes = (await db.select().from(vocabCards).where(eqFn(vocabCards.id, cardId)))[0]

    const r = await remapear(deck.id, {
      mapeamentos: [{ estruturaHash: HASH, papeis: ['nenhum', 'palavra', 'significado', 'frase'] }],
    })
    // Quatro papéis para três campos: não é o tipo desta nota (ela tem Num/Word/Meaning/Sentence = quatro campos).
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ mudaram: 0, preencheram: 1, protegidas: 0 })

    const depois = await notaPorGuid(deck.id, 'ativa')
    expect(depois.frente).toBe('orbit')
    expect(depois.verso).toBe('órbita')
    expect(depois.exemplo).toBe('sem uso')
    expect(depois.estado).toBe('ativa')
    expect(depois.projectedCardId).toBe(cardId)
    // O cartão e o log de revisão não foram tocados.
    const cartaoDepois = (await db.select().from(vocabCards).where(eqFn(vocabCards.id, cardId)))[0]
    expect(cartaoDepois).toEqual(cartaoAntes)
    expect(await db.select().from(reviewLogs).where(eqFn(reviewLogs.id, 'log-remapear-ativada'))).toHaveLength(1)

    // Numa segunda passada o exemplo já existe: a nota é só protegida.
    const r2 = await (
      await remapear(deck.id, {
        mapeamentos: [{ estruturaHash: HASH, papeis: ['nenhum', 'palavra', 'significado', 'frase'] }],
      })
    ).json()
    expect(r2).toMatchObject({ mudaram: 0, preencheram: 0, protegidas: 1 })
  })

  it('baralho de outra conta → 404, e nada muda lá', async () => {
    const OUTRO = asUserId('anki-remapear-outro')
    const alheio = await semear(OUTRO, 'remapear-alheio', [
      { guid: 'a', frente: '1', verso: 'x', camposBrutos: campos('1', 'ledger', 'livro-razão'), motivoDescarte: 'x' },
    ])
    const r = await remapear(alheio.id, { mapeamentos: [{ estruturaHash: HASH, papeis: PAPEIS }] })
    expect(r.status).toBe(404)
    const { itens } = await ankiRepo.listarNotas(OUTRO, alheio.id, {})
    expect(itens[0].frente).toBe('1')
    expect((await s.get(`/api/anki/decks/${alheio.id}/estruturas`)).status).toBe(404)
  })

  it('mapeamento sem palavra ou sem tradução → 400; corpo fora do contrato → 400', async () => {
    const deck = await semear(DONO(), 'remapear-invalido', [
      { guid: 'a', frente: '1', verso: 'x', camposBrutos: campos('1', 'ledger', 'livro-razão') },
    ])
    const semTraducao = await remapear(deck.id, {
      mapeamentos: [{ estruturaHash: HASH, papeis: ['nenhum', 'palavra', 'nenhum'] }],
    })
    expect(semTraducao.status).toBe(400)
    expect((await semTraducao.json()).code).toBe('mapeamento_invalido')
    expect((await remapear(deck.id, { mapeamentos: [] })).status).toBe(400)
    expect(
      (await remapear(deck.id, { mapeamentos: [{ estruturaHash: HASH, papeis: ['inventado', 'palavra'] }] })).status,
    ).toBe(400)
  })

  it('nota de outro tipo de nota (campos que não batem) fica como está', async () => {
    const deck = await semear(DONO(), 'remapear-outro-tipo', [
      {
        guid: 'a',
        frente: 'casa',
        verso: 'house',
        camposBrutos: JSON.stringify({ campos: { Front: 'casa', Back: 'house' } }),
      },
    ])
    const corpo = await (await remapear(deck.id, { mapeamentos: [{ estruturaHash: HASH, papeis: PAPEIS }] })).json()
    expect(corpo).toMatchObject({ mudaram: 0, ignoradas: 1 })
    expect((await notaPorGuid(deck.id, 'a')).frente).toBe('casa')
  })
})

describe('GET /api/anki/decks/:id/estruturas', () => {
  it('devolve os campos reais, a amostra limpa e o palpite de papéis', async () => {
    const deck = await semear(DONO(), 'estruturas-reais', [
      { guid: 'a', frente: '1', verso: 'x', camposBrutos: campos('1', '<b>ledger</b>', 'livro-razão') },
      { guid: 'b', frente: '2', verso: 'y', camposBrutos: campos('2', 'orbit', 'órbita') },
    ])
    const r = await s.get(`/api/anki/decks/${deck.id}/estruturas`)
    expect(r.status).toBe(200)
    const { estruturas } = await r.json()
    expect(estruturas).toHaveLength(1)
    expect(estruturas[0]).toMatchObject({ hash: HASH, notetype: 'Vocab', campos: ['Num', 'Word', 'Meaning'], notas: 2 })
    expect(estruturas[0].amostra.map((l: string[]) => l[1]).sort()).toEqual(['ledger', 'orbit'])
    expect(estruturas[0].papeis).toEqual(PAPEIS)
  })
})
