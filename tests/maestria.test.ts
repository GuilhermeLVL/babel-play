// @vitest-environment jsdom
/**
 * MAESTRIA POR JOGO (recompensas v2, Task 3.1): pontos por precisão e combo, cinco níveis, e o
 * crédito `maestria:<jogo>:<nível>` conferido contra os pontos que o SERVIDOR soma das linhas
 * gravadas — idempotente por `roundId` (rodada salva duas vezes não conta em dobro).
 *
 * O núcleo puro e o espelho sem conta; o Express está em `tests/integration/economia-maestria`.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { valorDoCredito } from '../src/core/economiaAutoridade'
import { PESOS_SEEDS } from '../src/core/learning/xp'
import {
  creditoDeMaestria,
  creditosDeMaestriaDevidos,
  LIMIARES_DE_MAESTRIA,
  type LinhaDeMaestria,
  maestriaPorJogo,
  nivelDeMaestria,
  NOMES_DE_MAESTRIA,
  pontosDeMaestria,
  rotuloDaMaestria,
} from '../src/core/maestria'
import { MINIGAMES } from '../src/core/minigames/types'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../src/data/efemero/store'

describe('pontosDeMaestria — precisão e combo, nada de tempo', () => {
  it('10/10 com combo 10 → 23; 9/10 sem combo → 14; nenhum item → 0', () => {
    expect(pontosDeMaestria({ acertos: 10, total: 10, comboMaximo: 10 })).toBe(23)
    expect(pontosDeMaestria({ acertos: 9, total: 10, comboMaximo: 0 })).toBe(14)
    expect(pontosDeMaestria({ acertos: 0, total: 0, comboMaximo: 0 })).toBe(0)
  })

  it('o multiplicador segue a régua: 75% vale 1, abaixo vale metade; o bônus de combo tem teto 5', () => {
    expect(pontosDeMaestria({ acertos: 3, total: 4, comboMaximo: 0 })).toBe(3)
    expect(pontosDeMaestria({ acertos: 2, total: 4, comboMaximo: 0 })).toBe(1)
    expect(pontosDeMaestria({ acertos: 4, total: 4, comboMaximo: 99 })).toBe(8 + 5)
  })

  it('a assinatura não tem parâmetro de tempo', () => {
    expect(pontosDeMaestria.length).toBe(1)
    const src = pontosDeMaestria.toString()
    expect(src).not.toMatch(/ms|tempo|minut|segund|duration/i)
  })
})

describe('nivelDeMaestria — os limiares exatos', () => {
  it('29 → 0, 30 → 1, 600 → 5 sem próximo', () => {
    expect(LIMIARES_DE_MAESTRIA).toEqual([30, 100, 220, 400, 600])
    expect(NOMES_DE_MAESTRIA).toEqual(['Bronze', 'Prata', 'Ouro', 'Platina', 'Mestre'])
    expect(nivelDeMaestria(29)).toMatchObject({ nivel: 0, proximo: 30 })
    expect(nivelDeMaestria(30)).toMatchObject({ nivel: 1, proximo: 100, pctNoNivel: 0 })
    expect(nivelDeMaestria(140)).toMatchObject({ nivel: 2, proximo: 220, pctNoNivel: 33 })
    expect(nivelDeMaestria(600)).toMatchObject({ nivel: 5, proximo: null, pctNoNivel: 100 })
    expect(nivelDeMaestria(5000)).toMatchObject({ nivel: 5, proximo: null })
  })

  it('o rótulo diz o jogo e o nome do nível', () => {
    expect(rotuloDaMaestria('memory', 3)).toBe('Memória Ouro')
  })
})

/** Uma rodada gravada: `n` itens, `certos` deles certos, gravados no mesmo milissegundo. */
function rodada(jogo: string, roundId: string, certos: number, n: number, combo: number, em: number): LinhaDeMaestria[] {
  return Array.from({ length: n }, (_, i) => ({ exerciseKind: jogo, roundId, correct: i < certos ? 1 : 0, combo, createdAt: em }))
}

