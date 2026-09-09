import { describe, expect,it } from 'vitest'

import { FRASES_INTEIRAS,PARAFRASES } from '../src/lib/traducao/expressoes'
import { chaveNormalizada,limparVicios, normalizarContracoes, parafrasearExpressoes, prepararFala, traducaoDeFraseInteira } from '../src/lib/traducao/prepararFala'

describe('prepararFala — a fala do mic em português vira português claro antes de traduzir', () => {
  it('remove hesitações isoladas e a gagueira, sem tocar em palavra de conteúdo', () => {
    expect(limparVicios('Eu, né, eu eu acho que sim, ahn, tipo assim.')).toBe('Eu, eu acho que sim.')
    expect(limparVicios('Que tipo de comida você gosta?')).toBe('Que tipo de comida você gosta?')
    expect(limparVicios('Ah, então tá.')).toBe('Então tá.')
  })

  it('normaliza contrações orais preservando a inicial maiúscula', () => {
    expect(normalizarContracoes('Tá tudo certo pra amanhã, cê vem?')).toBe('Está tudo certo para amanhã, você vem?')
    expect(normalizarContracoes('A gente tava indo pro mercado')).toBe('Nós estava indo para o mercado')
    // "to" e "ta" sem acento são ambíguos demais ("to" não existe; "ta" é raro) — ficam de fora.
    expect(normalizarContracoes('vou to')).toBe('vou to')
  })

  it('parafraseia gíria e expressão idiomática em português claro', () => {
    expect(parafrasearExpressoes('Pois é, deu certo, tô ligado')).toBe('É verdade, funcionou, entendi')
    expect(parafrasearExpressoes('A galera curtiu o rolê pra caramba')).toBe('A pessoal curtiu o passeio muito')
    expect(parafrasearExpressoes('massa')).toBe('ótimo')
  })

  it('fala inteira conhecida sai com tradução pronta no idioma-alvo', () => {
    expect(traducaoDeFraseInteira('Valeu!', 'en')).toBe('Thanks!')
    expect(traducaoDeFraseInteira('tudo bem?', 'en')).toBe('How are you?')
    expect(traducaoDeFraseInteira('Tudo bem.', 'en')).toBe('All good.')
    expect(traducaoDeFraseInteira('valeu', 'es')).toBeUndefined()
    expect(traducaoDeFraseInteira('valeu pela ajuda', 'en')).toBeUndefined()
  })

  it('pipeline: só age em português; outros idiomas saem intactos', () => {
    expect(prepararFala('Hey, um, you know, whatever.', 'en', 'pt')).toEqual({ texto: 'Hey, um, you know, whatever.', mudou: false })
    const r = prepararFala('Né, a gente tava de boa, pois é.', 'pt-BR', 'en')
    expect(r.texto).toBe('Nós estava tranquilo, é verdade.')
    expect(r.mudou).toBe(true)
    expect(r.traducaoPronta).toBeUndefined()
  })

  it('pipeline: depois de limpar, a expressão inteira ainda é reconhecida', () => {
    expect(prepararFala('Ahn, valeu!', 'pt', 'en').traducaoPronta).toBe('Thanks!')
    expect(prepararFala('Pois é.', 'pt', 'en').traducaoPronta).toBe('Yeah, exactly.')
  })

  it('só vícios: devolve o original (melhor traduzir algo do que nada)', () => {
    expect(prepararFala('ahn', 'pt', 'en')).toEqual({ texto: 'ahn', mudou: false })
  })

  it('chave de cache ignora caixa, pontuação final e espaços', () => {
    expect(chaveNormalizada('Tá bom.')).toBe(chaveNormalizada('tá   bom'))
    expect(chaveNormalizada('Tá bom?')).not.toBe(chaveNormalizada('tá bom'))
  })

  it('glossário: sem duplicatas e sem entrada vazia', () => {
    const chaves = PARAFRASES.map(([k]) => k)
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const [k, v] of PARAFRASES) { expect(k.trim()).toBeTruthy(); expect(v.trim()).toBeTruthy() }
    const en = FRASES_INTEIRAS.en.map(([k]) => k)
    expect(new Set(en).size).toBe(en.length)
  })
})
