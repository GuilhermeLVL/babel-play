/**
 * O FILTRO LEGAL DO CATÁLOGO DE LIVROS (critério 1 da spec `docs/specs/2026-10-26-livros-e-leitura.md`).
 *
 * Lei 9.610, art. 41: a obra entra em domínio público 70 anos contados de 1º de janeiro do ano seguinte à
 * morte do autor. Em 2026 entra quem morreu até 1955. Art. 14: a tradução tem direito próprio, então o
 * tradutor segue a mesma regra. E o que não se sabe não entra: autor sem ano de morte, e obra que não se
 * sabe se é tradução (o autor escrevia em outro idioma, ou não se sabe em qual).
 */
import { describe, expect, it } from 'vitest'

import {
  anoEmSaoPaulo,
  anoLimite,
  avaliarLegalidade,
  ehTraducao,
  entraNoCatalogo,
  passaNaDefesaDoCliente,
} from '../src/core/livros/filtroLegal'
import { metadadosLegaisDoGutendex } from '../src/core/livros/fontes'
import type { Pessoa } from '../src/core/livros/tipos'
import { MARCA_DE_TRADUCAO, textoDizQueETraducao } from '../src/core/livros/traducao'

/* `idiomas: null` = idioma desconhecido (um `undefined` explícito cairia no padrão). */
const autor = (anoMorte: number | null, nome = 'Fulano', idiomas: string[] | null = ['en']): Pessoa => ({
  nome,
  anoMorte,
  ...(idiomas ? { idiomas } : {}),
})
const obra = (
  o: { autores?: Pessoa[]; tradutores?: Pessoa[]; traducaoDeclarada?: boolean; fonte?: string; idioma?: string } = {},
) => ({
  autores: o.autores ?? [autor(1900)],
  tradutores: o.tradutores ?? [],
  idioma: o.idioma ?? 'en',
  traducaoDeclarada: o.traducaoDeclarada,
  fonte: o.fonte ?? 'standard-ebooks',
})

describe('o ano-limite e o ano do Brasil', () => {
  it('é o ano menos 71', () => {
    expect(anoLimite(2026)).toBe(1955)
    expect(anoLimite(2027)).toBe(1956)
  })

  it('a virada é a de São Paulo, não a de UTC', () => {
    // 31/12/2026 às 23h30 em São Paulo = 1º/1/2027 às 02h30 em UTC.
    expect(anoEmSaoPaulo(new Date('2027-01-01T02:30:00Z'))).toBe(2026)
    expect(anoEmSaoPaulo(new Date('2027-01-01T03:00:00Z'))).toBe(2027)
  })
})

describe('autor', () => {
  it('morto em 1955 entra em 2026', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1955)] }), 2026)).toBe(true)
  })

  it('morto em 1956 NUNCA entra em 2026', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1956, 'Gabriela')] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'autor-protegido' })
    expect(v).toHaveProperty('detalhe', expect.stringContaining('1956'))
    expect(v).toHaveProperty('detalhe', expect.stringContaining('2027'))
  })

  it('morto em 1998 (Jünger, que o Standard Ebooks tem por ser domínio público nos EUA) não entra', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1998, 'Ernst Jünger')] }), 2026)).toBe(false)
  })

  it('sem ano de morte NUNCA entra', () => {
    expect(avaliarLegalidade(obra({ autores: [autor(null)] }), 2026)).toMatchObject({
      entra: false,
      motivo: 'autor-sem-ano-de-morte',
    })
  })

  it('obra sem autor não entra (anônimo só pela lista de exceções revisada)', () => {
    expect(avaliarLegalidade(obra({ autores: [] }), 2026)).toMatchObject({ entra: false, motivo: 'sem-autor' })
  })

  it('coautoria: basta um autor protegido ou sem ano para a obra ficar de fora', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(1960)] }), 2026)).toBe(false)
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(null)] }), 2026)).toBe(false)
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(1950)] }), 2026)).toBe(true)
  })

  it('obra sem tradutor, no idioma do autor, morto em 1900, entra', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1900, 'A', ['pt'])], idioma: 'pt' }), 2026)).toBe(true)
  })
})

