/**
 * AS ETIQUETAS DE PALAVRAS, A REGRA (`src/core/vocabulario/etiquetas.ts`): o caderno manda, e o ponto "nova para você"
 * só aparece quando não pode mentir — índice carregado e completo, histórico suficiente, palavra indexável, linha fora
 * do idioma da pessoa e o sub-ajuste ligado.
 */
import { describe, expect, it } from 'vitest'

import { AJUSTES_PADRAO, normalizarAjustes } from '../src/core/assistente/telaDoAssistente'
import {
  chaveIndexavel,
  etiquetaDaPalavra,
  etiquetasNoLayout,
  montarIndiceDoCaderno,
  type OpcoesDaEtiqueta,
  resumoDasEtiquetas,
  SESSOES_MINIMAS_PARA_NOVA,
  type VistasDoIdioma,
} from '../src/core/vocabulario/etiquetas'

const caderno = montarIndiceDoCaderno([
  { palavra: 'Água', lang: 'pt-BR', estado: 'nova' },
  { palavra: 'report', lang: 'en', estado: 'aprendendo' },
  { palavra: 'ambiguous', lang: 'en-US', estado: 'dominada' },
  { palavra: 'twice', lang: 'en', estado: 'nova' },
  /* A mesma chave duas vezes: vale o estado mais avançado. */
  { palavra: 'Twice!', lang: 'en', estado: 'aprendendo' },
  /* Cartão antigo sem idioma: vale para todos. */
  { palavra: 'gato', estado: 'nova' },
])

const vistas = (chaves: string[], o: Partial<VistasDoIdioma> = {}): VistasDoIdioma => ({
  chaves: new Set(chaves),
  truncado: false,
  sessoes: SESSOES_MINIMAS_PARA_NOVA,
  ...o,
})
const comNova = (v: VistasDoIdioma | null | undefined, extra: Partial<OpcoesDaEtiqueta> = {}): OpcoesDaEtiqueta => ({
  nova: true,
  langDaPessoa: 'pt-BR',
  vistas: v,
  ...extra,
})

describe('o caderno manda', () => {
  it('cartão novo é "salva"; aprendendo e dominada seguem o estado', () => {
    const o = comNova(vistas([]))
    expect(etiquetaDaPalavra('report', 'en', caderno, o)).toBe('aprendendo')
    expect(etiquetaDaPalavra('ambiguous', 'en', caderno, o)).toBe('dominada')
    expect(etiquetaDaPalavra('twice', 'en', caderno, o)).toBe('aprendendo')
  })

  it('a chave ignora acento, caixa e pontuação (a mesma do núcleo)', () => {
    const o = comNova(null)
    expect(etiquetaDaPalavra('agua', 'pt', caderno, o)).toBe('salva')
    expect(etiquetaDaPalavra('ÁGUA!', 'pt-PT', caderno, o)).toBe('salva')
    expect(etiquetaDaPalavra('"Report,"', 'en-GB', caderno, o)).toBe('aprendendo')
  })

  it('o idioma conta: a mesma palavra em outro idioma não é a do caderno', () => {
    expect(etiquetaDaPalavra('report', 'fr', caderno, comNova(null))).toBeUndefined()
  })

  it('o cartão sem idioma vale em qualquer idioma', () => {
    expect(etiquetaDaPalavra('Gato', 'es', caderno, comNova(null))).toBe('salva')
  })

  it('sem caderno (ainda carregando), nada é pintado', () => {
    expect(etiquetaDaPalavra('report', 'en', null, comNova(null))).toBeUndefined()
  })

  it('o caderno vence o ponto: a palavra guardada nunca é "nova para você"', () => {
    expect(etiquetaDaPalavra('report', 'en', caderno, comNova(vistas([])))).toBe('aprendendo')
  })
})

describe('o ponto "nova para você" e os portões dele', () => {
  it('aparece na palavra indexável que o índice nunca viu', () => {
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(vistas(['report'])))).toBe('nova-para-voce')
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(vistas(['checked'])))).toBeUndefined()
  })

  it('sem índice (convidado: 501) ou ainda a caminho, nenhum ponto', () => {
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(null))).toBeUndefined()
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(undefined))).toBeUndefined()
  })

  it('índice truncado: nenhum ponto (um ponto errado é pior que nenhum)', () => {
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(vistas([], { truncado: true })))).toBeUndefined()
  })

  it(`histórico curto (menos de ${SESSOES_MINIMAS_PARA_NOVA} sessões no idioma): nenhum ponto`, () => {
    const pouco = vistas([], { sessoes: SESSOES_MINIMAS_PARA_NOVA - 1 })
    expect(etiquetaDaPalavra('checked', 'en', caderno, comNova(pouco))).toBeUndefined()
  })

  it('o sub-ajuste desligado tira o ponto e deixa as tintas', () => {
    const o = comNova(vistas([]), { nova: false })
    expect(etiquetaDaPalavra('checked', 'en', caderno, o)).toBeUndefined()
    expect(etiquetaDaPalavra('report', 'en', caderno, o)).toBe('aprendendo')
  })

  it('no idioma da pessoa nada é novo', () => {
    expect(etiquetaDaPalavra('cachorro', 'pt', caderno, comNova(vistas([])))).toBeUndefined()
  })

  it('palavra-função, número e palavra curta nunca ganham o ponto (o servidor não as indexa)', () => {
    const o = comNova(vistas([]))
    for (const p of ['the', 'The', "don't", 'a', 'x', '2024', 'b2b'])
      expect(etiquetaDaPalavra(p, 'en', caderno, o)).toBeUndefined()
  })

  it('em japonês e chinês uma letra já é palavra', () => {
    expect(chaveIndexavel('猫', 'ja')).toBe(true)
    expect(chaveIndexavel('x', 'en')).toBe(false)
  })
})

describe('layout, resumo e ajustes', () => {
  it('a Faixa fica com as tintas e perde o ponto; os outros layouts mostram os dois', () => {
    expect(etiquetasNoLayout('faixa')).toEqual({ tintas: true, nova: false })
    for (const l of ['legenda', 'conversa', 'estudo'] as const) expect(etiquetasNoLayout(l).nova).toBe(true)
    expect(etiquetasNoLayout(undefined).nova).toBe(true)
  })

  it('o resumo da linha agrupa salvas, aprendendo e novas, sem repetir e sem as dominadas', () => {
    const r = resumoDasEtiquetas([
      ['Twice,', 'aprendendo'],
      ['twice', 'aprendendo'],
      ['água', 'salva'],
      ['ambiguous', 'dominada'],
      ['checked.', 'nova-para-voce'],
      ['so', undefined],
    ])
    expect(r).toEqual({ salvas: ['água'], aprendendo: ['Twice'], novas: ['checked'] })
  })

  it('os dois ajustes nascem ligados, e o disco estranho volta ao padrão', () => {
    expect(AJUSTES_PADRAO.etiquetas).toBe(true)
    expect(AJUSTES_PADRAO.etiquetaNova).toBe(true)
    expect(normalizarAjustes({ etiquetas: false, etiquetaNova: 'sim' })).toMatchObject({
      etiquetas: false,
      etiquetaNova: true,
    })
    expect(normalizarAjustes(null)).toMatchObject({ etiquetas: true, etiquetaNova: true })
  })
})
