/**
 * O TAMANHO DA PALAVRA E O NÚMERO DE TABULEIROS SÃO PARTE DA DIFICULDADE.
 *
 * O Termo tinha régua única: 4–8 letras e uma escada que sempre terminava em QUATRO tabuleiros
 * simultâneos. Na tela isso vira uma parede — quatro grades lado a lado, nove linhas de tentativa
 * cada, e um teclado embaixo —, e quem estava começando recebia exatamente o mesmo jogo de quem
 * já domina. A faixa (`facil`/`medio`/`dificil`) já existia e já recortava o material da rodada;
 * o que faltava era ela alcançar as duas alavancas que decidem o custo real deste jogo.
 */
import { describe, it, expect } from 'vitest'
import {
  motivoForaDoTermo, contarJogaveisMulti, rodadasDaEscada,
  LETRAS_POR_FAIXA, ESCADA_POR_FAIXA, MIN_LETRAS, MAX_LETRAS,
} from '../src/core/minigames/termo'
import type { VocabCard } from '../src/types'

const carta = (word: string, translation: string): VocabCard => ({
  id: word, word, translation, inDeck: true,
} as unknown as VocabCard)

describe('a régua de letras segue a faixa', () => {
  it('médio é a régua de sempre — quem não passa faixa não vê mudança', () => {
    expect(LETRAS_POR_FAIXA.medio).toEqual({ min: MIN_LETRAS, max: MAX_LETRAS })
    // sem argumento de faixa, o comportamento é o de antes
    expect(motivoForaDoTermo(carta('bread', 'pão'))).toBeNull()
  })

  it('no fácil, palavra de 7 letras fica de fora por comprimento', () => {
    expect(motivoForaDoTermo(carta('shelter', 'abrigo'), 'facil')).toBe('longa')
    expect(motivoForaDoTermo(carta('shelter', 'abrigo'), 'medio')).toBeNull()
  })

  it('no difícil, palavra de 10 letras entra — e no médio não', () => {
    expect(motivoForaDoTermo(carta('friendship', 'amizade'), 'dificil')).toBeNull()
    expect(motivoForaDoTermo(carta('friendship', 'amizade'), 'medio')).toBe('longa')
  })

  it('o difícil também sobe o piso: 4 letras vira curta demais', () => {
    expect(motivoForaDoTermo(carta('bread', 'pão'), 'dificil')).toBeNull()
    expect(motivoForaDoTermo(carta('door', 'porta'), 'dificil')).toBe('curta')
    expect(motivoForaDoTermo(carta('door', 'porta'), 'facil')).toBeNull()
  })

  it('a contagem de jogáveis respeita a faixa pedida', () => {
    const baralho = [
      carta('door', 'porta'), carta('bread', 'pão'), carta('house', 'casa'),
      carta('shelter', 'abrigo'), carta('kitchen', 'cozinha'), carta('morning', 'manhã'),
    ]
    // fácil: só as de 4–6 letras (door, bread, house)
    expect(contarJogaveisMulti(baralho, 'facil')).toBeLessThanOrEqual(3)
    // médio aceita as de 7 também, então o maior grupo do mesmo tamanho cresce
    expect(contarJogaveisMulti(baralho, 'medio')).toBeGreaterThanOrEqual(contarJogaveisMulti(baralho, 'facil'))
  })
})

describe('a escada para onde a faixa manda', () => {
  it('o quarteto deixa de ser o destino padrão', () => {
    expect(Math.max(...ESCADA_POR_FAIXA.facil)).toBe(1)
    expect(Math.max(...ESCADA_POR_FAIXA.medio)).toBe(2)
    expect(Math.max(...ESCADA_POR_FAIXA.dificil)).toBe(4)
  })

  it('no fácil, nenhum degrau pede mais de um tabuleiro por vez', () => {
    // É a regra que o dono pediu: manter um nível de dificuldade em vez de escalar sempre.
    expect(ESCADA_POR_FAIXA.facil.every(d => d === 1)).toBe(true)
  })

  it('com material de sobra, o fácil monta uma escada mais curta em tabuleiros que o difícil', () => {
    // Sete palavras de 5 letras: material suficiente para qualquer escada.
    const baralho = [['bread','pão'],['house','casa'],['water','água'],['green','verde'],['story','conto'],['plant','planta'],['child','criança']]
      .map(([w, t]) => carta(w, t))
    const facil = rodadasDaEscada(baralho, { faixa: 'facil' })
    const dificil = rodadasDaEscada(baralho, { faixa: 'dificil' })
    // O difícil consome mais palavras porque seus degraus são maiores (1+2+4 contra 1+1+1).
    expect(dificil.length).toBeGreaterThan(facil.length)
  })

  it('sem faixa, o comportamento continua o do médio', () => {
    const baralho = [['bread','pão'],['house','casa'],['water','água'],['green','verde'],['story','conto']]
      .map(([w, t]) => carta(w, t))
    expect(rodadasDaEscada(baralho).length).toBe(rodadasDaEscada(baralho, { faixa: 'medio' }).length)
  })
})