describe('tradução: na dúvida, é tradução (falha fechada)', () => {
  it('livro num idioma que o autor não escrevia é tradução', () => {
    expect(ehTraducao(obra({ autores: [autor(1863, 'Jacob Grimm', ['de'])], idioma: 'en' }))).toBe(true)
    expect(ehTraducao(obra({ autores: [autor(1817, 'Jane Austen', ['en'])], idioma: 'en' }))).toBe(false)
  })

  it('autor de idioma DESCONHECIDO conta como tradução', () => {
    expect(ehTraducao(obra({ autores: [autor(1900, 'X', null)] }))).toBe(true)
    expect(ehTraducao(obra({ autores: [autor(1900, 'X', [])] }))).toBe(true)
  })

  it('tradução com tradutor DESCONHECIDO (o autor escrevia em outro idioma) NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1870, 'Alexandre Dumas', ['fr'])], idioma: 'en' }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
  })

  it('autor de idioma desconhecido e sem tradutor NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1900, 'Sem Idioma', null)] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
    expect(v).toHaveProperty('detalhe', expect.stringContaining('Sem Idioma'))
  })

  it('a fonte ou o texto dizem que é tradução, sem dizer de quem: NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ traducaoDeclarada: true }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
  })

  it('tradução com tradutor SEM ano de morte NUNCA entra', () => {
    const v = avaliarLegalidade(
      obra({ autores: [autor(1881, 'Dostoiévski', ['ru'])], tradutores: [autor(null, 'Tradutora')] }),
      2026,
    )
    expect(v).toMatchObject({ entra: false, motivo: 'tradutor-sem-ano-de-morte' })
  })

  it('tradução com tradutor morto em 1956 nunca entra em 2026', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1881, 'D', ['ru'])], tradutores: [autor(1956)] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'tradutor-protegido' })
  })

  it('tradução com autor e tradutor mortos até 1955 entra', () => {
    expect(
      entraNoCatalogo(
        obra({ autores: [autor(1881, 'D', ['ru'])], tradutores: [autor(1946, 'Constance Garnett')] }),
        2026,
      ),
    ).toBe(true)
  })
})

