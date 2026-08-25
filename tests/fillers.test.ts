/**
 * Testes da contagem de vícios de linguagem.
 *
 * O teste central é `um`: no banco real ele aparecia 172 vezes, e 171 eram o artigo português. É a
 * medição que justifica a lista ser por idioma, então está travada aqui — se alguém unificar as
 * listas "para simplificar", este arquivo reprova.
 */
import { describe, it, expect } from 'vitest'
import { contarVicios, contarViciosDasFalas, idiomasComVicios } from '../src/core/learning/fillers'

describe('contarVicios', () => {
  it('conta marcador inequívoco em português', () => {
    const r = contarVicios('ah, eu acho que sim, né', 'pt')
    expect(r?.total).toBe(2)
    expect(r?.detalhe.map((d) => d.marcador).sort()).toEqual(['ah', 'né'])
  })

  it('conta marcador inequívoco em inglês', () => {
    const r = contarVicios('uh, I think, you know, that it works', 'en')
    expect(r?.total).toBe(2)
  })

  /* O CASO QUE MOTIVOU O MÓDULO. */
  it('"um" é hesitação em inglês e NÃO é vício em português (é artigo)', () => {
    expect(contarVicios('um, I need a break', 'en')?.total).toBe(1)
    expect(contarVicios('eu preciso de um intervalo', 'pt')?.total).toBe(0)
  })

  it('não conta um artigo português repetido como 3 vícios', () => {
    const r = contarVicios('um copo, um prato e um garfo', 'pt')
    expect(r?.total).toBe(0)
  })

  it('não conta palavras ambíguas — "like", "assim", "sabe", "so", "tipo" solto', () => {
    expect(contarVicios('I like this so much, right', 'en')?.total).toBe(0)
    expect(contarVicios('faça assim, você sabe, é desse tipo', 'pt')?.total).toBe(0)
  })

  it('conta a locução "tipo assim", que só existe como marcador', () => {
    expect(contarVicios('era tipo assim, difícil', 'pt')?.total).toBe(1)
  })

  it('devolve null — não zero — para idioma sem lista', () => {
    expect(contarVicios('bonjour, euh, je pense', 'fr')).toBeNull()
    expect(contarVicios('texto qualquer', '')).toBeNull()
    expect(contarVicios('texto qualquer', null)).toBeNull()
  })

  it('aceita a etiqueta regional (pt-BR, en-US)', () => {
    expect(contarVicios('ah sim', 'pt-BR')?.total).toBe(1)
    expect(contarVicios('uh yes', 'en-US')?.total).toBe(1)
  })

  /* Sem isto, "né" casaria dentro de "nébula" — o defeito do \b que já nos morreu em quality.ts. */
  it('não casa marcador dentro de outra palavra, nem com acento', () => {
    expect(contarVicios('a nébula é grande', 'pt')?.total).toBe(0)
    expect(contarVicios('ahead of time', 'en')?.total).toBe(0)
    expect(contarVicios('o aharoni chegou', 'pt')?.total).toBe(0)
  })

  it('é indiferente à caixa', () => {
    expect(contarVicios('AH, NÉ', 'pt')?.total).toBe(2)
  })

  it('a taxa por mil palavras usa o total de palavras como denominador', () => {
    const r = contarVicios('ah ' + 'palavra '.repeat(99), 'pt')
    expect(r?.palavras).toBe(100)
    expect(r?.porMilPalavras).toBe(10)
  })

  it('texto vazio não divide por zero', () => {
    const r = contarVicios('', 'pt')
    expect(r?.total).toBe(0)
    expect(r?.porMilPalavras).toBe(0)
  })

  it('o detalhe vem do mais frequente ao menos', () => {
    const r = contarVicios('né né né ah ah hmm', 'pt')
    expect(r?.detalhe.map((d) => d.marcador)).toEqual(['né', 'ah', 'hmm'])
  })

  it('só pt e en têm lista', () => {
    expect(idiomasComVicios().sort()).toEqual(['en', 'pt'])
  })
})

describe('contarViciosDasFalas', () => {
  it('usa a lista do idioma de CADA fala numa gravação mista', () => {
    const r = contarViciosDasFalas([
      { text: 'um, I think so', lang: 'en' },      // 1 (hesitação)
      { text: 'eu quero um café', lang: 'pt' },    // 0 (artigo)
      { text: 'ah, entendi', lang: 'pt' },         // 1
    ])
    expect(r.total).toBe(2)
    expect(r.idiomas).toEqual(['en', 'pt'])
  })

  it('separa as palavras sem lista em vez de somá-las ao denominador', () => {
    const r = contarViciosDasFalas([
      { text: 'ah sim', lang: 'pt' },
      { text: 'bonjour je pense bien', lang: 'fr' },
    ])
    expect(r.total).toBe(1)
    expect(r.palavras).toBe(2)
    expect(r.palavrasSemLista).toBe(4)
    expect(r.idiomas).toEqual(['pt'])
  })

  it('soma o mesmo marcador vindo de falas diferentes', () => {
    const r = contarViciosDasFalas([
      { text: 'ah', lang: 'pt' },
      { text: 'ah', lang: 'pt' },
      { text: 'hmm', lang: 'pt' },
    ])
    expect(r.detalhe).toEqual([{ marcador: 'ah', vezes: 2 }, { marcador: 'hmm', vezes: 1 }])
  })

  it('lista vazia não divide por zero', () => {
    const r = contarViciosDasFalas([])
    expect(r.total).toBe(0)
    expect(r.porMilPalavras).toBe(0)
    expect(r.idiomas).toEqual([])
  })

  it('fala sem idioma nenhum conta como sem lista', () => {
    const r = contarViciosDasFalas([{ text: 'ah sim', lang: null }])
    expect(r.total).toBe(0)
    expect(r.palavrasSemLista).toBe(2)
  })
})
