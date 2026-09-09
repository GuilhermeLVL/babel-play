/**
 * O SELETOR FACETADO (`openspec/changes/seletor-facetado`) — o invariante central: para um
 * `filtro` dado, `selecionarParaJogo` devolve EXATAMENTE o subconjunto esperado, declarado à mão
 * abaixo — nunca "aproximadamente certo". União DENTRO de cada faceta (`fontes`), interseção
 * ENTRE facetas (`idiomas`, `recorte`, `midia`).
 *
 * Acervo semeado (um usuário só, `filtro-u1`), 8 cartões cobrindo a matriz fonte×idioma×due×nível:
 *
 *   id  palavra   idioma  origem          due            nível  back   sentence
 *   c1  apple     en      trilha          NULL (nunca)   A1     'x'    's1'
 *   c2  banana    en      anki:deckA      vencido        A2     NULL   's2'
 *   c3  cherry    en      anki:deckB      futuro         B1     'b3'   NULL
 *   c4  maçã      pt      sessão s1       futuro         B1     'b4'   's4'
 *   c5  laranja   pt      manual          NULL (nunca)   ausente NULL  NULL
 *   c6  ringo     ja      anki:deckA      vencido        A1     'b6'   's6'
 *   c7  budou     ja      trilha          futuro         C1     'b7'   's7'
 *   c8  momo      en      anki:deckB      futuro         A2     NULL   NULL
 *
 * `selecionarParaJogo` devolve até `limite*3` cartões (sem paginação): com 8 cartões e limite
 * generoso, `itens` cobre o conjunto inteiro do WHERE — comparamos por `word` (chave legível).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let vocabRepo: any
let db: any
let vocabCards: any
let vocabOccurrences: any
let sessions: any

const U = asUserId('filtro-u1')
const DECK_A = 'deckA-facetado'
const DECK_B = 'deckB-facetado'
let sessaoId: string

const palavras = new Map<string, string>() // word -> cardId

function porNomes(itens: Array<{ word: string }>): string[] {
  return itens.map((i) => i.word).sort()
}

/**
 * Semeadura DIRETA no banco, não via `bulkAdd`. `bulkAdd` aplica a régua de qualidade de
 * `avaliarCartao` (rejeita cartão sem tradução E sem frase, entre outras regras) — legítimo para
 * quem entra pela ENTRADA de cartões, mas este arquivo testa `selecionarParaJogo`, que lê os
 * dados já gravados sem se importar por onde entraram. Inserir direto dá controle exato sobre a
 * matriz (inclusive a combinação "sem back e sem sentence", que `bulkAdd` recusaria) sem
 * confundir o resultado com a régua de outro repositório.
 */
