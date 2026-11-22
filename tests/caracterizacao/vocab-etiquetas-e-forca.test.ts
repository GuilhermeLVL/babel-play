/**
 * ETIQUETAS DO USUÁRIO e FORÇA 1–4 nas rotas do vocabulário (openspec `vocab-forca-e-etiquetas`):
 * `PUT /api/vocab/:id/etiquetas`, `GET /api/vocab/etiquetas`, os filtros e ordens de `GET /api/vocab/pagina`,
 * a força no histórico da palavra e a exportação da conta.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

let s: AppDeTeste
let ta: string
let tb: string
let db: any

beforeAll(async () => {
  s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
  ta = await s.token('etq-a')
  tb = await s.token('etq-b')
  ;({ db } = await import('../../server/db/db'))
}, 60_000)
afterAll(async () => {
  await s?.encerrar()
})

async function novo(word: string, token = ta): Promise<string> {
  const r = await s.post('/api/vocab/bulk-add', { cards: [{ word, srcLang: 'en', back: `sentido de ${word}` }] }, token)
  expect(r.status).toBe(200)
  const lista = (await (await s.get('/api/vocab', token)).json()) as Array<{ id: string; word: string }>
  return lista.find((c) => c.word === word)!.id
}

const etiquetar = (id: string, etiquetas: unknown, token = ta) =>
  s.put(`/api/vocab/${id}/etiquetas`, { etiquetas }, token)

/** Estado FSRS direto no banco: a força é função da linha. */
const definirEstado = (id: string, stab: number | null, reps: number, lapses: number, due: number | null = null) =>
  db.execute(
    sql`UPDATE vocab_cards SET stability = ${stab}, reps = ${reps}, lapses = ${lapses}, due_at = ${due} WHERE id = ${id}`,
  )

describe('PUT /api/vocab/:id/etiquetas', () => {
  it('exige login', async () => {
    const id = await novo('anon')
    expect((await s.put(`/api/vocab/${id}/etiquetas`, { etiquetas: ['x'] })).status).toBe(401)
  })

  it('normaliza (minúsculas, # e espaços), tira repetidas e sai em GET /api/vocab', async () => {
    const id = await novo('river')
    const r = await etiquetar(id, ['  Filme ', '#Viagem de Ferias', 'filme'])
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ id, etiquetas: ['filme', 'viagem-de-ferias'] })
    const lista = (await (await s.get('/api/vocab', ta)).json()) as Array<{ id: string; etiquetas: string[] }>
    expect(lista.find((c) => c.id === id)?.etiquetas).toEqual(['filme', 'viagem-de-ferias'])
  })

  it('[] limpa', async () => {
    const id = await novo('stone')
    await etiquetar(id, ['a'])
    const r = await etiquetar(id, [])
    expect(await r.json()).toEqual({ id, etiquetas: [] })
  })

  it('recusa com 400: mais de 10, mais de 32 caracteres, vazia, tipo errado; 10 e 32 passam', async () => {
    const id = await novo('cloud')
    const onze = Array.from({ length: 11 }, (_, i) => `e${i}`)
    expect((await etiquetar(id, onze)).status).toBe(400)
    expect((await etiquetar(id, ['x'.repeat(33)])).status).toBe(400)
    expect((await etiquetar(id, ['   '])).status).toBe(400)
    expect((await etiquetar(id, ['!!!'])).status).toBe(400)
    expect((await etiquetar(id, 'filme')).status).toBe(400)
    expect((await etiquetar(id, [1])).status).toBe(400)
    const dez = Array.from({ length: 10 }, (_, i) => `e${i}`)
    expect((await etiquetar(id, dez)).status).toBe(200)
    expect((await etiquetar(id, ['x'.repeat(32)])).status).toBe(200)
  })

  it('isolamento: o cartão de outra conta (ou inexistente) responde 404 e não muda', async () => {
    const id = await novo('forest')
    await etiquetar(id, ['de-a'])
    expect((await etiquetar(id, ['de-b'], tb)).status).toBe(404)
    expect((await etiquetar('nao-existe', ['x'])).status).toBe(404)
    const lista = (await (await s.get('/api/vocab', ta)).json()) as Array<{ id: string; etiquetas: string[] }>
    expect(lista.find((c) => c.id === id)?.etiquetas).toEqual(['de-a'])
  })
})

describe('GET /api/vocab/etiquetas', () => {
  it('lista as etiquetas em uso com a contagem, só da própria conta', async () => {
    const t = await s.token('etq-lista')
    const a = await novo('lamp', t)
    const b = await novo('desk', t)
    await etiquetar(a, ['filme', 'trabalho'], t)
    await etiquetar(b, ['filme'], t)
    const r = await s.get('/api/vocab/etiquetas', t)
    expect(await r.json()).toEqual({
      etiquetas: [
        { etiqueta: 'filme', cartoes: 2 },
        { etiqueta: 'trabalho', cartoes: 1 },
      ],
    })
    const vazia = (await (await s.get('/api/vocab/etiquetas', await s.token('etq-vazia'))).json()) as {
      etiquetas: unknown[]
    }
    expect(vazia.etiquetas).toEqual([])
  })
})

