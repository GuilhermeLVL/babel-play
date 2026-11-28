/**
 * PROGRESSO POR BARALHO (openspec `motor-anki-jogos`, 4.4): `GET /api/anki/decks` devolve `praticadas` por `deckId`, o
 * "praticado" de "praticado/total" da tela do baralho. Ativar não é praticar: só conta a nota cujo cartão projetado tem
 * pelo menos uma revisão (`vocab_cards.reps > 0`). Cada baralho conta o seu, e o de outra conta nunca entra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let ankiRepo: any
let db: any
let eqFn: any
let ankiNotes: any
let vocabCards: any
let asUserId: (id: string) => any

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
  ;({ ankiRepo } = await s.load('../../server/db/repositories/anki'))
  ;({ db } = await s.load('../../server/db/db'))
  ;({ eq: eqFn } = await s.load('drizzle-orm'))
  ;({ ankiNotes, vocabCards } = await s.load('../../server/db/schema'))
  ;({ asUserId } = await s.load('../../server/lib/authContext'))
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

const DONO = () => asUserId(process.env.LOCAL_OWNER_ID || 'local-owner')

/** Um baralho com `n` notas; `reps[i]` é o número de revisões do cartão projetado da nota i (`null` = sem cartão). */
async function baralhoComNotas(userId: any, nome: string, reps: Array<number | null>) {
  const deck = await ankiRepo.criarOuAcharDeck(userId, { nome, arquivoOrigem: `${nome}.apkg` })
  const imp = await ankiRepo.criarImport(userId, { deckId: deck.id, arquivo: `${nome}.apkg`, bytes: 1 })
  await ankiRepo.gravarNotas(
    userId,
    deck.id,
    imp.id,
    reps.map((_, i) => ({ guid: `${nome}-${i}`, frente: `palavra${i}`, verso: `traducao${i}` })),
  )
  const { itens } = await ankiRepo.listarNotas(userId, deck.id, { limite: 500 })
  for (const [i, r] of reps.entries()) {
    if (r === null) continue
    const nota = itens.find((n: any) => n.guid === `${nome}-${i}`)
    const cardId = `card-${nome}-${i}`
    await db.insert(vocabCards).values({
      id: cardId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId,
      word: `palavra${i}`,
      normKey: `en|${nome}-palavra${i}`,
      occurrences: 1,
      reps: r,
    })
    await db.update(ankiNotes).set({ estado: 'ativa', projectedCardId: cardId }).where(eqFn(ankiNotes.id, nota.id))
  }
  return deck as { id: string }
}

async function listar() {
  const r = await s.get('/api/anki/decks')
  expect(r.status).toBe(200)
  return (await r.json()) as Array<{ id: string; total: number; ativas: number; praticadas: number }>
}

describe('GET /api/anki/decks › praticadas', () => {
  it('conta só a nota cujo cartão foi revisado: ativada sem revisão e arquivada não contam', async () => {
    // 5 notas: duas praticadas (reps 3 e 1), uma ativada e nunca praticada (reps 0), uma sem reps, uma arquivada.
    const deck = await baralhoComNotas(DONO(), 'progresso-um', [3, 1, 0, null, null])
    const d = (await listar()).find((x) => x.id === deck.id)!
    expect(d.total).toBe(5)
    expect(d.ativas).toBe(3)
    expect(d.praticadas).toBe(2)
  })

  it('cada baralho conta o seu, e baralho sem nenhuma revisão devolve 0 (não undefined)', async () => {
    const a = await baralhoComNotas(DONO(), 'progresso-a', [2, 2])
    const b = await baralhoComNotas(DONO(), 'progresso-b', [0, 0, 0])
    const lista = await listar()
    expect(lista.find((x) => x.id === a.id)!.praticadas).toBe(2)
    expect(lista.find((x) => x.id === b.id)!.praticadas).toBe(0)
  })

  it('o cartão revisado de outra conta não entra na contagem', async () => {
    const alheio = await baralhoComNotas(asUserId('anki-progresso-outro'), 'progresso-alheio', [5])
    expect((await listar()).find((x) => x.id === alheio.id)).toBeUndefined()
    const meu = await baralhoComNotas(DONO(), 'progresso-meu', [null])
    expect((await listar()).find((x) => x.id === meu.id)!.praticadas).toBe(0)
  })
})