async function semear(
  userId: string,
  c: {
    word: string
    srcLang: string
    back: string | null
    sentence: string | null
    cefrLevel: string | null
    dueAt: number | null
    origem: { kind: string; ref: string | null }
  },
) {
  const now = Date.now()
  const id = randomUUID()
  await db.insert(vocabCards).values({
    id,
    createdAt: now,
    updatedAt: now,
    userId,
    word: c.word,
    back: c.back,
    sentence: c.sentence,
    srcLang: c.srcLang,
    tgtLang: 'pt',
    inDeck: 1,
    box: 1,
    dueAt: c.dueAt,
    addedAt: now,
    normKey: `${c.srcLang}|${c.word}`,
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    cefrLevel: c.cefrLevel,
    cefrSource: c.cefrLevel ? 'curado' : 'ausente',
  })
  await db.insert(vocabOccurrences).values({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    userId,
    cardId: id,
    occurredAt: now,
    originKind: c.origem.kind,
    originRef: c.origem.ref,
    sentence: c.sentence,
  })
  palavras.set(c.word, id)
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  vocabRepo = (await import('../../server/db/repositories/vocab')).vocabRepo
  ;({ db } = await h.load('../../server/db/db'))
  ;({ vocabCards, vocabOccurrences, sessions } = await h.load('../../server/db/schema'))

  const now = Date.now()
  const passado = now - 86_400_000
  const futuro = now + 86_400_000
  sessaoId = 'sessao-facetado-1'
  await db.insert(sessions).values({
    id: sessaoId,
    createdAt: now,
    updatedAt: now,
    userId: U,
    title: 'Sessão do filtro facetado',
    kind: 'live',
  })

  await semear(U, {
    word: 'apple',
    srcLang: 'en',
    back: 'x',
    sentence: 's1',
    cefrLevel: 'A1',
    dueAt: null,
    origem: { kind: 'trilha', ref: 'en' },
  })
  await semear(U, {
    word: 'banana',
    srcLang: 'en',
    back: null,
    sentence: 's2',
    cefrLevel: 'A2',
    dueAt: passado,
    origem: { kind: 'anki', ref: DECK_A },
  })
  await semear(U, {
    word: 'cherry',
    srcLang: 'en',
    back: 'b3',
    sentence: null,
    cefrLevel: 'B1',
    dueAt: futuro,
    origem: { kind: 'anki', ref: DECK_B },
  })
  await semear(U, {
    word: 'maçã',
    srcLang: 'pt',
    back: 'b4',
    sentence: 's4',
    cefrLevel: 'B1',
    dueAt: futuro,
    origem: { kind: 'sessao', ref: sessaoId },
  })
  await semear(U, {
    word: 'laranja',
    srcLang: 'pt',
    back: null,
    sentence: null,
    cefrLevel: null,
    dueAt: null,
    origem: { kind: 'manual', ref: null },
  })
  await semear(U, {
    word: 'ringo',
    srcLang: 'ja',
    back: 'b6',
    sentence: 's6',
    cefrLevel: 'A1',
    dueAt: passado,
    origem: { kind: 'anki', ref: DECK_A },
  })
  await semear(U, {
    word: 'budou',
    srcLang: 'ja',
    back: 'b7',
    sentence: 's7',
    cefrLevel: 'C1',
    dueAt: futuro,
    origem: { kind: 'trilha', ref: 'ja' },
  })
  await semear(U, {
    word: 'momo',
    srcLang: 'en',
    back: null,
    sentence: null,
    cefrLevel: 'A2',
    dueAt: futuro,
    origem: { kind: 'anki', ref: DECK_B },
  })
})
afterAll(async () => {
  await h?.cleanup?.()
})

/**
 * O FILTRO CHEGA AO SERVIDOR (change `filtro-facetado-chega-ao-servidor`, auditoria A17).
 *
 * As duas pontas existiam e não se falavam: `compor` montava o pedido e `caminhoDaComposicao`
 * nunca serializava `filtro`, então o ramo facetado abaixo só rodava quando chamado direto no
 * repositório — como nos testes desta suíte — e nunca a partir da tela. Aqui o transporte é a
 * própria rota Express em processo: `compor` → `GET|POST /api/vocab/para-jogo` → repositório.
 */
