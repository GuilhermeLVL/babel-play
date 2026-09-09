// @vitest-environment jsdom
/**
 * OS AVISOS POR MARCO DE USO (mudança porta-de-entrada).
 *
 * O que este arquivo prende: até 01/09 o app pedia a conta na PORTA e depois calava. O convite
 * aparecia uma vez por visita e só por ação que pedia rede — quem gravou dez sessões e fichou cem
 * palavras sem conta nunca ouvia que ia perder tudo ao trocar de navegador.
 *
 * A regra nova é a do padrão de 2026: pedir a conta no momento em que a pessoa TEM ALGO A PERDER,
 * uma vez por marco, dispensável, e sem bloquear nada.
 */
import { beforeEach,describe, expect, it } from 'vitest'

import { TETO_ANONIMO } from '../src/core/tetoAnonimo'
import { avisoPendente, jaViu,marcarVisto } from '../src/lib/marcosDeConta'

beforeEach(() => { localStorage.removeItem('babel.marcos_vistos') })

describe('quando avisar', () => {
  it('com conta, nunca — o aviso é sobre perder o que está só no navegador', () => {
    expect(avisoPendente({ sessoes: 99, palavras: 999, semConta: false })).toBeNull()
  })

  it('na primeira sessão, ainda não: uma gravação não é um acervo a perder', () => {
    expect(avisoPendente({ sessoes: 1, palavras: 0, semConta: true })).toBeNull()
  })

  it('na segunda sessão, sim', () => {
    expect(avisoPendente({ sessoes: 2, palavras: 0, semConta: true })?.marco).toBe('segunda-sessao')
  })

  it('perto do teto do caderno, o aviso é o do caderno — o concreto ganha do genérico', () => {
    const perto = Math.floor(TETO_ANONIMO.palavras * 0.8)
    expect(avisoPendente({ sessoes: 2, palavras: perto, semConta: true })?.marco).toBe('caderno-quase-cheio')
  })

  it('perto do teto de gravações, esse vem primeiro de todos', () => {
    const perto = Math.floor(TETO_ANONIMO.sessoes * 0.8)
    const a = avisoPendente({ sessoes: perto, palavras: TETO_ANONIMO.palavras, semConta: true })
    expect(a?.marco).toBe('acervo-quase-cheio')
  })

  it('avisa ANTES de bater, não no limite — no limite a notícia vem junto com o bloqueio', () => {
    // Um a menos que o ponto de aviso ainda não fala.
    const antes = Math.floor(TETO_ANONIMO.palavras * 0.8) - 1
    expect(avisoPendente({ sessoes: 0, palavras: antes, semConta: true })).toBeNull()
  })
})

describe('dispensar lembra', () => {
  it('o marco dispensado não volta', () => {
    expect(avisoPendente({ sessoes: 2, palavras: 0, semConta: true })?.marco).toBe('segunda-sessao')
    marcarVisto('segunda-sessao')
    expect(jaViu('segunda-sessao')).toBe(true)
    expect(avisoPendente({ sessoes: 2, palavras: 0, semConta: true })).toBeNull()
  })

  it('dispensar um não silencia os outros', () => {
    marcarVisto('segunda-sessao')
    const perto = Math.floor(TETO_ANONIMO.palavras * 0.8)
    expect(avisoPendente({ sessoes: 2, palavras: perto, semConta: true })?.marco).toBe('caderno-quase-cheio')
  })

  it('sem storage, o aviso volta — melhor repetir do que sumir', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('sem storage') }
    try {
      marcarVisto('segunda-sessao')
      expect(avisoPendente({ sessoes: 2, palavras: 0, semConta: true })?.marco).toBe('segunda-sessao')
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('o teto que os avisos anunciam', () => {
  it('os números dos textos vêm do core, não de literais na tela', () => {
    const a = avisoPendente({ sessoes: 0, palavras: Math.floor(TETO_ANONIMO.palavras * 0.8), semConta: true })
    expect(a?.titulo).toContain(String(TETO_ANONIMO.palavras))
  })
})
