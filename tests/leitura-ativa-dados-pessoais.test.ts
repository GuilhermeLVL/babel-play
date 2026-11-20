/**
 * DADOS PESSOAIS NA ESCRITA (spec `leitura-ativa-escrita`, "Dados pessoais são barrados antes de qualquer envio"):
 * e-mail, telefone, @usuário, endereço web e nome de escola viram trechos `{inicio, fim, tipo}`. O cliente sublinha,
 * o servidor recusa com 422. Número curto ("2 bananas", "at 7 o'clock") não dispara.
 */
import { describe, expect, it } from 'vitest'

import { dadosPessoaisNoTexto, temDadoPessoal } from '../src/core/leitura/dadosPessoais'

const trechos = (texto: string) => dadosPessoaisNoTexto(texto).map((t) => [t.tipo, texto.slice(t.inicio, t.fim)])

describe('dadosPessoaisNoTexto', () => {
  it('acha o e-mail', () => {
    expect(trechos('my email is lia@exemplo.com and I like apples')).toEqual([['email', 'lia@exemplo.com']])
  })

  it('acha o telefone brasileiro com DDD', () => {
    expect(trechos('Call me at (11) 98765-4321 please.')).toEqual([['telefone', '(11) 98765-4321']])
  })

  it('acha o telefone internacional e o número corrido', () => {
    expect(trechos('My number is +55 11 98765 4321.')).toEqual([['telefone', '+55 11 98765 4321']])
    expect(trechos('My number is 11987654321')).toEqual([['telefone', '11987654321']])
  })

  it('acha o @usuário', () => {
    expect(trechos('Follow me on @lia_reads now')).toEqual([['usuario', '@lia_reads']])
  })

  it('acha o endereço web', () => {
    expect(trechos('Look at https://exemplo.com/eu and www.lia.com.br today')).toEqual([
      ['url', 'https://exemplo.com/eu'],
      ['url', 'www.lia.com.br'],
    ])
    expect(trechos('My site is lia.com.br.')).toEqual([['url', 'lia.com.br']])
  })

  it('acha o nome da escola', () => {
    expect(trechos('I study at Escola Estadual Monteiro Lobato every day.')).toEqual([
      ['escola', 'Escola Estadual Monteiro Lobato'],
    ])
    expect(trechos('I go to Colégio Santa Maria.')).toEqual([['escola', 'Colégio Santa Maria']])
    expect(trechos('My school is Lincoln High School.')).toEqual([['escola', 'Lincoln High School']])
    expect(trechos('I study at the Escola de Música do Bairro.')).toEqual([['escola', 'Escola de Música do Bairro']])
  })

  it('o e-mail não vira também um @usuário', () => {
    expect(trechos('write to ben@mail.org')).toEqual([['email', 'ben@mail.org']])
  })

  it('não dispara em número curto, hora, preço ou palavra "school" sem nome', () => {
    for (const ok of [
      'She picks six red apples and 2 bananas.',
      "The bus comes at 7 o'clock and leaves at 7:30.",
      'It costs 12 dollars. I was born in 2012.',
      'I go to school by bus. School is fun.',
      'In 2024 and 2025 we read 30 books.',
      'Mr. Brown said hello. The end.',
      'I ate 3.5 apples',
    ]) {
      expect(dadosPessoaisNoTexto(ok), ok).toEqual([])
    }
  })

  it('o jeito de criança escrever: minúsculas, e-mail por extenso, telefone fixo de 8 dígitos', () => {
    expect(trechos('my phone is 9876 5432')).toEqual([['telefone', '9876 5432']])
    expect(trechos('I study at escola estadual monteiro lobato every day')).toEqual([
      ['escola', 'escola estadual monteiro lobato'],
    ])
    expect(trechos('I study at the Lincoln school.')).toEqual([['escola', 'Lincoln school']])
    expect(trechos('write to lia at gmail dot com please')).toEqual([['email', 'lia at gmail dot com']])
  })

  it('sem falso positivo: "read.me", ponto sem espaço entre frases, dois anos seguidos, "the school"', () => {
    for (const ok of [
      'Open the read.me file.',
      'I like apples.Me too.',
      'She went with us.Us and them.',
      'In 2024 2025 we read books.',
      'The school is big. Sunday school is fun.',
      'I looked at it and it was fun.',
    ]) {
      expect(dadosPessoaisNoTexto(ok), ok).toEqual([])
    }
  })

  it('devolve os trechos em ordem e temDadoPessoal diz sim', () => {
    const t = 'Call 98765-4321 or mail lia@exemplo.com'
    expect(trechos(t)).toEqual([
      ['telefone', '98765-4321'],
      ['email', 'lia@exemplo.com'],
    ])
    expect(temDadoPessoal(t)).toBe(true)
    expect(temDadoPessoal('Lucy forgot her umbrella.')).toBe(false)
  })
})
