/**
 * BUSCA, FILTROS, VITRINE E VISIBILIDADE DO CATÁLOGO DE LIVROS (spec de Livros & Leitura, CAT07–CAT09 e
 * critérios 2, 4 e 5), e o catálogo publicado (`public/catalogo/livros.json`) contra o filtro legal.
 */
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  buscarExcluidos,
  casaComBusca,
  comecePorAqui,
  contarPor,
  filtrarLivros,
  livrosVisiveis,
  ordenarLivros,
  paraOSeuNivel,
  prateleiras,
  tamanhoDe,
  visivelPara,
} from '../src/core/livros/catalogo'
import { categoriasDosAssuntos, ehAutorDoVestibular, nomeNaOrdemDireta, slug } from '../src/core/livros/categorias'
import { anoLimite, avaliarLegalidade } from '../src/core/livros/filtroLegal'
import type { Catalogo, Classificacao, LivroDoCatalogo, LivroExcluido, NivelDoLivro } from '../src/core/livros/tipos'

let n = 0
function livro(o: Partial<LivroDoCatalogo> = {}): LivroDoCatalogo {
  n++
  return {
    id: `l${n}`,
    titulo: `Livro ${n}`,
    autores: [{ nome: 'Machado de Assis', anoMorte: 1908 }],
    tradutores: [],
    idioma: 'pt',
    fonte: 'wikisource',
    fonteId: `L${n}`,
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

describe('quem pode ver o quê (critério 4)', () => {
  const de = (c: Classificacao | null) => livro({ classificacao: c })

  it('adulto vê tudo, inclusive o que ainda não foi revisado', () => {
    for (const c of ['livre', '12', '14', '16', '18', null] as const) expect(visivelPara(de(c), '18')).toBe(true)
  })

  it('menor NUNCA vê o 18 nem o "a revisar" (null)', () => {
    for (const teto of ['livre', '12', '14', '16'] as const) {
      expect(visivelPara(de('18'), teto)).toBe(false)
      expect(visivelPara(de(null), teto)).toBe(false)
    }
  })

  it('o teto de 12 vê livre e 12, e não 14', () => {
    expect(visivelPara(de('livre'), '12')).toBe(true)
    expect(visivelPara(de('12'), '12')).toBe(true)
    expect(visivelPara(de('14'), '12')).toBe(false)
  })

  it('livrosVisiveis aplica também a defesa dupla do filtro legal', () => {
    const lista = [
      livro({ classificacao: '18' }),
      livro({ classificacao: '12' }),
      livro({ classificacao: 'livre', autores: [{ nome: 'Protegido', anoMorte: 1990 }] }),
      livro({ classificacao: 'livre', autores: [{ nome: 'Sem ano', anoMorte: null }] }),
    ]
    expect(livrosVisiveis(lista, '12', 1955).map((l) => l.classificacao)).toEqual(['12'])
    expect(livrosVisiveis(lista, '18', 1955)).toHaveLength(2)
  })
})

describe('busca e filtros', () => {
  const dom = livro({ titulo: 'Dom Casmurro', categorias: ['enem', 'classicos'], nivel: 'B2', palavras: 62_000 })
  const alice = livro({
    titulo: "Alice's Adventures in Wonderland",
    autores: [{ nome: 'Lewis Carroll', anoMorte: 1898 }],
    idioma: 'en',
    fonte: 'gutenberg-curado',
    categorias: ['infantojuvenil'],
    nivel: 'A2',
    palavras: 26_000,
  })
  const conto = livro({ titulo: 'A Cartomante', palavras: 4000, nivel: 'B1', categorias: ['contos'] })
  const lista = [dom, alice, conto]

  it('cada palavra da busca precisa aparecer, sem acento nem caixa, em título ou autor', () => {
    expect(casaComBusca(dom, 'machado casmurro')).toBe(true)
    expect(casaComBusca(dom, 'CASMURRO')).toBe(true)
    expect(casaComBusca(alice, 'alice carroll')).toBe(true)
    expect(casaComBusca(alice, 'alice machado')).toBe(false)
    expect(casaComBusca(dom, '')).toBe(true)
  })

  it('filtra por idioma, nível, categoria, tamanho e fonte', () => {
    expect(filtrarLivros(lista, { idioma: 'en' })).toEqual([alice])
    expect(filtrarLivros(lista, { niveis: ['A2', 'B1'] })).toEqual([alice, conto])
    expect(filtrarLivros(lista, { categoria: 'enem' })).toEqual([dom])
    expect(filtrarLivros(lista, { tamanho: 'curto' })).toEqual([conto])
    expect(filtrarLivros(lista, { fonte: 'gutenberg-curado' })).toEqual([alice])
    expect(filtrarLivros(lista, { idioma: 'pt', texto: 'cartomante' })).toEqual([conto])
  })

  it('os tamanhos: curto até 20 mil palavras, longo acima de 80 mil', () => {
    expect(tamanhoDe(19_999)).toBe('curto')
    expect(tamanhoDe(20_000)).toBe('medio')
    expect(tamanhoDe(80_000)).toBe('medio')
    expect(tamanhoDe(80_001)).toBe('longo')
  })

  it('com busca, o título que começa pelo termo vem antes; depois, a popularidade', () => {
    const a = livro({ titulo: 'Outra Casmurrice', popularidade: 0.9 })
    const b = livro({ titulo: 'Casmurro', popularidade: 0.1 })
    expect(ordenarLivros([a, b], 'casmurr').map((l) => l.titulo)).toEqual(['Casmurro', 'Outra Casmurrice'])
    expect(ordenarLivros([b, a]).map((l) => l.titulo)).toEqual(['Outra Casmurrice', 'Casmurro'])
  })

  it('conta por valor (para o filtro não oferecer opção que dá zero)', () => {
    expect(contarPor(lista, (l) => l.idioma)).toEqual(
      new Map([
        ['pt', 2],
        ['en', 1],
      ]),
    )
    expect(contarPor(lista, (l) => l.categorias).get('enem')).toBe(1)
  })
})

describe('vitrine', () => {
  const niveis: NivelDoLivro[] = ['C1', 'A1', 'B2', 'A2', 'B1']
  const lista = niveis.map((nivel, i) => livro({ nivel, popularidade: i / 10, idioma: 'en' }))

  it('"Comece por aqui": do mais fácil para o mais difícil, completando com os níveis seguintes', () => {
    expect(comecePorAqui(lista, 'en', 3).map((l) => l.nivel)).toEqual(['A1', 'A2', 'B1'])
  })

  it('"Comece por aqui" fica com os de classificação livre quando há livres suficientes', () => {
    const livres = Array.from({ length: 10 }, () => livro({ idioma: 'es', nivel: 'B2', classificacao: 'livre' }))
    const doze = livro({ idioma: 'es', nivel: 'A1', classificacao: '12' })
    expect(comecePorAqui([...livres, doze], 'es')).not.toContain(doze)
  })

  it('"Para o seu nível": o nível e o de baixo, do mais popular', () => {
    expect(paraOSeuNivel(lista, 'en', 'B1').map((l) => l.nivel)).toEqual(['B1', 'A2'])
    expect(paraOSeuNivel(lista, 'en', 'A1').map((l) => l.nivel)).toEqual(['A1'])
  })

  it('prateleiras só com as categorias que têm livro, na ordem pedida', () => {
    const p = prateleiras([livro({ categorias: ['contos'] }), livro({ categorias: ['aventura', 'contos'] })], 'pt', [
      'aventura',
      'poesia',
      'contos',
    ])
    expect(p.map((x) => [x.categoria, x.livros.length])).toEqual([
      ['aventura', 1],
      ['contos', 2],
    ])
  })
})

describe('"Por que este livro não está?" (critério 5)', () => {
  const exclusoes: LivroExcluido[] = [
    {
      titulo: 'Grande Sertão: Veredas',
      autores: ['João Guimarães Rosa'],
      idioma: 'pt',
      fonte: 'Wikisource',
      motivo: 'autor-protegido',
      detalhe: 'João Guimarães Rosa morreu em 1967',
    },
    {
      titulo: 'El crimen y el castigo',
      autores: ['Fyodor Dostoyevsky'],
      idioma: 'es',
      fonte: 'Project Gutenberg',
      motivo: 'tradutor-sem-ano-de-morte',
      detalhe: 'sem o ano de morte do tradutor',
    },
  ]
  it('a busca por autor protegido acha a exclusão com o motivo', () => {
    expect(buscarExcluidos(exclusoes, 'guimaraes rosa')).toMatchObject([{ motivo: 'autor-protegido' }])
    expect(buscarExcluidos(exclusoes, 'castigo')).toMatchObject([{ motivo: 'tradutor-sem-ano-de-morte' }])
    expect(buscarExcluidos(exclusoes, '')).toEqual([])
  })
})

describe('as categorias e os nomes que o script grava', () => {
  it('assuntos viram categorias; romance histórico não é não ficção', () => {
    expect(categoriasDosAssuntos(['Adventure stories', 'Pirates--Fiction'])).toContain('aventura')
    expect(categoriasDosAssuntos(['Detective and mystery stories'])).toContain('misterio')
    expect(categoriasDosAssuntos(['Philosophy, Ancient'])).toEqual(['didaticos'])
    expect(categoriasDosAssuntos(['Great Britain--History--Fiction'])).not.toContain('didaticos')
    expect(categoriasDosAssuntos(['Science fiction'])).not.toContain('didaticos')
  })

  it('autores do vestibular, nomes na ordem direta e ids', () => {
    expect(ehAutorDoVestibular('Joaquim Maria Machado de Assis')).toBe(true)
    expect(ehAutorDoVestibular('Eça de Queirós')).toBe(true)
    expect(ehAutorDoVestibular('Jane Austen')).toBe(false)
    expect(nomeNaOrdemDireta('Austen, Jane')).toBe('Jane Austen')
    expect(nomeNaOrdemDireta('Twain, Mark (Samuel Langhorne Clemens)')).toBe('Mark Twain')
    expect(slug('Memórias Póstumas de Brás Cubas')).toBe('memorias-postumas-de-bras-cubas')
  })
})

/* O CATÁLOGO PUBLICADO (critério 2): o que está no JSON versionado passa pelo filtro, e a classificação
   revisada só usa valores válidos. O script também confere (`--verificar`, sai ≠ 0); aqui é a rede do CI. */
const CAMINHO = 'public/catalogo/livros.json'
describe.runIf(existsSync(CAMINHO))('o catálogo publicado', () => {
  /* Lido dentro de cada teste: o corpo do `describe` roda na coleta mesmo quando o bloco é pulado. */
  let lido: Catalogo | null = null
  const catalogoPublicado = () => (lido ??= JSON.parse(readFileSync(CAMINHO, 'utf8')) as Catalogo)

  it('guarda o ano e o ano-limite de quem montou', () => {
    expect(catalogoPublicado().versao).toBe(1)
    expect(catalogoPublicado().anoLimite).toBe(anoLimite(catalogoPublicado().ano))
  })

  it('todo livro passa no filtro legal do ano em que foi montado', () => {
    const violacoes = catalogoPublicado()
      .livros.map((l) => ({
        l,
        v: avaliarLegalidade({ ...l, ehTraducao: l.tradutores.length > 0 }, catalogoPublicado().ano),
      }))
      .filter((x) => !x.v.entra)
      .map((x) => `${x.l.id}: ${'motivo' in x.v ? x.v.motivo : ''}`)
    expect(violacoes).toEqual([])
  })

  it('o Gutenberg só entra pela cópia curada (nunca um link para gutenberg.org)', () => {
    const texto = JSON.stringify(catalogoPublicado().livros)
    expect(texto).not.toMatch(/gutenberg\.org/i)
    for (const l of catalogoPublicado().livros.filter((x) => x.fonte === 'gutenberg-curado')) {
      expect(l.formatos.r2).toMatch(/^livros\/pg-\d+\.epub$/)
      expect(l.formatos.epub).toBeUndefined()
    }
  })

  it('ids únicos, e a classificação revisada aplicada de scripts/livros/classificacao.json', () => {
    const ids = catalogoPublicado().livros.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    const revisados = JSON.parse(readFileSync('scripts/livros/classificacao.json', 'utf8')).revisados as Array<{
      id: string
      classificacao: string
    }>
    for (const r of revisados) {
      expect(['livre', '12', '14', '16', '18']).toContain(r.classificacao)
      const l = catalogoPublicado().livros.find((x) => x.id === r.id)
      if (l) expect(l.classificacao).toBe(r.classificacao)
    }
    const naoRevisados = catalogoPublicado().livros.filter((l) => !revisados.some((r) => r.id === l.id))
    expect(naoRevisados.every((l) => l.classificacao === null)).toBe(true)
  })
})
