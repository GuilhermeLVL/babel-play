/**
 * O ALINHADOR DA LEITURA EM VOZ ALTA (spec `leitura-ativa-voz-alta`): cada parcial do reconhecimento casa com as
 * palavras do texto numa janela de 6 à frente do cursor; o cursor só avança. Casos reais de quem lê em voz alta:
 * palavra pulada, repetição, hesitação ("um", "uh"), ruído, palavra parecida, número em algarismo e o parcial
 * que o reconhecedor corrige por baixo.
 */
import { describe, expect, it } from 'vitest'

import {
  aplicarParcial,
  criarAlinhador,
  estadoDaPalavra,
  type EstadoDoAlinhador,
  frasesConcluidas,
  palavrasPorMinuto,
  palavrasPuladas,
  reposicionar,
  temEstrela,
  TETO_DE_PALAVRAS_POR_MINUTO,
} from '../src/core/leitura/alinhadorDeLeitura'

const MERCADO =
  'It is Saturday morning. Lia and her dad go to the market. The market is big. There is a lot of fruit. ' +
  'Lia likes apples. She picks six red apples. Her dad takes bread, milk and water.'

/** O estado visível de cada palavra de uma frase, como "palavra:estado". */
function frase(e: EstadoDoAlinhador, i: number): string[] {
  return e.palavras
    .map((p, k) => ({ p, k }))
    .filter(({ p }) => p.frase === i)
    .map(({ p, k }) => `${p.chave}:${estadoDaPalavra(e, k)}`)
}

/** Leva o cursor ao começo da frase `i` (como se a pessoa já tivesse lido até lá). */
function ateAFrase(e: EstadoDoAlinhador, i: number): EstadoDoAlinhador {
  return reposicionar(
    e,
    e.palavras.findIndex((p) => p.frase === i),
  )
}

/** Aplica os parciais em sequência; o último é final. */
function ler(e: EstadoDoAlinhador, parciais: string[]): EstadoDoAlinhador {
  return parciais.reduce((s, p, i) => aplicarParcial(s, p, { final: i === parciais.length - 1 }), e)
}

