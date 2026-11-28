/**
 * CARACTERIZAÇÃO — `GET /api/vocab/pagina?estados=` (openspec `cartoes` 6.1; flag `estudo_palavras_v2`):
 *
 * 1. flag desligada: o parâmetro é ignorado e a página é a de sempre;
 * 2. ligada: estado sozinho, dois estados (um OU outro) e estado + etiqueta (E);
 * 3. nome de estado desconhecido: 400.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

describe('GET /api/vocab/pagina com estados', () => {
  let s: AppDeTeste
  let ana: string
  const palavras = ['harvest', 'garden', 'window', 'river', 'silver']

  const palavrasDa = async (consulta: string): Promise<string[]> => {
    const r = await s.get(`/api/vocab/pagina?${consulta}`, ana)
    expect(r.status).toBe(200)
    return ((await r.json()) as { itens: Array<{ word: string }> }).itens.map((i) => i.word).sort()
  }
  const ligar = async (ligada: boolean) => {
    const { db } = await s.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { invalidarCacheDeFlags } = await s.load<typeof import('../../server/lib/flags')>('../../server/lib/flags')
    await db.execute(sql`update flags set habilitada = ${ligada} where chave = 'estudo_palavras_v2'`)
    invalidarCacheDeFlags()
  }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('pagina-ana')
    await s.post(
      '/api/vocab/bulk-add',
      {
        cards: palavras.map((word) => ({
          word,
          srcLang: 'en',
          back: `${word}-pt`,
          sentence: `I see the ${word} today.`,
        })),
      },
      ana,
    )
    const lista = (await (await s.get('/api/vocab', ana)).json()) as Array<{ id: string; word: string }>
    const id = (w: string) => lista.find((c) => c.word === w)!.id
    const { db } = await s.load<typeof import('../../server/db/db')>('../../server/db/db')
    // garden: aprendendo; window: em revisão; river: difícil; silver: suspensa; harvest: nova e etiquetada
    await db.execute(sql`update vocab_cards set stability = 1, reps = 1 where id = ${id('garden')}`)
    await db.execute(sql`update vocab_cards set stability = 9, reps = 5 where id = ${id('window')}`)
    await db.execute(sql`update vocab_cards set stability = 9, reps = 5, lapses = 9 where id = ${id('river')}`)
    await db.execute(sql`update vocab_cards set in_deck = 0 where id = ${id('silver')}`)
    await s.put(`/api/vocab/${id('harvest')}/etiquetas`, { etiquetas: ['filme'] }, ana)
    await s.put(`/api/vocab/${id('river')}/etiquetas`, { etiquetas: ['filme'] }, ana)
  }, 60_000)
  afterAll(async () => {
    await s.encerrar()
  })

  it('desligada: ignora o parâmetro', async () => {
    expect(await palavrasDa('estados=suspensa')).toEqual([...palavras].sort())
  })

  it('ligada: um estado, dois estados e estado + etiqueta', async () => {
    await ligar(true)
    expect(await palavrasDa('estados=nova')).toEqual(['harvest'])
    expect(await palavrasDa('estados=aprendendo')).toEqual(['garden'])
    expect(await palavrasDa('estados=revisao')).toEqual(['river', 'window'])
    expect(await palavrasDa('estados=dificeis')).toEqual(['river'])
    expect(await palavrasDa('estados=suspensa')).toEqual(['silver'])
    expect(await palavrasDa('estados=nova,suspensa')).toEqual(['harvest', 'silver'])
    expect(await palavrasDa('estados=nova,revisao&etiquetas=filme')).toEqual(['harvest', 'river'])
    expect(await palavrasDa('estados=revisao&etiquetas=filme')).toEqual(['river'])
  })

  it('estado desconhecido: 400', async () => {
    expect((await s.get('/api/vocab/pagina?estados=inventado', ana)).status).toBe(400)
  })
})
