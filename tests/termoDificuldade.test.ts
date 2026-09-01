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

  it('NENHUMA faixa passa do teto — acima dele deixa de ser dificuldade e vira parede', () => {
    expect(MAX_LETRAS).toBe(6)
    for (const f of ['facil', 'medio', 'dificil'] as const) {
      expect(LETRAS_POR_FAIXA[f].max).toBeLessThanOrEqual(MAX_LETRAS)
      // 7 letras: um dueto disso já são 14 quadrados numa linha, e o quarteto 28.
      expect(motivoForaDoTermo(carta('shelter', 'abrigo'), f)).toBe('longa')
      expect(motivoForaDoTermo(carta('friendship', 'amizade'), f)).toBe('longa')
    }
  })

  it('no fácil, 6 letras já fica de fora — o começo é só de palavra curta', () => {
    expect(motivoForaDoTermo(carta('garden', 'jardim'), 'facil')).toBe('longa')
    expect(motivoForaDoTermo(carta('garden', 'jardim'), 'medio')).toBeNull()
    expect(motivoForaDoTermo(carta('garden', 'jardim'), 'dificil')).toBeNull()
  })

  it('o difícil sobe o PISO em vez do teto: 4 letras vira curta demais', () => {
    expect(motivoForaDoTermo(carta('bread', 'pão'), 'dificil')).toBeNull()
    expect(motivoForaDoTermo(carta('door', 'porta'), 'dificil')).toBe('curta')
    expect(motivoForaDoTermo(carta('door', 'porta'), 'facil')).toBeNull()
  })

  it('a contagem de jogáveis respeita a faixa pedida', () => {
    const baralho = [
      carta('door', 'porta'), carta('bread', 'pão'), carta('house', 'casa'),
      carta('garden', 'jardim'), carta('winter', 'inverno'), carta('summer', 'verão'),
    ]
    // fácil pára em 5 letras: o maior grupo possível é {bread, house}
    expect(contarJogaveisMulti(baralho, 'facil')).toBe(2)
    // médio aceita as de 6, e aí o maior grupo vira {garden, winter, summer}
    expect(contarJogaveisMulti(baralho, 'medio')).toBe(3)
  })
})

/**
 * TODAS AS PALAVRAS DE UMA RODADA TÊM O MESMO COMPRIMENTO — e no Dueto/Quarteto isso não é
 * estética, é a condição de o jogo ter solução: o palpite é UM SÓ, avaliado em todos os
 * tabuleiros ao mesmo tempo. Com tamanhos diferentes não existe palpite válido para os dois.
 *
 * `mesmoTamanho` + `maiorGrupoPorTamanho` garantem isso desde sempre, mas nada afirmava a
 * invariante em teste — e ela é fácil de perder: basta alguém completar uma escada curta com
 * sobras de outro grupo, que é exatamente o tipo de "melhoria" que parece inofensiva.
 */
describe('a rodada inteira cabe no mesmo tabuleiro', () => {
  it('mesmo com o baralho misturando comprimentos, a escada sai toda do mesmo tamanho', () => {
    const baralho = [
      ['door', 'porta'], ['bread', 'pão'], ['house', 'casa'], ['water', 'água'],
      ['green', 'verde'], ['story', 'conto'], ['plant', 'planta'], ['child', 'criança'],
      ['garden', 'jardim'], ['winter', 'inverno'], ['summer', 'verão'], ['forest', 'floresta'],
      ['tree', 'árvore'], ['fish', 'peixe'], ['bird', 'pássaro'],
    ].map(([w, t]) => carta(w, t))
    for (const faixa of ['facil', 'medio', 'dificil'] as const) {
      const r = rodadasDaEscada(baralho, { faixa })
      expect(r.length, `faixa ${faixa} precisa montar rodada`).toBeGreaterThan(0)
      const tamanhos = new Set(r.map((x) => x.resposta.length))
      expect([...tamanhos], `faixa ${faixa}`).toHaveLength(1)
      expect([...tamanhos][0]).toBeLessThanOrEqual(MAX_LETRAS)
    }
  })
})

/**
 * REFAZER UMA FASE PASSADA NÃO PASSA PELA RÉGUA DE HOJE.
 *
 * O DEFEITO, reproduzido com as rodadas reais do banco: "jogar esta fase de novo" reaplicava a
 * régua de comprimento vigente sobre palavras escolhidas noutro dia. `find, ball, left` (4 letras)
 * ficava impossível no difícil; `legend, sponge, empire` (6) no fácil; e `sadness, geology,
 * mystery` (7) em TODAS as faixas, por terem sido jogadas quando o teto ainda era 8. Como
 * `rodadasDaEscada` devolve `[]` sem escada e quem chamava engolia o `null`, o botão simplesmente
 * não fazia nada — sem erro, sem aviso.
 */
describe('refazer uma fase usa as palavras dela, não a régua de hoje', () => {
  const fase = (ws: Array<[string, string]>) => ws.map(([w, t]) => carta(w, t))

  it('as três fases que o banco tinha e que nenhuma faixa aceitava voltam a montar', () => {
    const casos: Array<[string, Array<[string, string]>]> = [
      ['4 letras', [['find', 'encontrar'], ['ball', 'bola'], ['left', 'esquerda']]],
      ['6 letras', [['legend', 'lenda'], ['sponge', 'esponja'], ['empire', 'império']]],
      ['7 letras (teto antigo)', [['sadness', 'tristeza'], ['geology', 'geologia'], ['mystery', 'mistério']]],
    ]
    for (const [rotulo, ws] of casos) {
      const r = rodadasDaEscada(fase(ws), { faixa: 'livre' })
      expect(r.length, rotulo).toBeGreaterThanOrEqual(3)
      expect(r.map(x => x.palavra).sort(), rotulo).toEqual(ws.map(([w]) => w).sort())
    }
  })

  it('e cada uma delas era mesmo impossível em alguma faixa — a prova do defeito', () => {
    expect(rodadasDaEscada(fase([['find','encontrar'],['ball','bola'],['left','esquerda']]), { faixa: 'dificil' })).toEqual([])
    expect(rodadasDaEscada(fase([['legend','lenda'],['sponge','esponja'],['empire','império']]), { faixa: 'facil' })).toEqual([])
    for (const f of ['facil', 'medio', 'dificil'] as const) {
      expect(rodadasDaEscada(fase([['sadness','tristeza'],['geology','geologia'],['mystery','mistério']]), { faixa: f }), f).toEqual([])
    }
  })

  it('o livre solta SÓ o comprimento — hífen e pista inútil continuam barrando', () => {
    expect(motivoForaDoTermo(carta('ice cream', 'sorvete'), 'livre')).toBe('hifen-ou-espaco')
    expect(motivoForaDoTermo(carta('sadness', 'tristeza'), 'livre')).toBeNull()
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
