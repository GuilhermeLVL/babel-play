/**
 * A métrica que vai julgar todas as correções do pipeline de fala precisa ser confiável ANTES de
 * julgar qualquer coisa. Uma métrica errada é pior que nenhuma: ela dá um número, e número convence.
 *
 * O foco dos testes é a normalização de português e a decomposição dos erros — as duas partes onde
 * um descuido produz um WER que parece bom e esconde o defeito.
 */
import { describe, expect,it } from 'vitest'

import {
agregar, agregarPorFaixa, cer, distanciaDeEdicao,   normalizarPt, palavras,
wer, } from '../src/core/eval/wer'

describe('normalização pt-BR', () => {
  it('tira caixa e pontuação, mas MANTÉM o acento', () => {
    expect(normalizarPt('Olá, tudo bem?')).toBe('olá tudo bem')
    // O acento distingue palavra em português; removê-lo mascararia o erro que se quer medir.
    expect(normalizarPt('está')).not.toBe(normalizarPt('esta'))
  })

  it('só remove acento quando explicitamente pedido', () => {
    expect(normalizarPt('está', { semAcento: true })).toBe('esta')
  })

  it('unifica as duas formas Unicode do mesmo caractere acentuado', () => {
    const composto = 'á'                    // U+00E1
    const decomposto = 'á'            // a + acento combinante
    expect(composto).not.toBe(decomposto)   // são strings diferentes...
    expect(normalizarPt(composto)).toBe(normalizarPt(decomposto)) // ...e a mesma palavra
  })

  it('hífen e apóstrofo viram espaço, não somem', () => {
    // "guarda-chuva" é uma palavra na referência e costuma sair como duas do modelo. Colapsar em
    // "guardachuva" inventaria um erro que o modelo não cometeu.
    expect(normalizarPt('guarda-chuva')).toBe('guarda chuva')
    expect(normalizarPt('d’água')).toBe('d água')
  })

  it('colapsa espaço repetido e apara as bordas', () => {
    expect(normalizarPt('  olá   mundo  ')).toBe('olá mundo')
  })

  it('texto vazio não vira uma palavra vazia', () => {
    expect(palavras(normalizarPt(''))).toEqual([])
    expect(palavras(normalizarPt('   '))).toEqual([])
  })
})

describe('distância de edição — a decomposição é o que orienta a correção', () => {
  it('conta substituição, inserção e deleção separadamente', () => {
    // ref: a b c   |   hip: a x c d      → 1 substituição (b→x) + 1 inserção (d)
    const d = distanciaDeEdicao(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])
    expect(d).toMatchObject({ distancia: 2, substituicoes: 1, insercoes: 1, delecoes: 0 })
  })

  it('fala engolida aparece como DELEÇÃO — o sintoma de VAD cortando', () => {
    const d = distanciaDeEdicao(['eu', 'quero', 'ir', 'embora'], ['eu', 'quero'])
    expect(d).toMatchObject({ delecoes: 2, substituicoes: 0, insercoes: 0 })
  })

  it('palavra ouvida errada aparece como SUBSTITUIÇÃO — o sintoma de modelo/idioma errado', () => {
    const d = distanciaDeEdicao(['companheiro', 'americano'], ['fellowo', 'americano'])
    expect(d).toMatchObject({ substituicoes: 1, delecoes: 0, insercoes: 0 })
  })

  it('referência vazia com hipótese cheia é tudo inserção (alucinação)', () => {
    expect(distanciaDeEdicao([], ['a', 'b'])).toMatchObject({ distancia: 2, insercoes: 2 })
  })

  it('as duas vazias custam zero', () => {
    expect(distanciaDeEdicao([], [])).toMatchObject({ distancia: 0 })
  })
})

describe('WER e CER', () => {
  it('transcrição idêntica dá zero', () => {
    expect(wer('bom dia a todos', 'Bom dia, a todos!').taxa).toBe(0)
  })

  it('uma palavra errada em quatro dá 0,25', () => {
    expect(wer('bom dia a todos', 'bom dia a todas').taxa).toBeCloseTo(0.25, 5)
  })

  it('o CER distingue erro de FLEXÃO de erro de SENTIDO — é para isso que ele existe', () => {
    // Mesma palavra, terminação errada: custa 100% do WER e quase nada do CER.
    const flexao = { ref: 'eles falaram', hip: 'eles falavam' }
    expect(wer(flexao.ref, flexao.hip).taxa).toBeCloseTo(0.5, 5)
    expect(cer(flexao.ref, flexao.hip).taxa).toBeLessThan(0.1)

    // Palavra completamente outra: WER igual, CER MUITO maior.
    const sentido = { ref: 'eles falaram', hip: 'eles correram' }
    expect(wer(sentido.ref, sentido.hip).taxa).toBeCloseTo(0.5, 5)
    expect(cer(sentido.ref, sentido.hip).taxa).toBeGreaterThan(cer(flexao.ref, flexao.hip).taxa)
  })

  it('alucinação pode passar de 100% — e o número não é truncado', () => {
    const r = wer('oi', 'oi tudo bem com você hoje')
    expect(r.taxa).toBeGreaterThan(1)
  })

  it('hipótese vazia com referência cheia é 100%', () => {
    expect(wer('bom dia', '').taxa).toBe(1)
  })
})

describe('agregação do corpus', () => {
  const casos = [
    { id: '1', referencia: 'sim', hipotese: 'não' },                                  // 1 palavra, 1 erro
    { id: '2', referencia: 'eu fui ao mercado comprar pão ontem de manhã cedo', hipotese: 'eu fui ao mercado comprar pão ontem de manhã cedo' }, // 10 palavras, 0 erro
  ]

  it('pondera por palavra em vez de tirar média por caso', () => {
    const a = agregar(casos)
    // Ponderado: 1 erro ÷ 11 palavras ≈ 0,091.
    expect(a.wer).toBeCloseTo(1 / 11, 5)
    // A média por caso daria (1,0 + 0,0)/2 = 0,5 — cinco vezes pior, dominada pela fala de uma
    // palavra. Num produto feito de enunciados curtos, essa escolha muda a conclusão.
    expect(a.wer).toBeLessThan(0.5)
    expect(a.palavrasNaReferencia).toBe(11)
  })

  it('corpus vazio não divide por zero', () => {
    expect(agregar([]).wer).toBe(0)
  })

  it('separa por faixa de tamanho — é o recorte que acusa se o gargalo é a segmentação', () => {
    const porFaixa = agregarPorFaixa(casos)
    expect(porFaixa['1-2 palavras'].casos).toBe(1)
    expect(porFaixa['1-2 palavras'].wer).toBe(1)      // a fala curta errou tudo
    expect(porFaixa['6-10 palavras'].casos).toBe(1)
    expect(porFaixa['6-10 palavras'].wer).toBe(0)     // a longa acertou tudo
    expect(porFaixa['21+ palavras'].casos).toBe(0)
  })
})
