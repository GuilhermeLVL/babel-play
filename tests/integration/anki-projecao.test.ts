/**
 * Motor Anki — projeção (`openspec/changes/motor-anki-acervo`, tasks 3 e "D" de
 * `selecionarParaJogo`). O acervo (`tests/integration/anki-acervo.test.ts`) é INDEPENDENTE de
 * virar cartão jogável; estes testes cobrem exatamente essa ligação: `vocabRepo.projetarDoAnki`,
 * `vocabRepo.ativarLote` e o filtro por baralho em `selecionarParaJogo`.
 *
 * A garantia mais importante do arquivo é a "armadilha" da Decisão 4: o índice único de
 * `vocab_cards` é PARCIAL (`deleted_at IS NULL`), então reimportar depois de uma desativação NÃO
 * pode criar um cartão paralelo — tem de ressuscitar o mesmo id, com o mesmo `review_logs`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let vocabRepo: any
let ankiRepo: any
let db: any
let vocabCards: any
let reviewLogs: any
let eqFn: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  vocabRepo = (await import('../../server/db/repositories/vocab')).vocabRepo
  ankiRepo = (await import('../../server/db/repositories/anki')).ankiRepo
  ;({ db } = await h.load('../../server/db/db'))
  ;({ vocabCards, reviewLogs } = await h.load('../../server/db/schema'))
  ;({ eq: eqFn } = await import('drizzle-orm'))
})
afterAll(async () => { await h?.cleanup?.() })

async function criarDeckComNotas(userId: string, sufixo: string, palavras: Array<{ frente: string; verso?: string }>) {
  const deck = await ankiRepo.criarOuAcharDeck(userId as never, {
    nome: `Deck${sufixo}`,
    arquivoOrigem: `arquivo${sufixo}.apkg`,
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
  })
  const imp = await ankiRepo.criarImport(userId as never, { deckId: deck.id, arquivo: `arquivo${sufixo}.apkg` })
  await ankiRepo.gravarNotas(userId as never, deck.id, imp.id, palavras.map((p, i) => ({
    guid: `${sufixo}-g${i}`, frente: p.frente, verso: p.verso ?? 'definição curta',
  })))
  return { deck, imp }
}

describe('projetarDoAnki — nota vira cartão jogável', () => {
  it('cria cartão com ocorrência origin_kind=anki e origin_ref=<deckId>', async () => {
    const u = asUserId('proj-1')
    const { deck } = await criarDeckComNotas(u, '-proj1', [{ frente: 'ledger', verso: 'livro-razão' }])
    const notas = await ankiRepo.listarNotas(u, deck.id, {})

    const r = await vocabRepo.projetarDoAnki(u, deck.id, notas.itens.map((n: any) =>
      ({ id: n.id, frente: n.frente, verso: n.verso, exemplo: n.exemplo, motivoDaBaixa: n.motivoDaBaixa })),
      { srcLang: 'en', tgtLang: 'pt' })

    expect(r.criados).toBe(1)
    expect(r.reaproveitados).toBe(0)
    expect(r.reativados).toBe(0)

    const card = (await vocabRepo.list(u)).find((c: any) => c.word === 'ledger')
    expect(card).toBeTruthy()
    const occ = await vocabRepo.ocorrencias(u, card.id)
    expect(occ).toHaveLength(1)
    expect(occ[0].originKind).toBe('anki')
    expect(occ[0].originRef).toBe(deck.id)

    const notaFinal = (await ankiRepo.listarNotas(u, deck.id, {})).itens[0]
    expect(notaFinal.projectedCardId).toBe(card.id)
    expect(notaFinal.estado).toBe('ativa')
  })
})

describe('ativação em lote — 3.600 (aqui, 500) notas importadas ⇒ ZERO cartões vencidos antes de ativar', () => {
  it('nenhum vocab_card existe até ativarLote ser chamado; depois, no máximo o teto é projetado', async () => {
    const u = asUserId('proj-lote')
    const N = 500
    // As DUAS letras do sufixo nunca podem ser iguais entre si NEM iguais ao 'e' final de
    // "lote" — senão formam trinca ("lote"+"ee" = "loteee") e `avaliarCartao` rejeita como
    // ruído (`palavra-ruido`), quebrando a contagem exata que o teste prova.
    const letras = 'abcdefghijklmnopqrstuvwxyz'.replace('e', '')
    const palavras = Array.from({ length: N }, (_, i) => ({
      frente: `lote${letras[Math.floor(i / letras.length) % letras.length]}${letras[(i + 1) % letras.length]}`,
      verso: `definicao sem digito numero ${letras[i % letras.length]}`,
    }))
    const { deck } = await criarDeckComNotas(u, '-lote', palavras)

    // A PROPRIEDADE: importar não cria cartão nenhum — a fila do usuário continua vazia.
    const antes = await db.select().from(vocabCards).where(eqFn(vocabCards.userId, u))
    expect(antes).toHaveLength(0)

    const r1 = await vocabRepo.ativarLote(u, deck.id, 300)
    expect(r1.ativadas).toBe(300)
    expect(r1.restantes).toBe(200)

    const depois = await db.select().from(vocabCards).where(eqFn(vocabCards.userId, u))
    expect(depois).toHaveLength(300)
  })

  it('é IDEMPOTENTE: chamar duas vezes seguidas não projeta a mesma nota duas vezes', async () => {
    const u = asUserId('proj-lote-idem')
    const letras = 'abcdefghij'
    const palavras = Array.from({ length: 10 }, (_, i) => ({ frente: `idem${letras[i]}`, verso: `definicao sem digito ${letras[i]}` }))
    const { deck } = await criarDeckComNotas(u, '-idem', palavras)

    const r1 = await vocabRepo.ativarLote(u, deck.id, 300)
    expect(r1.ativadas).toBe(10)
    expect(r1.restantes).toBe(0)

    const r2 = await vocabRepo.ativarLote(u, deck.id, 300)
    expect(r2.ativadas).toBe(0)
    expect(r2.restantes).toBe(0)

    const cartoes = await db.select().from(vocabCards).where(eqFn(vocabCards.userId, u))
    expect(cartoes).toHaveLength(10)
  })
})

describe('dedupe entre baralhos — mesma palavra em DOIS baralhos', () => {
  it('vira 1 cartão, 2 ocorrências, e as duas notas apontam para o mesmo cartão', async () => {
    const u = asUserId('proj-dedup')
    const { deck: deckA } = await criarDeckComNotas(u, '-dedupA', [{ frente: 'runway', verso: 'pista de pouso' }])
    const { deck: deckB } = await criarDeckComNotas(u, '-dedupB', [{ frente: 'runway', verso: 'caixa de caixa' }])

    const notasA = await ankiRepo.listarNotas(u, deckA.id, {})
    const notasB = await ankiRepo.listarNotas(u, deckB.id, {})

    await vocabRepo.projetarDoAnki(u, deckA.id, notasA.itens.map((n: any) =>
      ({ id: n.id, frente: n.frente, verso: n.verso, exemplo: n.exemplo, motivoDaBaixa: n.motivoDaBaixa })), { srcLang: 'en' })
    const r2 = await vocabRepo.projetarDoAnki(u, deckB.id, notasB.itens.map((n: any) =>
      ({ id: n.id, frente: n.frente, verso: n.verso, exemplo: n.exemplo, motivoDaBaixa: n.motivoDaBaixa })), { srcLang: 'en' })

    expect(r2.criados).toBe(0)
    expect(r2.reaproveitados).toBe(1)

    const cartoes = (await vocabRepo.list(u)).filter((c: any) => c.word === 'runway')
    expect(cartoes).toHaveLength(1)
    const card = cartoes[0]
    const occ = await vocabRepo.ocorrencias(u, card.id)
    expect(occ).toHaveLength(2)
    expect(occ.map((o: any) => o.originRef).sort()).toEqual([deckA.id, deckB.id].sort())

    const notaFinalA = (await ankiRepo.listarNotas(u, deckA.id, {})).itens[0]
    const notaFinalB = (await ankiRepo.listarNotas(u, deckB.id, {})).itens[0]
    expect(notaFinalA.projectedCardId).toBe(card.id)
    expect(notaFinalB.projectedCardId).toBe(card.id)
  })
})

describe('a armadilha — reativação após desativação NÃO racha o histórico', () => {
  it('projetar → soft-delete (motivo_da_baixa=desativacao) → projetar de novo: MESMO id, review_logs intacto', async () => {
    const u = asUserId('proj-armadilha')
    const { deck } = await criarDeckComNotas(u, '-armadilha', [{ frente: 'churn', verso: 'evasão de clientes' }])
    const nota0 = (await ankiRepo.listarNotas(u, deck.id, {})).itens[0]

    const r1 = await vocabRepo.projetarDoAnki(u, deck.id,
      [{ id: nota0.id, frente: nota0.frente, verso: nota0.verso, exemplo: nota0.exemplo, motivoDaBaixa: null }],
      { srcLang: 'en' })
    expect(r1.criados).toBe(1)
    const cardOriginal = (await vocabRepo.list(u)).find((c: any) => c.word === 'churn')
    const cardIdOriginal = cardOriginal.id

    // Um review_log DE VERDADE, para provar que ele continua ligado ao cartão vivo depois.
    const logId = 'log-armadilha'
    await db.insert(reviewLogs).values({
      id: logId, createdAt: Date.now(), updatedAt: Date.now(), userId: u,
      cardId: cardIdOriginal, reviewedAt: Date.now(), grade: 3,
    })

    // Simula o que "desativar o baralho" faz ao cartão jogável (fora do escopo deste arquivo):
    // soft-delete com o motivo que autoriza reativação.
    await db.update(vocabCards).set({ deletedAt: Date.now(), updatedAt: Date.now() })
      .where(eqFn(vocabCards.id, cardIdOriginal))
    // `ankiRepo.desativarBaralho` é quem grava isto na nota, na integração real.
    await ankiRepo.desativarBaralho(u, deck.id)

    // Sem cartão vivo, `list()` não devolve mais 'churn'.
    expect((await vocabRepo.list(u)).find((c: any) => c.word === 'churn')).toBeUndefined()

    const notaAposDesativar = (await ankiRepo.listarNotas(u, deck.id, {})).itens[0]
    expect(notaAposDesativar.motivoDaBaixa).toBe('desativacao')

    const r2 = await vocabRepo.projetarDoAnki(u, deck.id, [{
      id: notaAposDesativar.id, frente: notaAposDesativar.frente, verso: notaAposDesativar.verso,
      exemplo: notaAposDesativar.exemplo, motivoDaBaixa: notaAposDesativar.motivoDaBaixa,
    }], { srcLang: 'en' })

    expect(r2.reativados).toBe(1)
    expect(r2.criados).toBe(0)

    const cardRessuscitado = (await vocabRepo.list(u)).find((c: any) => c.word === 'churn')
    expect(cardRessuscitado).toBeTruthy()
    expect(cardRessuscitado.id).toBe(cardIdOriginal) // MESMO id

    // review_logs continua ligado ao cartão vivo.
    const log = await db.select().from(reviewLogs).where(eqFn(reviewLogs.id, logId))
    expect(log[0].cardId).toBe(cardIdOriginal)

    // NENHUM cartão paralelo para a mesma palavra.
    const todosChurn = await db.select().from(vocabCards)
      .where(eqFn(vocabCards.userId, u))
    expect(todosChurn.filter((c: any) => c.word === 'churn')).toHaveLength(1)
  })

  it('deleção MANUAL (não desativação) ⇒ projetar de novo cria cartão NOVO', async () => {
    const u = asUserId('proj-manual')
    const { deck } = await criarDeckComNotas(u, '-manual', [{ frente: 'moat', verso: 'fosso competitivo' }])
    const nota0 = (await ankiRepo.listarNotas(u, deck.id, {})).itens[0]

    await vocabRepo.projetarDoAnki(u, deck.id,
      [{ id: nota0.id, frente: nota0.frente, verso: nota0.verso, exemplo: nota0.exemplo, motivoDaBaixa: null }],
      { srcLang: 'en' })
    const cardOriginal = (await vocabRepo.list(u)).find((c: any) => c.word === 'moat')

    // O USUÁRIO apagou o cartão manualmente — motivo_da_baixa NÃO é 'desativacao'.
    await db.update(vocabCards).set({ deletedAt: Date.now(), updatedAt: Date.now() })
      .where(eqFn(vocabCards.id, cardOriginal.id))

    const r2 = await vocabRepo.projetarDoAnki(u, deck.id,
      [{ id: nota0.id, frente: nota0.frente, verso: nota0.verso, exemplo: nota0.exemplo, motivoDaBaixa: 'manual' }],
      { srcLang: 'en' })

    expect(r2.criados).toBe(1)
    expect(r2.reativados).toBe(0)

    const cardNovo = (await vocabRepo.list(u)).find((c: any) => c.word === 'moat')
    expect(cardNovo.id).not.toBe(cardOriginal.id) // cartão NOVO, o antigo continua apagado

    const todos = await db.select().from(vocabCards).where(eqFn(vocabCards.userId, u))
    expect(todos.filter((c: any) => c.word === 'moat')).toHaveLength(2) // 1 vivo + 1 soft-deletado
  })
})

describe('S8 (auditoria) — word sem teto superior na projeção', () => {
  it('nota com "frente" de 250 caracteres NÃO projeta, e a nota grava motivoDescarte', async () => {
    const u = asUserId('proj-s8')
    const fraseLonga = 'palavra '.repeat(32).trim() // bem além de LIMITES_DO_BULK_ADD.max (200)
    expect(fraseLonga.length).toBeGreaterThan(200)
    const { deck } = await criarDeckComNotas(u, '-s8', [{ frente: fraseLonga, verso: 'definição' }])
    const notas = await ankiRepo.listarNotas(u, deck.id, {})

    const r = await vocabRepo.projetarDoAnki(u, deck.id, notas.itens.map((n: any) =>
      ({ id: n.id, frente: n.frente, verso: n.verso, exemplo: n.exemplo, motivoDaBaixa: n.motivoDaBaixa })),
      { srcLang: 'en', tgtLang: 'pt' })

    // Não virou cartão nenhum.
    expect(r.criados).toBe(0)
    expect(r.reaproveitados).toBe(0)
    expect(r.reativados).toBe(0)
    const cartao = (await vocabRepo.list(u)).find((c: any) => c.word === fraseLonga)
    expect(cartao).toBeUndefined()

    // A nota permanece no acervo, com o motivo de descarte gravado (não some do banco).
    const notaFinal = (await ankiRepo.listarNotas(u, deck.id, {})).itens[0]
    expect(notaFinal.motivoDescarte).toBe('palavra-longa')
    expect(notaFinal.estado).not.toBe('ativa')
  })

  it('palavra dentro do teto (200) continua projetando normalmente', async () => {
    const u = asUserId('proj-s8-ok')
    const { deck } = await criarDeckComNotas(u, '-s8ok', [{ frente: 'runway', verso: 'pista de pouso' }])
    const notas = await ankiRepo.listarNotas(u, deck.id, {})

    const r = await vocabRepo.projetarDoAnki(u, deck.id, notas.itens.map((n: any) =>
      ({ id: n.id, frente: n.frente, verso: n.verso, exemplo: n.exemplo, motivoDaBaixa: n.motivoDaBaixa })),
      { srcLang: 'en', tgtLang: 'pt' })

    expect(r.criados).toBe(1)
  })
})

describe('selecionarParaJogo — filtro por baralho', () => {
  it('com fonteRef="anki:<deckId>" devolve só os daquele baralho; sem fonteRef, devolve todos', async () => {
    const u = asUserId('proj-filtro')
    const { deck: deckA } = await criarDeckComNotas(u, '-filtroA', [{ frente: 'scale', verso: 'escalar negócio' }])
    const { deck: deckB } = await criarDeckComNotas(u, '-filtroB', [{ frente: 'bootstrap', verso: 'iniciar sem capital externo' }])

    await vocabRepo.ativarLote(u, deckA.id, 300)
    await vocabRepo.ativarLote(u, deckB.id, 300)

    const soDeckA = await vocabRepo.selecionarParaJogo(u, { fonte: 'baralho', fonteRef: `anki:${deckA.id}`, limite: 50 })
    expect(soDeckA.itens.map((i: any) => i.word)).toEqual(['scale'])

    const soDeckB = await vocabRepo.selecionarParaJogo(u, { fonte: 'baralho', fonteRef: `anki:${deckB.id}`, limite: 50 })
    expect(soDeckB.itens.map((i: any) => i.word)).toEqual(['bootstrap'])

    const semRef = await vocabRepo.selecionarParaJogo(u, { fonte: 'baralho', limite: 50 })
    const palavras = semRef.itens.map((i: any) => i.word).sort()
    expect(palavras).toEqual(['bootstrap', 'scale'])
  })
})
