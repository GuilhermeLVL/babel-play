import { describe, expect, it } from 'vitest'
import {
  chaveDoTermo, motivoForaDoTermo, diagnosticoTermo, julgarPalpite, buildTermoRounds, distanciaDeEdicao,
  type RodadaTermo,
} from '../src/core/minigames/termo'
import { balancear } from '../src/core/minigames/composicao'
import type { VocabCard } from '../src/types'

const carta = (word: string, translation: string, extra: Partial<VocabCard> = {}): VocabCard =>
  ({ id: word, word, translation, inDeck: true, srcLang: 'en', fsrsDueAt: '', leitnerDueAt: '', ...extra } as unknown as VocabCard)

describe('Termo justo — normalização', () => {
  it('preserva letras Unicode e ignora acentos; hífen/espaço ficam fora com motivo', () => {
    expect(chaveDoTermo('œuvre')).toBe('ŒUVRE')
    expect(chaveDoTermo('café')).toBe('CAFE')
    expect(motivoForaDoTermo(carta('well-being', 'bem-estar'))).toBe('hifen-ou-espaco')
    expect(motivoForaDoTermo(carta('ice cream', 'sorvete'))).toBe('hifen-ou-espaco')
    expect(motivoForaDoTermo(carta('cat', 'gato'))).toBe('curta')
    expect(motivoForaDoTermo(carta('extraordinary', 'extraordinário'))).toBe('longa')
    expect(motivoForaDoTermo(carta('house', ''))).toBe('sem-pista')
    expect(motivoForaDoTermo(carta('house', 'casa'))).toBeNull()
  })
  it('diagnóstico conta jogáveis e fora por motivo', () => {
    const d = diagnosticoTermo([carta('house', 'casa'), carta('well-being', 'bem-estar'), carta('cat', 'gato')])
    expect(d.jogaveis).toBe(1)
    expect(d.foraPor['hifen-ou-espaco']).toBe(1)
    expect(d.foraPor.curta).toBe(1)
  })
})

describe('Termo justo — sinônimos e quase', () => {
  const rodada: RodadaTermo = { resposta: 'DEAD', palavra: 'dead', pista: 'morto', lang: 'en', alternativas: ['deceased'] }

  it('sinônimo do acervo não gasta tentativa e orienta com tamanho + 1ª letra', () => {
    const j = julgarPalpite('DECEASED', rodada)
    expect(j.acertou).toBe(false)
    expect(j.sinonimo).toBe('deceased')
    expect(j.dica).toMatch(/4 letras e começa com D/)
  })
  it('quase: a uma letra na última tentativa, uma vez só', () => {
    expect(julgarPalpite('DEAL', rodada, { ultimaTentativa: true }).quase).toBe(true)
    expect(julgarPalpite('DEAL', rodada, { ultimaTentativa: true, quaseJaUsado: true }).quase).toBeUndefined()
    expect(julgarPalpite('DEAL', rodada, { ultimaTentativa: false }).quase).toBeUndefined()
    expect(julgarPalpite('DEAD', rodada).acertou).toBe(true)
  })
  it('distância de edição', () => {
    expect(distanciaDeEdicao('DEAD', 'DEAL')).toBe(1)
    expect(distanciaDeEdicao('DEAD', 'DEAD')).toBe(0)
    expect(distanciaDeEdicao('DEAD', 'LIVE')).toBe(4)
  })
  it('buildTermoRounds carrega as alternativas do acervo e a frase de contexto', () => {
    const cards = [carta('dead', 'morto', { sentence: 'The battery is dead.' }), carta('deceased', 'morto'), carta('house', 'casa')]
    const rodadas = buildTermoRounds(cards, { quantidade: 3, shuffle: (xs) => xs })
    const dead = rodadas.find((r) => r.palavra === 'dead' || r.palavra === 'deceased')!
    expect(dead.alternativas).toHaveLength(1)
    const house = rodadas.find((r) => r.palavra === 'house')!
    expect(house.alternativas).toBeUndefined()
  })
})

describe('composição local balanceia como o servidor (50/25/25)', () => {
  it('mistura as faixas e completa quando falta', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, difficultyScore: 0.1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, difficultyScore: 0.5 })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, difficultyScore: 0.9 })),
    ]
    const r = balancear(pool, 8)
    expect(r).toHaveLength(8)
    expect(r.filter((x) => x.id.startsWith('m')).length).toBe(4)
    expect(r.filter((x) => x.id.startsWith('f')).length).toBe(2)
    expect(r.filter((x) => x.id.startsWith('d')).length).toBe(2)
    // sem difíceis: completa com o que há
    expect(balancear(pool.filter((x) => !x.id.startsWith('d')), 8)).toHaveLength(8)
  })
})
