// @vitest-environment jsdom
/**
 * O livro da Wikisource (L1) no leitor (L2): os capítulos vêm da API pelo navegador e vão à estante como
 * texto em capítulos, com os títulos. jsdom: a limpeza do HTML da Wikisource usa o `DOMParser`.
 */
import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'

import { estante } from '../src/lib/livros/armazem'
import { lerCapitulosGuardados } from '../src/lib/livros/capitulosGuardados'
import { prepararDoCatalogo } from '../src/lib/livros/doCatalogo'

const livroDoCatalogo = (o: Record<string, unknown>) =>
  ({
    titulo: 'Contos',
    autores: [{ nome: 'Machado de Assis', anoMorte: 1908, idiomas: ['pt'] }],
    tradutores: [],
    idioma: 'pt',
    fonteId: 'x',
    categorias: [],
    classificacao: 'livre',
    nivel: 'B1',
    palavras: 1000,
    minutosEstimados: 5,
    popularidade: 0,
    downloads: 0,
    credito: 'Wikisource',
    licenca: 'Domínio público',
    ...o,
  }) as unknown as Parameters<typeof prepararDoCatalogo>[0]

describe('Wikisource no leitor', () => {
  it('Wikisource: os capítulos pela API viram texto em capítulos, com os títulos', async () => {
    const paginas: Record<string, string> = {
      Contos: '<p><a href="/wiki/Contos/Um">Um</a> <a href="/wiki/Contos/Dois">Dois</a></p>',
      'Contos/Um': '<p>Primeiro parágrafo.</p><p>Segundo.</p>',
      'Contos/Dois': '<p>Outro conto.</p>',
    }
    const fetch = vi.fn(async (u: string) => {
      const page = new URL(u).searchParams.get('page') ?? ''
      return new Response(JSON.stringify({ parse: { title: page, text: paginas[page] } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    const id = await prepararDoCatalogo(
      livroDoCatalogo({
        id: 'ws-contos',
        fonte: 'wikisource',
        formatos: { wikisource: { api: 'https://pt.wikisource.org/w/api.php', pagina: 'Contos' } },
      }),
      (i) => `Parte ${i + 1}`,
    )
    const guardado = await estante.livro(id)
    expect(guardado).toMatchObject({ formato: 'txt', origem: 'catalogo', dominioPublico: true })
    expect(await lerCapitulosGuardados(guardado!.arquivo)).toEqual([
      { titulo: 'Um', paragrafos: ['Primeiro parágrafo.', 'Segundo.'] },
      { titulo: 'Dois', paragrafos: ['Outro conto.'] },
    ])
    vi.unstubAllGlobals()
  })
})
