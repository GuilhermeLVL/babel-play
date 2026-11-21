/**
 * "JÁ SEI" E "IGNORAR", A REGRA (`src/core/vocabulario/marcadas.ts` e `etiquetas.ts`; openspec
 * `vocab-conhecidas-e-ignoradas`): o cartão manda, depois a marcação, depois o ponto "nova para você"; a contagem
 * de palavras conhecidas não conta a mesma palavra duas vezes; os marcos são por resultado; a cobertura de um texto
 * passa a contar as marcadas "Já sei".
 */
import { describe, expect, it } from 'vitest'

import { coberturaDoTexto } from '../src/core/leitura/coberturaDoTexto'
import {
  etiquetaDaPalavra,
  etiquetaSilenciosa,
  montarIndiceDoCaderno,
  resumoDasEtiquetas,
  SESSOES_MINIMAS_PARA_NOVA,
} from '../src/core/vocabulario/etiquetas'
import {
  chavesConhecidas,
  contagemPorIdioma,
  contarConhecidas,
  estadoMarcado,
  MARCOS_DE_PALAVRAS,
  montarIndiceDeMarcadas,
  progressoDoMarco,
} from '../src/core/vocabulario/marcadas'

const caderno = montarIndiceDoCaderno([
  { palavra: 'report', lang: 'en', estado: 'aprendendo' },
  { palavra: 'ambiguous', lang: 'en', estado: 'dominada' },
  { palavra: 'twice', lang: 'en', estado: 'nova' },
  { palavra: 'gato', estado: 'dominada' }, // sem idioma
  { palavra: 'perro', lang: 'es', estado: 'dominada' },
])

const marcadas = montarIndiceDeMarcadas([
  { lang: 'en-US', chave: 'Hello!', estado: 'conhecida' },
  { lang: 'en', chave: 'world', estado: 'conhecida' },
  { lang: 'en', chave: 'report', estado: 'conhecida' }, // duplicada com o caderno: conta uma vez
  { lang: 'en', chave: 'twice', estado: 'conhecida' }, // cartão novo manda: NÃO conta
  { lang: 'en', chave: 'gandalf', estado: 'ignorada' },
  { lang: 'es', chave: 'hola', estado: 'conhecida' },
])

const opcoes = {
  nova: true,
  langDaPessoa: 'pt-BR',
  vistas: { chaves: new Set<string>(), truncado: false, sessoes: SESSOES_MINIMAS_PARA_NOVA },
  marcadas,
}

describe('o índice de marcadas', () => {
  it('reduz idioma à base e a chave com chaveDaPalavra; ignora estado desconhecido', () => {
    const i = montarIndiceDeMarcadas([
      { lang: 'en-GB', chave: 'Água', estado: 'conhecida' },
      { lang: 'en', chave: 'x', estado: 'outra' as never },
      { lang: '', chave: 'sem', estado: 'conhecida' },
    ])
    expect(estadoMarcado(i, 'agua', 'en')).toBe('conhecida')
    expect(estadoMarcado(i, 'x', 'en')).toBeUndefined()
    expect([...i.keys()]).toEqual(['en'])
  })
})

