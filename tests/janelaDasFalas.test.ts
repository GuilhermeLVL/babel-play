/**
 * A JANELA DA LEGENDA LONGA (`lib/captura/janelaDasFalas`, 26/10/2026): a conta de quais blocos de falas ficam no
 * DOM e da altura dos vãos que ficam no lugar dos outros. Pura: a tela (`HistoricoDoPrototipo`) mede e rola.
 */
import { describe, expect, it } from 'vitest'

import {
  ajusteDaRolagem,
  ALTURA_DA_FALA_ESTIMADA,
  alturaDoBloco,
  alturaMediaDaFala,
  alturaTotal,
  ancoraDaLeitura,
  BLOCOS_SEM_JANELA,
  blocosNaJanela,
  janelaDasFalas,
  type PedacoDaJanela,
  toposDosBlocos,
} from '../src/lib/captura/janelaDasFalas'

const ESPACO = 10
/** n blocos de 1.000 px (com o espaço de 10 entre eles, o bloco i começa em i × 1.010). */
const blocos = (n: number, h = 1000) => Array.from({ length: n }, () => h)

describe('alturaMediaDaFala e alturaDoBloco', () => {
  it('sem medida nenhuma, a fala tem a altura reservada no CSS', () => {
    expect(alturaMediaDaFala([], ESPACO)).toBe(ALTURA_DA_FALA_ESTIMADA)
    expect(alturaDoBloco(undefined, 20, ALTURA_DA_FALA_ESTIMADA, ESPACO)).toBe(20 * 84 + 19 * 10)
  })

  it('a média sai das medidas, sem os espaços entre as linhas, e ignora bloco vazio', () => {
    const medidas = [
      { altura: 20 * 100 + 19 * ESPACO, falas: 20 },
      { altura: 10 * 50 + 9 * ESPACO, falas: 10 },
      { altura: 0, falas: 0 },
    ]
    expect(alturaMediaDaFala(medidas, ESPACO)).toBeCloseTo((20 * 100 + 10 * 50) / 30)
  })

  it('o bloco medido com as mesmas falas usa a medida; com outras, a proporção; vazio não ocupa', () => {
    expect(alturaDoBloco({ altura: 1500, falas: 20 }, 20, 84, ESPACO)).toBe(1500)
    expect(alturaDoBloco({ altura: 1500, falas: 20 }, 21, 84, ESPACO)).toBe(1575)
    expect(alturaDoBloco(undefined, 0, 84, ESPACO)).toBe(0)
    expect(alturaDoBloco(undefined, 1, 84, ESPACO)).toBe(84)
  })
})

describe('blocosNaJanela', () => {
  it(`até ${BLOCOS_SEM_JANELA} blocos, todos ficam (a janela não paga o que custa)`, () => {
    expect(
      blocosNaJanela({ alturas: blocos(BLOCOS_SEM_JANELA), espaco: ESPACO, topo: 0, visivel: 500, folga: 0 }),
    ).toEqual([0, 1, 2, 3])
  })

  it('acompanhando ao vivo (`topo: null`), a janela é a do fim, com a folga acima', () => {
    // 30 blocos: o fim fica em 30 × 1.000 + 29 × 10 = 30.290; a área visível de 600 começa em 29.690.
    const v = { alturas: blocos(30), espaco: ESPACO, topo: null, visivel: 600, folga: 600 }
    expect(blocosNaJanela(v)).toEqual([28, 29])
  })

  it('no meio da lista: os blocos que cruzam a área visível mais a folga, e o último sempre', () => {
    // área visível 10.100–10.700 (o bloco 10 começa em 10.100); com folga de 600: 9.500–11.300.
    const v = { alturas: blocos(30), espaco: ESPACO, topo: 10_100, visivel: 600, folga: 600 }
    expect(blocosNaJanela(v)).toEqual([9, 10, 11, 29])
  })

  it('no topo da lista: o primeiro bloco e o último', () => {
    expect(blocosNaJanela({ alturas: blocos(30), espaco: ESPACO, topo: 0, visivel: 600, folga: 0 })).toEqual([0, 29])
  })

  it('os fixos (foco, fala escolhida, fala tocando) ficam onde estiverem; índice inválido é ignorado', () => {
    const v = { alturas: blocos(30), espaco: ESPACO, topo: 0, visivel: 600, folga: 0, fixos: [17, -1, 99, 3] }
    expect(blocosNaJanela(v)).toEqual([0, 3, 17, 29])
  })

  it('a borda exata não monta o bloco vizinho (o que só encosta não cruza)', () => {
    // área 1.010–2.010 sem folga: o bloco 1 (1.010–2.010) cruza; o 0 termina em 1.000 e o 2 começa em 2.020.
    expect(blocosNaJanela({ alturas: blocos(10), espaco: ESPACO, topo: 1010, visivel: 1000, folga: 0 })).toEqual([1, 9])
  })
})

