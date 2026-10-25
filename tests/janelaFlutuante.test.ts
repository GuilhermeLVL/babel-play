/**
 * A JANELA FLUTUANTE EM REGRA PURA (`core/legendas/janelaFlutuante`): o formato sugerido pelo que o
 * app sabe da captura, o layout que cabe no tamanho REAL da janela, quantas falas, a letra que
 * acompanha a largura, o tamanho guardado por formato e a quebra de linha do quadro do PiP de vídeo.
 */
import { describe, expect, it } from 'vitest'

import {
  falasAVista,
  formatoSugerido,
  layoutPorTamanho,
  normalizarTamanhos,
  quebrarLinhas,
  TAMANHO_DO_FORMATO,
  tamanhoDaLetra,
  tamanhoParaAbrir,
} from '../src/core/legendas/janelaFlutuante'
import { caminhoDaJanela, suportaPiPDeVideo } from '../src/lib/legendas/janelaDoNavegador'

describe('formato sugerido', () => {
  it('intérprete, reunião (som + microfone) e só o microfone (aula, conversa) → conversa', () => {
    expect(formatoSugerido({ interprete: true, cenario: 'media', superficie: 'browser' })).toBe('conversa')
    expect(formatoSugerido({ interprete: false, cenario: 'conversation' })).toBe('conversa')
    expect(formatoSugerido({ interprete: false, cenario: 'mic' })).toBe('conversa')
  })
  it('som de uma aba (vídeo no navegador) → legenda; tela inteira ou janela (jogo) → faixa', () => {
    expect(formatoSugerido({ interprete: false, cenario: 'media', superficie: 'browser' })).toBe('legenda')
    expect(formatoSugerido({ interprete: false, cenario: 'media', superficie: 'monitor' })).toBe('faixa')
    expect(formatoSugerido({ interprete: false, cenario: 'media', superficie: 'window' })).toBe('faixa')
  })
  it('sem saber de onde vem o som → legenda (o meio-termo)', () => {
    expect(formatoSugerido({ interprete: false, cenario: 'media', superficie: null })).toBe('legenda')
    expect(formatoSugerido({ interprete: false, cenario: 'media' })).toBe('legenda')
  })
})

describe('layout pelo tamanho real da janela', () => {
  it('cada formato, no seu tamanho de abertura, é ele mesmo', () => {
    for (const f of ['faixa', 'legenda', 'conversa', 'estudo'] as const)
      expect(layoutPorTamanho(f, TAMANHO_DO_FORMATO[f])).toBe(f)
  })
  it('sem medida (fora da PiP), o layout é o formato', () => {
    expect(layoutPorTamanho('conversa', null)).toBe('conversa')
    expect(layoutPorTamanho('faixa', { largura: 0, altura: 0 })).toBe('faixa')
  })
  it('achatar qualquer formato vira faixa', () => {
    expect(layoutPorTamanho('conversa', { largura: 400, altura: 120 })).toBe('faixa')
    expect(layoutPorTamanho('estudo', { largura: 500, altura: 100 })).toBe('faixa')
  })
  it('esticar a faixa vira legenda; esticar em pé vira conversa', () => {
    expect(layoutPorTamanho('faixa', { largura: 720, altura: 220 })).toBe('legenda')
    expect(layoutPorTamanho('faixa', { largura: 420, altura: 480 })).toBe('conversa')
    expect(layoutPorTamanho('legenda', { largura: 380, altura: 360 })).toBe('conversa')
  })
  it('conversa larga e não tão alta continua conversa; deitada e baixa vira legenda', () => {
    expect(layoutPorTamanho('conversa', { largura: 700, altura: 280 })).toBe('conversa')
    expect(layoutPorTamanho('conversa', { largura: 700, altura: 200 })).toBe('legenda')
  })
  it('estudo baixo demais para o cartão vira legenda', () => {
    expect(layoutPorTamanho('estudo', { largura: 600, altura: 200 })).toBe('legenda')
  })
})