describe('maestriaPorJogo — a soma que o servidor faz', () => {
  it('soma por rodada e por jogo, com os 18 jogos na resposta', () => {
    const linhas = [...rodada('memory', 'r1', 10, 10, 10, 1000), ...rodada('memory', 'r2', 9, 10, 0, 2000), ...rodada('termo', 'r3', 3, 4, 0, 3000)]
    const m = maestriaPorJogo(linhas)
    expect(m).toHaveLength(Object.keys(MINIGAMES).length)
    expect(m.find((j) => j.jogo === 'memory')).toMatchObject({ pontos: 37, nivel: 1 })
    expect(m.find((j) => j.jogo === 'termo')).toMatchObject({ pontos: 3, nivel: 0 })
    expect(m.find((j) => j.jogo === 'taboo')).toMatchObject({ pontos: 0, nivel: 0 })
  })

  it('rodada salva duas vezes (retry) conta uma vez só: vale o primeiro lote do roundId', () => {
    const uma = rodada('memory', 'r1', 10, 10, 10, 1000)
    const retry = rodada('memory', 'r1', 10, 10, 10, 1500)
    expect(maestriaPorJogo([...uma, ...retry]).find((j) => j.jogo === 'memory')?.pontos).toBe(23)
  })

  it('linha sem rodada, sem resposta ou de exercício que não é jogo não entra', () => {
    const linhas: LinhaDeMaestria[] = [
      { exerciseKind: 'memory', roundId: null, correct: 1, combo: 0, createdAt: 1 },
      { exerciseKind: 'read-aloud', roundId: 'x', correct: 1, combo: 0, createdAt: 1 },
      { exerciseKind: 'karaoke', roundId: 'k', correct: null, combo: 0, createdAt: 1 },
    ]
    expect(maestriaPorJogo(linhas).every((j) => j.pontos === 0)).toBe(true)
  })

  it('créditos devidos: um por nível alcançado, menos os já creditados', () => {
    const m = maestriaPorJogo(rodada('memory', 'r1', 10, 10, 10, 1).concat(...Array.from({ length: 9 }, (_, i) => rodada('memory', `r${i + 2}`, 10, 10, 10, 10 + i))))
    // 10 rodadas perfeitas de 23 = 230 → Ouro (nível 3)
    expect(m.find((j) => j.jogo === 'memory')?.nivel).toBe(3)
    expect(creditosDeMaestriaDevidos(m, new Set(['maestria:memory:1']))).toEqual(['maestria:memory:2', 'maestria:memory:3'])
  })
})

describe('valorDoCredito — a família maestria', () => {
  it('maestria:memory:3 vale 20 × 3 Seeds e exige 220 pontos', () => {
    expect(PESOS_SEEDS.nivelDeMaestria).toBe(20)
    const c = valorDoCredito('maestria:memory:3')
    expect(c).toMatchObject({ seeds: 60, xp: 0, reason: 'maestria:memory:3', maestria: { jogo: 'memory', nivel: 3, pontosExigidos: 220 } })
  })

  it('jogo inexistente, nível fora de 1..5 ou formato torto é recusado', () => {
    for (const id of ['maestria:xadrez:1', 'maestria:memory:0', 'maestria:memory:6', 'maestria:memory', 'maestria:memory:2:x']) {
      expect(creditoDeMaestria(id), id).toBeNull()
      expect(valorDoCredito(id), id).toHaveProperty('erro')
    }
  })
})

describe('espelho sem conta — GET /api/metrics/maestria e o crédito conferido', () => {
  beforeEach(async () => {
    await limparTudo()
  })
  afterAll(async () => {
    await fecharStore()
  })

  async function gravar(roundId: string, certos: number, n: number, combo: number) {
    const itens = Array.from({ length: n }, (_, i) => ({ itemRef: `p${i}`, correct: i < certos ? 1 : 0 }))
    await servidorEfemero('/api/exercises/rodada', {
      method: 'POST',
      body: JSON.stringify({ roundId, exerciseKind: 'memory', melhorSequencia: combo, itens }),
    })
  }
  const creditar = (creditoId: string) =>
    servidorEfemero('/api/metrics/seeds/creditar', { method: 'POST', body: JSON.stringify({ creditoId }) })

  it('sem rodada: 18 jogos zerados; o crédito de Bronze é recusado', async () => {
    const r = await servidorEfemero('/api/metrics/maestria', { method: 'GET' })
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.jogos).toHaveLength(18)
    expect(corpo.creditados).toEqual([])
    const c = await creditar('maestria:memory:1')
    expect(c.status).toBe(400)
    expect((await c.json()).code).toBe('maestria_nao_alcancada')
  })

  it('com 30+ pontos o Bronze credita 20 Seeds, uma vez; o mesmo roundId gravado de novo não soma', async () => {
    await gravar('mem-1', 10, 10, 10) // 23
    await gravar('mem-2', 5, 5, 3) // 10 + 1 = 11 → 34
    const m = await (await servidorEfemero('/api/metrics/maestria', { method: 'GET' })).json()
    expect(m.jogos.find((j: { jogo: string }) => j.jogo === 'memory')).toMatchObject({ pontos: 34, nivel: 1 })

    const a = await creditar('maestria:memory:1')
    expect(a.status).toBe(200)
    expect(await a.json()).toMatchObject({ jaExistia: false, seedsCreditadas: 20 })
    const b = await creditar('maestria:memory:1')
    expect(await b.json()).toMatchObject({ jaExistia: true, seedsCreditadas: 20 })
    expect((await creditar('maestria:memory:2')).status).toBe(400)

    const depois = await (await servidorEfemero('/api/metrics/maestria', { method: 'GET' })).json()
    expect(depois.creditados).toEqual(['maestria:memory:1'])
  })
})
