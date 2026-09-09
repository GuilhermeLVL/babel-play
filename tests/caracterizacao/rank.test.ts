/**
 * CARACTERIZACAO — o ranking publico (`/api/rank`), por HTTP, no modo publico e SEM token.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1). A rota fica antes do
 * `authMiddleware` e responde igual com e sem conta; as guardas sao as de placar de fliperama.
 *
 * ORDEM DOS CASOS IMPORTA: a trava de flood e por origem (hash do IP) e todos os requests daqui
 * saem de 127.0.0.1. O primeiro POST valido entra; a partir dele, qualquer POST valido dentro de
 * um minuto e 429. As recusas de validacao (400/404) vem ANTES da trava e continuam observaveis.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste,resposta, subirApp } from './_app'

describe('ranking publico (modo publico, sem token)', () => {
  let s: AppDeTeste
  beforeAll(async () => { s = await subirApp({ modo: 'publico' }) })
  afterAll(async () => { await s.encerrar() })

  it('GET /api/rank/termo vazio: 200 com linhas=[]', async () => {
    const r = await s.get('/api/rank/termo')
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toEqual({ linhas: [] })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.rank.termo.vazio.json')
  })

  it('jogo desconhecido: 404 jogo_desconhecido no GET e no POST', async () => {
    const g = await s.get('/api/rank/jogo-inventado')
    expect(g.status).toBe(404)
    await expect(JSON.stringify(await resposta(g), null, 2)).toMatchFileSnapshot('__snapshots__/get.rank.jogo-desconhecido.json')
    const p = await s.post('/api/rank/jogo-inventado', { apelido: 'Alguem', pontos: 10, combo: 1 })
    expect(p.status).toBe(404)
    expect(await p.json()).toEqual({ error: 'jogo desconhecido', code: 'jogo_desconhecido' })
  })

  it('pontos acima do teto: 400 pontuacao_implausivel com o teto em detalhes (nao ha clamp)', async () => {
    const r = await s.post('/api/rank/termo', { apelido: 'Trapaceiro', pontos: 5_001, combo: 1 })
    expect(r.status).toBe(400)
    expect(await r.clone().json()).toEqual({ error: 'pontuação fora do plausível', code: 'pontuacao_implausivel', detalhes: { teto: 5_000 } })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.rank.termo.implausivel.json')
    expect(await (await s.get('/api/rank/termo')).json()).toEqual({ linhas: [] })
  })

  it('apelido que vira nada depois do saneamento: 400 apelido_invalido', async () => {
    const r = await s.post('/api/rank/termo', { apelido: '<>!!', pontos: 100, combo: 1 })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'apelido_invalido' })
  })

  it('POST com apelido contendo HTML: as tags sao removidas caractere a caractere, e o resto entra', async () => {
    // caracterizacao: comportamento atual — `<b>Ana</b>` vira `bAnab` (so letras, numeros, espaco,
    // `_` e `-` sobrevivem); nao ha escape nem recusa, o nome gravado e o saneado
    const r = await s.post('/api/rank/termo', { apelido: '<b>Ana</b>', pontos: 900, combo: 12 })
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toEqual({ ok: true, manteve: false })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.rank.termo.json')

    const g = await s.get('/api/rank/termo')
    expect(g.status).toBe(200)
    const corpo = await g.clone().json()
    expect(corpo.linhas).toEqual([{ apelido: 'bAnab', pontos: 900, combo: 12, quando: expect.any(Number) }])
    await expect(JSON.stringify(await resposta(g), null, 2)).toMatchFileSnapshot('__snapshots__/get.rank.termo.json')
  })

  it('segundo POST valido da mesma origem dentro de um minuto: 429 envio_muito_frequente', async () => {
    const r = await s.post('/api/rank/termo', { apelido: 'Outra Pessoa', pontos: 500, combo: 3 })
    expect(r.status).toBe(429)
    expect(await r.clone().json()).toEqual({ error: 'aguarde um minuto entre envios', code: 'envio_muito_frequente' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.rank.termo.429.json')
    expect((await (await s.get('/api/rank/termo')).json()).linhas).toHaveLength(1)
  })

  it('a trava e por origem, nao por jogo: outro jogo da mesma origem tambem e 429', async () => {
    const r = await s.post('/api/rank/blitz', { apelido: 'Outra Pessoa', pontos: 500, combo: 3 })
    expect(r.status).toBe(429)
  })

  it('a validacao continua vindo antes da trava: pontos acima do teto e 400, nao 429', async () => {
    const r = await s.post('/api/rank/termo', { apelido: 'Alguem', pontos: 999_999, combo: 1 })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ code: 'pontuacao_implausivel' })
  })

  it('token invalido no header nao muda nada: a rota e publica', async () => {
    const r = await s.get('/api/rank/termo', 'lixo.qualquer.coisa')
    expect(r.status).toBe(200)
  })

  it('o que fica gravado e o apelido saneado e um hash da origem, nunca o IP', async () => {
    const { db } = await s.load('../../server/db/db')
    const schema = await s.load('../../server/db/schema')
    const linhas = await db.select().from(schema.rank)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].apelido).toBe('bAnab')
    expect(String(linhas[0].ipHash)).toMatch(/^[0-9a-f]{32}$/)
    expect(String(linhas[0].ipHash)).not.toContain('127.0.0.1')
  })
})
