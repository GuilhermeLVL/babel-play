import { describe, expect, it } from 'vitest'

import {
  ehModoDeEscuta,
  etapaAtual,
  iniciarEscuta,
  irParaFrase,
  modoSugerido,
  proximoPasso,
  revelarTexto,
  textoVisivel,
  trocarModo,
} from '../src/core/learning/escutaGuiada'

describe('escuta guiada', () => {
  it('ouvir-primeiro: ouvir sem texto → ler → ouvir com texto → próxima frase', () => {
    let e = iniciarEscuta('ouvir-primeiro')
    expect(etapaAtual(e)).toBe('ouvir-sem-texto')
    expect(textoVisivel(e)).toBe(false)
    e = proximoPasso(e, 3).estado
    expect(etapaAtual(e)).toBe('ler')
    expect(textoVisivel(e)).toBe(true)
    e = proximoPasso(e, 3).estado
    expect(etapaAtual(e)).toBe('ouvir-com-texto')
    expect(textoVisivel(e)).toBe(true)
    e = proximoPasso(e, 3).estado
    expect(e).toEqual({ modo: 'ouvir-primeiro', frase: 1, passo: 0 })
    expect(textoVisivel(e)).toBe(false)
  })

  it('ler-primeiro: ler → ouvir → próxima frase, sempre com o texto à mostra', () => {
    let e = iniciarEscuta('ler-primeiro')
    expect(etapaAtual(e)).toBe('ler')
    expect(textoVisivel(e)).toBe(true)
    e = proximoPasso(e, 2).estado
    expect(etapaAtual(e)).toBe('ouvir-com-texto')
    e = proximoPasso(e, 2).estado
    expect(e).toEqual({ modo: 'ler-primeiro', frase: 1, passo: 0 })
  })

  it('livre: sem etapa, texto visível, o passo só avança de frase', () => {
    const e = iniciarEscuta('livre')
    expect(etapaAtual(e)).toBeNull()
    expect(textoVisivel(e)).toBe(true)
    expect(proximoPasso(e, 2)).toEqual({ estado: { modo: 'livre', frase: 1, passo: 0 }, terminou: false })
  })

  it('última frase: o último passo termina e não muda o estado', () => {
    const e = { modo: 'ler-primeiro' as const, frase: 1, passo: 1 }
    expect(proximoPasso(e, 2)).toEqual({ estado: e, terminou: true })
    expect(proximoPasso({ modo: 'livre', frase: 0, passo: 0 }, 1).terminou).toBe(true)
  })

  it('trocar de frase recomeça os passos; a mesma frase não', () => {
    const e = { modo: 'ouvir-primeiro' as const, frase: 2, passo: 2 }
    expect(irParaFrase(e, 2)).toBe(e)
    expect(irParaFrase(e, 4)).toEqual({ modo: 'ouvir-primeiro', frase: 4, passo: 0 })
  })

  it('trocar de modo recomeça os passos da frase em foco', () => {
    const e = { modo: 'ouvir-primeiro' as const, frase: 3, passo: 2 }
    expect(trocarModo(e, 'ler-primeiro')).toEqual({ modo: 'ler-primeiro', frase: 3, passo: 0 })
    expect(trocarModo(e, 'ouvir-primeiro')).toBe(e)
  })

  it('revelar o texto pula para ler e não volta atrás', () => {
    expect(revelarTexto(iniciarEscuta('ouvir-primeiro')).passo).toBe(1)
    const adiante = { modo: 'ouvir-primeiro' as const, frase: 0, passo: 2 }
    expect(revelarTexto(adiante)).toBe(adiante)
    expect(etapaAtual(revelarTexto(iniciarEscuta('ler-primeiro')))).toBe('ler')
  })

  it('sugestão por nível: A1–A2 e sem nível ouvem primeiro; B1 em diante, livre', () => {
    expect(modoSugerido('A1')).toBe('ouvir-primeiro')
    expect(modoSugerido('A2')).toBe('ouvir-primeiro')
    expect(modoSugerido(null)).toBe('ouvir-primeiro')
    expect(modoSugerido(undefined)).toBe('ouvir-primeiro')
    for (const n of ['B1', 'B2', 'C1', 'C2'] as const) expect(modoSugerido(n)).toBe('livre')
  })

  it('valida o modo guardado', () => {
    expect(ehModoDeEscuta('livre')).toBe(true)
    expect(ehModoDeEscuta('x')).toBe(false)
    expect(ehModoDeEscuta(null)).toBe(false)
  })
})
