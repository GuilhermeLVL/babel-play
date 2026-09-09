/**
 * CARACTERIZAÇÃO — estatísticas derivadas (`/api/metrics`, recordes, dificuldade, ocorrências),
 * por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1) das leituras que DERIVAM números do
 * dado primário: perfil de métricas, curva de XP, recordes por jogo, distribuição de dificuldade e
 * ocorrências de um cartão. A fixture é a semeadura + uma revisão + uma rodada, para que cada
 * agregado tenha ao menos uma linha de entrada. Cada resposta vira um snapshot de FORMA. O que
 * parecer errado está marcado com `// caracterizacao:` — o teste detecta mudança, não corrige.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste,resposta, semear, subirApp } from './_app'

describe('estatisticas (self-host)', () => {
  let s: AppDeTeste
  let semente: Awaited<ReturnType<typeof semear>>
  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    semente = await semear(s, 'local-owner')
    const revisao = await s.post(`/api/vocab/${semente.cartoes[0].id}/review`, { grade: 3 })
    if (revisao.status !== 200) throw new Error(`fixture: review ${revisao.status}`)
    const rodada = await s.post('/api/exercises/rodada', {
      roundId: 'rodada-estatisticas', exerciseKind: 'memory', origem: 'baralho', score: 150, melhorSequencia: 2,
      itens: semente.cartoes.slice(0, 2).map((c: { id: string; word: string }) => ({ cardId: c.id, itemRef: c.word, correct: 1, attempts: 1, ms: 700, hinted: 0, kind: 'srs' })),
    })
    if (rodada.status !== 200) throw new Error(`fixture: rodada ${rodada.status}`)
  })
  afterAll(async () => { await s.encerrar() })

  it('GET /api/metrics/profile devolve o perfil com a forma conhecida', async () => {
    const r = await s.get('/api/metrics/profile')
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    // caracterizacao: nao existem chaves `seeds`, `xp` nem `level` no perfil; a economia aparece
    // como `seedsGastas`, `seedsCreditadas` e `xpCreditado`, e o nivel e derivado no cliente.
    expect(corpo).not.toHaveProperty('seeds')
    expect(corpo).not.toHaveProperty('xp')
    expect(corpo).not.toHaveProperty('level')
    expect(typeof corpo.seedsGastas).toBe('number')
    expect(typeof corpo.seedsCreditadas).toBe('number')
    expect(typeof corpo.xpCreditado).toBe('number')
    expect(corpo.reviews).toBe(1)
    // caracterizacao: `drillItems` so conta itens com `kind === 'drill'`; as duas rodadas da fixture
    // (4 itens) sao `kind: 'srs'` e nao entram — o total aparece em `acertoPorExercicio`.
    expect(corpo.drillItems).toBe(0)
    expect(corpo.acertoPorExercicio).toEqual([{ kind: 'memory', total: 4, acerto: 100 }])
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.metrics.profile.json')
  })

  it('GET /api/metrics/profile duas vezes deriva os mesmos numeros (so o relogio muda)', async () => {
    const a = await (await s.get('/api/metrics/profile')).json()
    const b = await (await s.get('/api/metrics/profile')).json()
    expect(b.seedsGastas).toBe(a.seedsGastas)
    expect(b.seedsCreditadas).toBe(a.seedsCreditadas)
    expect(b.xpCreditado).toBe(a.xpCreditado)
    // caracterizacao: alem de `asOf`, `avgRetention` e funcao do relogio (retencao FSRS decai com o
    // tempo desde a revisao) e muda entre duas chamadas consecutivas; todo o resto e deterministico.
    const semRelogio = (p: Record<string, unknown>) => { const { asOf: _asOf, avgRetention: _ret, ...resto } = p; return resto }
    expect(semRelogio(b)).toEqual(semRelogio(a))
    expect(b.avgRetention).toBeCloseTo(a.avgRetention, 6)
  })

  it('GET /api/metrics/xp devolve a curva de XP com a forma conhecida', async () => {
    const r = await s.get('/api/metrics/xp')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.metrics.xp.json')
  })

  it('GET /api/exercises/recordes filtra por `origem`; `jogo` nao existe no schema e e ignorado', async () => {
    const porOrigem = await s.get('/api/exercises/recordes?origem=baralho')
    expect(porOrigem.status).toBe(200)
    const lista = await porOrigem.clone().json()
    expect(lista.length).toBeGreaterThanOrEqual(1)
    await expect(JSON.stringify(await resposta(porOrigem), null, 2)).toMatchFileSnapshot('__snapshots__/get.exercises.recordes.origem.json')

    // caracterizacao: `recordesQuerySchema` so declara `origem`; `?jogo=memory` passa pelo `.strip()`
    // e a resposta e a mesma da chamada sem filtro (200, todos os jogos).
    const porJogo = await s.get('/api/exercises/recordes?jogo=memory')
    expect(porJogo.status).toBe(200)
    expect(await porJogo.json()).toEqual(await (await s.get('/api/exercises/recordes')).json())
  })

  it('GET /api/vocab/distribuicao-dificuldade devolve a distribuicao por faixa', async () => {
    const r = await s.get('/api/vocab/distribuicao-dificuldade')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.distribuicao-dificuldade.json')
  })

  it('GET /api/vocab/:id/ocorrencias devolve a linha do tempo do cartao', async () => {
    const r = await s.get(`/api/vocab/${semente.cartoes[0].id}/ocorrencias`)
    expect(r.status).toBe(200)
    const lista = await r.clone().json()
    expect(lista.length).toBeGreaterThanOrEqual(1)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.id.ocorrencias.json')
  })
})