describe('a decisão a partir dos metadados do Gutendex (o que o script de montagem faz)', () => {
  /* Grimm em inglês, sem `translators`: o Gutendex não diz que é tradução, e não diz de quem. */
  const grimm = {
    id: 2591,
    authors: [
      { name: 'Grimm, Jacob', birth_year: 1785, death_year: 1863 },
      { name: 'Grimm, Wilhelm', birth_year: 1786, death_year: 1859 },
    ],
    translators: [],
  }

  it('obra traduzida sem tradutor listado fica FORA', () => {
    const idiomas = new Map([
      ['Jacob Grimm', ['de']],
      ['Wilhelm Grimm', ['de']],
    ])
    const v = avaliarLegalidade(metadadosLegaisDoGutendex(grimm, 'en', idiomas), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
  })

  it('e fica fora também quando não se achou o idioma dos autores', () => {
    const v = avaliarLegalidade(metadadosLegaisDoGutendex(grimm, 'en', new Map()), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
  })

  it('o mesmo livro em alemão, no idioma dos autores, entra', () => {
    const idiomas = new Map([
      ['Jacob Grimm', ['de']],
      ['Wilhelm Grimm', ['de']],
    ])
    expect(entraNoCatalogo(metadadosLegaisDoGutendex(grimm, 'de', idiomas), 2026)).toBe(true)
  })

  it('o texto diz "translated by": fica fora mesmo com o autor no idioma', () => {
    const idiomas = new Map([['Fulano', ['en']]])
    const livro = { id: 1, authors: [{ name: 'Fulano', death_year: 1900 }], translators: [] }
    expect(entraNoCatalogo(metadadosLegaisDoGutendex(livro, 'en', idiomas, false), 2026)).toBe(true)
    expect(entraNoCatalogo(metadadosLegaisDoGutendex(livro, 'en', idiomas, true), 2026)).toBe(false)
  })
})

describe('a marca de tradução no texto', () => {
  it('casa ao lado de letras de qualquer escrita (flag u, fronteira por \\p{L})', () => {
    for (const t of [
      'Translated by Constance Garnett',
      'Перевод с немецкого',
      '— перевел А. Н.',
      'Traducción de Juan Pérez',
      'Übersetzt von Hans',
      'Przełożył Jan',
      '英語から翻訳した',
      '张三 译者',
      'Çeviren: Ahmet',
    ])
      expect(MARCA_DE_TRADUCAO.test(t), t).toBe(true)
  })

  it('não casa dentro de outra palavra', () => {
    expect(MARCA_DE_TRADUCAO.test('the translatorship of the guild')).toBe(false)
    expect(MARCA_DE_TRADUCAO.test('a frase sem crédito nenhum')).toBe(false)
  })

  it('só olha o começo do texto', () => {
    expect(textoDizQueETraducao(`${'x '.repeat(3000)} translated by Fulano`)).toBe(false)
    expect(textoDizQueETraducao('Translated by Fulano\n\nCapítulo 1')).toBe(true)
  })
})

describe('o ano de quem monta', () => {
  it('trocar --ano para 2027 libera quem morreu em 1956 (autor e tradutor)', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1956)] }), 2027)).toBe(true)
    expect(entraNoCatalogo(obra({ autores: [autor(1900, 'R', ['ru'])], tradutores: [autor(1956)] }), 2027)).toBe(true)
    expect(entraNoCatalogo(obra({ autores: [autor(1957)] }), 2027)).toBe(false)
  })
})

describe('a fonte', () => {
  it('só as quatro fontes aceitas', () => {
    expect(entraNoCatalogo(obra({ fonte: 'gutenberg-curado' }), 2026)).toBe(true)
    expect(entraNoCatalogo(obra({ fonte: 'wikisource' }), 2026)).toBe(true)
    expect(avaliarLegalidade(obra({ fonte: 'gutenberg' }), 2026)).toMatchObject({
      entra: false,
      motivo: 'fonte-nao-aceita',
    })
    expect(entraNoCatalogo(obra({ fonte: 'mec' }), 2026)).toBe(false)
  })
})

describe('a defesa do cliente', () => {
  const em2026 = new Date('2026-10-26T12:00:00-03:00')

  it('usa o ano-limite MAIS RESTRITIVO entre o do catálogo e o do relógio do Brasil', () => {
    // Catálogo adulterado dizendo anoLimite 1990: o relógio de 2026 (limite 1955) vence.
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(1980)] }), 1990, em2026)).toBe(false)
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(1955)] }), 1990, em2026)).toBe(true)
    // Catálogo de 2026 aberto em 2030: o limite publicado (1955) vence.
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(1957)] }), 1955, new Date('2030-06-01T12:00:00Z'))).toBe(false)
  })

  it('recusa sem ano de morte, sem autor, e tradução sem tradutor', () => {
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(null)] }), 1955, em2026)).toBe(false)
    expect(passaNaDefesaDoCliente(obra({ autores: [] }), 1955, em2026)).toBe(false)
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(1900, 'F', ['fr'])] }), 1955, em2026)).toBe(false)
    expect(passaNaDefesaDoCliente(obra({ autores: [autor(1900, 'S', null)] }), 1955, em2026)).toBe(false)
    expect(passaNaDefesaDoCliente(obra({ tradutores: [autor(null)] }), 1955, em2026)).toBe(false)
  })
})