describe('compor → rota → selecionarParaJogo — o filtro viaja de ponta a ponta', () => {
  let compor: any
  let handlers: { get: any; post: any }

  function fakeRes() {
    const r: any = { statusCode: 200, body: undefined }
    r.status = (c: number) => {
      r.statusCode = c
      return r
    }
    r.json = (b: any) => {
      r.body = b
      return r
    }
    return r
  }

  /** Transporte que invoca o handler registrado no router, sem subir servidor. */
  const transporte = async (caminho: string, init?: { method: 'POST'; body: string }) => {
    const url = new URL(`http://x${caminho}`)
    const query: Record<string, string> = {}
    url.searchParams.forEach((v, k) => {
      query[k] = v
    })
    const req: any = { userId: U, path: url.pathname, query, body: init ? JSON.parse(init.body) : {} }
    const res = fakeRes()
    await (init ? handlers.post : handlers.get)(req, res)
    if (res.statusCode !== 200) throw new Error(`http ${res.statusCode}: ${JSON.stringify(res.body)}`)
    return res.body
  }

  beforeAll(async () => {
    ;({ compor } = await h.load('../../src/core/minigames/composicao'))
    const { vocabRouter } = (await h.load('../../server/routes/vocab')) as any
    const camada = (metodo: 'get' | 'post') =>
      vocabRouter.stack.find((l: any) => l.route?.path === '/para-jogo' && l.route?.methods?.[metodo]).route.stack[0]
        .handle
    handlers = { get: camada('get'), post: camada('post') }
  })

  it('GET: o filtro por baralho recorta no servidor, não só no fallback local', async () => {
    const r = await compor(
      { jogo: 'memory', fonte: { id: 'baralho' }, limite: 50, filtro: { fontes: ['baralho'], baralhos: [DECK_A] } },
      [],
      transporte,
    )
    expect(r.origemDaComposicao).toBe('servidor')
    expect(porNomes(r.itens)).toEqual(['banana', 'ringo'])
  })

  it('GET: fontes:[trilha] + idiomas:[ja] — interseção calculada no servidor', async () => {
    const r = await compor(
      { jogo: 'memory', fonte: { id: 'baralho' }, limite: 50, filtro: { fontes: ['trilha'], idiomas: ['ja'] } },
      [],
      transporte,
    )
    expect(r.origemDaComposicao).toBe('servidor')
    expect(porNomes(r.itens)).toEqual(['budou'])
  })

  it('GET: fontes:[sessao] com a sessão pedida — e `fonte: baralho` no pedido NÃO manda', async () => {
    // Precedência: `fonte/fonteRef/lang` viajam como proveniência; com `filtro`, o recorte é dele.
    const r = await compor(
      {
        jogo: 'memory',
        fonte: { id: 'baralho', lang: 'en' },
        limite: 50,
        filtro: { fontes: ['sessao'], sessoes: [sessaoId] },
      },
      [],
      transporte,
    )
    expect(r.origemDaComposicao).toBe('servidor')
    expect(porNomes(r.itens)).toEqual(['maçã'])
  })

  it('GET: recorte.pedindoRevisao — o servidor devolve só os vencidos', async () => {
    const r = await compor(
      {
        jogo: 'memory',
        fonte: { id: 'baralho' },
        limite: 50,
        filtro: { fontes: ['trilha', 'sessao', 'baralho'], recorte: { pedindoRevisao: true } },
      },
      [],
      transporte,
    )
    expect(r.origemDaComposicao).toBe('servidor')
    expect(porNomes(r.itens)).toEqual(['banana', 'ringo'])
  })

  it('POST: um filtro grande demais para a URL vai no corpo e o servidor responde igual', async () => {
    // 200 ids de "difíceis" com 40 chars cada passam do teto da query: o pedido vira POST.
    const dificeisIds = Array.from({ length: 200 }, (_, i) => `id-${String(i).padStart(36, '0')}`)
    dificeisIds[0] = palavras.get('banana')!
    const r = await compor(
      {
        jogo: 'memory',
        fonte: { id: 'baralho' },
        limite: 50,
        filtro: { fontes: ['baralho'], baralhos: [DECK_A], recorte: { dificeisIds } },
      },
      [],
      transporte,
    )
    expect(r.origemDaComposicao).toBe('servidor')
    expect(porNomes(r.itens)).toEqual(['banana'])
  })
})