describe('janelaDasFalas: os vãos', () => {
  const alturaDosPedacos = (p: PedacoDaJanela[], alturas: number[]) =>
    alturaTotal(
      p.map((x) => (x.tipo === 'vao' ? x.altura : alturas[x.i])),
      ESPACO,
    )

  it('cada sequência de blocos de fora vira UM vão, com as alturas e os espaços entre eles', () => {
    const alturas = [500, 600, 700, 800, 900, 1000, 1100]
    const p = janelaDasFalas({ alturas, espaco: ESPACO, topo: 1110 + 710, visivel: 100, folga: 0 })
    // área 1.820–1.920: o bloco 2 vai de 1.120 a 1.820 e só encosta; o 3 (1.830–2.630) cruza.
    expect(p).toEqual([
      { tipo: 'vao', de: 0, ate: 2, altura: 500 + 600 + 700 + 2 * ESPACO },
      { tipo: 'bloco', i: 3 },
      { tipo: 'vao', de: 4, ate: 5, altura: 900 + 1000 + ESPACO },
      { tipo: 'bloco', i: 6 },
    ])
  })

  it('trocar blocos por vãos não muda a altura da lista nem onde cada bloco montado começa', () => {
    const alturas = Array.from({ length: 50 }, (_, i) => 900 + ((i * 37) % 300))
    const total = alturaTotal(alturas, ESPACO)
    for (const topo of [0, 5_000, 20_000, 40_000, null]) {
      const p = janelaDasFalas({ alturas, espaco: ESPACO, topo, visivel: 700, folga: 700 })
      expect(alturaDosPedacos(p, alturas)).toBe(total)
      let y = 0
      for (const x of p) {
        if (x.tipo === 'bloco') {
          const esperado = alturas.slice(0, x.i).reduce((a, h) => a + h + ESPACO, 0)
          expect(y).toBe(esperado)
        }
        y += (x.tipo === 'vao' ? x.altura : alturas[x.i]) + ESPACO
      }
    }
  })

  it('2.005 falas (101 blocos): no fim, a janela monta 2 blocos; rolar ao topo monta o primeiro e mantém o último', () => {
    // 100 blocos cheios de 1.870 px e o último, aberto, com 5 falas (460 px): a área visível pega o fim do bloco 99.
    const alturas = [...blocos(100, 1870), 460]
    const fim = janelaDasFalas({ alturas, espaco: ESPACO, topo: null, visivel: 800, folga: 800 })
    expect(fim.filter((x) => x.tipo === 'bloco').map((x) => (x as { i: number }).i)).toEqual([99, 100])
    expect(fim[0]).toMatchObject({ tipo: 'vao', de: 0, ate: 98 })
    const topo = janelaDasFalas({ alturas, espaco: ESPACO, topo: 0, visivel: 800, folga: 800 })
    expect(topo.filter((x) => x.tipo === 'bloco').map((x) => (x as { i: number }).i)).toEqual([0, 100])
  })

  it('sem bloco nenhum, nada', () => {
    expect(janelaDasFalas({ alturas: [], espaco: ESPACO, topo: null, visivel: 800, folga: 800 })).toEqual([])
  })
})

describe('ajusteDaRolagem (navegador sem `overflow-anchor`)', () => {
  it('o bloco inteiro acima da área visível cresceu ou encolheu: a rolagem anda a diferença', () => {
    expect(ajusteDaRolagem(0, 1000, 1200, 5000)).toBe(200)
    expect(ajusteDaRolagem(0, 1000, 900, 1000)).toBe(-100)
  })

  it('o bloco à vista ou abaixo dela não mexe na rolagem', () => {
    expect(ajusteDaRolagem(4500, 1000, 1200, 5000)).toBe(0)
    expect(ajusteDaRolagem(6000, 1000, 1200, 5000)).toBe(0)
  })
})

describe('toposDosBlocos e ancoraDaLeitura (a âncora sem `overflow-anchor`)', () => {
  it('cada bloco começa depois dos de cima e dos espaços', () => {
    expect(toposDosBlocos([100, 200, 50], ESPACO)).toEqual([0, 110, 320])
    expect(toposDosBlocos([], ESPACO)).toEqual([])
  })

  it('a âncora é o primeiro bloco montado que ainda aparece; o que já passou inteiro não conta', () => {
    const alturas = [1000, 1000, 1000, 1000]
    const topos = toposDosBlocos(alturas, ESPACO)
    expect(ancoraDaLeitura([1, 2, 3], topos, alturas, 1500)).toBe(1)
    expect(ancoraDaLeitura([1, 2, 3], topos, alturas, 2010)).toBe(2)
    expect(ancoraDaLeitura([0, 3], topos, alturas, 2500)).toBe(3)
    expect(ancoraDaLeitura([0], topos, alturas, 2500)).toBe(-1)
  })

  it('o vão acima reestimado anda a âncora: a diferença é o quanto a rolagem anda', () => {
    const antes = toposDosBlocos([1000, 1000, 1000], ESPACO)
    const depois = toposDosBlocos([1300, 1000, 1000], ESPACO)
    const i = ancoraDaLeitura([2], antes, [1000, 1000, 1000], 2100)
    expect(depois[i] - antes[i]).toBe(300)
  })
})
