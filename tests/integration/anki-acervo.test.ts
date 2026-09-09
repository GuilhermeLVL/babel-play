/**
 * Motor Anki — acervo (`openspec/changes/motor-anki-acervo`, tasks 1 e 2).
 *
 * O acervo é o registro CANÔNICO das notas de um `.apkg`, independente de virarem cartão
 * jogável. Estes testes cobrem a garantia central: reimportar nunca duplica e nunca apaga —
 * "sumiu do arquivo" é um ESTADO (`ausente_no_arquivo`), não uma deleção.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const U = asUserId('anki-user')

let h: EphemeralDb
let ankiRepo: any
let db: any
let reviewLogs: any
let vocabCards: any
let ankiNotesTable: any
let eqFn: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ankiRepo = (await import('../../server/db/repositories/anki')).ankiRepo
  ;({ db } = await h.load('../../server/db/db'))
  ;({ reviewLogs, vocabCards, ankiNotes: ankiNotesTable } = await h.load('../../server/db/schema'))
  ;({ eq: eqFn } = await import('drizzle-orm'))
})
afterAll(async () => {
  await h?.cleanup?.()
})

async function criarDeckEImport(userId = U, sufixo = '') {
  const deck = await ankiRepo.criarOuAcharDeck(userId, {
    nome: `Core 2k${sufixo}`,
    nomeNoArquivo: 'Core 2000',
    arquivoOrigem: `core2k${sufixo}.apkg`,
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
  })
  const imp = await ankiRepo.criarImport(userId, { deckId: deck.id, arquivo: `core2k${sufixo}.apkg`, bytes: 1024 })
  return { deck, imp }
}

describe('criarOuAcharDeck — idempotente por (userId, arquivoOrigem, nome)', () => {
  it('reimportar o mesmo arquivo/nome acha o MESMO deck, não cria um paralelo', async () => {
    const a = await ankiRepo.criarOuAcharDeck(U, { nome: 'Meu Baralho', arquivoOrigem: 'x.apkg' })
    const b = await ankiRepo.criarOuAcharDeck(U, { nome: 'Meu Baralho', arquivoOrigem: 'x.apkg' })
    expect(b.id).toBe(a.id)
  })
})

describe('gravarNotas — upsert por (deckId, guid)', () => {
  it('gravar 2x a mesma leva NÃO duplica, e a 2ª chamada reporta "iguais" (nada mudou)', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-dup')
    const notas = [
      { guid: 'g1', frente: 'ledger', verso: 'livro-razão', notetype: 'Basic' },
      { guid: 'g2', frente: 'churn', verso: 'evasão', notetype: 'Basic' },
    ]
    const r1 = await ankiRepo.gravarNotas(U, deck.id, imp.id, notas)
    expect(r1.novas).toBe(2)
    expect(r1.atualizadas).toBe(0)

    const r2 = await ankiRepo.gravarNotas(U, deck.id, imp.id, notas)
    expect(r2.novas).toBe(0)
    expect(r2.iguais).toBe(2)
    expect(r2.atualizadas).toBe(0)

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.total).toBe(2)
  })

  it('nota com conteúdo mudado é reportada como "atualizada", não como nova', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-upd')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger', verso: 'livro-razão' }])
    const r2 = await ankiRepo.gravarNotas(U, deck.id, imp.id, [
      { guid: 'g1', frente: 'ledger', verso: 'livro contábil' },
    ])
    expect(r2.novas).toBe(0)
    expect(r2.atualizadas).toBe(1)

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.itens[0].verso).toBe('livro contábil')
  })

  it('camposBrutos sobrevive ÍNTEGRO, mesmo com campo que o app não usa', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-campos')
    const campos = { Front: 'ledger', Back: 'livro-razão', Notes: 'campo que o app ignora', Extra: '<b>html</b>' }
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger', camposBrutos: campos }])

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    const salvo = JSON.parse(pagina.itens[0].camposBrutos)
    expect(salvo).toEqual(campos)
  })
})

describe('marcarAusentes — nota some do arquivo, nunca é apagada', () => {
  it('nota fora da lista de guids presentes vira ausente_no_arquivo, e continua no banco', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-ausente')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [
      { guid: 'g1', frente: 'ledger' },
      { guid: 'g2', frente: 'churn' },
    ])

    const n = await ankiRepo.marcarAusentes(U, deck.id, ['g1']) // só g1 continua no arquivo
    expect(n).toBe(1)

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.total).toBe(2) // NADA foi apagado
    const churn = pagina.itens.find((x: any) => x.guid === 'g2')
    expect(churn.estado).toBe('ausente_no_arquivo')
    const ledger = pagina.itens.find((x: any) => x.guid === 'g1')
    expect(ledger.estado).not.toBe('ausente_no_arquivo')
  })

  it('nota que REAPARECE num reimport sai de ausente_no_arquivo', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-reaparece')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger' }])
    await ankiRepo.marcarAusentes(U, deck.id, []) // arquivo reenviado sem nenhuma nota reconhecida
    let pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.itens[0].estado).toBe('ausente_no_arquivo')

    // O Anki devolveu a nota no import seguinte.
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger' }])
    pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.itens[0].estado).not.toBe('ausente_no_arquivo')
  })
})

describe('desativarBaralho — arquiva sem apagar', () => {
  it('deck vira desativado, notas viram arquivada, nada é deletado', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-desativa')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [
      { guid: 'g1', frente: 'ledger' },
      { guid: 'g2', frente: 'churn' },
    ])
    await ankiRepo.desativarBaralho(U, deck.id)

    const decks = await ankiRepo.listarBaralhos(U)
    const d = decks.find((x: any) => x.id === deck.id)
    expect(d.estado).toBe('desativado')
    expect(d.total).toBe(2)

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.total).toBe(2)
    expect(pagina.itens.every((n: any) => n.estado === 'arquivada')).toBe(true)
  })

  it('nota com cartão projetado ganha motivo_da_baixa=desativacao', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-baixa')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger' }])
    const pagina0 = await ankiRepo.listarNotas(U, deck.id, {})
    // Simula a projeção (Fase 3, fora deste change): a nota ganhou um cartão jogável.
    const cardId = 'card-simulado'
    await db.insert(vocabCards).values({
      id: cardId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: U,
      word: 'ledger',
      normKey: 'en|ledger',
      occurrences: 1,
    })
    await db.update(ankiNotesTable).set({ projectedCardId: cardId }).where(eqFn(ankiNotesTable.id, pagina0.itens[0].id))

    await ankiRepo.desativarBaralho(U, deck.id)
    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.itens[0].motivoDaBaixa).toBe('desativacao')
  })
})

describe('purgarBaralho — apaga notas e deck; review_logs intocado', () => {
  it('apaga notas e deck, mas NÃO toca review_logs de um cartão qualquer', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-purga')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'g1', frente: 'ledger' }])

    // Um review_log independente, para provar que a purga não varre a tabela errada.
    const cardId = 'card-purga-teste'
    await db.insert(vocabCards).values({
      id: cardId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: U,
      word: 'sentinela',
      normKey: 'en|sentinela',
      occurrences: 1,
    })
    const logId = 'log-purga-teste'
    await db.insert(reviewLogs).values({
      id: logId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: U,
      cardId,
      reviewedAt: Date.now(),
      grade: 3,
    })

    await ankiRepo.purgarBaralho(U, deck.id)

    const pagina = await ankiRepo.listarNotas(U, deck.id, {})
    expect(pagina.total).toBe(0)
    const decks = await ankiRepo.listarBaralhos(U)
    expect(decks.find((d: any) => d.id === deck.id)).toBeUndefined()

    const logAinda = await db.select().from(reviewLogs).where(eqFn(reviewLogs.id, logId))
    expect(logAinda).toHaveLength(1) // review_logs NUNCA é tocado pela purga
  })
})

describe('listarBaralhos — contagens', () => {
  it('ausente e descartada são contadas SEPARADAMENTE — somá-las mentiria na tela', async () => {
    // Sumir do arquivo não é defeito de qualidade: uma tela que juntasse as duas contagens mandaria
    // a pessoa procurar conserto onde não há nada quebrado.
    const { deck, imp } = await criarDeckEImport(U, '-contagens')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [
      { guid: 'g1', frente: 'a' },
      { guid: 'g2', frente: 'b' },
      { guid: 'g3', frente: 'c' },
      { guid: 'g4', frente: 'd', motivoDescarte: 'pista-ruim' },
    ])
    await ankiRepo.marcarAusentes(U, deck.id, ['g1', 'g2', 'g4']) // g3 some do arquivo

    const decks = await ankiRepo.listarBaralhos(U)
    const d = decks.find((x: any) => x.id === deck.id)
    expect(d.total).toBe(4)
    expect(d.arquivadas).toBe(3)
    expect(d.ausentes).toBe(1) // g3: sumiu do arquivo
    expect(d.descartadas).toBe(1) // g4: a régua recusou — acionável, e nada a ver com g3
    expect(d.ativas).toBe(0)
  })
})

describe('reimportar um baralho DESATIVADO o traz de volta', () => {
  it('sem isto, desativar era uma porta só de ida — não havia como reativar', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-revolta')
    await ankiRepo.gravarNotas(U, deck.id, imp.id, [{ guid: 'v1', frente: 'ledger', verso: 'razao' }])
    await ankiRepo.desativarBaralho(U, deck.id)
    expect((await ankiRepo.listarBaralhos(U)).find((d: any) => d.id === deck.id)!.estado).toBe('desativado')

    // Reimportar o MESMO arquivo é o pedido de volta: ninguém sobe de novo o que quer desligado.
    const voltou = await ankiRepo.criarOuAcharDeck(U, {
      nome: deck.nome,
      arquivoOrigem: deck.arquivoOrigem,
      nomeNoArquivo: deck.nomeNoArquivo,
    })
    expect(voltou.id).toBe(deck.id) // o MESMO baralho, não um paralelo
    expect(voltou.estado).toBe('ativo')
    expect((await ankiRepo.listarBaralhos(U)).find((d: any) => d.id === deck.id)!.estado).toBe('ativo')
  })
})

describe('listarNotas — paginação por cursor não repete item', () => {
  it('percorrer em páginas de 5 devolve todas as 12 notas, sem repetição', async () => {
    const { deck, imp } = await criarDeckEImport(U, '-cursor')
    const notas = Array.from({ length: 12 }, (_, i) => ({ guid: `g${i}`, frente: `palavra${i}` }))
    // Grava uma a uma para garantir created_at estritamente crescente (o cursor ordena por ele).
    for (const n of notas) {
      await ankiRepo.gravarNotas(U, deck.id, imp.id, [n])
      await new Promise((r) => setTimeout(r, 2))
    }

    const vistos = new Set<string>()
    /* O cursor e OPACO desde 07/09: quem pagina devolve exatamente o que recebeu, sem conhecer
       a forma interna. Era `{ valor, id }` no servidor e `string` no cliente (achado A21). */
    let cursor: string | null = null
    let paginas = 0
    do {
      // `ankiRepo` e `any` no harness, entao a forma da pagina precisa estar escrita aqui
      // (e o mesmo contrato declarado em `listarNotas`).
      const pagina: { itens: Array<{ id: string }>; proximoCursor: string | null } = await ankiRepo.listarNotas(
        U,
        deck.id,
        { limite: 5, cursor },
      )
      for (const it of pagina.itens) {
        expect(vistos.has(it.id)).toBe(false)
        vistos.add(it.id)
      }
      cursor = pagina.proximoCursor
      paginas++
      expect(paginas).toBeLessThan(10) // guarda contra loop infinito em caso de bug
    } while (cursor)

    expect(vistos.size).toBe(12)
  })
})
