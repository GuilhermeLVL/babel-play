/**
 * CARACTERIZAÇÃO — `POST /api/vocab/lote` (openspec `cartoes` 6.2b; flag `estudo_palavras_v2`):
 *
 * 1. com a flag desligada a rota não existe (404) e nada muda;
 * 2. ligada: suspender, retomar e etiquetar valem para os cartões da conta;
 * 3. um id de OUTRA conta dá o mesmo 404 de um id que não existe, e NENHUM cartão do pedido muda (tudo ou nada);
 * 4. etiqueta inválida: 400; mais de 50 ids: 400; sem token: 401.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

interface Cartao {
  id: string
  front: string
  inDeck?: number
  etiquetas?: string[]
}

describe('POST /api/vocab/lote', () => {
  let s: AppDeTeste
  let ana: string
  let bia: string
  let deAna: Cartao[]
  let deBia: Cartao[]

  const ler = async (token: string): Promise<Cartao[]> => (await (await s.get('/api/vocab', token)).json()) as Cartao[]
  const semear = async (token: string, palavras: string[]) => {
    const r = await s.post(
      '/api/vocab/bulk-add',
      {
        cards: palavras.map((word) => ({
          word,
          srcLang: 'en',
          back: `${word}-pt`,
          sentence: `I like the ${word} today.`,
        })),
      },
      token,
    )
    expect(r.status).toBe(200)
    return ler(token)
  }
  const ligar = async (ligada: boolean) => {
    const { db } = await s.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { invalidarCacheDeFlags } = await s.load<typeof import('../../server/lib/flags')>('../../server/lib/flags')
    await db.execute(sql`update flags set habilitada = ${ligada} where chave = 'estudo_palavras_v2'`)
    invalidarCacheDeFlags()
  }

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('lote-ana')
    bia = await s.token('lote-bia')
    deAna = await semear(ana, ['harvest', 'garden', 'window'])
    deBia = await semear(bia, ['river'])
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('flag desligada: 404 e nada muda', async () => {
    const r = await s.post('/api/vocab/lote', { acao: 'suspender', ids: [deAna[0].id] }, ana)
    expect(r.status).toBe(404)
    expect((await ler(ana)).every((c) => c.inDeck !== 0)).toBe(true)
  })

  it('sem token: 401', async () => {
    expect((await s.post('/api/vocab/lote', { acao: 'suspender', ids: ['x'] })).status).toBe(401)
  })

  it('ligada: suspende, retoma e etiqueta só os cartões do pedido', async () => {
    await ligar(true)
    const [a, b, c] = deAna
    expect((await s.post('/api/vocab/lote', { acao: 'suspender', ids: [a.id, b.id, a.id] }, ana)).status).toBe(200)
    let agora = await ler(ana)
    expect(
      agora
        .filter((x) => x.inDeck === 0)
        .map((x) => x.id)
        .sort(),
    ).toEqual([a.id, b.id].sort())
    expect((await s.post('/api/vocab/lote', { acao: 'retomar', ids: [a.id] }, ana)).status).toBe(200)
    agora = await ler(ana)
    expect(agora.filter((x) => x.inDeck === 0).map((x) => x.id)).toEqual([b.id])
    const et = await s.post(
      '/api/vocab/lote',
      { acao: 'etiquetar', ids: [a.id, c.id], adicionar: ['#Filme'], remover: [] },
      ana,
    )
    expect(et.status).toBe(200)
    expect(await et.json()).toEqual({ alterados: 2 })
    agora = await ler(ana)
    expect(agora.find((x) => x.id === a.id)?.etiquetas).toEqual(['filme'])
    expect(agora.find((x) => x.id === b.id)?.etiquetas ?? []).toEqual([])
  })

  it('id de outra conta: 404 igual ao de id inexistente, e nada do pedido muda', async () => {
    const [a] = deAna
    const antes = await ler(ana)
    const alheio = await s.post('/api/vocab/lote', { acao: 'suspender', ids: [a.id, deBia[0].id] }, ana)
    const fantasma = await s.post('/api/vocab/lote', { acao: 'suspender', ids: [a.id, 'nao-existe-123'] }, ana)
    expect(alheio.status).toBe(404)
    expect(fantasma.status).toBe(404)
    expect(await alheio.json()).toEqual(await fantasma.json())
    expect(await ler(ana)).toEqual(antes)
    expect((await ler(bia))[0].inDeck).not.toBe(0)
  })

  it('etiqueta inválida e lote grande demais: 400', async () => {
    const [a] = deAna
    expect((await s.post('/api/vocab/lote', { acao: 'etiquetar', ids: [a.id], adicionar: ['###'] }, ana)).status).toBe(
      400,
    )
    const muitos = Array.from({ length: 51 }, (_, i) => `id-${i}`)
    expect((await s.post('/api/vocab/lote', { acao: 'suspender', ids: muitos }, ana)).status).toBe(400)
    expect((await s.post('/api/vocab/lote', { acao: 'apagar', ids: [a.id] }, ana)).status).toBe(400)
  })
})
