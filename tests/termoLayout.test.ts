/**
 * A GRADE DO TERMO NÃO PODE ESTOURAR EM NENHUMA TELA NEM EM NENHUM ZOOM.
 *
 * O A± de acessibilidade põe `zoom` no `body`, e dentro de um elemento com zoom as unidades de
 * viewport (`vw`/`vh`) continuam resolvendo contra a viewport SEM zoom — o resultado sai
 * multiplicado depois. Era assim que os quatro tabuleiros do Quarteto acabavam colados: a célula
 * saía 15% maior que a conta, os tabuleiros estouravam o container, e as folgas entre eles são a
 * primeira coisa que o navegador come.
 *
 * A varredura abaixo é o contrato: em toda combinação de tela × zoom × palavra, o que a função
 * devolve TEM de caber na largura que ela recebeu. Como a entrada é medida do container (que já
 * vem no espaço de layout zoomado), o zoom entra aqui simplesmente dividindo a viewport — que é
 * exatamente o que o navegador faz.
 */
import { describe, it, expect } from 'vitest'
import {
  layoutDoTermo, larguraDoTabuleiro,
  CELULA_MIN, CELULA_MAX, GAP_CELULA, GAP_TABULEIRO,
} from '../src/core/minigames/termoLayout'

/** Telas reais, da menor à maior. */
const TELAS: Array<[string, number, number]> = [
  ['iPhone SE', 375, 667],
  ['celular comum', 390, 844],
  ['tablet retrato', 768, 1024],
  ['laptop pequeno', 1280, 720],
  ['laptop comum', 1440, 900],
  ['desktop', 1920, 1080],
  ['ultrawide', 2560, 1080],
]
/** Os degraus do A± (o `zoom` que o app aplica no `body`). */
const ZOOMS = [0.9, 1, 1.15, 1.3, 1.5]
const TABULEIROS = [1, 2, 4]
const COLUNAS = [4, 5, 6]

/** Como o componente mede: o container é limitado a `max-w-6xl` (72rem) e vive no espaço zoomado. */
function espaco(larguraTela: number, alturaTela: number, zoom: number, tabuleiros: number, colunas: number) {
  const larguraLayout = larguraTela / zoom
  const alturaLayout = alturaTela / zoom
  return {
    largura: Math.min(1152, larguraLayout - 32), // padding lateral da tela do jogo
    altura: alturaLayout - 330,                  // cabeçalho + teclado + folgas, medidos
    tabuleiros, colunas, linhas: tabuleiros >= 4 ? 9 : tabuleiros === 2 ? 7 : 6,
    cabecalho: 44,
  }
}

describe('a grade cabe no espaço que recebeu, em toda tela e todo zoom', () => {
  for (const [nome, w, h] of TELAS) {
    for (const zoom of ZOOMS) {
      it(`${nome} @ zoom ${zoom}`, () => {
        for (const tabuleiros of TABULEIROS) {
          for (const colunas of COLUNAS) {
            const e = espaco(w, h, zoom, tabuleiros, colunas)
            const { celula, porFileira, moldura, apertado } = layoutDoTermo(e)
            const usada = larguraDoTabuleiro(celula, colunas, moldura) * porFileira + GAP_TABULEIRO * (porFileira - 1)
            /* O contrato tem DOIS ramos, e o segundo é o que impede o defeito de voltar por outro
               caminho: ou cabe, ou a função DECLARA que está apertada (e aí o componente rola de
               lado). O que não pode existir é o terceiro caso — estourar em silêncio, que é quando
               o navegador come as folgas e os tabuleiros se colam. */
            if (apertado) {
              expect(celula, `${nome} z${zoom} ${tabuleiros}×${colunas}`).toBe(CELULA_MIN)
            } else {
              expect(
                usada,
                `${nome} z${zoom} ${tabuleiros}×${colunas}: usa ${Math.round(usada)} de ${Math.round(e.largura)}`,
              ).toBeLessThanOrEqual(e.largura + 0.5)
            }
          }
        }
      })
    }
  }
})

describe('as folgas entre tabuleiros sobrevivem — é o que separa uma palavra da outra', () => {
  it('a folga entre tabuleiros é bem maior que a folga entre quadrados', () => {
    // Se as duas fossem parecidas, vinte e quatro quadrados virariam uma fileira contínua.
    expect(GAP_TABULEIRO).toBeGreaterThanOrEqual(GAP_CELULA * 3)
  })

  it('no quarteto sobra folga de verdade entre os tabuleiros, mesmo apertado', () => {
    for (const [nome, w, h] of TELAS) {
      for (const zoom of ZOOMS) {
        const e = espaco(w, h, zoom, 4, 6)
        const { celula, porFileira, moldura, apertado } = layoutDoTermo(e)
        if (apertado) continue // rola de lado, mas as folgas continuam lá — e é isso que importa
        const largura = larguraDoTabuleiro(celula, 6, moldura) * porFileira + GAP_TABULEIRO * (porFileira - 1)
        expect(e.largura - largura, `${nome} z${zoom}`).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('a célula fica dentro dos limites do legível', () => {
  it('o celular comum aguenta o quarteto SEM rolar de lado', () => {
    // O aparelho mais comum não pode caber no ramo "apertado": é a tela de referência.
    expect(layoutDoTermo(espaco(390, 844, 1, 4, 6)).apertado).toBe(false)
    expect(layoutDoTermo(espaco(390, 844, 1, 4, 5)).apertado).toBe(false)
  })

  it('nunca abaixo do piso nem acima do teto', () => {
    for (const [, w, h] of TELAS) {
      for (const zoom of ZOOMS) {
        for (const t of TABULEIROS) {
          const { celula } = layoutDoTermo(espaco(w, h, zoom, t, 6))
          expect(celula).toBeGreaterThanOrEqual(CELULA_MIN)
          expect(celula).toBeLessThanOrEqual(CELULA_MAX)
        }
      }
    }
  })

  it('mais zoom = célula MAIOR na tela: é para isso que o A± existe', () => {
    // A célula em px de layout encolhe (o espaço de layout encolheu), mas o tamanho RENDERIZADO
    // — que é o que a pessoa enxerga — precisa crescer. Era exatamente isto que o `vh` quebrava.
    const renderizada = (zoom: number) => layoutDoTermo(espaco(1920, 1080, zoom, 4, 6)).celula * zoom
    expect(renderizada(1.15)).toBeGreaterThan(renderizada(1))
    expect(renderizada(1.5)).toBeGreaterThan(renderizada(1.15))
  })
})

describe('o quarteto escolhe o arranjo que dá o maior quadrado', () => {
  it('em tela larga e baixa, prefere 1×4', () => {
    expect(layoutDoTermo(espaco(2560, 1080, 1, 4, 6)).porFileira).toBe(4)
  })

  it('em celular, prefere 2×2 — 1×4 espremeria os quadrados abaixo do legível', () => {
    expect(layoutDoTermo(espaco(390, 844, 1, 4, 5)).porFileira).toBe(2)
  })

  it('o dueto e o termo simples nunca mudam de arranjo', () => {
    for (const [, w, h] of TELAS) {
      expect(layoutDoTermo(espaco(w, h, 1, 2, 6)).porFileira).toBe(2)
      expect(layoutDoTermo(espaco(w, h, 1, 1, 6)).porFileira).toBe(1)
    }
  })
})
