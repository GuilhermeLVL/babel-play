/**
 * ANOTAÇÃO SEMÂNTICA POR FRASE (Leitura, protótipo): um tipo por frase, trocar substitui, Apagar
 * tira — e as anotações por palavra de antes, guardadas na mesma lista da sessão, não se perdem.
 */
import { describe, expect, it } from 'vitest'

import { type Anotacao, anotarFrase, lerAnotacoes, notaDaFrase } from '../src/lib/leitura/anotacaoDaFrase'

const antigaPorPalavra: Anotacao = {
  id: 'ann-1',
  type: 'highlight',
  textIndex: 2,
  wordIndex: 'w-3',
  wordText: 'roadmap',
  color: 'bg-warn-soft',
  content: 'Vocabulário',
  createdAt: 1,
}

describe('anotarFrase', () => {
  it('anota a frase com o tipo escolhido', () => {
    const l = anotarFrase([], 2, 'gram', { agora: 10 })
    expect(notaDaFrase(l, 2)).toMatchObject({ type: 'frase', textIndex: 2, tipo: 'gram' })
  })

  it('escolher outro tipo TROCA a anotação da frase (uma por frase)', () => {
    let l = anotarFrase([], 2, 'gram', { agora: 10 })
    l = anotarFrase(l, 2, 'duvida', { agora: 11 })
    expect(l.filter((a) => a.type === 'frase')).toHaveLength(1)
    expect(notaDaFrase(l, 2)?.tipo).toBe('duvida')
  })

  it('Apagar tira a anotação da frase e deixa as por palavra', () => {
    let l = anotarFrase([antigaPorPalavra], 2, 'expr', { agora: 10 })
    l = anotarFrase(l, 2, 'apagar')
    expect(notaDaFrase(l, 2)).toBeUndefined()
    expect(l).toEqual([antigaPorPalavra])
  })

  it('o áudio guarda a gravação junto', () => {
    const l = anotarFrase([], 0, 'audio', { audioUrl: 'data:audio/webm;base64,AAA', agora: 5 })
    expect(notaDaFrase(l, 0)).toMatchObject({ tipo: 'audio', audioUrl: 'data:audio/webm;base64,AAA' })
  })
})

describe('lerAnotacoes', () => {
  it('lê as antigas (por palavra) e as novas (por frase) da mesma chave', () => {
    const l = lerAnotacoes(JSON.stringify([antigaPorPalavra, ...anotarFrase([], 1, 'vocab', { agora: 3 })]))
    expect(l).toHaveLength(2)
    expect(notaDaFrase(l, 1)?.tipo).toBe('vocab')
  })

  it('disco estranho vira lista vazia, sem quebrar a tela', () => {
    expect(lerAnotacoes('{"x":1}')).toEqual([])
    expect(lerAnotacoes('não é json')).toEqual([])
    expect(lerAnotacoes(JSON.stringify([null, { id: 3 }]))).toEqual([])
  })
})