describe('selecionarParaJogo(filtro) — o invariante de paridade', () => {
  it('fontes:[trilha] sozinha — só trilha, os dois idiomas', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: ['trilha'] } })
    expect(porNomes(r.itens)).toEqual(['apple', 'budou'])
  })

  it('fontes:[baralho], baralhos:[deckA] — só o baralho A, deckB não vaza', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: ['baralho'], baralhos: [DECK_A] } })
    expect(porNomes(r.itens)).toEqual(['banana', 'ringo'])
  })

  it('fontes:[baralho], baralhos:[deckB] — só o baralho B, deckA não vaza', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: ['baralho'], baralhos: [DECK_B] } })
    expect(porNomes(r.itens)).toEqual(['cherry', 'momo'])
  })

  it('fontes:[trilha, baralho] sem baralhos — UNIÃO = acervo inteiro (baralho sem ref = "não é trilha")', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: ['trilha', 'baralho'] } })
    expect(porNomes(r.itens)).toEqual(['apple', 'banana', 'budou', 'cherry', 'laranja', 'maçã', 'momo', 'ringo'])
  })

  it('fontes:[sessao], sessoes:[s1] — só a sessão pedida', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: ['sessao'], sessoes: [sessaoId] } })
    expect(porNomes(r.itens)).toEqual(['maçã'])
  })

  it('idiomas:[en] com todas as fontes — interseção por idioma', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], idiomas: ['en'] },
    })
    expect(porNomes(r.itens)).toEqual(['apple', 'banana', 'cherry', 'momo'])
  })

  it('recorte.nuncaVistas — só due IS NULL', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], recorte: { nuncaVistas: true } },
    })
    expect(porNomes(r.itens)).toEqual(['apple', 'laranja'])
  })

  it('recorte.pedindoRevisao — due vencido, EXCLUI due NULL', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], recorte: { pedindoRevisao: true } },
    })
    const nomes = porNomes(r.itens)
    expect(nomes).toEqual(['banana', 'ringo'])
    expect(nomes).not.toContain('apple') // due NULL não é "vencido"
    expect(nomes).not.toContain('laranja')
  })

  it('recorte.niveis — nível CEFR exato', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], recorte: { niveis: ['B1'] } },
    })
    expect(porNomes(r.itens)).toEqual(['cherry', 'maçã'])
  })

  it('recorte.dificeisIds — recorte manual por id, um cartão só', async () => {
    const alvo = palavras.get('momo')!
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], recorte: { dificeisIds: [alvo] } },
    })
    expect(porNomes(r.itens)).toEqual(['momo'])
  })

  it('midia.comTraducao — só cartões com back preenchido', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], midia: { comTraducao: true } },
    })
    expect(porNomes(r.itens)).toEqual(['apple', 'budou', 'cherry', 'maçã', 'ringo'])
  })

  it('midia.comFrase — só cartões com sentence preenchida', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['trilha', 'sessao', 'baralho'], midia: { comFrase: true } },
    })
    expect(porNomes(r.itens)).toEqual(['apple', 'banana', 'budou', 'maçã', 'ringo'])
  })

  it('filtro vazio de fontes é recusado — Zod exige >=1 (contrato da rota, não do repositório)', async () => {
    // O repositório não valida `fontes` vazio (é o Zod da rota quem recusa); aqui, no
    // repositório puro, `fontes: []` produz um WHERE sem nenhum membro de origem — union
    // vazia — e não deve nunca devolver linha alguma, por segurança de composição do SQL.
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, filtro: { fontes: [] } })
    expect(r.itens).toEqual([])
  })
})

describe('paridade com os chamadores ANTIGOS (fonte/fonteRef, sem filtro)', () => {
  it('fonte:"baralho", fonteRef:"anki:<deckA>" — mesmo conjunto que o filtro equivalente', async () => {
    const antigo = await vocabRepo.selecionarParaJogo(U, { limite: 50, fonte: 'baralho', fonteRef: `anki:${DECK_A}` })
    const novo = await vocabRepo.selecionarParaJogo(U, {
      limite: 50,
      filtro: { fontes: ['baralho'], baralhos: [DECK_A] },
    })
    expect(porNomes(antigo.itens)).toEqual(porNomes(novo.itens))
    expect(porNomes(antigo.itens)).toEqual(['banana', 'ringo'])
  })

  it('fonte:"trilha" — mesmo conjunto que filtro fontes:[trilha]', async () => {
    const antigo = await vocabRepo.selecionarParaJogo(U, { limite: 50, fonte: 'trilha' })
    expect(porNomes(antigo.itens)).toEqual(['apple', 'budou'])
  })

  it('sem fonte (default) — exclui trilha, o comportamento "minhas gravações" intocado', async () => {
    const antigo = await vocabRepo.selecionarParaJogo(U, { limite: 50 })
    const nomes = porNomes(antigo.itens)
    expect(nomes).not.toContain('apple')
    expect(nomes).not.toContain('budou')
    expect(nomes).toEqual(['banana', 'cherry', 'laranja', 'maçã', 'momo', 'ringo'])
  })

  it('lang continua funcionando (coluna sargável nova, mesma semântica)', async () => {
    const r = await vocabRepo.selecionarParaJogo(U, { limite: 50, lang: 'en' })
    const nomes = porNomes(r.itens)
    // "minhas gravações" (exclui trilha) ∩ idioma en
    expect(nomes).toEqual(['banana', 'cherry', 'momo'])
  })
})

