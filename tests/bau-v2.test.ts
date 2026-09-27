// @vitest-environment jsdom
/**
 * BAÚ v2 (recompensas v2, Task 2.2): estrelas mínimas, teto diário no dia LOCAL, garantia no 5º,
 * repetido vira Seeds, chances na resposta — e idempotência por `roundId`.
 *
 * O núcleo puro (`decidirBau`, `situacaoDoBau`) e o caminho do espelho sem conta, que é o mesmo
 * código do Express (paridade em `tests/contratos/economia.test.ts`).
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BAUS_POR_DIA,
  CHANCES_DO_BAU,
  decidirBau,
  itensSorteaveisNoDrop,
  PITY_DO_BAU,
  proximoRaroGarantidoEm,
  SEEDS_DO_REPETIDO,
  situacaoDoBau,
  valorDoRepetido,
} from '../src/core/economiaAutoridade'
import { diaNoFuso } from '../src/core/learning/economia'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../src/data/efemero/store'

const TODOS = itensSorteaveisNoDrop(new Set())
const base = { estrelas: 3 as const, bausHoje: 0, semRaroSeguidos: 0, sorteio: 0.5, elegiveis: TODOS }

describe('decidirBau — a regra pura', () => {
  it('menos de duas estrelas: sem baú, pelo motivo certo', () => {
    expect(decidirBau({ ...base, estrelas: 1 })).toEqual({ tipo: 'sem-bau', motivo: 'estrelas' })
    expect(decidirBau({ ...base, estrelas: 0 })).toEqual({ tipo: 'sem-bau', motivo: 'estrelas' })
    expect(decidirBau({ ...base, estrelas: 2 }).tipo).toBe('item')
  })

  it('teto diário: o 4º baú do dia não sai', () => {
    expect(BAUS_POR_DIA).toBe(3)
    expect(decidirBau({ ...base, bausHoje: 3 })).toEqual({ tipo: 'sem-bau', motivo: 'teto' })
    expect(decidirBau({ ...base, bausHoje: 2 }).tipo).toBe('item')
  })

  it('garantia: com 4 baús seguidos sem raro, o próximo é raro mesmo com sorteio de comum', () => {
    expect(PITY_DO_BAU).toBe(5)
    const d = decidirBau({ ...base, semRaroSeguidos: 4, sorteio: 0.01 })
    expect(d.tipo).toBe('item')
    if (d.tipo === 'item') expect(d.raridade).toBe('raro')
    const sem = decidirBau({ ...base, semRaroSeguidos: 3, sorteio: 0.01 })
    if (sem.tipo === 'item') expect(sem.raridade).toBe('comum')
  })

  it('as chances anunciadas são as do sorteio: 75% comum, 25% raro', () => {
    expect(CHANCES_DO_BAU).toEqual({ comum: 75, raro: 25 })
    const N = 10_000
    let comuns = 0
    for (let n = 0; n < N; n++) {
      const d = decidirBau({ ...base, sorteio: n / N })
      if (d.tipo !== 'sem-bau' && d.raridade === 'comum') comuns += 1
    }
    expect(comuns / N).toBeCloseTo(0.75, 3)
  })

  it('elegíveis vazios: vira Seeds com o valor da raridade sorteada', () => {
    expect(decidirBau({ ...base, elegiveis: [], sorteio: 0.1 })).toEqual({ tipo: 'seeds', seeds: SEEDS_DO_REPETIDO.comum, raridade: 'comum' })
    expect(decidirBau({ ...base, elegiveis: [], sorteio: 0.9 })).toEqual({ tipo: 'seeds', seeds: SEEDS_DO_REPETIDO.raro, raridade: 'raro' })
    // Faixa sorteada vazia não devolve a chance à outra: a taxa anunciada não muda sozinha.
    const soComuns = TODOS.filter((i) => i.raridade === 'comum')
    expect(decidirBau({ ...base, elegiveis: soComuns, sorteio: 0.9 })).toEqual({ tipo: 'seeds', seeds: 40, raridade: 'raro' })
  })

  it('o repetido não atesta posse: o razão não é `drop:`', () => {
    const r = valorDoRepetido('drop:r1', 'raro')
    expect(r).toMatchObject({ seeds: 40, reason: 'bau:repetido:raro' })
  })
})

describe('situacaoDoBau — dia local e sequência sem raro', () => {
  const fuso = 'America/Sao_Paulo'
  const diaDe = (t: number) => diaNoFuso(t, fuso)
  const comum = TODOS.find((i) => i.raridade === 'comum')!
  const raro = TODOS.find((i) => i.raridade === 'raro')!

  it('baús às 23:59 e às 00:01 contam em dias diferentes', () => {
    const t2359 = Date.UTC(2026, 8, 28, 2, 59) // 27/09 23:59 em -03
    const t0001 = Date.UTC(2026, 8, 28, 3, 1) // 28/09 00:01 em -03
    const baus = [{ em: t2359, reason: `drop:${comum.id}` }, { em: t0001, reason: `drop:${comum.id}` }]
    expect(situacaoDoBau(baus, '2026-09-27', diaDe).bausHoje).toBe(1)
    expect(situacaoDoBau(baus, '2026-09-28', diaDe).bausHoje).toBe(1)
  })

  it('conta os seguidos sem raro do mais recente para trás; repetido conta pela raridade', () => {
    const baus = [
      { em: 1, reason: `drop:${comum.id}` },
      { em: 2, reason: `drop:${raro.id}` },
      { em: 3, reason: 'bau:repetido:comum' },
      { em: 4, reason: `drop:${comum.id}` },
    ]
    expect(situacaoDoBau(baus, 'x', () => 'y').semRaroSeguidos).toBe(2)
    expect(situacaoDoBau([...baus, { em: 5, reason: 'bau:repetido:raro' }], 'x', () => 'y').semRaroSeguidos).toBe(0)
    expect(proximoRaroGarantidoEm(4)).toBe(1)
    expect(proximoRaroGarantidoEm(0)).toBe(5)
  })
})

describe('o baú pela rota (espelho sem conta)', () => {
  afterAll(() => fecharStore())
  beforeEach(async () => {
    vi.useRealTimers()
    await limparTudo()
  })

  const post = (rota: string, corpo: unknown) => servidorEfemero(rota, { method: 'POST', body: JSON.stringify(corpo) })
  const rodada = (roundId: string) =>
    post('/api/exercises/rodada', {
      roundId,
      exerciseKind: 'memory',
      origem: 'baralho',
      score: 10,
      melhorSequencia: 4,
      itens: Array.from({ length: 4 }, (_, i) => ({ itemRef: `b${i}`, correct: 1, attempts: 1, ms: 400, hinted: 0, kind: 'drill' })),
    })
  const abrir = async (roundId: string) => {
    await rodada(roundId)
    const r = await post('/api/metrics/seeds/creditar', { creditoId: `drop:${roundId}`, fuso: 'America/Sao_Paulo' })
    return { status: r.status, body: await r.json() }
  }

  it('a resposta traz as chances e quantos faltam para o raro garantido', async () => {
    const r = await abrir('r-chances')
    expect(r.status).toBe(200)
    expect(r.body.chances).toEqual({ comum: 75, raro: 25 })
    expect(r.body.proximoRaroGarantidoEm).toBeGreaterThanOrEqual(1)
    expect(r.body.proximoRaroGarantidoEm).toBeLessThanOrEqual(PITY_DO_BAU)
    expect(['comum', 'raro']).toContain(r.body.raridade)
  })

  it('mesmo roundId duas vezes: um crédito só, e a mesma resposta', async () => {
    const a = await abrir('r-dup')
    const b = await (await post('/api/metrics/seeds/creditar', { creditoId: 'drop:r-dup' })).json()
    expect(b.jaExistia).toBe(true)
    expect(b.item).toBe(a.body.item)
    expect(b.seedsCreditadas).toBe(a.body.seedsCreditadas)
  })

  it('o 4º baú do dia não sai e não grava nada', async () => {
    for (const id of ['t1', 't2', 't3']) expect((await abrir(id)).body.item !== undefined).toBe(true)
    const quarto = await abrir('t4')
    expect(quarto.status).toBe(200)
    expect(quarto.body).toMatchObject({ semBau: 'teto', item: null })
    const repetir = await (await post('/api/metrics/seeds/creditar', { creditoId: 'drop:t4' })).json()
    expect(repetir.jaExistia).toBe(false)
  })

  it('virada de meia-noite: o teto recomeça no dia local seguinte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 28, 2, 50))) // 27/09 23:50 em -03
    for (const id of ['m1', 'm2', 'm3']) await abrir(id)
    expect((await abrir('m4')).body.semBau).toBe('teto')
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 28, 3, 1))) // 28/09 00:01 em -03
    const novoDia = await abrir('m5')
    expect(novoDia.body.semBau).toBeUndefined()
    vi.useRealTimers()
  })
})
