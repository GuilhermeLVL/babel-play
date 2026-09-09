/**
 * ONDE UM POPUP ABRE QUANDO O CORPO ESTÁ COM ZOOM (o A± de acessibilidade).
 *
 * BUG QUE ISTO PRENDE (observado na tela de captura, com A+ ligado): a gaveta de idiomas abria
 * ~200px FORA da direita da tela. A conta de posição estava certa — o que faltava era saber que
 * `body { zoom: 1.15 }` reescala tudo que é `position: fixed` dentro dele. Uma coordenada de
 * viewport escrita no `style` vira `coord × zoom` na tela, e o painel some pela borda.
 *
 * Como `getBoundingClientRect()` e `window.innerWidth` já vêm em pixels de TELA, a decisão de
 * caber ou não precisa usar o tamanho RENDERIZADO (largura × zoom), e o resultado precisa ser
 * devolvido em coordenadas PRÉ-zoom — que é o que o `style` do elemento entende.
 *
 * Vale para os quatro consumidores do hook (LangPicker, menu e filtros da Biblioteca, InfoHint,
 * gaveta de idiomas): todos renderizam por portal dentro do `body`.
 */
import { describe, expect,it } from 'vitest'

import { caixaFlutuante } from '../src/lib/posicaoFlutuante'

const viewport = { width: 1920, height: 893 }
const padrao = { largura: 320, alturaEstimada: 220, margem: 8 }

/** Gatilho no canto direito da tela — o caso em que o bug aparecia. */
const gatilhoDireita = { top: 460, bottom: 490, left: 1300, right: 1520, width: 220 }

describe('sem zoom (o caso comum) nada muda', () => {
  it('alinha pela direita do gatilho', () => {
    const c = caixaFlutuante(gatilhoDireita, viewport, { ...padrao, zoom: 1 })
    expect(c.left).toBe(1520 - 320)
    expect(c.top).toBe(494)
    expect(c.largura).toBe(320)
  })

  it('encosta na margem quando o gatilho está colado na borda', () => {
    const colado = { top: 100, bottom: 130, left: 1880, right: 1918, width: 38 }
    const c = caixaFlutuante(colado, viewport, { ...padrao, zoom: 1 })
    expect(c.left + c.largura).toBeLessThanOrEqual(viewport.width - padrao.margem)
  })

  it('abre para CIMA quando não cabe abaixo', () => {
    const peDaTela = { top: 800, bottom: 840, left: 1300, right: 1520, width: 220 }
    const c = caixaFlutuante(peDaTela, viewport, { ...padrao, zoom: 1 })
    expect(c.top).toBeLessThan(peDaTela.top)
  })
})

describe('com o corpo em zoom o painel continua DENTRO da tela', () => {
  const zoom = 1.15

  it('a borda direita renderizada não passa da janela', () => {
    const c = caixaFlutuante(gatilhoDireita, viewport, { ...padrao, zoom })
    // O que o navegador vai pintar: as coordenadas do style, multiplicadas pelo zoom do corpo.
    const direitaNaTela = c.left * zoom + c.largura * zoom
    expect(direitaNaTela).toBeLessThanOrEqual(viewport.width - padrao.margem + 0.001)
  })

  it('a borda esquerda renderizada não fica negativa nem invade a margem', () => {
    const perto = { top: 460, bottom: 490, left: 10, right: 60, width: 50 }
    const c = caixaFlutuante(perto, viewport, { ...padrao, zoom })
    expect(c.left * zoom).toBeGreaterThanOrEqual(padrao.margem - 0.001)
  })

  it('o topo renderizado encosta logo abaixo do gatilho, não deslocado pelo zoom', () => {
    const c = caixaFlutuante(gatilhoDireita, viewport, { ...padrao, zoom })
    expect(c.top * zoom).toBeCloseTo(gatilhoDireita.bottom + 4, 6)
  })

  it('a decisão de abrir para cima usa a altura RENDERIZADA, não a autoral', () => {
    /* Com 220 de altura autoral e zoom 1,15 o painel ocupa 253px na tela. Um gatilho com 240px
       livres abaixo caberia pela conta antiga e vazaria pelo pé da tela na prática. */
    const g = { top: 600, bottom: 645, left: 1300, right: 1520, width: 220 }
    expect(viewport.height - g.bottom).toBe(248)
    const c = caixaFlutuante(g, viewport, { ...padrao, zoom })
    expect(c.top).toBeLessThan(g.top) // abriu para cima
  })

  it("largura 'ancora' copia o gatilho na TELA, não 15% maior", () => {
    const c = caixaFlutuante(gatilhoDireita, viewport, { ...padrao, largura: 'ancora', zoom })
    expect(c.largura * zoom).toBeCloseTo(gatilhoDireita.width, 6)
  })
})
