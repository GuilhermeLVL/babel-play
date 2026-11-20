/**
 * CARACTERIZAÇÃO — etiquetas de palavras (lado do servidor), por HTTP:
 *
 * 1. `GET /api/vocab/vistas?lang=xx`: as chaves das palavras já vistas nas sessões, num idioma (base),
 *    com ETag pela versão `atividade` — 304 enquanto nada muda, ETag novo quando uma sessão muda.
 * 2. `GET /api/vocab/palavra?lang=xx&chave=yy`: o histórico de UMA palavra (cartão, sessões com frase,
 *    jogos e nota). Palavra nunca vista: 200 com tudo zerado.
 * 3. `PUT /api/vocab/:id/nota`: a nota pessoal do cartão (até 500; `''` limpa). Cartão alheio: 404.
 * 4. Tudo SÓ DO DONO: outra conta não vê as chaves, o histórico nem a nota de ninguém; sem token, 401.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, semear, subirApp } from './_app'

describe('etiquetas de palavras (modo publico)', () => {
  let s: AppDeTeste
  let dono: string
  let outro: string
  let harvest: { id: string }
  let sessaoId: string

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    const semente = await semear(s, 'dono-das-palavras')
    harvest = semente.cartoes.find((c: { word: string }) => c.word === 'harvest')
    dono = await s.token('dono-das-palavras')
    outro = await s.token('outra-conta-das-palavras')
    const sessoes = (await (await s.get('/api/sessions', dono)).json()) as Array<{ id: string; title: string }>
    sessaoId = sessoes.find((x) => x.title === 'Sessão semeada')!.id
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('vistas: as chaves das falas, sem funcionais; 304 com o mesmo ETag; ETag novo quando a sessão muda', async () => {
    const r = await s.get('/api/vocab/vistas?lang=en-US', dono)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as { lang: string; chaves: string[]; truncado: boolean }
    expect(corpo.lang).toBe('en')
    expect(corpo.truncado).toBe(false)
    expect([...corpo.chaves].sort()).toEqual(['drink', 'good', 'harvest', 'water'])
    const etag = r.headers.get('etag')!
    expect(etag).toBeTruthy()

    const revalida = await s.chamar('GET', '/api/vocab/vistas?lang=en', {
      token: dono,
      headers: { 'if-none-match': etag },
    })
    expect(revalida.status).toBe(304)

    const append = await s.post(
      `/api/sessions/${sessaoId}/utterances`,
      { utterances: [{ idx: 2, sourceLang: 'en', sourceText: 'Lovely orchard.' }] },
      dono,
    )
    expect(append.status).toBe(200)
    const depois = await s.chamar('GET', '/api/vocab/vistas?lang=en', {
      token: dono,
      headers: { 'if-none-match': etag },
    })
    expect(depois.status).toBe(200)
    expect(((await depois.json()) as { chaves: string[] }).chaves).toEqual(
      expect.arrayContaining(['lovely', 'orchard']),
    )
  })

  it('vistas: idioma inválido ou ausente é 400; outra conta não vê nada; sem token, 401', async () => {
    expect((await s.get('/api/vocab/vistas', dono)).status).toBe(400)
    expect((await s.get('/api/vocab/vistas?lang=1', dono)).status).toBe(400)
    const alheia = (await (await s.get('/api/vocab/vistas?lang=en', outro)).json()) as { chaves: string[] }
    expect(alheia.chaves).toEqual([])
    expect((await s.get('/api/vocab/vistas?lang=en')).status).toBe(401)
  })

  it('palavra: cartão, sessão com a frase, jogos e nota', async () => {
    expect((await s.put(`/api/vocab/${harvest.id}/nota`, { nota: 'colheita, de "harvest moon"' }, dono)).status).toBe(
      200,
    )
    const r = await s.get('/api/vocab/palavra?lang=en&chave=Harvest', dono)
    expect(r.status).toBe(200)
    const h = (await r.json()) as Record<string, any>
    expect(h.chave).toBe('harvest')
    expect(h.lang).toBe('en')
    expect(h.cartao).toMatchObject({ id: harvest.id, estado: 'nova', reps: 0, lapses: 0 })
    expect(typeof h.cartao.proximaRevisao === 'string' || h.cartao.proximaRevisao === null).toBe(true)
    expect(h.vistas).toMatchObject({ vezes: 1, sessoes: 1 })
    expect(h.vistas.primeiraEm).toEqual(expect.any(String))
    expect(h.onde).toEqual([
      { sessaoId, titulo: 'Sessão semeada', quando: expect.any(String), frase: 'The harvest was good.' },
    ])
    expect(Array.isArray(h.jogos)).toBe(true)
    expect(h.nota).toBe('colheita, de "harvest moon"')
  })

  it('palavra: nunca vista nem salva é 200 zerado; sem chave é 400; outra conta vê zero', async () => {
    const r = await s.get('/api/vocab/palavra?lang=en&chave=zebra', dono)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      chave: 'zebra',
      lang: 'en',
      cartao: null,
      vistas: { vezes: 0, sessoes: 0, primeiraEm: null, ultimaEm: null },
      onde: [],
      jogos: [],
      nota: null,
    })
    expect((await s.get('/api/vocab/palavra?lang=en', dono)).status).toBe(400)
    const alheia = (await (await s.get('/api/vocab/palavra?lang=en&chave=harvest', outro)).json()) as Record<
      string,
      any
    >
    expect(alheia.cartao).toBeNull()
    expect(alheia.onde).toEqual([])
    expect(alheia.nota).toBeNull()
  })

  it('nota: grava aparada, vai no baralho, limpa com vazio; 400 acima de 500; alheio é 404', async () => {
    const r = await s.put(`/api/vocab/${harvest.id}/nota`, { nota: '  lembrar da fazenda  ' }, dono)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ id: harvest.id, nota: 'lembrar da fazenda' })
    const baralho = (await (await s.get('/api/vocab', dono)).json()) as Array<{ id: string; nota: string | null }>
    expect(baralho.find((c) => c.id === harvest.id)?.nota).toBe('lembrar da fazenda')

    expect((await s.put(`/api/vocab/${harvest.id}/nota`, { nota: 'x'.repeat(501) }, dono)).status).toBe(400)
    expect((await s.put(`/api/vocab/${harvest.id}/nota`, {}, dono)).status).toBe(400)
    expect((await s.put(`/api/vocab/${harvest.id}/nota`, { nota: 'alheia' }, outro)).status).toBe(404)
    expect((await s.put(`/api/vocab/${harvest.id}/nota`, { nota: 'sem token' })).status).toBe(401)

    const limpa = await s.put(`/api/vocab/${harvest.id}/nota`, { nota: '' }, dono)
    expect(await limpa.json()).toEqual({ id: harvest.id, nota: null })
  })
})