describe('alinhadorDeLeitura', () => {
  it('leitura completa de "Lia likes apples.": as três ficam lidas e o cursor passa à frase seguinte', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 4)
    e = aplicarParcial(e, 'lia')
    expect(frase(e, 4)).toEqual(['lia:lida', 'likes:atual', 'apples:pendente'])
    e = aplicarParcial(e, 'lia likes')
    e = aplicarParcial(e, 'lia likes apples')
    expect(frase(e, 4)).toEqual(['lia:lida', 'likes:lida', 'apples:lida'])
    expect(e.palavras[e.cursor].frase).toBe(5)
    expect(frasesConcluidas(e)).toContain(4)
  })

  it('palavra pulada: "she picks red apples" deixa "six" pulada e as outras quatro lidas', () => {
    const e = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), ['she', 'she picks', 'she picks red apples'])
    expect(frase(e, 5)).toEqual(['she:lida', 'picks:lida', 'six:pulada', 'red:lida', 'apples:lida'])
    expect(palavrasPuladas(e)).toEqual(['six'])
  })

  it('repetição: um parcial novo que repete "she picks" não faz nada voltar', () => {
    let e = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), ['she picks'])
    const cursor = e.cursor
    e = ler(e, ['she', 'she picks'])
    expect(e.cursor).toBe(cursor)
    expect(frase(e, 5).slice(0, 3)).toEqual(['she:lida', 'picks:lida', 'six:atual'])
  })

  it('o reconhecedor corrige uma palavra já lida: nada volta a pendente e o cursor não recua', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 5)
    e = aplicarParcial(e, 'she picks')
    const cursor = e.cursor
    e = aplicarParcial(e, 'she pick')
    expect(frase(e, 5).slice(0, 3)).toEqual(['she:lida', 'picks:lida', 'six:atual'])
    expect(e.cursor).toBe(cursor)
  })

  it('a correção de uma palavra já lida não reaplica as seguintes mais adiante (palavra repetida na janela)', () => {
    let e = criarAlinhador('Lia likes apples. Tom likes pears.', 'en')
    e = aplicarParcial(e, 'lia likes apples')
    expect(e.cursor).toBe(3)
    e = aplicarParcial(e, 'leah likes apples')
    expect(e.cursor).toBe(3)
    expect(e.palavras.map((_, i) => estadoDaPalavra(e, i))).toEqual([
      'lida',
      'lida',
      'lida',
      'atual',
      'pendente',
      'pendente',
    ])
    e = aplicarParcial(e, 'leah likes apples tom likes')
    expect(e.marcas.slice(3, 5)).toEqual(['lida', 'lida'])
    expect(palavrasPuladas(e)).toEqual([])
  })

  it('a hipótese que encolhe e cresce de novo na mesma fala não reaplica o que já casou', () => {
    let e = criarAlinhador('Lia likes apples. Tom likes pears.', 'en')
    e = aplicarParcial(e, 'lia likes')
    e = aplicarParcial(e, 'lia')
    e = aplicarParcial(e, 'lia likes')
    expect(e.cursor).toBe(2)
    expect(e.marcas).toEqual(['lida', 'lida', 'pendente', 'pendente', 'pendente', 'pendente'])
  })

  it('repetição na mesma fala com a palavra repetida na janela: a revisão não avança', () => {
    let e = criarAlinhador('She picks six. She picks red.', 'en')
    e = aplicarParcial(e, 'she picks six')
    e = aplicarParcial(e, 'she pick six')
    expect(e.cursor).toBe(3)
    expect(palavrasPuladas(e)).toEqual([])
  })

  it('o parcial revisado por baixo acerta a palavra: "sick" vira "six" e ela fica lida, não pulada', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 5)
    e = aplicarParcial(e, 'she picks sick')
    e = aplicarParcial(e, 'she picks six red')
    expect(frase(e, 5)).toEqual(['she:lida', 'picks:lida', 'six:lida', 'red:lida', 'apples:atual'])
  })

  it('hesitação: "um", "uh" e a palavra repetida não marcam nada como pulada', () => {
    const e = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), [
      'she um',
      'she um she uh picks',
      'she um she uh picks six',
    ])
    expect(frase(e, 5).slice(0, 3)).toEqual(['she:lida', 'picks:lida', 'six:lida'])
    expect(palavrasPuladas(e)).toEqual([])
  })

  it('ruído: palavras que não estão na janela não mexem no cursor', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 5)
    const antes = e.cursor
    e = aplicarParcial(e, 'okay hmm what', { final: true })
    expect(e.cursor).toBe(antes)
    e = aplicarParcial(e, 'she picks')
    expect(frase(e, 5).slice(0, 2)).toEqual(['she:lida', 'picks:lida'])
  })

  it('palavra parecida (uma letra de diferença, palavra longa) conta como lida; curta e diferente, não', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 1)
    e = aplicarParcial(e, 'lia and her dad go to the marked')
    expect(frase(e, 1).at(-1)).toBe('market:lida')
    let g = criarAlinhador('The cat is here.', 'en')
    g = aplicarParcial(g, 'the hat')
    expect(estadoDaPalavra(g, 1)).toBe('atual')
  })

  it('número em algarismo casa com o número escrito ("6" ↔ "six")', () => {
    const e = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), ['she picks 6 red apples'])
    expect(frase(e, 5)[2]).toBe('six:lida')
  })

  it('palavra fora da janela de 6: nada muda', () => {
    let e = criarAlinhador('She picks six one two three four five seven eight apples.', 'en')
    e = aplicarParcial(e, 'she picks', { final: true })
    const antes = e.cursor
    e = aplicarParcial(e, 'apples')
    expect(e.cursor).toBe(antes)
    expect(estadoDaPalavra(e, 2)).toBe('atual')
  })

  it('reposicionar: o cursor vai à palavra tocada e as do meio ficam pendentes', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 1)
    const market = e.palavras.findIndex((p) => p.chave === 'market')
    e = reposicionar(e, market)
    const lia = e.palavras.findIndex((p, i) => p.chave === 'lia' && i > market + 1 && p.frase === 4)
    e = reposicionar(e, lia)
    expect(e.cursor).toBe(lia)
    for (let i = market; i < lia; i++) expect(estadoDaPalavra(e, i)).toBe('pendente')
    expect(estadoDaPalavra(e, lia)).toBe('atual')
  })

  it('depois de um final, a fala seguinte começa uma hipótese nova', () => {
    let e = ateAFrase(criarAlinhador(MERCADO, 'en'), 4)
    e = aplicarParcial(e, 'lia likes apples', { final: true })
    e = aplicarParcial(e, 'she')
    e = aplicarParcial(e, 'she picks')
    expect(frase(e, 5).slice(0, 2)).toEqual(['she:lida', 'picks:lida'])
  })

  it('estrela: frase de 5 com 4 lidas e 1 pulada ganha; com 3 de 5, não', () => {
    const e = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), ['she picks red apples her'])
    expect(frasesConcluidas(e)).toContain(5)
    expect(temEstrela(e, 5)).toBe(true)
    const f = ler(ateAFrase(criarAlinhador(MERCADO, 'en'), 5), ['she red her'])
    expect(temEstrela(f, 5)).toBe(false)
  })

  it('o texto inteiro lido deixa o cursor no fim e todas as frases concluídas', () => {
    const e = ler(criarAlinhador('Lia likes apples. Ben has a dog.', 'en'), ['lia likes apples ben has a dog'])
    expect(e.cursor).toBe(e.palavras.length)
    expect(frasesConcluidas(e)).toEqual([0, 1])
  })

  it('propriedade: com parciais quaisquer, o cursor nunca recua e "lida" nunca deixa de ser lida', () => {
    const vocab = ['lia', 'she', 'picks', 'six', 'red', 'apples', 'um', 'the', 'market', 'dog', 'zzz', '6', 'her']
    let semente = 42
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648
      return semente / 2147483648
    }
    for (let rodada = 0; rodada < 200; rodada++) {
      let e = criarAlinhador(MERCADO, 'en')
      let hip: string[] = []
      for (let passo = 0; passo < 30; passo++) {
        const r = aleatorio()
        if (r < 0.6) hip.push(vocab[Math.floor(aleatorio() * vocab.length)])
        else if (r < 0.75) hip = hip.slice(0, Math.max(0, hip.length - 1))
        else if (r < 0.85 && hip.length) hip[Math.floor(aleatorio() * hip.length)] = 'xx'
        const final = aleatorio() < 0.15
        const antes = e
        e = aplicarParcial(e, hip.join(' '), { final })
        if (final) hip = []
        expect(e.cursor).toBeGreaterThanOrEqual(antes.cursor)
        antes.marcas.forEach((m, i) => {
          if (m === 'lida') expect(e.marcas[i]).toBe('lida')
          if (m === 'pulada') expect(e.marcas[i]).not.toBe('pendente')
        })
      }
    }
  })
})

describe('palavrasPorMinuto', () => {
  it('72 palavras em 45 s dá cerca de 96 por minuto', () => {
    expect(palavrasPorMinuto(72, 45_000)).toBe(96)
  })
  it('sem tempo, sem número', () => {
    expect(palavrasPorMinuto(72, 0)).toBeNull()
  })
  it('acima do teto (leitura impossível, como 894 por minuto) não mostra número', () => {
    expect(palavrasPorMinuto(72, 4_830)).toBeNull()
  })
  it('no teto ainda mostra', () => {
    expect(palavrasPorMinuto(TETO_DE_PALAVRAS_POR_MINUTO, 60_000)).toBe(TETO_DE_PALAVRAS_POR_MINUTO)
  })
})