describe('GET /api/vocab/pagina: etiqueta, força e ordem', () => {
  it('filtra por etiqueta (todas), por força e ordena por força e por próxima revisão', async () => {
    const t = await s.token('etq-pagina')
    const nova = await novo('alpha', t)
    const rec = await novo('bravo', t)
    const fam = await novo('charlie', t)
    const firme = await novo('delta', t)
    const sanguessuga = await novo('echo', t)
    await definirEstado(nova, null, 0, 0)
    await definirEstado(rec, 1.5, 2, 0, 3000)
    await definirEstado(fam, 10, 3, 0, 1000)
    await definirEstado(firme, 40, 5, 0, 2000)
    await definirEstado(sanguessuga, 40, 9, 3, null)
    await etiquetar(fam, ['filme', 'trabalho'], t)
    await etiquetar(firme, ['filme'], t)

    const pagina = async (q: string) =>
      ((await (await s.get(`/api/vocab/pagina?${q}`, t)).json()) as { itens: Array<{ word: string }> }).itens.map(
        (c) => c.word,
      )

    expect(await pagina('etiquetas=filme&ordem=alfabetica')).toEqual(['charlie', 'delta'])
    expect(await pagina('etiquetas=Filme,trabalho')).toEqual(['charlie'])
    expect(await pagina('forcas=1')).toEqual(['alpha'])
    // `echo` tem estabilidade de 40 dias mas 3 esquecimentos: perde um nível e é Familiar.
    expect(await pagina('forcas=3&ordem=alfabetica')).toEqual(['charlie', 'echo'])
    expect(await pagina('forcas=3,4&ordem=alfabetica')).toEqual(['charlie', 'delta', 'echo'])
    expect((await s.get('/api/vocab/pagina?forcas=9', t)).status).toBe(400)

    // Mais fracas primeiro: 1, 2, 3, 3, 4.
    const porForca = await pagina('ordem=forca')
    expect(porForca.slice(0, 2)).toEqual(['alpha', 'bravo'])
    expect(porForca[4]).toBe('delta')
    // A revisão mais próxima primeiro; sem data (alpha, echo) por último.
    expect((await pagina('ordem=proximaRevisao')).slice(0, 3)).toEqual(['charlie', 'delta', 'bravo'])

    // Paginar por cursor, nas duas ordens novas, não repete nem perde ninguém.
    for (const ordem of ['forca', 'proximaRevisao']) {
      const vistos: string[] = []
      let cursor = ''
      for (let i = 0; i < 10; i++) {
        const r = (await (await s.get(`/api/vocab/pagina?ordem=${ordem}&limite=2${cursor}`, t)).json()) as any
        vistos.push(...r.itens.map((c: any) => c.word))
        if (!r.proximoCursor) break
        cursor = `&cursorValor=${r.proximoCursor.valor}&cursorId=${r.proximoCursor.id}`
      }
      expect(vistos, ordem).toHaveLength(5)
      expect(new Set(vistos).size, ordem).toBe(5)
    }
  })

  it('a força em SQL é a da função pura, caso a caso', async () => {
    const { forcaDoCartao } = await import('../../src/core/learning/forcaDoCartao')
    const t = await s.token('etq-paridade')
    const casos: Array<[number | null, number, number]> = [
      [null, 0, 0],
      [5, 0, 0],
      [0.5, 1, 0],
      [2.99, 2, 0],
      [3, 2, 0],
      [20.9, 4, 0],
      [21, 4, 0],
      [21, 4, 3],
      [10, 4, 3],
      [1, 4, 5],
    ]
    for (const [i, [stab, reps, lapses]] of casos.entries()) {
      const id = await novo(`parity${'abcdefghij'[i]}`, t)
      await definirEstado(id, stab, reps, lapses)
      const esperada = forcaDoCartao({ stability: stab, reps, lapses })
      const r = (await (await s.get(`/api/vocab/pagina?forcas=${esperada}`, t)).json()) as {
        itens: Array<{ id: string }>
      }
      expect(
        r.itens.map((c) => c.id),
        `caso ${i}`,
      ).toContain(id)
    }
  })
})

describe('histórico da palavra e exportação da conta', () => {
  it('o cartão no histórico traz a força e as etiquetas', async () => {
    const t = await s.token('etq-hist')
    const id = await novo('mirror', t)
    await etiquetar(id, ['viagem'], t)
    const h = (await (await s.get('/api/vocab/palavra?lang=en&chave=mirror', t)).json()) as any
    expect(h.cartao.forca).toBe(1)
    expect(h.cartao.etiquetas).toEqual(['viagem'])
  })

  it('o cartão exportado leva as etiquetas', async () => {
    const t = await s.token('etq-export')
    const id = await novo('harbor', t)
    await etiquetar(id, ['porto'], t)
    const r = await s.get('/api/me/exportar', t)
    expect(r.status).toBe(200)
    const corpo = JSON.stringify(await r.json())
    expect(corpo).toContain(id)
    expect(corpo).toContain('"etiquetas":["porto"]')
  })
})

describe('regressões da revisão', () => {
  it('filtro só com etiquetas inválidas não devolve o acervo inteiro', async () => {
    await novo('sentinel')
    const r = await s.get('/api/vocab/pagina?etiquetas=%23%23', ta)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as { itens: unknown[]; porOrigem: Record<string, number> }
    expect(corpo.itens).toEqual([])
    expect(corpo.porOrigem).toBeTypeOf('object')
  })
})