describe('falas à vista', () => {
  it('faixa e estudo: uma; legenda: até duas se a altura deixa; conversa: o que a altura comporta', () => {
    expect(falasAVista('faixa', { largura: 720, altura: 110 }, 3)).toBe(1)
    expect(falasAVista('estudo', { largura: 440, altura: 380 }, 5)).toBe(1)
    expect(falasAVista('legenda', { largura: 600, altura: 170 }, 3)).toBe(1)
    expect(falasAVista('legenda', { largura: 600, altura: 260 }, 3)).toBe(2)
    expect(falasAVista('legenda', { largura: 600, altura: 260 }, 1)).toBe(1)
    expect(falasAVista('conversa', { largura: 400, altura: 460 }, 3)).toBe(4)
    expect(falasAVista('conversa', { largura: 400, altura: 900 }, 3)).toBe(6)
    expect(falasAVista('conversa', { largura: 400, altura: 200 }, 3)).toBe(2)
  })
  it('sem medida, vale a preferência (menos faixa e estudo)', () => {
    expect(falasAVista('legenda', null, 3)).toBe(3)
    expect(falasAVista('faixa', null, 3)).toBe(1)
  })
})

describe('a letra acompanha a largura', () => {
  it('cresce com a janela, dentro de limites, vezes a escala da pessoa', () => {
    expect(tamanhoDaLetra('faixa', 720)).toBe(24)
    expect(tamanhoDaLetra('faixa', 300)).toBe(17)
    expect(tamanhoDaLetra('faixa', 2000)).toBe(30)
    expect(tamanhoDaLetra('conversa', 400)).toBe(15)
    expect(tamanhoDaLetra('legenda', 600, 1.5)).toBe(35)
    expect(tamanhoDaLetra('legenda', 0)).toBe(tamanhoDaLetra('legenda', 600))
  })
})

describe('o tamanho guardado por formato', () => {
  it('só o que tem forma de tamanho entra, dentro de limites', () => {
    expect(
      normalizarTamanhos({
        faixa: { largura: 800.4, altura: 90 },
        conversa: { largura: 'x', altura: 3 },
        estudo: { largura: 99999, altura: 10 },
        outro: { largura: 1, altura: 1 },
      }),
    ).toEqual({ faixa: { largura: 800, altura: 90 }, estudo: { largura: 2400, altura: 80 } })
    expect(normalizarTamanhos(null)).toEqual({})
  })
  it('abre no último tamanho daquele formato, ou no de fábrica', () => {
    expect(tamanhoParaAbrir('faixa', { faixa: { largura: 900, altura: 120 } })).toEqual({ largura: 900, altura: 120 })
    expect(tamanhoParaAbrir('legenda', { faixa: { largura: 900, altura: 120 } })).toEqual(TAMANHO_DO_FORMATO.legenda)
  })
})

describe('quebrar linhas (o quadro do PiP de vídeo)', () => {
  const medir = (s: string) => s.length * 10
  it('quebra pela largura, sem perder palavra', () => {
    expect(quebrarLinhas('one two three four', 90, medir)).toEqual(['one two', 'three', 'four'])
  })
  it('palavra maior que a linha vai sozinha', () => {
    expect(quebrarLinhas('supercalifragilistic go', 50, medir)).toEqual(['supercalifragilistic', 'go'])
  })
  it('com teto de linhas, ficam as ÚLTIMAS (o fim da frase é o que acabou de ser dito)', () => {
    expect(quebrarLinhas('a b c d e f', 30, medir, 2)).toEqual(['c d', 'e f'])
  })
  it('texto vazio → nenhuma linha', () => {
    expect(quebrarLinhas('   ', 100, medir)).toEqual([])
  })
})

describe('que janela este navegador dá', () => {
  const comVideo = {
    document: { pictureInPictureEnabled: true },
    HTMLCanvasElement: { prototype: { captureStream: () => null } },
    HTMLVideoElement: { prototype: { requestPictureInPicture: () => null } },
  }
  it('Document PiP (Chrome/Edge) vence', () => {
    expect(caminhoDaJanela({ ...comVideo, documentPictureInPicture: { requestWindow: () => null } })).toBe('documento')
  })
  it('sem ela, o PiP de vídeo com canvas (Safari)', () => {
    expect(suportaPiPDeVideo(comVideo)).toBe(true)
    expect(caminhoDaJanela(comVideo)).toBe('video')
  })
  it('PiP desligado, sem captureStream ou sem requestPictureInPicture (Firefox) → o painel', () => {
    expect(caminhoDaJanela({ ...comVideo, document: { pictureInPictureEnabled: false } })).toBe('painel')
    expect(caminhoDaJanela({ ...comVideo, HTMLCanvasElement: { prototype: {} } })).toBe('painel')
    expect(caminhoDaJanela({ ...comVideo, HTMLVideoElement: { prototype: {} } })).toBe('painel')
    expect(caminhoDaJanela({})).toBe('painel')
  })
})
