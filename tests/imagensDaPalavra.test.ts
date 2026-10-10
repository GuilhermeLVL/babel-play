// @vitest-environment jsdom
/**
 * AS IMAGENS DA FOLHA DA PALAVRA — a consulta e o filtro, com respostas GRAVADAS.
 *
 * O relato (10/10/2026): a folha de "concordado" mostrava a capa de um livro de 1615, a única imagem
 * que a busca livre achava. `tests/fixtures/imagens-da-palavra/gravadas.json` guarda o que o
 * Wikcionário e o Openverse responderam naquele dia para as palavras do relato e mais algumas,
 * reduzido ao que o código lê (títulos e primeiras definições do verbete, as figuras como vieram no
 * HTML, os campos usados de cada imagem). Nada sai para a rede: o `fetch` é respondido da gravação,
 * e pedido que não está nela derruba o teste.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type Candidata,
  escolherImagens,
  figurasDoVerbete,
  lemaDoVerbete,
  motivoDeRecusa,
  temSubstantivo,
  tituloEhOTermo,
} from '../src/lib/imagens/criterios'

vi.mock('../src/data/funil', () => ({
  // Sem servidor: a busca livre cai direto no Openverse, como na edição estática.
  apiFetch: async () => {
    throw new Error('sem servidor')
  },
}))

interface Gravadas {
  wiktionary: Record<
    string,
    { secoes: Array<{ index: string; line: string }> | { erro: string }; texto: Record<string, string> }
  >
  imageinfo: Array<{ title: string }>
  openverse: Record<string, { results: Array<Record<string, unknown>> }>
}
const gravadas = JSON.parse(
  readFileSync(path.resolve(__dirname, 'fixtures/imagens-da-palavra/gravadas.json'), 'utf8'),
) as Gravadas

let pedidos: string[] = []
const json = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })

function responder(entrada: RequestInfo | URL): Response {
  const url = new URL(String(entrada))
  const p = url.searchParams
  if (url.hostname === 'api.openverse.org') {
    const q = p.get('q') ?? ''
    pedidos.push(`openverse:${q}`)
    const gravada = gravadas.openverse[q]
    if (!gravada) throw new Error(`busca livre não gravada: ${q}`)
    return json(gravada)
  }
  if (!url.hostname.endsWith('.wiktionary.org')) throw new Error(`pedido inesperado: ${url.href}`)
  if (p.get('action') === 'query') {
    const titulos = (p.get('titles') ?? '').split('|')
    pedidos.push(`arquivos:${titulos.length}`)
    return json({ query: { pages: gravadas.imageinfo.filter((pg) => titulos.includes(pg.title)) } })
  }
  const pagina = p.get('page') ?? ''
  const verbete = gravadas.wiktionary[`${url.hostname}|${pagina}`]
  if (!verbete) throw new Error(`verbete não gravado: ${url.hostname} ${pagina}`)
  if (p.get('prop') === 'sections') {
    pedidos.push(`secoes:${url.hostname.split('.')[0]}:${pagina}`)
    return json(
      Array.isArray(verbete.secoes) ? { parse: { sections: verbete.secoes } } : { error: { code: 'missingtitle' } },
    )
  }
  return json({ parse: { text: verbete.texto[p.get('section') ?? ''] } })
}

/** O módulo guarda o que já buscou; cada caso começa de um módulo novo. */
async function buscar(pedido: { palavra: string; idioma: string; traducao?: string; idiomaDaTraducao?: string }) {
  const { buscarImagensDaPalavra } = await import('../src/lib/imagens/imagensDaPalavra')
  return buscarImagensDaPalavra(pedido)
}

