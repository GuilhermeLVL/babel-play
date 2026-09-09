/**
 * BUSCA DE IMAGENS — sem estado no processo (Fase 5).
 *
 * A rota tinha um `Map` de 200 entradas, sem validade, guardando o resultado do Openverse por
 * termo. Ele saiu, e a decisão foi por MEDIÇÃO, não por regra: sobre uma cópia de `data/babel.db`,
 * reproduzindo o fluxo real (o cliente já tem cache por palavra), o teto de 200 acertava **20 de
 * 916 buscas, 2,2%**. Os números e as alternativas recusadas estão em `server/routes/images.ts`.
 *
 * O que este arquivo prende é o que a remoção não pode ter quebrado — a rota continua respondendo,
 * continua degradando sem quebrar o cliente, e continua com teto de tamanho no termo — mais o
 * comportamento novo: nenhuma resposta vem de memória de requisição anterior.
 */
import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

let base: string
let fechar: () => Promise<void>
let chamadas: string[] = []
let responder: () => Response = () => new Response(JSON.stringify({ results: [] }), { status: 200 })

beforeAll(async () => {
  const { imagesRouter } = await import('../../server/routes/images')
  const app = express()
  app.use('/api/images', imagesRouter)
  const servidor = await new Promise<import('node:http').Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s))
  })
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  fechar = () => new Promise<void>((r) => servidor.close(() => r()))

  /* O Openverse nunca é chamado de verdade: o que sai do processo é registrado e respondido aqui.
     O `fetch` do próprio teste contra o servidor local passa reto. */
  const real = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith(base)) return real(input, init)
    chamadas.push(url)
    return responder()
  })
})
afterAll(async () => {
  vi.unstubAllGlobals()
  await fechar()
})
afterEach(() => {
  chamadas = []
})

const buscar = (q: string) => fetch(`${base}/api/images/search?q=${encodeURIComponent(q)}`)

const umaImagem = () =>
  new Response(
    JSON.stringify({ results: [{ id: 'i1', thumbnail: 'https://ex/t.jpg', url: 'https://ex/i.jpg', title: 'gato' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('GET /api/images/search', () => {
  it('devolve o que o Openverse devolveu, no shape compacto do cliente', async () => {
    responder = umaImagem
    const r = await buscar('gato')
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.results).toHaveLength(1)
    expect(corpo.results[0]).toMatchObject({ id: 'i1', url: 'https://ex/i.jpg', title: 'gato' })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toContain('q=gato')
  })

  it('a MESMA busca repetida vai ao provedor de novo — não sobra estado no processo', async () => {
    responder = umaImagem
    await buscar('ponte')
    await buscar('ponte')
    await buscar('PONTE')
    expect(
      chamadas,
      'com o cache no heap, a segunda e a terceira seriam servidas de memória — e cada instância teria a sua',
    ).toHaveLength(3)
  })

  it('provedor fora do ar → 200 com lista vazia e motivo curto (o cliente não quebra)', async () => {
    responder = () => new Response('caiu', { status: 503 })
    const corpo = await (await buscar('caiu')).json()
    expect(corpo.results).toEqual([])
    expect(corpo.error).toBe('openverse 503')
  })

  it('termo vazio nem sai do processo; termo gigante é recusado antes da chamada de saída', async () => {
    expect((await (await buscar('   ')).json()).results).toEqual([])
    expect(chamadas, 'termo vazio não vira requisição de saída').toHaveLength(0)

    const r = await buscar('x'.repeat(5_000))
    expect(r.status).toBe(400)
    expect(chamadas, 'o teto de tamanho existe para não pagar requisição de saída arbitrária').toHaveLength(0)
  })
})
