/**
 * OBRAS E EDIÇÕES: o mesmo livro em vários idiomas, e a busca por título traduzido. A visibilidade vale
 * EDIÇÃO POR EDIÇÃO: um irmão de outro idioma só aparece se ele próprio passa no filtro legal e na classificação.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  aUmaLetra,
  casaComBusca,
  filtrarLivros,
  livrosVisiveis,
  ordenarLivros,
  pontuacaoDaBusca,
} from '../src/core/livros/catalogo'
import {
  agruparPorObra,
  chaveDaObra,
  edicoesDaObra,
  edicoesEmOutrosIdiomas,
  ehObraDaWikidata,
  montarTitulosAlternativos,
  obraLocal,
  tituloEquivale,
} from '../src/core/livros/obras'
import type { Classificacao, LivroDoCatalogo } from '../src/core/livros/tipos'
import { validarCatalogo } from '../src/lib/livros/catalogo'

let n = 0
function livro(o: Partial<LivroDoCatalogo> = {}): LivroDoCatalogo {
  n++
  return {
    id: `l${n}`,
    titulo: `Livro ${n}`,
    autores: [{ nome: 'Autor', anoMorte: 1900, idiomas: ['en'] }],
    tradutores: [],
    idioma: 'en',
    fonte: 'gutenberg-curado',
    fonteId: `${n}`,
    formatos: {},
    categorias: [],
    classificacao: 'livre',
    nivel: 'B1',
    palavras: 50_000,
    minutosEstimados: 280,
    popularidade: 0.5,
    downloads: 10,
    credito: '',
    licenca: '',
    ...o,
  }
}

const LIMITE = 1955
const odisseiaEn = livro({
  id: 'pg-1727',
  titulo: 'The Odyssey',
  idioma: 'en',
  obra: 'Q35160',
  titulosAlternativos: ['Odisseia', 'La Odisea', 'Οδύσσεια'],
  popularidade: 0.9,
})
const odisseiaEs = livro({
  id: 'pg-58221',
  titulo: 'La Odisea',
  idioma: 'es',
  obra: 'Q35160',
  titulosAlternativos: ['The Odyssey', 'Odisseia'],
  tradutores: [{ nome: 'Tradutor', anoMorte: 1920, idiomas: ['es'] }],
  popularidade: 0.4,
})
const odisseiaPt = livro({
  id: 'se-odisseia',
  titulo: 'Odisseia',
  idioma: 'pt',
  obra: 'Q35160',
  titulosAlternativos: ['The Odyssey', 'La Odisea'],
  tradutores: [{ nome: 'Tradutora', anoMorte: 1930, idiomas: ['pt'] }],
  popularidade: 0.2,
})
const quixoteEs = livro({
  id: 'pg-2000',
  titulo: 'Don Quijote',
  idioma: 'es',
  obra: 'Q480',
  titulosAlternativos: ['Don Quixote', 'Dom Quixote'],
})
const quixoteEn = livro({
  id: 'pg-996',
  titulo: 'Don Quixote',
  idioma: 'en',
  obra: 'Q480',
  titulosAlternativos: ['Don Quijote', 'Dom Quixote'],
})
const faustDe = livro({ id: 'pg-2229', titulo: 'Faust', idioma: 'de', obra: 'Q41', titulosAlternativos: ['Fausto'] })
const faustoEs = livro({ id: 'pg-1', titulo: 'Fausto', idioma: 'es', obra: 'Q41', titulosAlternativos: ['Faust'] })
const semObra = livro({ id: 'pg-9', titulo: 'Solitário' })
const catalogo = [odisseiaEn, odisseiaEs, odisseiaPt, quixoteEs, quixoteEn, faustDe, faustoEs, semObra]

describe('agrupar por obra', () => {
  it('liga edições de idiomas diferentes só quando o QID da obra bate', () => {
    const g = agruparPorObra(catalogo)
    expect(g.get('Q35160')?.map((l) => l.id)).toEqual(['pg-1727', 'pg-58221', 'se-odisseia'])
    expect(g.get('Q480')).toHaveLength(2)
    expect(g.get('Q41')).toHaveLength(2)
  })

  it('catálogo antigo (sem os campos): cada livro é uma obra, nada se junta', () => {
    const a = livro({ titulo: 'Hamlet', idioma: 'en' })
    const b = livro({ titulo: 'Hamlet', idioma: 'es' })
    expect(agruparPorObra([a, b]).size).toBe(2)
    expect(chaveDaObra(a)).not.toBe(chaveDaObra(b))
  })

  it('a obra local (sem QID) é por idioma e nunca vale como ligação', () => {
    const a = livro({
      titulo: 'Hamlet',
      idioma: 'en',
      obra: obraLocal({ idioma: 'en', titulo: 'Hamlet', autores: [] }),
    })
    const b = livro({
      titulo: 'Hamlet',
      idioma: 'es',
      obra: obraLocal({ idioma: 'es', titulo: 'Hamlet', autores: [] }),
    })
    expect(a.obra).toBe('local:en:anonimo-hamlet')
    expect(ehObraDaWikidata(a.obra)).toBe(false)
    expect(agruparPorObra([a, b]).size).toBe(2)
  })

  it('edicoesDaObra põe o próprio livro primeiro, as outras por popularidade', () => {
    expect(edicoesDaObra(odisseiaEs, catalogo).map((l) => l.id)).toEqual(['pg-58221', 'pg-1727', 'se-odisseia'])
    expect(edicoesDaObra(semObra, catalogo)).toEqual([semObra])
  })
})

describe('o filtro vale edição por edição', () => {
  const visiveis = (teto: Classificacao, livros: LivroDoCatalogo[]) =>
    edicoesEmOutrosIdiomas(odisseiaEn, livros, teto, LIMITE)

  it('adulto vê os irmãos de outros idiomas', () => {
    expect(visiveis('18', catalogo).map((l) => l.idioma)).toEqual(['es', 'pt'])
  })

  it('um irmão sem classificação aprovada não aparece para menor, mesmo que o livro principal apareça', () => {
    const revisado = [
      odisseiaEn,
      { ...odisseiaEs, classificacao: null },
      { ...odisseiaPt, classificacao: '12' as const },
    ]
    expect(visiveis('12', revisado).map((l) => l.id)).toEqual(['se-odisseia'])
    expect(visiveis('livre', revisado)).toEqual([])
  })

  it('um irmão que não passa no filtro legal nunca é devolvido, nem para adulto', () => {
    const protegido = { ...odisseiaEs, autores: [{ nome: 'Autor', anoMorte: 1990, idiomas: ['es'] }] }
    expect(visiveis('18', [odisseiaEn, protegido, odisseiaPt]).map((l) => l.id)).toEqual(['se-odisseia'])
  })

  it('tradução cujo tradutor está protegido também fica de fora', () => {
    const traducao = { ...odisseiaEs, tradutores: [{ nome: 'Tradutor', anoMorte: 1999, idiomas: ['es'] }] }
    expect(visiveis('18', [odisseiaEn, traducao]).map((l) => l.id)).toEqual([])
  })

  it('não devolve a outra edição do MESMO idioma como "outro idioma"', () => {
    const outra = { ...odisseiaEn, id: 'pg-3160' }
    expect(visiveis('18', [odisseiaEn, outra])).toEqual([])
  })

  it('livrosVisiveis continua sendo a porta: menor sem classificação não vê nada', () => {
    expect(
      livrosVisiveis(
        catalogo.map((l) => ({ ...l, classificacao: null })),
        '16',
        LIMITE,
      ),
    ).toEqual([])
  })
})

describe('busca por título em qualquer idioma da obra', () => {
  const acha = (texto: string, livros = catalogo) => filtrarLivros(livros, { texto }).map((l) => l.id)

  it('"odisseia" acha a obra em inglês (Odyssey) e em espanhol (La Odisea)', () => {
    expect(acha('odisseia')).toEqual(expect.arrayContaining(['pg-1727', 'pg-58221', 'se-odisseia']))
  })

  it('"odyssey" acha a edição em português e "la odisea" a inglesa', () => {
    expect(acha('odyssey')).toContain('se-odisseia')
    expect(acha('la odisea')).toContain('pg-1727')
  })

  it('"dom quixote" e "don quijote" acham as duas edições', () => {
    expect(acha('dom quixote').sort()).toEqual(['pg-2000', 'pg-996'])
    expect(acha('don quijote').sort()).toEqual(['pg-2000', 'pg-996'])
    expect(acha('dom quijote').sort()).toEqual(['pg-2000', 'pg-996'])
  })

  it('"faust" e "fausto" acham os dois', () => {
    expect(acha('faust').sort()).toEqual(['pg-1', 'pg-2229'])
    expect(acha('fausto').sort()).toEqual(['pg-1', 'pg-2229'])
  })

  it('acento e caixa não importam', () => {
    expect(acha('ODISSÉIA')).toContain('pg-1727')
    expect(acha('Fáust')).toContain('pg-2229')
  })

  it('erro de digitação de uma letra, só com 5+ letras', () => {
    expect(acha('odyssy')).toContain('pg-1727')
    expect(acha('quijotte')).toContain('pg-2000')
    expect(acha('quixote')).toContain('pg-2000')
    expect(acha('fuast')).toEqual([])
    expect(acha('faus')).toEqual(expect.arrayContaining(['pg-1', 'pg-2229']))
    expect(acha('xxust')).toEqual([])
  })

  it('não casa por duas letras erradas', () => {
    expect(acha('odissea')).toContain('pg-1727')
    expect(acha('odusseey')).toEqual([])
  })

  it('autor continua achando', () => {
    expect(acha('autor')).toHaveLength(catalogo.length)
  })

  it('aUmaLetra: troca, falta e sobra de uma letra', () => {
    expect(aUmaLetra('faust', 'fausto')).toBe(true)
    expect(aUmaLetra('quijote', 'quixote')).toBe(true)
    expect(aUmaLetra('abcde', 'abde')).toBe(true)
    expect(aUmaLetra('abcde', 'axyde')).toBe(false)
    expect(aUmaLetra('abc', 'abcde')).toBe(false)
  })

  it('livro sem os campos novos continua casando só por título e autor', () => {
    expect(casaComBusca({ titulo: 'Hamlet', autores: [], tradutores: [] }, 'hamlet')).toBe(true)
    expect(casaComBusca({ titulo: 'Hamlet', autores: [], tradutores: [] }, 'odyssey')).toBe(false)
  })
})

describe('ordem da busca: título no idioma > título alternativo > autor', () => {
  const autorOdyssey = livro({ id: 'a', titulo: 'Outro livro', autores: [{ nome: 'Odyssey Jones', anoMorte: 1900 }] })

  it('título no idioma preferido vence o título alternativo, que vence o autor', () => {
    const r = ordenarLivros([autorOdyssey, odisseiaPt, odisseiaEs, odisseiaEn], 'odyssey', 'en')
    expect(r.map((l) => l.id)).toEqual(['pg-1727', 'pg-58221', 'se-odisseia', 'a'])
  })

  it('pontuações: exato > começa com > contém > alternativo > autor', () => {
    const p = (l: Parameters<typeof pontuacaoDaBusca>[0], t: string) => pontuacaoDaBusca(l, t)
    const exato = livro({ titulo: 'Faust' })
    const comeca = livro({ titulo: 'Faust, parte um' })
    const contem = livro({ titulo: 'O doutor Faust' })
    const alt = livro({ titulo: 'Outro', titulosAlternativos: ['Faust'] })
    const autor = livro({ titulo: 'Outro', autores: [{ nome: 'Faust Silva', anoMorte: 1900 }] })
    const notas = [exato, comeca, contem, alt, autor].map((l) => p(l, 'faust'))
    expect(notas).toEqual([...notas].sort((a, b) => b - a))
    expect(new Set(notas).size).toBe(5)
  })

  it('o idioma preferido desempata a favor da edição na língua da pessoa', () => {
    const r = ordenarLivros([odisseiaEn, odisseiaEs], 'odisea', 'es')
    expect(r[0].id).toBe('pg-58221')
  })
})

describe('validarCatalogo e os campos novos', () => {
  const base = { versao: 1, ano: 2026, anoLimite: 1955, geradoEm: '', exclusoes: [] }
  it('catálogo sem os campos continua válido', () => {
    const c = validarCatalogo({ ...base, livros: [livro()] })
    expect(c.livros).toHaveLength(1)
    expect(c.livros[0]).not.toHaveProperty('obra')
  })

  it('aceita obra e titulosAlternativos, e descarta valor malformado', () => {
    const c = validarCatalogo({
      ...base,
      livros: [
        livro({ obra: 'Q1', titulosAlternativos: ['A', 'B'] }),
        { ...livro(), obra: 42, titulosAlternativos: 'x' },
        { ...livro(), titulosAlternativos: ['ok', 7, ' '] },
      ],
    })
    expect(c.livros[0].obra).toBe('Q1')
    expect(c.livros[0].titulosAlternativos).toEqual(['A', 'B'])
    expect(c.livros[1]).not.toHaveProperty('obra')
    expect(c.livros[1]).not.toHaveProperty('titulosAlternativos')
    expect(c.livros[2].titulosAlternativos).toEqual(['ok'])
  })
})

describe('montagem: títulos alternativos e equivalência de título', () => {
  it('tira o título da edição, repetidos (sem acento nem caixa) e vazios', () => {
    expect(montarTitulosAlternativos(['The Odyssey', 'Odisseia', 'odisseía', ' ', 'La Odisea'], 'The Odyssey')).toEqual(
      ['Odisseia', 'La Odisea'],
    )
  })

  it('tem teto', () => {
    const muitos = Array.from({ length: 80 }, (_, i) => `Título ${i}`)
    expect(montarTitulosAlternativos(muitos, 'x')).toHaveLength(24)
  })

  it('tituloEquivale: subtítulo, parênteses, acento e complemento de mais de uma palavra', () => {
    expect(tituloEquivale('Noli me tangere', 'Noli Me Tángere')).toBe(true)
    expect(tituloEquivale('El Filibusterismo (Continuación del Noli me tángere)', 'El filibusterismo')).toBe(true)
    expect(tituloEquivale('Divina Commedia di Dante', 'Divina Commedia')).toBe(true)
    expect(tituloEquivale('Short Fiction', 'Fiction')).toBe(false)
    expect(tituloEquivale('Faust', 'Faust, Part One')).toBe(false)
    expect(tituloEquivale('Hamlet', 'Macbeth')).toBe(false)
  })
})

describe('o catálogo publicado e as obras', () => {
  const publicado = JSON.parse(readFileSync('public/catalogo/livros.json', 'utf8')) as { livros: LivroDoCatalogo[] }

  it('todo livro tem uma obra válida, e obra local nunca atravessa idiomas', () => {
    for (const l of publicado.livros) {
      expect(l.obra, l.id).toMatch(/^(Q\d+|local:[a-z]{2}:[a-z0-9-]+)$/)
      if (l.obra!.startsWith('local:')) expect(l.obra!.startsWith(`local:${l.idioma}:`), l.id).toBe(true)
      for (const a of l.titulosAlternativos ?? []) expect(a.trim(), l.id).not.toBe('')
    }
  })

  it('liga em mais de um idioma os exemplos conhecidos (e só por QID)', () => {
    const grupos = agruparPorObra(publicado.livros)
    const idiomasDe = (id: string) => {
      const l = publicado.livros.find((x) => x.id === id)!
      return new Set(grupos.get(chaveDaObra(l))!.map((x) => x.idioma))
    }
    expect([...idiomasDe('se-william-shakespeare-hamlet')].sort()).toEqual(['en', 'es'])
    expect([...idiomasDe('pg-57303')].sort()).toEqual(['en', 'es', 'it'])
    expect([...idiomasDe('pg-2229')].sort()).toEqual(['de', 'es'])
    expect([...idiomasDe('pg-21848')].sort()).toEqual(['es', 'nl'])
    for (const [chave, edicoes] of grupos)
      if (new Set(edicoes.map((e) => e.idioma)).size > 1) expect(ehObraDaWikidata(chave), chave).toBe(true)
  })

  it('"odisseia" e "don quijote" acham a obra pelo título de outro idioma', () => {
    const acha = (texto: string) => filtrarLivros(publicado.livros, { texto }).map((l) => l.id)
    expect(acha('odisseia')).toEqual(expect.arrayContaining(['pg-58221', 'se-homer-the-odyssey-william-cullen-bryant']))
    expect(acha('dom quixote')).toContain('se-miguel-de-cervantes-saavedra-don-quixote-john-ormsby')
    expect(acha('la isla del tesoro')).toContain('se-robert-louis-stevenson-treasure-island')
  })
})
