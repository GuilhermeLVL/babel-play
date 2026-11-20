/**
 * "MEUS LIVROS": as regras puras do progresso (porcentagem, status sugerido, tempo que falta) e da lista
 * (busca, filtro por status, ordem de recentes).
 */
import { describe, expect, it } from 'vitest'

import {
  contarPorStatus,
  filtrarMeus,
  FRACAO_DE_LIDO,
  type ItemParaListar,
  minutosRestantes,
  ordenarPorRecentes,
  porcentagemDe,
  statusSugerido,
} from '../src/core/livros/meusLivros'

describe('porcentagemDe', () => {
  it('arredonda para inteiro e respeita os extremos', () => {
    expect(porcentagemDe(0)).toBe(0)
    expect(porcentagemDe(0.424)).toBe(42)
    expect(porcentagemDe(0.426)).toBe(43)
    expect(porcentagemDe(1)).toBe(100)
  })

  it('quem já começou nunca vê 0%, e quem não terminou nunca vê 100%', () => {
    expect(porcentagemDe(0.001)).toBe(1)
    expect(porcentagemDe(0.999)).toBe(99)
  })

  it('valor inválido vira 0', () => {
    expect(porcentagemDe(null)).toBe(0)
    expect(porcentagemDe(undefined)).toBe(0)
    expect(porcentagemDe(Number.NaN)).toBe(0)
    expect(porcentagemDe(-0.5)).toBe(0)
    expect(porcentagemDe(7)).toBe(100)
  })
})

describe('statusSugerido', () => {
  it('começou e ainda está em "Quero ler" → "Lendo"', () => {
    expect(statusSugerido('quero-ler', 0.05)).toBe('lendo')
  })

  it('chegou ao fim e não está "Lido" → "Lido" (a partir de 98%)', () => {
    expect(statusSugerido('lendo', FRACAO_DE_LIDO)).toBe('lido')
    expect(statusSugerido('quero-ler', 1)).toBe('lido')
    expect(statusSugerido('lendo', 0.97)).toBeNull()
  })

  it('só sugere o que está desatualizado: status coerente ou escolha da pessoa não são tocados', () => {
    expect(statusSugerido('lendo', 0.5)).toBeNull()
    expect(statusSugerido('lido', 1)).toBeNull()
    expect(statusSugerido('lido', 0.1)).toBeNull()
    expect(statusSugerido('quero-ler', 0)).toBeNull()
    expect(statusSugerido('quero-ler', null)).toBeNull()
  })
})

describe('minutosRestantes', () => {
  it('é a estimativa vezes o que falta, para cima', () => {
    expect(minutosRestantes(600, 0.5)).toBe(300)
    expect(minutosRestantes(100, 0.333)).toBe(67)
    expect(minutosRestantes(100, 1)).toBe(0)
  })

  it('sem estimativa do livro não há resposta (livro trazido)', () => {
    expect(minutosRestantes(undefined, 0.5)).toBeNull()
    expect(minutosRestantes(0, 0.5)).toBeNull()
  })

  it('sem posição, falta o livro todo', () => {
    expect(minutosRestantes(120, null)).toBe(120)
  })
})

const livro = (titulo: string, status: ItemParaListar['status'], ultimaAtividade: number, autor?: string) => ({
  titulo,
  autor,
  status,
  ultimaAtividade,
})
const LISTA = [
  livro('Dom Casmurro', 'lendo', 30, 'Machado de Assis'),
  livro('Pride and Prejudice', 'quero-ler', 10, 'Jane Austen'),
  livro('Memórias Póstumas', 'lido', 20, 'Machado de Assis'),
  livro('Meu arquivo', 'quero-ler', 40),
]

describe('filtrarMeus', () => {
  it('busca por título ou autor, sem acento nem caixa, termos em qualquer ordem', () => {
    expect(filtrarMeus(LISTA, { texto: 'machado' }).map((l) => l.titulo)).toEqual(['Dom Casmurro', 'Memórias Póstumas'])
    expect(filtrarMeus(LISTA, { texto: 'MEMORIAS' }).map((l) => l.titulo)).toEqual(['Memórias Póstumas'])
    expect(filtrarMeus(LISTA, { texto: 'austen pride' })).toHaveLength(1)
    expect(filtrarMeus(LISTA, { texto: 'inexistente' })).toEqual([])
  })

  it('filtra por status e combina com a busca', () => {
    expect(filtrarMeus(LISTA, { status: 'quero-ler' })).toHaveLength(2)
    expect(filtrarMeus(LISTA, { status: 'quero-ler', texto: 'pride' })).toHaveLength(1)
    expect(filtrarMeus(LISTA, { status: null, texto: '' })).toHaveLength(4)
  })
})

describe('ordenar e contar', () => {
  it('os mais recentes primeiro, sem mexer na lista original', () => {
    const antes = LISTA.map((l) => l.titulo)
    expect(ordenarPorRecentes(LISTA).map((l) => l.ultimaAtividade)).toEqual([40, 30, 20, 10])
    expect(LISTA.map((l) => l.titulo)).toEqual(antes)
  })

  it('conta por status', () => {
    expect(contarPorStatus(LISTA)).toEqual({ 'quero-ler': 2, lendo: 1, lido: 1 })
  })
})
