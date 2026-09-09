/**
 * CARACTERIZAÇÃO — sessão (`/api/sessions`) e rodada de exercício (`/api/exercises`), por HTTP,
 * no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1) dos dois fluxos que produzem o dado
 * primário do app: a gravação com suas falas, e a rodada de jogo com seus itens. Cada resposta de
 * rota crítica vira um snapshot de FORMA (chaves e tipos, nunca valores). O que parecer errado
 * está marcado com `// caracterizacao:` — o teste detecta mudança; a correção é de outra fase.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, resposta, semear, subirApp } from './_app'

describe('sessao e rodada (self-host)', () => {
  let s: AppDeTeste
  let semente: Awaited<ReturnType<typeof semear>>
  let sessaoId: string
  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    semente = await semear(s, 'local-owner')
  })
  afterAll(async () => {
    await s.encerrar()
  })

  const falas = [
    {
      idx: 0,
      source: 'mic',
      speakerName: 'A',
      sourceLang: 'en',
      sourceText: 'Good morning.',
      targetLang: 'pt',
      translatedText: 'Bom dia.',
      tStartMs: 0,
      tEndMs: 900,
    },
    {
      idx: 1,
      source: 'mic',
      speakerName: 'B',
      sourceLang: 'en',
      sourceText: 'Good night.',
      targetLang: 'pt',
      translatedText: 'Boa noite.',
      tStartMs: 900,
      tEndMs: 1800,
    },
  ]

  it('POST /api/sessions com 2 falas devolve a sessao criada (sem as falas no corpo)', async () => {
    const r = await s.post('/api/sessions', {
      title: 'Gravada',
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt',
      status: 'done',
      durationMs: 1800,
      utterances: falas,
    })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    sessaoId = corpo.id
    expect(typeof sessaoId).toBe('string')
    // caracterizacao: comportamento atual — o POST devolve so a sessao; as falas gravadas nao voltam
    // no corpo, quem as le e o GET /:id.
    expect(corpo.utterances).toBeUndefined()
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.sessions.json')
  })

  it('GET /api/sessions lista as sessoes vivas do dono (a semeada e a criada)', async () => {
    const r = await s.get('/api/sessions')
    expect(r.status).toBe(200)
    const lista = await r.clone().json()
    expect(lista.map((x: { id: string }) => x.id).sort()).toEqual([semente.sessao.id, sessaoId].sort())
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.sessions.json')
  })

  it('GET /api/sessions/:id devolve {session, utterances} com as 2 falas', async () => {
    const r = await s.get(`/api/sessions/${sessaoId}`)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.session.id).toBe(sessaoId)
    expect(corpo.utterances).toHaveLength(2)
    expect(corpo.utterances.map((u: { sourceText: string }) => u.sourceText)).toEqual(['Good morning.', 'Good night.'])
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.sessions.id.json')
  })

  it('PATCH /api/sessions/:id {durationMs} devolve a sessao atualizada', async () => {
    const r = await s.patch(`/api/sessions/${sessaoId}`, { durationMs: 5000 })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.durationMs).toBe(5000)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/patch.sessions.id.json')
  })

  it('PUT /api/sessions/:id/utterances substitui TODAS as falas', async () => {
    const r = await s.put(`/api/sessions/${sessaoId}/utterances`, { utterances: [falas[1]] })
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/put.sessions.id.utterances.json',
    )
    const lido = await (await s.get(`/api/sessions/${sessaoId}`)).json()
    expect(lido.utterances).toHaveLength(1)
    expect(lido.utterances[0].sourceText).toBe('Good night.')
  })

  it('GET /api/sessions/utterances/all devolve todas as falas do dono, de todas as sessoes', async () => {
    const r = await s.get('/api/sessions/utterances/all')
    expect(r.status).toBe(200)
    const lista = await r.clone().json()
    // 2 da sessao semeada + 1 que sobrou do PUT acima.
    expect(lista).toHaveLength(3)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.sessions.utterances.all.json',
    )
  })

  it('PATCH /api/sessions/utterances/:uid com :uid acima do teto → 400 pelo idParamSchema', async () => {
    /* FASE 4 (correção 4): o `:uid` era a leitura crua de `req.params` desta rota — só o CORPO
       tinha schema. Agora o identificador passa pelo mesmo `idParamSchema` das rotas vizinhas
       (o nome do parâmetro difere, o contrato não). */
    const r = await s.patch(`/api/sessions/utterances/${'u'.repeat(200)}`, { sourceText: 'x' })
    expect(r.status).toBe(400)
    expect(String((await r.json()).error)).toContain('id')
  })

  it('DELETE /api/sessions/:id responde {ok:true} e o GET seguinte e 404', async () => {
    const r = await s.del(`/api/sessions/${sessaoId}`)
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/delete.sessions.id.json',
    )
    const depois = await s.get(`/api/sessions/${sessaoId}`)
    expect(depois.status).toBe(404)
    await expect(JSON.stringify(await resposta(depois), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.sessions.id.404.json',
    )
    // caracterizacao: apagar de novo tambem responde 200 {ok:true} (soft delete idempotente, sem 404)
    expect((await s.del(`/api/sessions/${sessaoId}`)).status).toBe(200)
  })

  const rodadaDe = (roundId: string, extra: Record<string, unknown> = {}) => ({
    roundId,
    exerciseKind: 'memory',
    origem: 'baralho',
    score: 120,
    melhorSequencia: 2,
    itens: semente.cartoes
      .slice(0, 2)
      .map((c: { id: string; word: string }) => ({
        cardId: c.id,
        itemRef: c.word,
        correct: 1,
        attempts: 1,
        ms: 800,
        hinted: 0,
        kind: 'srs',
      })),
    ...extra,
  })

  it('POST /api/exercises/rodada com 2 itens dos cartoes semeados grava a rodada', async () => {
    const r = await s.post('/api/exercises/rodada', rodadaDe('rodada-http-1'))
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo).toEqual({ gravados: 2, roundId: 'rodada-http-1' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.exercises.rodada.json',
    )
  })

  it('GET /api/exercises/historico, /recordes e /results?limite=20 tem as formas conhecidas', async () => {
    const historico = await s.get('/api/exercises/historico')
    expect(historico.status).toBe(200)
    await expect(JSON.stringify(await resposta(historico), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.exercises.historico.json',
    )

    const recordes = await s.get('/api/exercises/recordes')
    expect(recordes.status).toBe(200)
    await expect(JSON.stringify(await resposta(recordes), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.exercises.recordes.json',
    )

    const results = await s.get('/api/exercises/results?limite=20')
    expect(results.status).toBe(200)
    const linhas = await results.clone().json()
    // caracterizacao: `limite` nao existe no schema (e descartado pelo `.strip()`); a rota devolve
    // TODAS as linhas — 2 da rodada semeada + 2 da rodada acima.
    expect(linhas).toHaveLength(4)
    await expect(JSON.stringify(await resposta(results), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.exercises.results.json',
    )
  })

  it('POST rodada com 0 itens responde 400', async () => {
    const r = await s.post('/api/exercises/rodada', rodadaDe('rodada-vazia', { itens: [] }))
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.exercises.rodada.400.json',
    )
  })

  it('POST rodada com score acima de 100000 responde 400', async () => {
    const r = await s.post('/api/exercises/rodada', rodadaDe('rodada-score', { score: 100_001 }))
    expect(r.status).toBe(400)
    expect(String((await r.json()).error)).toContain('score')
  })

  it('o mesmo roundId enviado duas vezes grava duas vezes (nao e idempotente)', async () => {
    const primeira = await s.post('/api/exercises/rodada', rodadaDe('rodada-repetida'))
    const segunda = await s.post('/api/exercises/rodada', rodadaDe('rodada-repetida'))
    expect(primeira.status).toBe(200)
    expect(segunda.status).toBe(200)
    expect(await segunda.json()).toEqual({ gravados: 2, roundId: 'rodada-repetida' })
    const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
    const linhas = await exerciseResultsRepo.listarPorRodada(semente.U, 'rodada-repetida')
    // caracterizacao: comportamento atual, nao desejado — nao ha chave de idempotencia por roundId;
    // o reenvio (retry do cliente) duplica as linhas da rodada.
    expect(linhas).toHaveLength(4)
  })
})
