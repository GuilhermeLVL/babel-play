/**
 * motor-anki-jogos (escopo sem mídia): frase do baralho nos jogos de frase, origem na prévia,
 * "só revisão" e o aviso quando o recorte por baralho não se aplica.
 */
import { describe, expect, it } from 'vitest'

import { estadoDeCadaJogo } from '../src/core/minigames/estadoDosJogos'
import { origemDoMaterial } from '../src/core/minigames/revelavel'
import { type EntradaDaRodada, montarRodada } from '../src/core/minigames/rodada'
import { itensSoRevisao } from '../src/core/minigames/soRevisao'
import { frasesDoAcervo } from '../src/core/minigames/source'
import type { VocabCard } from '../src/types'

const AGORA = new Date('2026-03-15T12:00:00Z').getTime()

const carta = (word: string, extra: Partial<VocabCard> = {}): VocabCard => ({
  id: `c-${word}`,
  word,
  phonetics: '',
  translation: `t-${word}`,
  explanation: '',
  srcLang: 'en',
  cefrLevel: 'A1',
  cefrConfidence: 1,
  inDeck: true,
  leitnerBox: 1,
  leitnerDueAt: '',
  fsrsState: 'New',
  fsrsStability: 0,
  fsrsDifficulty: 5,
  fsrsPredictedRetention: 0.9,
  fsrsDueAt: '',
  ...extra,
})

const PALAVRAS = ['house', 'bread', 'window', 'table', 'chair', 'garden', 'bottle', 'mirror']
const DECK: VocabCard[] = PALAVRAS.map((w, i) =>
  carta(w, { translation: `trad${i}`, sentence: `I really like the ${w} number ${i} very much` }),
)
const ACERVO = frasesDoAcervo(DECK, 'en')

const base = (over: Partial<EntradaDaRodada> = {}): EntradaDaRodada => ({
  jogo: 'escuta',
  agora: AGORA,
  jogaveis: DECK,
  fonte: { id: 'baralho', lang: 'en' },
  etapaDaTrilha: null,
  memoria: new Map(),
  estrategia: 'equilibrado',
  faixas: [],
  cortes: null,
  decisaoAuto: () => ({ faixa: 'medio' }),
  vistasRecentes: new Set(),
  frasesGravadas: [],
  frasesDaTrilha: [],
  frasesDoAcervo: ACERVO,
  comTrilha: false,
  temVoz: true,
  temAudio: false,
  porPalavra: new Map(DECK.map((c) => [c.word.toLowerCase(), c])),
  origemDaPalavra: () => 'baralho',
  nomeDoBaralho: 'Core 2k',
  ...over,
})

describe('frase do baralho nos jogos de frase (3.2, 3.3)', () => {
  it('escuta e ditado montam por TTS, sem clipe', () => {
    expect(montarRodada(base({ jogo: 'escuta' }))?.material.tipo).toBe('escuta')
    expect(montarRodada(base({ jogo: 'ditado' }))?.material.tipo).toBe('ditado')
  })

  it('karaokê não monta: precisa de clipe real', () => {
    expect(montarRodada(base({ jogo: 'karaoke' }))).toBeNull()
  })

  it('sem voz, escuta e ditado recusam', () => {
    expect(montarRodada(base({ jogo: 'escuta', temVoz: false }))).toBeNull()
    expect(montarRodada(base({ jogo: 'ditado', temVoz: false }))).toBeNull()
  })

  it('o gate concorda: karaokê indisponível com motivo, escuta e ditado liberados', () => {
    const e = estadoDeCadaJogo({
      cartas: DECK,
      frases: ACERVO,
      falasSoDoAcervo: true,
      temAudio: false,
      temVoz: true,
      fonteId: 'baralho',
      lang: 'en',
    })
    expect(e.karaoke.ok).toBe(false)
    expect(e.karaoke.motivo).toBe('sem-clipe-de-audio')
    expect(e.escuta.ok).toBe(true)
    expect(e.ditado.ok).toBe(true)
  })
})

describe('origem na prévia (4.1, 4.2)', () => {
  it('frase do acervo é do baralho, não "sessão"', () => {
    expect(origemDoMaterial('escuta', 'baralho', undefined, true)).toBe('baralho')
    expect(origemDoMaterial('escuta', 'baralho', undefined, false)).toBe('sessao')
  })

  it('a prévia da escuta diz "Anki · nome" e não escreve a frase que vai tocar', () => {
    const r = montarRodada(base({ jogo: 'escuta' }))!
    expect(r.previa.length).toBeGreaterThan(0)
    for (const p of r.previa) {
      expect(p.origem?.tipo).toBe('baralho')
      expect(p.origem?.rotulo).toBe('Anki · Core 2k')
      expect(p.titulo).not.toContain('really like')
    }
  })

  it('o nome do baralho que entrega a resposta daquele item é retido (Ditado)', () => {
    const nome = ACERVO.map((f) => f.text).join(' / ')
    const r = montarRodada(base({ jogo: 'ditado', nomeDoBaralho: nome }))!
    expect(r.previa.length).toBeGreaterThan(0)
    for (const p of r.previa) expect(p.origem?.rotulo).toBeUndefined()
  })
})

describe('só revisão (4.3)', () => {
  it('palavra sem tradução e sem frase vira revisão simples; as que servem a jogo ficam fora', () => {
    const solta = carta('lonely', { translation: '', sentence: '' })
    const lista = itensSoRevisao([...DECK, solta], 'en')
    expect(lista.map((c) => c.word)).toEqual(['lonely'])
  })

  it('palavra de outro idioma não entra na revisão desta rodada', () => {
    const outra = carta('maison', { translation: '', sentence: '', srcLang: 'fr' })
    expect(itensSoRevisao([outra], 'en')).toEqual([])
  })
})
