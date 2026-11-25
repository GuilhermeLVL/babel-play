/**
 * tela-de-jogos-v2 4.7: com a segmentação por idioma (`src/core/texto/segmentacao.ts`), japonês e
 * chinês com frase na medida jogam a Frase embaralhada; o motivo `escrita-sem-separacao` só sobra
 * para a frase que o segmentador não corta numa janela jogável. Coreano segue fora (decisão do dono).
 */
import { describe, expect, it } from 'vitest'

import { type EntradaDoEstado, estadoDoJogo } from '../src/core/minigames/estadoDosJogos'

const falas = (lang: string, texto: string) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `f${i}`,
    text: texto,
    translation: 'Hoje eu quero comprar um carro novo.',
    startMs: i * 4000,
    endMs: i * 4000 + 3000,
    lang,
  }))

const entrada = (lang: string, texto: string): EntradaDoEstado => ({
  cartas: [],
  frases: falas(lang, texto),
  temAudio: true,
  temVoz: true,
  fonteId: 'sessao',
  lang,
})

describe('Frase embaralhada em escrita sem espaço', () => {
  it('japonês com frase segmentável joga, sem o motivo escrita-sem-separacao', () => {
    const e = estadoDoJogo('scramble', entrada('ja', '私は今日新しい車を買いたいです。'))
    expect(e.motivo).not.toBe('escrita-sem-separacao')
    expect(e.ok).toBe(true)
  })

  it('chinês com frase segmentável joga, sem o motivo escrita-sem-separacao', () => {
    const e = estadoDoJogo('scramble', entrada('zh', '我今天想买一辆新的汽车。'))
    expect(e.motivo).not.toBe('escrita-sem-separacao')
    expect(e.ok).toBe(true)
  })

  it('frase curta demais em japonês segue bloqueada, mas com o motivo dito', () => {
    const e = estadoDoJogo('scramble', entrada('ja', 'はい。'))
    expect(e.ok).toBe(false)
    expect(e.motivo).toBe('escrita-sem-separacao')
  })
})

describe('coreano segue fora, com motivo dito (decisão do dono, 25/11)', () => {
  const cartas = ['안녕하세요', '감사합니다', '안녕히계세요', '죄송합니다', '실례합니다'].map((word, i) => ({
    id: `k${i}`,
    word,
    phonetics: '',
    translation: ['olá', 'obrigado', 'adeus', 'desculpe', 'com licença'][i],
    explanation: '',
    srcLang: 'ko',
    tgtLang: 'pt',
    leitnerBox: 1,
    leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New' as const,
    fsrsStability: 0,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: new Date(0).toISOString(),
    inDeck: true,
  }))

  it('Termo e Caça-palavras bloqueiam com alfabeto-nao-suportado', () => {
    const base: EntradaDoEstado = { cartas, frases: [], temAudio: false, temVoz: true, fonteId: 'sessao', lang: 'ko' }
    expect(estadoDoJogo('termo', base).motivo).toBe('alfabeto-nao-suportado')
    expect(estadoDoJogo('wordsearch', base).motivo).toBe('alfabeto-nao-suportado')
  })
})
