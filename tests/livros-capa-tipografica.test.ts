/**
 * A CAPA TIPOGRÁFICA: contraste AA em todas as paletas e nos dois temas, quebra do título (até 4 linhas, nada
 * de palavra estourando a caixa), determinismo e variedade.
 */
import { describe, expect, it } from 'vitest'

import {
  CAIXA_DO_TITULO,
  contraste,
  diagramarAutor,
  diagramarTitulo,
  hash32,
  MAX_LINHAS_DO_TITULO,
  ORNAMENTOS,
  paletaDe,
  planoDaCapa,
  quebrarEmLinhas,
  tituloPrincipal,
} from '../src/core/livros/capaTipografica'

describe('contraste das paletas', () => {
  it('título, autor e selo passam de 4,5:1 (AA) em qualquer matiz, esquema, tema e variação', () => {
    for (let matiz = 0; matiz < 360; matiz += 3) {
      for (const forte of [false, true]) {
        for (const escuro of [false, true]) {
          for (let variacao = 0; variacao < 8; variacao++) {
            const p = paletaDe(matiz, forte, escuro, variacao)
            expect(
              contraste(p.tinta, p.fundo),
              `matiz ${matiz} forte=${forte} escuro=${escuro} v=${variacao}`,
            ).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    }
  })

  it('a conta do contraste confere com valores conhecidos da WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contraste('#ffffff', '#ffffff')).toBe(1)
  })
})

describe('quebra do título', () => {
  const titulos = [
    'Dom Casmurro',
    'Memórias Póstumas de Brás Cubas',
    'The Adventures of Sherlock Holmes',
    'Pride and Prejudice',
    'A',
    'Crime e Castigo',
    'Don Quijote de la Mancha',
    'Os Maias: Episódios da Vida Romântica',
    'Anticonstitucionalissimamente',
    'Supercalifragilisticexpialidocious Extraordinarily Long Compound Word Title That Never Seems To End Here',
    'Moby Dick; or, The Whale',
    'Die Leiden des jungen Werthers und andere Erzählungen aus der Zeit',
    'اسم الكتاب الطويل جدا في اللغة العربية',
  ]

  it.each(titulos)('cabe em até 4 linhas e dentro da caixa: %s', (titulo) => {
    const d = diagramarTitulo(titulo)
    expect(d.linhas.length).toBeGreaterThan(0)
    expect(d.linhas.length).toBeLessThanOrEqual(MAX_LINHAS_DO_TITULO)
    const colunas = Math.floor(CAIXA_DO_TITULO.largura / (d.corpo * 0.6))
    for (const l of d.linhas) expect(l.length).toBeLessThanOrEqual(colunas)
    expect(d.ys).toHaveLength(d.linhas.length)
    expect(d.ys[d.ys.length - 1]).toBeLessThanOrEqual(CAIXA_DO_TITULO.topo + CAIXA_DO_TITULO.altura)
    expect(d.ys[0]).toBeGreaterThanOrEqual(CAIXA_DO_TITULO.topo)
  })

  it('título curto usa corpo grande; título longo reduz a fonte', () => {
    expect(diagramarTitulo('Emma').corpo).toBeGreaterThan(
      diagramarTitulo('Memórias Póstumas de Brás Cubas e Outras Histórias do Seu Tempo').corpo,
    )
  })

  it('palavra gigante é cortada com reticências e marcada como cortada', () => {
    const d = diagramarTitulo('Anticonstitucionalissimamente Pneumoultramicroscopicossilicovulcanoconiótico')
    expect(d.cortado).toBe(true)
    expect(d.linhas.join(' ')).toContain('…')
  })

  it('deixa o subtítulo de fora só quando o título é longo', () => {
    expect(tituloPrincipal('Moby Dick; or, The Whale')).toBe('Moby Dick; or, The Whale')
    expect(tituloPrincipal('Os Maias: Episódios da Vida Romântica e outras histórias')).toBe('Os Maias')
  })

  it('equilibra as linhas (nada de uma longa e uma curta)', () => {
    const l = quebrarEmLinhas('uma duas tres quatro cinco seis', 16)
    expect(l).not.toBeNull()
    expect(Math.abs(l![0].length - l![1].length)).toBeLessThanOrEqual(6)
  })

  it('o autor ocupa no máximo 2 linhas', () => {
    expect(diagramarAutor('Fiódor Dostoiévski')).toHaveLength(1)
    expect(diagramarAutor('Alexandre Dumas, Auguste Maquet, Paul Meurice e outros colaboradores')).toHaveLength(2)
    expect(diagramarAutor(undefined)).toEqual([])
  })
})

describe('o plano da capa', () => {
  const livro = { id: 'cat:pg-1342', titulo: 'Pride and Prejudice', autor: 'Jane Austen', idioma: 'en' }

  it('é determinístico', () => {
    expect(planoDaCapa(livro)).toEqual(planoDaCapa({ ...livro }))
    expect(hash32('x')).toBe(hash32('x'))
  })

  it('varia: muitos matizes, os dois esquemas e todos os ornamentos', () => {
    const planos = Array.from({ length: 400 }, (_, i) => planoDaCapa({ ...livro, id: `pg-${i}`, titulo: `Livro ${i}` }))
    expect(new Set(planos.map((p) => p.matiz)).size).toBeGreaterThan(150)
    expect(new Set(planos.map((p) => p.forte)).size).toBe(2)
    expect(new Set(planos.map((p) => p.ornamento)).size).toBe(ORNAMENTOS)
  })

  it('tem o selo do idioma e marca o direita-para-esquerda', () => {
    expect(planoDaCapa(livro).selo).toBe('EN')
    expect(planoDaCapa(livro).rtl).toBe(false)
    expect(planoDaCapa({ ...livro, idioma: 'ar' }).rtl).toBe(true)
    expect(planoDaCapa({ ...livro, idioma: undefined }).selo).toBe('')
  })
})