/**
 * O INVARIANTE CENTRAL DO DESENHO, cruzado de verdade: o SQL do servidor e o predicado puro do
 * cliente (`passaNoFiltro`) são A MESMA verdade. Os blocos acima comparam o SQL com expectativas
 * declaradas à mão; este compara o SQL com o PRÓPRIO predicado, sobre os mesmos cartões — se um
 * dos lados mudar de semântica sozinho (a classe de defeito que fez o filtro de idioma divergir
 * entre telas neste projeto), este teste quebra na hora, sem depender de alguém lembrar de
 * atualizar duas listas de expectativas em paralelo.
 */
describe('paridade SQL × passaNoFiltro — a mesma verdade dos dois lados', () => {
  it('dez filtros representativos devolvem conjuntos idênticos', async () => {
    const { passaNoFiltro, FILTRO_PADRAO } = await import('../../src/core/minigames/filtro')
    const { eq: eqFn } = await import('drizzle-orm')
    const { filtroParaComposicao } = await import('../../src/core/minigames/composicao')

    // O espelho cliente dos cartões semeados — o mesmo shape que o payload do deck carrega.
    const linhas = await db.select().from(vocabCards).where(eqFn(vocabCards.userId, U))
    const occs = await db.select().from(vocabOccurrences).where(eqFn(vocabOccurrences.userId, U))
    const occsPorCartao = new Map<string, Array<{ kind: string; ref: string | null }>>()
    for (const o of occs) {
      const lista = occsPorCartao.get(o.cardId) ?? []
      lista.push({ kind: o.originKind, ref: o.originRef })
      occsPorCartao.set(o.cardId, lista)
    }
    /* O tipo tem de estar escrito aqui: `db` e um `any` do harness efemero, entao `linhas` chega
       como `any` e o `.filter((c) => ...)` la embaixo ficaria com parametro implicito. */
    type CartaoCliente = {
      word: string
      daTrilha: boolean
      daAnki: boolean
      baralhosAnki: string[]
      sourceSessionId: string | undefined
      srcLang: string | undefined
      cefrLevel: string | undefined
      translation: string | undefined
      sentence: string | undefined
      dueAtMs: number | null
    }
    const clientes: CartaoCliente[] = linhas.map((l: any) => {
      const minhas = occsPorCartao.get(l.id) ?? []
      return {
        word: l.word as string,
        daTrilha: minhas.some((o) => o.kind === 'trilha'),
        daAnki: minhas.some((o) => o.kind === 'anki'),
        baralhosAnki: minhas.filter((o) => o.kind === 'anki' && o.ref).map((o) => o.ref as string),
        sourceSessionId: minhas.find((o) => o.kind === 'sessao')?.ref ?? undefined,
        srcLang: l.srcLang ?? undefined,
        cefrLevel: l.cefrLevel ?? undefined,
        translation: l.back ?? undefined,
        sentence: l.sentence ?? undefined,
        dueAtMs: l.dueAt ?? null,
      }
    })

    const agora = Date.now()
    const casos = [
      { ...FILTRO_PADRAO, fontes: ['trilha' as const] },
      { ...FILTRO_PADRAO, fontes: ['sessao' as const] },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const] },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const], baralhos: [DECK_A] },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const, 'trilha' as const], idiomas: ['ja'] },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const], idiomas: ['en'] },
      {
        ...FILTRO_PADRAO,
        fontes: ['baralho' as const, 'sessao' as const, 'trilha' as const],
        recorte: { pedindoRevisao: true },
      },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const, 'trilha' as const], recorte: { nuncaVistas: true } },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const], midia: { comTraducao: true } },
      { ...FILTRO_PADRAO, fontes: ['baralho' as const, 'trilha' as const], recorte: { niveis: ['A1', 'B1'] } },
    ]

    for (const filtro of casos) {
      const doSql = await vocabRepo.selecionarParaJogo(U, {
        jogo: 'memory',
        limite: 200,
        filtro: filtroParaComposicao(filtro as never),
      })
      const doPredicado = clientes
        .filter((c) => passaNoFiltro(c as never, filtro as never, { agora }))
        .map((c) => c.word)
        .sort()
      expect(porNomes(doSql.itens ?? doSql), JSON.stringify(filtro)).toEqual(doPredicado)
    }
  })
})
