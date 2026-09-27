// @vitest-environment jsdom
/**
 * PELES DE CARTÃO (recompensas v2, onda 4, Task 4.3).
 *
 * A moldura do cartão de vocabulário muda com o estado da palavra — nova, aprendida, dominada — e
 * a pele define as três variações. O estado NÃO é recalculado aqui: vem da fase do FSRS que o
 * cartão já carrega (`fsrsState`) e do corte de domínio que a fluência já usa
 * (`RETENCAO_DE_DOMINIO` sobre `retrievability`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { RETENCAO_DE_DOMINIO } from '../src/core/learning/fluencia'
import { retrievability } from '../src/core/learning/scheduler'
import { CATALOGO_DA_LOJA, marcarPosse, soPorSeeds } from '../src/lib/loja'
import { palavrasAprendidas } from '../src/lib/palavrasAprendidas'
import {
  classeDoCartao,
  equiparPeleDeCartao,
  estadoDoCartao,
  lerPeleDeCartao,
  PELE_PADRAO,
  PELES_DE_CARTAO,
  resolverPeleDeCartao,
} from '../src/lib/pelesDeCartao'
import type { VocabCard } from '../src/types'

const css = readFileSync(path.join(process.cwd(), 'src/styles/cartoes.css'), 'utf8')
const DIA = 86_400_000
const AGORA = Date.UTC(2026, 8, 27)

const cartao = (p: Partial<VocabCard>): VocabCard =>
  ({ id: 'c', word: 'roadmap', inDeck: true, fsrsState: 'New', fsrsStability: 0, lastReview: null, ...p }) as VocabCard

beforeEach(() => localStorage.clear())

describe('o estado vem do FSRS que o cartão já tem', () => {
  it('New é nova', () => {
    expect(estadoDoCartao(cartao({ fsrsState: 'New' }), AGORA)).toBe('nova')
  })

  it('Learning e Relearning são aprendida', () => {
    expect(estadoDoCartao(cartao({ fsrsState: 'Learning', fsrsStability: 2, lastReview: AGORA }), AGORA)).toBe('aprendida')
    expect(estadoDoCartao(cartao({ fsrsState: 'Relearning', fsrsStability: 40, lastReview: AGORA }), AGORA)).toBe('aprendida')
  })

  it('Review acima do corte de domínio é dominada; abaixo, volta a aprendida', () => {
    const firme = cartao({ fsrsState: 'Review', fsrsStability: 30, lastReview: AGORA - 2 * DIA })
    expect(retrievability(2, 30)).toBeGreaterThanOrEqual(RETENCAO_DE_DOMINIO)
    expect(estadoDoCartao(firme, AGORA)).toBe('dominada')
    const escapando = cartao({ fsrsState: 'Review', fsrsStability: 3, lastReview: AGORA - 40 * DIA })
    expect(retrievability(40, 3)).toBeLessThan(RETENCAO_DE_DOMINIO)
    expect(estadoDoCartao(escapando, AGORA)).toBe('aprendida')
  })

  it('a legenda marca como aprendida toda palavra que saiu de "nova" (mesma régua)', () => {
    const s = palavrasAprendidas([
      cartao({ word: 'Nova', fsrsState: 'New' }),
      cartao({ word: 'Ship', fsrsState: 'Learning', fsrsStability: 1, lastReview: AGORA }),
      cartao({ word: 'roadmap', fsrsState: 'Review', fsrsStability: 30, lastReview: AGORA }),
      cartao({ word: 'fora', fsrsState: 'Review', inDeck: false }),
    ])
    expect([...s].sort()).toEqual(['roadmap', 'ship'])
  })
})

describe('as peles', () => {
  it('são 5, com a padrão livre e as outras só com Seeds (comum ou raro)', () => {
    expect(PELES_DE_CARTAO).toHaveLength(5)
    expect(PELE_PADRAO).toBe('padrao')
    const itens = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'cartao')
    expect(itens.map((i) => i.alvo).sort()).toEqual(PELES_DE_CARTAO.map((p) => p.id).sort())
    for (const i of itens) {
      if (i.alvo === 'padrao') {
        expect(i.nivel).toBe(1)
        expect(i.precoSeeds).toBeUndefined()
        continue
      }
      expect(soPorSeeds(i), i.id).toBe(true)
      expect(['comum', 'raro']).toContain(i.raridade)
      const [min, max] = i.raridade === 'comum' ? [350, 450] : [1000, 1300]
      expect(i.precoSeeds!).toBeGreaterThanOrEqual(min)
      expect(i.precoSeeds!).toBeLessThanOrEqual(max)
    }
  })

  it('cada pele tem uma classe para nova, aprendida e dominada, e o CSS desenha as três', () => {
    for (const p of PELES_DE_CARTAO) {
      const cls = (['nova', 'aprendida', 'dominada'] as const).map((e) => classeDoCartao(p.id, e, () => true))
      expect(new Set(cls).size, p.id).toBe(3)
      for (const e of ['nova', 'aprendida', 'dominada']) {
        expect(css, `${p.id} ${e}`).toMatch(new RegExp(`\\.pele-${p.id}\\.cartao-${e}\\b`))
      }
    }
  })

  it('pele não possuída (ou desconhecida) cai na padrão', () => {
    expect(resolverPeleDeCartao('vitral', () => false)).toBe('padrao')
    expect(resolverPeleDeCartao('pele-que-saiu', () => true)).toBe('padrao')
    expect(resolverPeleDeCartao('vitral')).toBe('padrao')
    marcarPosse(CATALOGO_DA_LOJA.find((i) => i.tipo === 'cartao' && i.alvo === 'vitral')!.id)
    expect(resolverPeleDeCartao('vitral')).toBe('vitral')
  })

  it('equipar guarda a escolha', () => {
    expect(lerPeleDeCartao()).toBe('padrao')
    equiparPeleDeCartao('caderno')
    expect(lerPeleDeCartao()).toBe('caderno')
  })

  it('modo leve e movimento reduzido tiram o brilho animado da dominada', () => {
    expect(css).toMatch(/html\[data-modo-leve='true'\][^{]*\{[^}]*animation:\s*none/)
    expect(css).toMatch(/prefers-reduced-motion: reduce/)
  })
})
