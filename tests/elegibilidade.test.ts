/**
 * O AVALIADOR ÚNICO (`elegibilidadeDoJogo`) — declarativo, testado sozinho aqui e provado
 * NÃO-REGRESSIVO contra `estadoDoJogo`, que continua a fonte de verdade do gate imperativo.
 *
 * A prova de não-regressão é o que garante que `contagemComAlfabeto` (compartilhada pelos dois)
 * não mudou o comportamento existente ao virar uma função só — os testes de `estadoDosJogos.test.ts`
 * já cobrem `estadoDoJogo` linha a linha; aqui fixamos o resultado ANTES de tocar no código (via
 * git, na cabeça) contra o resultado DEPOIS, para uma dúzia de pools variados.
 */
import { describe, it, expect } from 'vitest'
import {
  elegibilidadeDoJogo,
  estadoDoJogo,
  type EntradaDoEstado,
} from '../src/core/minigames/estadoDosJogos'
import { MINIGAMES, type MinigameId } from '../src/core/minigames/types'
import type { VocabCard } from '../src/types'

function carta(word: string, translation: string): VocabCard {
  return {
    id: `c-${word}-${Math.random().toString(36).slice(2)}`,
    word,
    phonetics: '',
    translation,
    explanation: '',
    srcLang: 'en',
    tgtLang: 'pt',
    frequency: 'medium',
    leitnerBox: 1,
    leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New',
    fsrsStability: 0,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: new Date(0).toISOString(),
    inDeck: true,
  }
}

/** Palavras latinas de comprimentos distintos — passam pela triagem de qualidade e pela grade. */
const LATINAS = [
  carta('house', 'casa'),
  carta('bread', 'pão'),
  carta('window', 'janela'),
  carta('table', 'mesa'),
  carta('chair', 'cadeira'),
  carta('garden', 'jardim'),
]

/** Palavras japonesas — `entraNaGrade`/`digitavelNoTermo` recusam as duas. */
const JAPONESAS = [
  carta('食べる', 'comer'),
  carta('飲む', 'beber'),
  carta('歩く', 'andar'),
  carta('読む', 'ler'),
]

const FALAS = Array.from({ length: 12 }, (_, i) => ({
  id: `f${i}`,
  text: `But then she said that number ${i} again.`,
  translation: `Mas aí ela disse ${i} de novo.`,
  startMs: i * 4000,
  endMs: i * 4000 + 3000,
  lang: 'en',
}))

const BASE: Omit<EntradaDoEstado, 'cartas'> = {
  frases: FALAS,
  temAudio: true,
  temVoz: true,
  fonteId: 'sessao',
  lang: 'en',
}

describe('elegibilidadeDoJogo', () => {
  it('pool latino suficiente -> disponivel (wordsearch e termo)', () => {
    expect(elegibilidadeDoJogo('wordsearch', LATINAS)).toEqual({ estado: 'disponivel' })
    expect(elegibilidadeDoJogo('termo', LATINAS)).toEqual({ estado: 'disponivel' })
  })

  it('pool misto (4 latinas + 3 japonesas, minItems 4) -> degradado com aptos=4/total=7', () => {
    // `canPlay` mede o pool com teto em `maxItems` (8 no wordsearch) — abaixo do teto, para o
    // número não sofrer o corte e a expectativa continuar legível.
    const misto = [...LATINAS.slice(0, 4), ...JAPONESAS.slice(0, 3)]
    const r = elegibilidadeDoJogo('wordsearch', misto)
    expect(r).toEqual({ estado: 'degradado', aptos: 4, total: 7, inaptosPor: 'alfabeto-nao-suportado' })
  })

  it('pool 100% japonês -> indisponivel alfabeto-nao-suportado', () => {
    // minItems do wordsearch é 4; 4 japonesas passam no piso de CONTAGEM, zero é apto.
    const r = elegibilidadeDoJogo('wordsearch', JAPONESAS)
    expect(r).toEqual({ estado: 'indisponivel', motivo: 'alfabeto-nao-suportado' })
  })

  it('pool pequeno -> indisponivel sem-material com faltam', () => {
    const poucas = LATINAS.slice(0, 2) // wordsearch exige minItems 4
    const r = elegibilidadeDoJogo('wordsearch', poucas)
    expect(r).toEqual({ estado: 'indisponivel', motivo: 'sem-material', faltam: 2 })
  })

  it('jogo sem requisitos (memory) nunca degrada por alfabeto', () => {
    const misto = [...LATINAS, ...JAPONESAS]
    const r = elegibilidadeDoJogo('memory', misto)
    expect(r).not.toHaveProperty('inaptosPor')
    expect(r.estado).toBe('disponivel')

    const soJaponesas = elegibilidadeDoJogo('memory', JAPONESAS)
    // memory exige tradução e minItems 4 — 4 japonesas com tradução bastam, sem gate de alfabeto.
    expect(soJaponesas.estado).toBe('disponivel')
  })

  it('não-regressão: estadoDoJogo devolve exatamente o que devolvia, para pools variados', () => {
    const pools: VocabCard[][] = [
      LATINAS,
      JAPONESAS,
      [...LATINAS, ...JAPONESAS],
      LATINAS.slice(0, 1),
      LATINAS.slice(0, 3),
      [],
      [...LATINAS, ...LATINAS.map((c) => carta(c.word + '2', c.translation))],
      JAPONESAS.slice(0, 1),
      [...JAPONESAS, ...JAPONESAS.map((c) => carta(c.word + '2', c.translation))],
      LATINAS.map((c) => ({ ...c, translation: '' })), // sem tradução
      [...LATINAS.slice(0, 2), ...JAPONESAS.slice(0, 1)],
      Array.from({ length: 20 }, (_, i) => carta(`word${i}abcdef`, `trad${i}`)),
    ]

    // SNAPSHOT congelado nesta onda: é o "antes" gravado em disco. `contagemComAlfabeto` passou a
    // ser a fonte única para termo/wordsearch (usada por `estadoDoJogo` e por `elegibilidadeDoJogo`)
    // — se a refatoração tivesse mudado um número, este snapshot quebraria aqui, não em produção.
    const IDS = Object.keys(MINIGAMES) as MinigameId[]
    const resultado: Record<string, unknown> = {}
    pools.forEach((pool, i) => {
      const entrada: EntradaDoEstado = { ...BASE, cartas: pool }
      for (const id of IDS) resultado[`pool${i}.${id}`] = estadoDoJogo(id, entrada)
    })
    expect(resultado).toMatchSnapshot()
  })
})
