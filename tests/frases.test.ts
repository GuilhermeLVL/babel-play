/**
 * O segmentador de frases existe para um defeito medido: o `opus-mt` só traduz UMA sentença e
 * descarta a segunda. Se ele errar a divisão, o conserto vira outro defeito — daí os testes
 * concentrarem-se nas três armadilhas clássicas e na garantia de que nada se perde.
 */
import { describe, expect,it } from 'vitest'

import { juntarFrases,separarEmFrases } from '../src/core/texto/frases'

describe('separação em frases', () => {
  it('separa o caso que motivou tudo isto', () => {
    // Sem separar, o opus-mt devolve só "Meu médico disse que estou bem." e perde o `she` que
    // resolveria o gênero.
    expect(separarEmFrases('My doctor said I am fine. She was very kind.'))
      .toEqual(['My doctor said I am fine.', 'She was very kind.'])
  })

  it('texto sem pontuação volta inteiro — é o caso normal da fala transcrita', () => {
    expect(separarEmFrases('então eu fui lá e falei com ele'))
      .toEqual(['então eu fui lá e falei com ele'])
  })

  it('NÃO quebra em abreviação', () => {
    expect(separarEmFrases('O Dr. Silva chegou cedo.')).toEqual(['O Dr. Silva chegou cedo.'])
    expect(separarEmFrases('Mr. Smith arrived early.')).toEqual(['Mr. Smith arrived early.'])
  })

  it('NÃO quebra em número decimal', () => {
    expect(separarEmFrases('O valor é 3.14 no total.')).toEqual(['O valor é 3.14 no total.'])
  })

  it('NÃO quebra em inicial isolada', () => {
    expect(separarEmFrases('J. R. R. Tolkien escreveu isso.'))
      .toEqual(['J. R. R. Tolkien escreveu isso.'])
  })

  it('trata reticências e pontuação repetida como um corte só', () => {
    expect(separarEmFrases('Que susto!!! Achei que fosse cair.'))
      .toEqual(['Que susto!!!', 'Achei que fosse cair.'])
    expect(separarEmFrases('Bom... Vamos ver.')).toEqual(['Bom...', 'Vamos ver.'])
  })

  it('minúscula depois do ponto NÃO abre frase nova — juntar erra menos que separar', () => {
    // Em transcrição, ponto seguido de minúscula quase sempre é abreviação ou erro de pontuação.
    expect(separarEmFrases('foi em 2020. e depois mudou')).toEqual(['foi em 2020. e depois mudou'])
  })

  it('cola fragmentos curtos demais na frase anterior', () => {
    // "Ah." sozinho não é frase para o tradutor: é ruído que ele traduz mal e isolado.
    const r = separarEmFrases('Eu fui lá ontem. Ah. Também vi o João.')
    expect(r).toEqual(['Eu fui lá ontem. Ah.', 'Também vi o João.'])
  })

  it('NADA SE PERDE: as partes reunidas contêm todo o texto original', () => {
    const original = 'Primeira frase aqui. Segunda frase ali! Terceira?'
    const partes = separarEmFrases(original)
    expect(partes).toHaveLength(3)
    // Os caracteres significativos são os mesmos — só a divisão mudou.
    expect(partes.join(' ').replace(/\s+/g, '')).toBe(original.replace(/\s+/g, ''))
  })

  it('entrada vazia devolve lista vazia, não uma frase vazia', () => {
    expect(separarEmFrases('')).toEqual([])
    expect(separarEmFrases('   ')).toEqual([])
  })

  it('interrogação e exclamação também terminam frase', () => {
    expect(separarEmFrases('Você viu? Foi incrível!')).toEqual(['Você viu?', 'Foi incrível!'])
  })
})

describe('reunião das traduções', () => {
  it('junta na ordem', () => {
    expect(juntarFrases(['Primeira.', 'Segunda.'])).toBe('Primeira. Segunda.')
  })

  it('uma parte que falhou não derruba as outras', () => {
    // Melhor entregar duas frases de três do que nada — a mesma doutrina do resto do produto.
    expect(juntarFrases(['Primeira.', '', 'Terceira.'])).toBe('Primeira. Terceira.')
  })

  it('todas vazias devolve string vazia', () => {
    expect(juntarFrases(['', '  '])).toBe('')
  })
})
