/**
 * A FORÇA 1–4 e as ETIQUETAS DO USUÁRIO — as duas regras puras do openspec `vocab-forca-e-etiquetas`.
 */
import { describe, expect, it } from 'vitest'

import {
  forcaDoCartao,
  LAPSES_QUE_REBAIXAM,
  LIMIAR_FAMILIAR_DIAS,
  LIMIAR_FIRME_DIAS,
} from '../src/core/learning/forcaDoCartao'
import {
  MAX_CARACTERES_DA_ETIQUETA,
  MAX_ETIQUETAS,
  normalizarEtiqueta,
  normalizarEtiquetas,
} from '../src/core/vocabulario/etiquetasDoUsuario'
import { tagsDoAnki } from '../src/lib/anki/montarApkg'

describe('forcaDoCartao', () => {
  it('1 Nova: sem estabilidade, estabilidade zerada ou nenhuma repetição', () => {
    expect(forcaDoCartao({})).toBe(1)
    expect(forcaDoCartao({ stability: null, reps: 0 })).toBe(1)
    expect(forcaDoCartao({ stability: 0, reps: 3 })).toBe(1)
    expect(forcaDoCartao({ stability: 12, reps: 0 })).toBe(1)
  })

  it('2, 3 e 4 pelos limiares de estabilidade (3 e 21 dias), com a borda no nível de cima', () => {
    expect(forcaDoCartao({ stability: 0.4, reps: 1 })).toBe(2)
    expect(forcaDoCartao({ stability: LIMIAR_FAMILIAR_DIAS - 0.01, reps: 2 })).toBe(2)
    expect(forcaDoCartao({ stability: LIMIAR_FAMILIAR_DIAS, reps: 2 })).toBe(3)
    expect(forcaDoCartao({ stability: LIMIAR_FIRME_DIAS - 0.01, reps: 4 })).toBe(3)
    expect(forcaDoCartao({ stability: LIMIAR_FIRME_DIAS, reps: 4 })).toBe(4)
    expect(forcaDoCartao({ stability: 400, reps: 9 })).toBe(4)
  })

  it('lê `fsrsStability` do cartão do cliente quando não há `stability`', () => {
    expect(forcaDoCartao({ fsrsStability: 30, reps: 5 })).toBe(4)
  })

  it('muitos esquecimentos rebaixam um nível, mas nunca abaixo de 2 e nunca a Nova', () => {
    expect(forcaDoCartao({ stability: 40, reps: 9, lapses: LAPSES_QUE_REBAIXAM - 1 })).toBe(4)
    expect(forcaDoCartao({ stability: 40, reps: 9, lapses: LAPSES_QUE_REBAIXAM })).toBe(3)
    expect(forcaDoCartao({ stability: 10, reps: 9, lapses: 8 })).toBe(2)
    expect(forcaDoCartao({ stability: 1, reps: 9, lapses: 8 })).toBe(2)
    expect(forcaDoCartao({ stability: null, reps: 0, lapses: 8 })).toBe(1)
  })
})

describe('normalizarEtiqueta(s)', () => {
  it('minúsculas, sem # e com espaços virando hífen; acentos ficam', () => {
    expect(normalizarEtiqueta('  Filme ')).toBe('filme')
    expect(normalizarEtiqueta('#Viagem de Férias')).toBe('viagem-de-férias')
    expect(normalizarEtiqueta('Café_2')).toBe('café_2')
  })

  it('o que não sobra nada ou passa de 32 caracteres é inválido', () => {
    expect(normalizarEtiqueta('   ')).toBeNull()
    expect(normalizarEtiqueta('!!!')).toBeNull()
    expect(normalizarEtiqueta('x'.repeat(MAX_CARACTERES_DA_ETIQUETA))).toBe('x'.repeat(MAX_CARACTERES_DA_ETIQUETA))
    expect(normalizarEtiqueta('x'.repeat(MAX_CARACTERES_DA_ETIQUETA + 1))).toBeNull()
  })

  it('a lista tira repetidas (a primeira fica) e recusa mais de 10 ou uma inválida', () => {
    expect(normalizarEtiquetas(['Filme', 'filme', '#FILME', 'trabalho'])).toEqual({
      ok: true,
      etiquetas: ['filme', 'trabalho'],
    })
    expect(normalizarEtiquetas([])).toEqual({ ok: true, etiquetas: [] })
    const onze = Array.from({ length: MAX_ETIQUETAS + 1 }, (_, i) => `e${i}`)
    expect(normalizarEtiquetas(onze)).toEqual({ ok: false, motivo: 'muitas' })
    expect(normalizarEtiquetas(onze.slice(0, MAX_ETIQUETAS)).ok).toBe(true)
    expect(normalizarEtiquetas(['ok', ' '])).toEqual({ ok: false, motivo: 'invalida' })
  })
})

describe('tagsDoAnki', () => {
  it('separa por espaço e cerca de espaços; sem etiquetas, vazio', () => {
    expect(tagsDoAnki(['filme', 'viagem'])).toBe(' filme viagem ')
    expect(tagsDoAnki([])).toBe('')
    expect(tagsDoAnki(undefined)).toBe('')
  })
})

describe('etiquetas com sinais combinantes', () => {
  it('mantém vogais do árabe e do devanágari', async () => {
    const { normalizarEtiqueta } = await import('../src/core/vocabulario/etiquetasDoUsuario')
    expect(normalizarEtiqueta('مُدَرِّسَة')).toBe('مُدَرِّسَة')
    expect(normalizarEtiqueta('हिंदी')).toBe('हिंदी')
  })
})
