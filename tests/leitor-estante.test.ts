/**
 * A ESTANTE DO LEITOR NO INDEXEDDB (L2): o arquivo da pessoa fica no aparelho (id pelo hash, nada vai à
 * rede), o livro do catálogo é baixado do NAVEGADOR (CORS, sem cookie) e guardado como domínio público, e as
 * anotações sincronizam — aparelho A grava, B recebe, B apaga e a lápide sobe; sem conta, nada sai.
 */
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AnotacaoDeLeitura, citacaoDe, novaAnotacao } from '../src/core/leitura/anotacao'
import { formatoDosBytes, idDoArquivo, idDoCatalogo, prepararLivro } from '../src/lib/livros/abrir'
import { anotacoesDoLivro } from '../src/lib/livros/anotacoesDoLivro'
import { esquecerConexaoDaEstante, estante } from '../src/lib/livros/armazem'

async function zerarEstante() {
  await esquecerConexaoDaEstante()
  await new Promise<void>((ok) => {
    const q = indexedDB.deleteDatabase('frasy-livros')
    q.onsuccess = q.onerror = q.onblocked = () => ok()
  })
}

describe('abrir e a estante (IndexedDB)', () => {
  beforeEach(zerarEstante)

  it('o formato vem da assinatura, não do nome', () => {
    expect(formatoDosBytes(new Uint8Array([0x50, 0x4b, 3, 4]), 'x.pdf')).toBe('epub')
    expect(formatoDosBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'x.epub')).toBe('pdf')
    expect(formatoDosBytes(new Uint8Array([1, 2, 3, 4]), 'notas.txt')).toBe('txt')
    expect(formatoDosBytes(new Uint8Array([1, 2, 3, 4]), 'x.mobi')).toBeNull()
  })

  it('o arquivo da pessoa fica no aparelho, com id pelo hash; o mesmo arquivo cai no mesmo livro', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const arquivo = new File(['Era uma vez.\n\nFim.'], 'conto.txt', { type: 'text/plain' })
    const id = await prepararLivro(arquivo, 10)
    expect(id).toMatch(/^arq:[0-9a-f]{32}$/)
    expect(id).toBe(await idDoArquivo(await arquivo.arrayBuffer()))
    expect(await prepararLivro(new File(['Era uma vez.\n\nFim.'], 'outro-nome.txt'), 20)).toBe(id)
    const l = await estante.livro(id)
    expect(l).toMatchObject({ titulo: 'conto', formato: 'txt', origem: 'usuario', adicionadoEm: 10 })
    expect(await l!.arquivo.text()).toBe('Era uma vez.\n\nFim.')
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('o livro do catálogo é baixado do navegador, sem cookie, e guardado como domínio público', async () => {
    const fetch = vi.fn(async () => new Response(new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const id = await prepararLivro({
      id: 'se:aesop',
      titulo: 'Fables',
      autores: [{ nome: 'Aesop' }],
      idioma: 'en',
      fonte: 'standard-ebooks',
      formatos: { epub: 'https://standardebooks.org/ebooks/aesop/fables/downloads/x.epub' },
      credito: 'Standard Ebooks',
    })
    expect(id).toBe(idDoCatalogo('se:aesop'))
    expect(fetch).toHaveBeenCalledWith(
      'https://standardebooks.org/ebooks/aesop/fables/downloads/x.epub',
      expect.objectContaining({ mode: 'cors', credentials: 'omit' }),
    )
    expect(await estante.livro(id)).toMatchObject({
      origem: 'catalogo',
      dominioPublico: true,
      autor: 'Aesop',
      formato: 'epub',
    })
    // De novo: já está no aparelho, não baixa outra vez.
    await prepararLivro({ id: 'se:aesop', titulo: 'Fables', fonte: 'standard-ebooks', formatos: { epub: 'x' } })
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('formato estranho e arquivo vazio são recusados com motivo', async () => {
    await expect(prepararLivro(new File([new Uint8Array([9, 9, 9, 9])], 'x.mobi'))).rejects.toMatchObject({
      code: 'formato',
    })
    await expect(prepararLivro(new File([], 'x.epub'))).rejects.toMatchObject({ code: 'vazio' })
  })
})

describe('sincronização das anotações (aparelho A grava, B recebe)', () => {
  beforeEach(zerarEstante)

  const anot = (id: string, agora: number, extra: Partial<Parameters<typeof novaAnotacao>[0]> = {}) =>
    novaAnotacao({
      id,
      livroId: 'arq:livro',
      tipo: 'grifo',
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      citacao: citacaoDe('abc def', 0, 3),
      agora,
      ...extra,
    })

  /** Um "servidor" em memória com a mesma regra da rota (última escrita vence). */
  function servidor() {
    const linhas = new Map<string, AnotacaoDeLeitura>()
    let relogio = 1_000
    return {
      linhas,
      deps: {
        pode: async () => true,
        enviar: async (lista: readonly AnotacaoDeLeitura[]) => {
          for (const a of lista) {
            const g = linhas.get(a.id)
            if (!g && a.apagadoEm != null) continue
            if (!g || Math.max(a.atualizadoEm, a.apagadoEm ?? 0) > Math.max(g.atualizadoEm, g.apagadoEm ?? 0))
              linhas.set(a.id, a)
          }
          return {
            ok: true as const,
            gravadas: lista.map((a) => linhas.get(a.id)!).filter(Boolean),
            recusadas: [],
            ignoradas: [],
          }
        },
        ler: async (_livro: string, desde?: number) => ({
          ok: true as const,
          anotacoes: [...linhas.values()].filter(
            (a) => desde == null || Math.max(a.atualizadoEm, a.apagadoEm ?? 0) > desde - 10_000,
          ),
          agora: (relogio += 1),
        }),
      },
    }
  }

  it('sem conta fica só no aparelho, e nada sai', async () => {
    const enviar = vi.fn()
    const r = anotacoesDoLivro('arq:livro', { pode: async () => false, enviar, ler: vi.fn() })
    await r.gravar(anot('anotacao-a1', 5))
    expect(await r.sincronizar()).toEqual({ estado: 'so-aparelho', recusadas: 0 })
    expect(enviar).not.toHaveBeenCalled()
    expect(await r.vivas()).toHaveLength(1)
  })

  it('A grava e sobe; B (outro aparelho, estante vazia) recebe; B apaga e A vê a lápide', async () => {
    const srv = servidor()
    const a = anotacoesDoLivro('arq:livro', srv.deps)
    await a.gravar(anot('anotacao-a2', 5, { nota: 'de A' }))
    expect((await a.sincronizar()).estado).toBe('sincronizada')
    expect(srv.linhas.get('anotacao-a2')?.nota).toBe('de A')
    // "Aparelho B": outro IndexedDB.
    await zerarEstante()
    const b = anotacoesDoLivro('arq:livro', srv.deps)
    await b.sincronizar()
    expect((await b.vivas()).map((x) => x.nota)).toEqual(['de A'])
    await b.apagar('anotacao-a2', 99)
    await b.sincronizar()
    expect(srv.linhas.get('anotacao-a2')?.apagadoEm).toBe(99)
    expect(await b.vivas()).toHaveLength(0)
  })

  it('reancorar no aparelho não "edita": não sobe, e a lápide de outro aparelho vence (o bug do F5)', async () => {
    const srv = servidor()
    const a = anotacoesDoLivro('arq:livro', srv.deps)
    await a.gravar(anot('anotacao-a4', 5))
    await a.sincronizar()
    // Outro aparelho apaga no servidor.
    srv.linhas.set('anotacao-a4', { ...srv.linhas.get('anotacao-a4')!, apagadoEm: 50 })
    // Este aparelho abre o livro e recalcula o CFI (dado derivado).
    await a.reancorar('anotacao-a4', 'epubcfi(/6/4!/4/2/1:1)')
    const local = (await estante.anotacoes('arq:livro')).find((x) => x.id === 'anotacao-a4')!
    expect(local).toMatchObject({ pendente: 0, atualizadoEm: 5, alvo: { cfi: 'epubcfi(/6/4!/4/2/1:1)' } })
    await a.sincronizar()
    expect(srv.linhas.get('anotacao-a4')?.apagadoEm).toBe(50)
    expect(await a.vivas()).toHaveLength(0)
  })

  it('falha de rede: continua pendente e no aparelho', async () => {
    const r = anotacoesDoLivro('arq:livro', {
      pode: async () => true,
      enviar: async () => ({ ok: false as const, status: 0, error: 'sem rede' }),
      ler: vi.fn(),
    })
    await r.gravar(anot('anotacao-a3', 5))
    expect((await r.sincronizar()).estado).toBe('erro')
    expect((await estante.pendentes()).map((x) => x.id)).toEqual(['anotacao-a3'])
  })
})