describe('a precedência das etiquetas: cartão > marcação > ponto nova', () => {
  it('sem cartão, a marcação vale: conhecida e ignorada (nunca "nova para você")', () => {
    expect(etiquetaDaPalavra('Hello', 'en', caderno, opcoes)).toBe('conhecida')
    expect(etiquetaDaPalavra('Gandalf', 'en', caderno, opcoes)).toBe('ignorada')
    // Sem marcação e fora do índice de vistas: o ponto aparece.
    expect(etiquetaDaPalavra('orchard', 'en', caderno, opcoes)).toBe('nova-para-voce')
  })

  it('com cartão, o cartão manda mesmo marcado', () => {
    expect(etiquetaDaPalavra('twice', 'en', caderno, opcoes)).toBe('salva')
    expect(etiquetaDaPalavra('report', 'en', caderno, opcoes)).toBe('aprendendo')
  })

  it('a marcação é por idioma', () => {
    expect(etiquetaDaPalavra('hello', 'es', caderno, opcoes)).not.toBe('conhecida')
  })

  it('conhecida e ignorada são silenciosas: não pintam nem entram no resumo do leitor de tela', () => {
    expect(etiquetaSilenciosa('conhecida')).toBe(true)
    expect(etiquetaSilenciosa('ignorada')).toBe(true)
    expect(etiquetaSilenciosa('salva')).toBe(false)
    const r = resumoDasEtiquetas([
      ['Hello', 'conhecida'],
      ['Gandalf', 'ignorada'],
      ['twice', 'salva'],
    ])
    expect(r).toEqual({ salvas: ['twice'], aprendendo: [], novas: [] })
  })
})

describe('contarConhecidas', () => {
  it('soma aprendendo/dominada do caderno com as "Já sei" sem cartão, sem duplicar', () => {
    // report + ambiguous (caderno) + hello + world (marcadas); report marcada não conta de novo; twice (cartão novo)
    // e gandalf (ignorada) não contam; o cartão sem idioma não conta na contagem por idioma.
    expect([...chavesConhecidas(caderno, marcadas, 'en')].sort()).toEqual(['ambiguous', 'hello', 'report', 'world'])
    expect(contarConhecidas(caderno, marcadas, 'en-US')).toBe(4)
    expect(contarConhecidas(caderno, marcadas, 'es')).toBe(2)
    expect(contarConhecidas(null, null, 'en')).toBe(0)
  })

  it('a cobertura pode incluir o balde sem idioma; a contagem não', () => {
    expect(chavesConhecidas(caderno, marcadas, 'en', { incluirSemIdioma: true }).has('gato')).toBe(true)
  })

  it('contagem por idioma: do maior para o menor, sem o balde sem idioma', () => {
    expect(contagemPorIdioma(caderno, marcadas)).toEqual([
      { lang: 'en', conhecidas: 4 },
      { lang: 'es', conhecidas: 2 },
    ])
  })
})

describe('os marcos são por resultado', () => {
  it('a lista é a combinada e crescente', () => {
    expect([...MARCOS_DE_PALAVRAS]).toEqual([100, 250, 500, 1000, 2000, 3000, 5000, 8000])
  })

  it('antes do primeiro, no meio, exatamente num marco e depois do último', () => {
    expect(progressoDoMarco(0)).toEqual({ alcancado: null, proximo: 100, faltam: 100, fracao: 0 })
    expect(progressoDoMarco(50)).toMatchObject({ alcancado: null, proximo: 100, faltam: 50, fracao: 0.5 })
    expect(progressoDoMarco(250)).toMatchObject({ alcancado: 250, proximo: 500, faltam: 250, fracao: 0 })
    expect(progressoDoMarco(375)).toMatchObject({ alcancado: 250, proximo: 500, fracao: 0.5 })
    expect(progressoDoMarco(9000)).toEqual({ alcancado: 8000, proximo: null, faltam: 0, fracao: 1 })
    expect(progressoDoMarco(-5).proximo).toBe(100)
  })
})

describe('a cobertura de um texto conta as marcadas "Já sei"', () => {
  it('a palavra marcada deixa de ser desconhecida', () => {
    const texto = 'The orchard was quiet.'
    const antes = coberturaDoTexto(texto, 'en', chavesConhecidas(caderno, null, 'en'))
    expect(antes.desconhecidas).toContain('orchard')
    const comMarcada = montarIndiceDeMarcadas([{ lang: 'en', chave: 'orchard', estado: 'conhecida' }])
    const depois = coberturaDoTexto(texto, 'en', chavesConhecidas(caderno, comMarcada, 'en'))
    expect(depois.desconhecidas).not.toContain('orchard')
    expect(depois.conhecidas).toBe(antes.conhecidas + 1)
  })
})
