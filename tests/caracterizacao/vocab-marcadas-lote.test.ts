/**
 * CARACTERIZAÇÃO — a marcação em LOTE ("Já sei" do teste rápido de vocabulário), por HTTP (openspec
 * `teste-de-vocabulario`): `PUT /api/vocab/marcadas/lote` e `POST /api/vocab/marcadas/lote/desfazer`.
 *
 * 1. sem token, 401; entrada inválida (idioma, lista vazia, acima de 3.000, chave só de pontuação), 400;
 * 2. o servidor reduz idioma e chave, tira repetidas e grava só `conhecida`;
 * 3. precedência: não sobrescreve `ignorada`, não cria com cartão, não conta de novo a que já é `conhecida`;
 * 4. teto atômico por conta (repositório, teto pequeno): se as novas não cabem, nada é gravado;
 * 5. isolamento: cada conta grava e desfaz só as dela; o desfazer nunca apaga `ignorada`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

interface Marcada {
  lang: string
  chave: string
  estado: string
}

describe('palavras marcadas em lote (modo publico)', () => {
  let s: AppDeTeste
  let ana: string
  let bia: string

  const lote = (b: unknown, token?: string) => s.put('/api/vocab/marcadas/lote', b, token)
  const listar = async (token: string, lang = 'en') =>
    ((await (await s.get(`/api/vocab/marcadas?lang=${lang}`, token)).json()) as { marcadas: Marcada[] }).marcadas

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    ana = await s.token('lote-ana')
    bia = await s.token('lote-bia')
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('sem token: 401 nas duas rotas', async () => {
    expect((await lote({ lang: 'en', chaves: ['hi'] })).status).toBe(401)
    expect((await s.post('/api/vocab/marcadas/lote/desfazer', { lang: 'en', chaves: ['hi'] })).status).toBe(401)
  })

  it('validação: idioma, lista vazia, lista grande demais e chave sem letras são 400', async () => {
    expect((await lote({ lang: '1', chaves: ['hi'] }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: [] }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en' }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: ['x'.repeat(31)] }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: Array.from({ length: 3001 }, (_, i) => `w${i}`) }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: ['!!!', '???'] }, ana)).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: ['hi'], estado: 'ignorada' }, ana)).status).toBe(400)
    expect((await listar(ana)).length).toBe(0)
  })

  it('grava até 3.000 de uma vez, reduzindo e sem repetir; repetir o lote não conta de novo', async () => {
    const chaves = Array.from(
      { length: 3000 },
      (_, i) => `palavra${String.fromCharCode(97 + (i % 26))}${'x'.repeat(i % 7)}${i}`,
    )
    const r = await lote({ lang: 'en-US', chaves }, ana)
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as { criadas: string[]; jaConhecidas: number }
    expect(corpo.criadas).toHaveLength(3000)
    expect(await listar(ana)).toHaveLength(3000)
    const de_novo = (await (
      await lote({ lang: 'en', chaves: ['Palavraa0', ...chaves.slice(0, 5)] }, ana)
    ).json()) as typeof corpo
    expect(de_novo.criadas).toEqual([])
    expect(de_novo.jaConhecidas).toBe(5)
    expect((await listar(ana)).every((m) => m.estado === 'conhecida')).toBe(true)
  })

  it('reduz a chave, tira repetidas e ignora só pontuação no meio', async () => {
    const r = await lote({ lang: 'es', chaves: ['Hola!', 'hola', ' HOLA ', '...', 'Adiós'] }, bia)
    expect(r.status).toBe(200)
    expect(((await r.json()) as { criadas: string[] }).criadas.sort()).toEqual(['adios', 'hola'])
    expect((await listar(bia, 'es')).map((m) => m.chave).sort()).toEqual(['adios', 'hola'])
  })

  it('precedência: não sobrescreve ignorada; ignorada continua ignorada', async () => {
    await s.put('/api/vocab/marcadas', { lang: 'fr', chave: 'bonjour', estado: 'ignorada' }, bia)
    const r = await (await lote({ lang: 'fr', chaves: ['bonjour', 'merci'] }, bia)).json()
    expect(r).toMatchObject({ criadas: ['merci'], ignoradas: 1 })
    const fr = await listar(bia, 'fr')
    expect(fr.find((m) => m.chave === 'bonjour')?.estado).toBe('ignorada')
    expect(fr.find((m) => m.chave === 'merci')?.estado).toBe('conhecida')
  })

  it('precedência: palavra que já tem cartão não ganha marcação', async () => {
    const add = await s.post('/api/vocab/bulk-add', { cards: [{ word: 'Tiger', srcLang: 'en', back: 'tigre' }] }, bia)
    expect(add.status).toBeLessThan(300)
    const r = await (await lote({ lang: 'en', chaves: ['tiger', 'zebra'] }, bia)).json()
    expect(r).toMatchObject({ criadas: ['zebra'], comCartao: 1 })
    expect((await listar(bia)).map((m) => m.chave)).toEqual(['zebra'])
  })

  it('o teto fecha o lote inteiro (atômico) e deixa passar o que já existe (repositório, teto pequeno)', async () => {
    const { palavrasMarcadasRepo } = await s.load('../../server/db/repositories/palavrasMarcadas')
    const u = 'lote-teto'
    expect((await palavrasMarcadasRepo.marcarEmLote(u, 'en', ['um', 'dois'], 3)).ok).toBe(true)
    /* 2 novas + 2 existentes = 3 palavras no total acima do teto de 3: nada entra, nem a que caberia. */
    expect(await palavrasMarcadasRepo.marcarEmLote(u, 'en', ['tres', 'quatro'], 3)).toEqual({
      ok: false,
      motivo: 'cheio',
    })
    expect((await palavrasMarcadasRepo.listar(u, 'en', 10)).map((m) => m.chave).sort()).toEqual(['dois', 'um'])
    /* Só existentes: cabe mesmo no teto. Uma nova que cabe: entra. */
    expect(await palavrasMarcadasRepo.marcarEmLote(u, 'en', ['um', 'dois'], 3)).toMatchObject({
      ok: true,
      jaConhecidas: 2,
    })
    expect(await palavrasMarcadasRepo.marcarEmLote(u, 'en', ['tres'], 3)).toMatchObject({ ok: true, criadas: ['tres'] })
  })

  it('dois lotes simultâneos não passam juntos pelo teto', async () => {
    const { palavrasMarcadasRepo } = await s.load('../../server/db/repositories/palavrasMarcadas')
    const u = 'lote-corrida'
    const [a, b] = await Promise.all([
      palavrasMarcadasRepo.marcarEmLote(u, 'en', ['a1', 'a2', 'a3'], 4),
      palavrasMarcadasRepo.marcarEmLote(u, 'en', ['b1', 'b2', 'b3'], 4),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(await palavrasMarcadasRepo.listar(u, 'en', 10)).toHaveLength(3)
  })

  it('isolamento: o lote e o desfazer valem só para a conta; desfazer nunca apaga ignorada', async () => {
    await lote({ lang: 'de', chaves: ['haus', 'baum'] }, ana)
    await lote({ lang: 'de', chaves: ['haus'] }, bia)
    await s.put('/api/vocab/marcadas', { lang: 'de', chave: 'tisch', estado: 'ignorada' }, ana)
    const r = await s.post('/api/vocab/marcadas/lote/desfazer', { lang: 'de', chaves: ['haus', 'tisch', 'nada'] }, ana)
    expect(r.status).toBe(200)
    expect(((await r.json()) as { removidas: string[] }).removidas).toEqual(['haus'])
    expect((await listar(ana, 'de')).map((m) => m.chave).sort()).toEqual(['baum', 'tisch'])
    expect((await listar(bia, 'de')).map((m) => m.chave)).toEqual(['haus'])
  })
})
