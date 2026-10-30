import { describe, expect, it } from 'vitest'

import { falaDaFrase, montarDistribuicao, planejarElenco } from '../src/core/avatar/elenco'

const vozes = [
  { id: 'Luciana', idioma: 'pt-BR', principal: true },
  { id: 'Felipe', idioma: 'pt-BR' },
  { id: 'Joana', idioma: 'pt-BR' },
]
const cfg = { idioma: 'pt', personagens: ['Ana', 'Bruno'], vozes, vozPrincipal: 'Luciana' }

describe('planejarElenco', () => {
  it('devolve um plano por frase, na mesma ordem', () => {
    const textos = ['A tarde caiu.', '"Venha cá", disse Ana.', 'Bruno respondeu: "Já vou."']
    const dist = montarDistribuicao(cfg)
    const plano = planejarElenco(textos, cfg, dist)
    expect(plano).toHaveLength(3)
    expect(plano[0].voz).toBeNull()
    expect(plano[1].falante).toEqual({ tipo: 'personagem', nome: 'Ana' })
    expect(plano[1].voz).toBe(dist.personagens.Ana)
    expect(plano[2].voz).toBe(dist.personagens.Bruno)
    expect(dist.personagens.Ana).not.toBe('Luciana')
  })

  it('narração e fala duvidosa ficam sem voz própria (a voz do narrador da pessoa)', () => {
    const dist = montarDistribuicao(cfg)
    const [a, b] = planejarElenco(['O vento soprava.', '"Quem é?"'], cfg, dist)
    expect(a.voz).toBeNull()
    expect(b.voz).toBeNull()
  })

  it('sem personagens da ficha só há narrador (livro trazido pela pessoa)', () => {
    const c = { ...cfg, personagens: [] }
    const plano = planejarElenco(['"Venha cá", disse Ana.'], c, montarDistribuicao(c))
    expect(plano[0].falante.tipo).not.toBe('personagem')
    expect(plano[0].voz).toBeNull()
  })

  it('frase longa partida pelo marcador não desalinha o plano', () => {
    const longa = 'palavra '.repeat(200).trim()
    const textos = ['Antes.', longa, 'Depois.']
    const plano = planejarElenco(textos, cfg, montarDistribuicao(cfg))
    expect(plano).toHaveLength(3)
  })

  it('é determinístico', () => {
    const t = ['"Oi", disse Bruno.', '"Tchau", disse Ana.']
    const d = montarDistribuicao(cfg)
    expect(planejarElenco(t, cfg, d)).toEqual(planejarElenco(t, cfg, d))
  })
})

describe('planejarElenco: marcação prévia (ponto de extensão da IA)', () => {
  const textos = ['O vento soprava.', '"Quem é?"']
  const previa = (i: number, nome: string | null, confianca = 0.9) => ({
    indice: i,
    texto: textos[i],
    falante: nome ? { tipo: 'personagem' as const, nome } : { tipo: 'narrador' as const },
    emocao: 'surpreso' as const,
    confianca,
  })

  it('prévia válida e confiante vence a heurística', () => {
    const d = montarDistribuicao(cfg)
    const [, b] = planejarElenco(textos, cfg, d, [null, previa(1, 'Bruno')])
    expect(b.falante).toEqual({ tipo: 'personagem', nome: 'Bruno' })
    expect(b.emocao).toBe('surpreso')
    expect(b.voz).toBe(d.personagens.Bruno)
  })

  it('personagem inventada, pouca confiança ou texto diferente caem na heurística', () => {
    const d = montarDistribuicao(cfg)
    expect(planejarElenco(textos, cfg, d, [null, previa(1, 'Zeca')])[1].voz).toBeNull()
    expect(planejarElenco(textos, cfg, d, [null, previa(1, 'Bruno', 0.2)])[1].voz).toBeNull()
    expect(planejarElenco(textos, cfg, d, [null, { ...previa(1, 'Bruno'), texto: 'outra' }])[1].voz).toBeNull()
  })
})

describe('falaDaFrase', () => {
  const plano = {
    falante: { tipo: 'personagem' as const, nome: 'Ana' },
    emocao: 'triste' as const,
    confianca: 0.9,
    voz: 'Joana',
  }

  it('aparelho: voz da personagem, ritmo e tom pela emoção', () => {
    const f = falaDaFrase(plano, { rate: 1, pitch: 1 }, { temTom: true, temVoz: true })
    expect(f.voiceName).toBe('Joana')
    expect(f.rate).toBeLessThan(1)
    expect(f.pitch).toBeLessThan(1)
  })

  it('nuvem: só ritmo (sem tom e sem voiceName)', () => {
    const f = falaDaFrase(plano, { rate: 1, pitch: 1 }, { temTom: false, temVoz: false })
    expect(f.voiceName).toBeUndefined()
    expect(f.pitch).toBeUndefined()
    expect(f.rate).toBeLessThan(1)
  })

  it('confiança baixa fala neutra, na voz do narrador', () => {
    const f = falaDaFrase(
      { ...plano, confianca: 0.2, voz: null },
      { rate: 1.2, pitch: 1 },
      { temTom: true, temVoz: true },
    )
    expect(f.rate).toBeCloseTo(1.2)
    expect(f.voiceName).toBeUndefined()
  })

  it('sem plano (elenco desligado ou frase fora) é exatamente a fala de hoje', () => {
    expect(falaDaFrase(undefined, { rate: 1.3, pitch: 0.9 }, { temTom: true, temVoz: true })).toEqual({
      rate: 1.3,
      pitch: 0.9,
    })
  })
})