beforeEach(() => {
  vi.resetModules()
  pedidos = []
  vi.stubGlobal('fetch', async (entrada: RequestInfo | URL) => responder(entrada))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const sentido = (definition: string, partOfSpeech = '') => ({ definition, partOfSpeech, examples: [] })

describe('o lema que o verbete aponta', () => {
  it('lê as frases feitas de forma flexionada, em português e em inglês', () => {
    expect(lemaDoVerbete([sentido('particípio do verbo concordar', 'Forma verbal')], 'concordado')).toBe('concordar')
    expect(lemaDoVerbete([sentido('past participle of concordar', 'Participle')], 'concordado')).toBe('concordar')
    expect(lemaDoVerbete([sentido('present participle and gerund of run', 'Verb')], 'running')).toBe('run')
    expect(lemaDoVerbete([sentido('simple past and past participle of agree', 'Verb')], 'agreed')).toBe('agree')
    expect(lemaDoVerbete([sentido('plural de cachorro', 'Forma de substantivo')], 'cachorros')).toBe('cachorro')
    expect(lemaDoVerbete([sentido('plural of apple', 'Noun')], 'apples')).toBe('apple')
  })

  it('não inventa lema para definição comum, nem pela última acepção do verbete', () => {
    expect(
      lemaDoVerbete([sentido('A common, firm, round fruit produced by a tree of the genus Malus.')], 'apple'),
    ).toBeNull()
    expect(lemaDoVerbete([sentido('Ellipsis of Adam’s apple')], 'apple')).toBeNull()
    expect(
      lemaDoVerbete([sentido('memória ou recordação grata de pessoas, familiares ou objetos')], 'saudade'),
    ).toBeNull()
    // "banco" é substantivo; a forma de "bancar" é a última acepção do verbete inglês.
    expect(
      lemaDoVerbete(
        [
          sentido('bank (financial institution)', 'Noun'),
          sentido('first-person singular present indicative of bancar', 'Verb'),
        ],
        'banco',
      ),
    ).toBeNull()
    expect(lemaDoVerbete([], 'x')).toBeNull()
  })
})

describe('a classe gramatical', () => {
  it('substantivo libera a busca livre; verbo, conjunção e forma verbal não', () => {
    expect(temSubstantivo([sentido('x', 'Adjetivo'), sentido('y', 'Substantivo')])).toBe(true)
    expect(temSubstantivo([sentido('x', 'Noun')])).toBe(true)
    expect(temSubstantivo([sentido('x', 'Forma verbal')])).toBe(false)
    expect(temSubstantivo([sentido('x', 'Conjunction')])).toBe(false)
    expect(temSubstantivo([sentido('x', 'Participle'), sentido('y', 'Verbo')])).toBe(false)
  })
})

describe('as figuras do verbete (HTML gravado do Wikcionário)', () => {
  const secao = (chave: string) => Object.values(gravadas.wiktionary[chave].texto)[0]

  it('pega as figuras na ordem do verbete e deixa os ícones de fora', () => {
    expect(figurasDoVerbete(secao('en.wiktionary.org|cachorro'))).toEqual([
      'File:Alopekis puppies.jpg',
      'File:Bernese Dog 10m..jpg',
      'File:Lempzours église modillon nord-est.JPG',
    ])
    // O cadeado de 8 px (duas vezes) do verbete de "apple" e o logo de 14 px do de "run" não são figura.
    expect(figurasDoVerbete(secao('en.wiktionary.org|apple'))).toEqual([
      'File:Red Apple.jpg',
      'File:Apple Blossom Time at Oak Glen, CA 3-16 (26094251756).jpg',
      'File:Frans Floris - The Fall of Man - Google Art Project.jpg',
    ])
    expect(figurasDoVerbete(secao('en.wiktionary.org|run'))).not.toContain('File:Wikipedia-logo.png')
  })

  it('verbete sem figura devolve lista vazia', () => {
    expect(figurasDoVerbete(secao('pt.wiktionary.org|concordado'))).toEqual([])
    expect(figurasDoVerbete(secao('en.wiktionary.org|although'))).toEqual([])
  })
})

describe('o filtro', () => {
  const base: Candidata = {
    id: 'a',
    url: 'https://exemplo.test/a.jpg',
    titulo: 'Cachorro',
    acervo: 'Flickr',
    fonte: 'busca',
    largura: 1024,
    altura: 768,
  }

  it('A CAPA DO LIVRO de "concordado": recusada pelo título de ficha, e o título nunca é a palavra', async () => {
    const { candidataDaBusca } = await import('../src/lib/imagens/imagensDaPalavra')
    const capas = gravadas.openverse.concordado.results.map((r) =>
      candidataDaBusca({
        id: String(r.id),
        url: String(r.url),
        thumbnail: String(r.thumbnail),
        title: String(r.title),
        creator: String(r.creator),
        source: String(r.source),
        width: Number(r.width),
        height: Number(r.height),
      }),
    )
    expect(capas[0].titulo).toMatch(/^Prouerbios morales/)
    // As duas capas caem no filtro (ficha de biblioteca); o terceiro resultado, um código de leis de
    // 1569, passaria nele. Nenhum dos três tem a palavra como título, e é isso que barra todos.
    expect(capas.slice(0, 2).map(motivoDeRecusa)).toEqual(['título de ficha', 'título de ficha'])
    expect(capas.filter((c) => tituloEhOTermo(c.titulo, ['concordado', 'concordar']))).toEqual([])
  })

  it('recusa por tipo de arquivo, tamanho, proporção, título, etiqueta, acervo e conteúdo adulto', () => {
    expect(motivoDeRecusa(base)).toBeNull()
    expect(motivoDeRecusa({ ...base, tipo: 'image/svg+xml' })).toBe('tipo de arquivo')
    expect(motivoDeRecusa({ ...base, url: 'https://exemplo.test/Partitura.pdf' })).toBe('tipo de arquivo')
    expect(motivoDeRecusa({ ...base, largura: 120, altura: 90 })).toBe('pequena demais')
    // A meia-calça do verbete de "run": 402 × 1054.
    expect(motivoDeRecusa({ ...base, fonte: 'verbete', largura: 402, altura: 1054 })).toBe('proporção de página')
    expect(motivoDeRecusa({ ...base, largura: 1024, altura: 282 })).toBe('proporção de faixa')
    expect(motivoDeRecusa({ ...base, titulo: 'Apple Logo' })).toBe('título de documento')
    expect(motivoDeRecusa({ ...base, titulo: 'Mapa do Brasil' })).toBe('título de documento')
    expect(motivoDeRecusa({ ...base, marcas: ['banco', 'pub', 'typographie'] })).toBe('categoria de documento')
    expect(motivoDeRecusa({ ...base, autor: 'Fondo Antiguo de la Biblioteca de Humanidades' })).toBe(
      'acervo de documentos',
    )
    expect(motivoDeRecusa({ ...base, adulto: true })).toBe('conteúdo adulto')
  })

  it('a figura do verbete foi escolhida por um editor: só o enfeite da página sai', () => {
    const doVerbete: Candidata = { ...base, fonte: 'verbete', acervo: 'Wikimedia Commons' }
    expect(motivoDeRecusa({ ...doVerbete, titulo: 'Mapa do Brasil' })).toBeNull()
    expect(motivoDeRecusa({ ...doVerbete, marcas: ['Trademarks and logos of Wikimedia'] })).toBe('enfeite da página')
  })

  it('a régua da busca livre: o título inteiro é a palavra (com plural e número de série)', () => {
    expect(tituloEhOTermo('Cachorros 2', ['cachorro'])).toBe(true)
    expect(tituloEhOTermo('Apple.', ['apple'])).toBe(true)
    expect(tituloEhOTermo('running', ['running', 'run'])).toBe(true)
    expect(tituloEhOTermo('Piggy Bank', ['bank'])).toBe(false)
    expect(tituloEhOTermo('Praia do Cachorro', ['cachorro'])).toBe(false)
    expect(tituloEhOTermo('', ['cachorro'])).toBe(false)
  })

  it('tira a foto repetida, a série do mesmo autor, e corta em quatro', () => {
    const lista: Candidata[] = [
      { ...base, id: '1', url: 'https://a.test/thumb/960px-Dog.jpg', autor: 'Ana' },
      { ...base, id: '2', url: 'https://b.test/Dog.jpg?x=1', autor: 'Bia' },
      { ...base, id: '3', url: 'https://a.test/c1.jpg', titulo: 'Cachorros', autor: 'Caio' },
      { ...base, id: '4', url: 'https://a.test/c2.jpg', titulo: 'Cachorros 2', autor: 'Caio' },
      { ...base, id: '5', url: 'https://a.test/e.jpg', autor: 'Edu' },
      { ...base, id: '6', url: 'https://a.test/f.jpg', autor: 'Fê' },
      { ...base, id: '7', url: 'https://a.test/g.jpg', autor: 'Gil' },
    ]
    expect(escolherImagens(lista).map((i) => i.id)).toEqual(['1', '3', '5', '6'])
  })
})

describe('a busca, palavra por palavra (respostas gravadas em 10/10/2026)', () => {
  it('"concordado": o verbete manda ao lema, ninguém ilustrou "concordar" nem "agreed": NENHUMA imagem', async () => {
    const imagens = await buscar({ palavra: 'concordado', idioma: 'pt', traducao: 'Agreed', idiomaDaTraducao: 'en' })
    expect(imagens).toEqual([])
    expect(pedidos).toContain('secoes:en:concordar')
    expect(pedidos).toContain('secoes:en:agreed')
    expect(
      pedidos.filter((p) => p.startsWith('openverse:')),
      'a busca livre não decide sozinha',
    ).toEqual([])
  })

  it('"cachorro": as três figuras do verbete e uma da busca livre com o título exato', async () => {
    const imagens = await buscar({ palavra: 'cachorro', idioma: 'pt', traducao: 'dog', idiomaDaTraducao: 'en' })
    expect(imagens.map((i) => [i.fonte, i.titulo])).toEqual([
      ['verbete', 'Alopekis puppies'],
      ['verbete', 'Bernese Dog 10m.'],
      ['verbete', 'Lempzours église modillon nord-est'],
      ['busca', 'Cachorros 2'],
    ])
    // Cada uma com o que a atribuição precisa.
    expect(imagens[1]).toMatchObject({
      acervo: 'Wikimedia Commons',
      licenca: 'CC BY-SA 4.0',
      autor: 'AnetaAp',
      pagina: 'https://commons.wikimedia.org/wiki/File:Bernese_Dog_10m..jpg',
    })
    expect(imagens[3]).toMatchObject({ acervo: 'Flickr', licenca: 'CC BY-NC 2.0', autor: 'monicatenerife' })
    expect(imagens.every((i) => i.url.startsWith('https://'))).toBe(true)
    expect(pedidos.filter((p) => p.startsWith('openverse:'))).toEqual(['openverse:cachorro'])
  })

  it('"banco": o banco de sentar do verbete, e a busca livre completa só com título "Banco"', async () => {
    const imagens = await buscar({ palavra: 'banco', idioma: 'pt', traducao: 'bank', idiomaDaTraducao: 'en' })
    expect(imagens[0]).toMatchObject({
      fonte: 'verbete',
      titulo: 'A Welcome Seat in Horton in Ribblesdale - geograph.org.uk - 430407',
    })
    expect(imagens.slice(1).map((i) => [i.fonte, i.titulo])).toEqual([
      ['busca', 'Banco'],
      ['busca', 'Banco'],
    ])
    // O anúncio, o infográfico e a captura de e-mail que a busca por "banco" traz ficaram de fora.
    expect(imagens).toHaveLength(3)
  })

  it('"running": o verbete não tem figura, o do lema "run" tem a corredora; o diagrama e a meia-calça saem', async () => {
    const imagens = await buscar({ palavra: 'running', idioma: 'en', traducao: 'correndo', idiomaDaTraducao: 'pt' })
    expect(imagens.map((i) => [i.fonte, i.titulo])).toEqual([
      ['verbete', 'Flickr cc runner wisconsin u'],
      ['busca', 'running'],
    ])
    expect(pedidos).toContain('secoes:en:run')
    expect(pedidos.filter((p) => p.startsWith('openverse:'))).toEqual(['openverse:run'])
  })

  it('"although": conjunção sem figura em verbete nenhum: NENHUMA imagem, e nenhuma busca livre', async () => {
    const imagens = await buscar({ palavra: 'although', idioma: 'en' })
    expect(imagens).toEqual([])
    expect(pedidos.filter((p) => p.startsWith('openverse:'))).toEqual([])
  })

  it('"Although" com a maiúscula do começo da frase: o verbete é "although", e a resposta é a mesma', async () => {
    expect(await buscar({ palavra: 'Although', idioma: 'en' })).toEqual([])
    expect(pedidos).toContain('secoes:en:Although')
    expect(pedidos).toContain('secoes:en:although')
  })

  it('"saudade": substantivo abstrato que ninguém ilustrou: NENHUMA imagem (a busca livre traria fotos avulsas)', async () => {
    expect(await buscar({ palavra: 'saudade', idioma: 'pt' })).toEqual([])
    expect(pedidos.filter((p) => p.startsWith('openverse:'))).toEqual([])
  })

  it('"apple" e "bank": as figuras do verbete vêm primeiro, na ordem dos sentidos', async () => {
    const apple = await buscar({ palavra: 'apple', idioma: 'en' })
    expect(apple.slice(0, 3).map((i) => i.titulo)).toEqual([
      'Red Apple',
      'Apple Blossom Time at Oak Glen, CA 3-16 (26094251756)',
      'Frans Floris - The Fall of Man - Google Art Project',
    ])
    expect(apple).toHaveLength(4)
    expect(apple[3].fonte).toBe('busca')

    const bank = await buscar({ palavra: 'bank', idioma: 'en' })
    expect(bank.map((i) => i.titulo)).toEqual([
      'Bank of England Building, London, UK - Diliff',
      'Perfume River Bank, as seen from Trường Tiền Bridge, 2019',
    ])
  })

  it('a mesma palavra aberta duas vezes não repete pedido', async () => {
    const { buscarImagensDaPalavra } = await import('../src/lib/imagens/imagensDaPalavra')
    const primeira = await buscarImagensDaPalavra({ palavra: 'bank', idioma: 'en' })
    const feitos = pedidos.length
    expect(await buscarImagensDaPalavra({ palavra: 'Bank', idioma: 'en-US' })).toBe(primeira)
    expect(pedidos).toHaveLength(feitos)
  })

  it('rede fora do ar: lista vazia, sem erro, e a próxima abertura tenta de novo', async () => {
    vi.stubGlobal('fetch', async () => {
      pedidos.push('falhou')
      throw new TypeError('Failed to fetch')
    })
    const { buscarImagensDaPalavra } = await import('../src/lib/imagens/imagensDaPalavra')
    expect(await buscarImagensDaPalavra({ palavra: 'bank', idioma: 'en' })).toEqual([])
    const feitos = pedidos.length
    expect(await buscarImagensDaPalavra({ palavra: 'bank', idioma: 'en' })).toEqual([])
    expect(pedidos.length).toBeGreaterThan(feitos)
  })
})
