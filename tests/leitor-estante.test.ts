/**
 * A ESTANTE DO LEITOR NO INDEXEDDB (L2): o arquivo da pessoa fica no aparelho (id pelo hash, nada vai à
 * rede), o livro do catálogo é baixado do NAVEGADOR (CORS, sem cookie) e guardado como domínio público, e as
 * anotações sincronizam — aparelho A grava, B recebe, B apaga e a lápide sobe; sem conta, nada sai.
 */
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type AnotacaoDeLeitura, citacaoDe, novaAnotacao } from '../src/core/leitura/anotacao'
import { formatoDosBytes, idDoArquivo, idDoCatalogo, prepararLivro } from '../src/lib/livros/abrir'
import { anotacoesDoLivro, lotesPorBytes, MAX_BYTES_DO_LOTE } from '../src/lib/livros/anotacoesDoLivro'
import { consumirRemovidosDaEstante, esquecerConexaoDaEstante, estante } from '../src/lib/livros/armazem'
import { lerCapitulosGuardados } from '../src/lib/livros/capitulosGuardados'
import { prepararDoCatalogo, prepararMeuLivro } from '../src/lib/livros/doCatalogo'
import { livroParaOMotor } from '../src/lib/livros/fontesDoLivro'
import { guardarConteudo, guardarMeuLivro, type MeuLivro, removerMeuLivro } from '../src/lib/livros/meusLivros'
import { posicoes } from '../src/lib/livros/posicoesDoAparelho'

async function zerarEstante() {
  await esquecerConexaoDaEstante()
  await new Promise<void>((ok) => {
    const q = indexedDB.deleteDatabase('frasy-leitor')
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

describe('o livro da L1 (catálogo e "Meus livros") na estante do leitor', () => {
  beforeEach(zerarEstante)

  it('Standard Ebooks: o EPUB vem da fonte com ?source=download, como domínio público', async () => {
    const fetch = vi.fn(async () => new Response(new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const id = await prepararDoCatalogo(
      livroDoCatalogo({
        id: 'se-x',
        fonte: 'standard-ebooks',
        formatos: { epub: 'https://standardebooks.org/x.epub' },
      }),
      (i) => `Parte ${i + 1}`,
    )
    expect(fetch).toHaveBeenCalledWith('https://standardebooks.org/x.epub?source=download', expect.anything())
    expect(await estante.livro(id)).toMatchObject({ origem: 'catalogo', dominioPublico: true, formato: 'epub' })
    vi.unstubAllGlobals()
  })

  it('"Meus livros": o EPUB que a L1 guardou abre no leitor; os dois bancos convivem (sem VersionError)', async () => {
    const meu: MeuLivro = {
      id: 'meu-abc123',
      titulo: 'Meu Livro',
      origem: 'arquivo',
      formato: 'epub',
      adicionadoEm: 5,
      status: 'lendo',
      etiquetas: [],
      progresso: null,
    }
    expect(
      await guardarConteudo({
        id: meu.id,
        arquivo: new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]),
        capitulos: [{ titulo: 'Um', texto: 'Texto.' }],
      }),
    ).toMatchObject({ guardado: true })
    /* No disco da L1 o arquivo vai como bytes, e não como Blob (o Safari recusa Blob no IndexedDB). */
    const cru = await new Promise<Record<string, unknown>>((ok, falha) => {
      const q = indexedDB.open('frasy-livros')
      q.onerror = () => falha(q.error)
      q.onsuccess = () => {
        const g = q.result.transaction('conteudo').objectStore('conteudo').get(meu.id)
        g.onsuccess = () => {
          q.result.close()
          ok(g.result as Record<string, unknown>)
        }
      }
    })
    expect(cru.arquivo).toBeUndefined()
    expect(cru.bytes).toBeInstanceOf(ArrayBuffer)
    expect(await prepararMeuLivro(meu)).toBe(meu.id)
    expect(await estante.livro(meu.id)).toMatchObject({ origem: 'usuario', formato: 'epub', titulo: 'Meu Livro' })
    /* O arquivo fica UMA vez: na estante do leitor só a referência a "Meus livros" (nenhum byte copiado). */
    const ref = await estante.livro(meu.id)
    expect(ref?.refMeuLivro).toBe(meu.id)
    expect(ref?.arquivo.size).toBe(0)
    const motor = await livroParaOMotor(meu.id, 'Parte')
    expect(motor?.entrada).toBeInstanceOf(File)
    expect((motor!.entrada as File).size).toBe(6)
    expect((await estante.livro(meu.id))?.dominioPublico).toBeUndefined()
    // Sem conteúdo no aparelho: null (a tela pede o arquivo de novo).
    expect(await prepararMeuLivro({ ...meu, id: 'meu-sumiu' })).toBeNull()
  })

  it('os capítulos guardados que não conferem são ignorados (o leitor lê como texto corrido)', async () => {
    const tipo = 'application/x-frasy-capitulos+json'
    expect(await lerCapitulosGuardados(new Blob(['[{"titulo":1}]'], { type: tipo }))).toBeNull()
    expect(await lerCapitulosGuardados(new Blob(['nao é json'], { type: tipo }))).toBeNull()
    expect(await lerCapitulosGuardados(new Blob(['[]'], { type: 'text/plain' }))).toBeNull()
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

  /**
   * Um "servidor" em memória com a MESMA regra da rota: última escrita vence pelo relógio do aparelho, e toda
   * escrita que muda a linha ganha o relógio do SERVIDOR (`s`, crescente); a leitura devolve as páginas em ordem
   * `(s, id)` depois do cursor, com `temMais`. `maxBytes`: o corpo acima disso responde 413, como o parser.
   */
  function servidor(opcoes: { pagina?: number; maxBytes?: number } = {}) {
    const linhas = new Map<string, AnotacaoDeLeitura & { s: number }>()
    let relogio = 1_000
    const pagina = opcoes.pagina ?? 2_000
    const pedidos: Array<{ n: number; bytes: number }> = []
    const escrever = (a: AnotacaoDeLeitura) => linhas.set(a.id, { ...a, s: ++relogio })
    const ordem = (x: { s: number; id: string }, y: { s: number; id: string }) =>
      x.s - y.s || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    return {
      linhas,
      pedidos,
      /** Uma escrita de outro aparelho direto no servidor (ganha relógio do servidor). */
      escrever,
      deps: {
        pode: async () => true,
        idRemoto: async (id: string) => id.replace(/^arq:/, 'arq:h-'),
        enviar: async (lista: readonly AnotacaoDeLeitura[]) => {
          const tamanho = new TextEncoder().encode(JSON.stringify({ anotacoes: lista })).length
          pedidos.push({ n: lista.length, bytes: tamanho })
          if (opcoes.maxBytes && tamanho > opcoes.maxBytes) {
            return { ok: false as const, status: 413, error: 'grande demais' }
          }
          for (const a of lista) {
            const g = linhas.get(a.id)
            if (!g && a.apagadoEm != null) continue
            if (!g || Math.max(a.atualizadoEm, a.apagadoEm ?? 0) > Math.max(g.atualizadoEm, g.apagadoEm ?? 0))
              escrever(a)
          }
          return {
            ok: true as const,
            gravadas: lista.map((a) => linhas.get(a.id)!).filter(Boolean),
            recusadas: [],
            ignoradas: [],
          }
        },
        ler: async (livro: string, cursor?: string) => {
          const [cs, cid] = cursor ? [Number(cursor.split(':')[0]), cursor.slice(cursor.indexOf(':') + 1)] : [0, '']
          const depois = [...linhas.values()]
            .filter((a) => a.livroId === livro && ordem(a, { s: cs, id: cid }) > 0)
            .sort(ordem)
          const pag = depois.slice(0, pagina)
          const ultima = pag.at(-1)
          return {
            ok: true as const,
            anotacoes: pag.map(({ s: _s, ...a }) => a),
            cursor: ultima ? `${ultima.s}:${ultima.id}` : (cursor ?? null),
            temMais: depois.length > pagina,
          }
        },
      },
    }
  }

  it('sem conta fica só no aparelho, e nada sai', async () => {
    const enviar = vi.fn()
    const r = anotacoesDoLivro('arq:livro', { pode: async () => false, enviar, ler: vi.fn(), idRemoto: vi.fn() })
    await r.gravar(anot('anotacao-a1', 5))
    expect(await r.sincronizar()).toEqual({ estado: 'so-aparelho', recusadas: 0, grandes: 0 })
    expect(enviar).not.toHaveBeenCalled()
    expect(await r.vivas()).toHaveLength(1)
  })

  it('A grava e sobe; B (outro aparelho, estante vazia) recebe; B apaga e A vê a lápide', async () => {
    const srv = servidor()
    const a = anotacoesDoLivro('arq:livro', srv.deps)
    await a.gravar(anot('anotacao-a2', 5, { nota: 'de A' }))
    expect((await a.sincronizar()).estado).toBe('sincronizada')
    expect(srv.linhas.get('anotacao-a2')?.nota).toBe('de A')
    // O servidor vê o id do HMAC, nunca o hash do arquivo.
    expect(srv.linhas.get('anotacao-a2')?.livroId).toBe('arq:h-livro')
    // "Aparelho B": outro IndexedDB.
    await zerarEstante()
    const b = anotacoesDoLivro('arq:livro', srv.deps)
    await b.sincronizar()
    expect((await b.vivas()).map((x) => [x.nota, x.livroId])).toEqual([['de A', 'arq:livro']])
    await b.apagar('anotacao-a2', 99)
    await b.sincronizar()
    expect(srv.linhas.get('anotacao-a2')?.apagadoEm).toBe(99)
    expect(await b.vivas()).toHaveLength(0)
  })

  it('A escreve SEM REDE com data antiga e sobe depois de B sincronizar: B recebe (cursor do servidor)', async () => {
    const srv = servidor()
    // B já sincronizou uma vez (o cursor de B está no relógio do servidor de agora).
    srv.escrever({ ...anot('anotacao-b0', 500), livroId: 'arq:h-livro' })
    const b = anotacoesDoLivro('arq:livro', srv.deps)
    await b.sincronizar()
    expect((await b.vivas()).map((x) => x.id)).toEqual(['anotacao-b0'])
    // A grava offline com o relógio do aparelho ATRASADO (ou só antigo: horas antes do sync de B).
    const estanteDeB = await estante.anotacoes('arq:livro')
    await zerarEstante()
    const a = anotacoesDoLivro('arq:livro', srv.deps)
    await a.gravar(anot('anotacao-a-offline', 1, { nota: 'feita sem rede' }))
    await a.sincronizar()
    // B de novo (a estante de B volta como estava).
    await zerarEstante()
    await estante.gravarAnotacoes(estanteDeB)
    await estante.gravarMarca('cursor:arq:livro', `${srv.linhas.get('anotacao-b0')!.s}:anotacao-b0`)
    await b.sincronizar()
    expect((await b.vivas()).map((x) => x.nota).sort()).toEqual(['', 'feita sem rede'])
  })

  it('mais de 2000 anotações: lê página a página e só guarda o cursor no fim', async () => {
    const srv = servidor({ pagina: 2_000 })
    for (let i = 0; i < 2_150; i++) {
      srv.escrever({ ...anot(`anotacao-p${String(i).padStart(5, '0')}`, 10 + i), livroId: 'arq:h-livro' })
    }
    const lidas: Array<string | undefined> = []
    const ler = srv.deps.ler
    const b = anotacoesDoLivro('arq:livro', {
      ...srv.deps,
      ler: async (l, c) => {
        lidas.push(c)
        // Enquanto há página por ler, nenhum cursor foi guardado ainda.
        if (lidas.length > 1) expect(await estante.marca('cursor:arq:livro')).toBeUndefined()
        return ler(l, c)
      },
    })
    expect((await b.sincronizar()).estado).toBe('sincronizada')
    expect(await b.vivas()).toHaveLength(2_150)
    expect(lidas).toHaveLength(2)
    expect(lidas[0]).toBeUndefined()
    const ultima = [...srv.linhas.values()].sort((x, y) => x.s - y.s).at(-1)!
    expect(await estante.marca('cursor:arq:livro')).toBe(`${ultima.s}:${ultima.id}`)
  })

  it('lotes por bytes abaixo de 90 KB; 413 parte o lote; uma anotação grande demais sai da fila com aviso', async () => {
    // Lotes: 200 anotações de nota longa passam de 90 KB e viram mais de um pedido, cada um abaixo do teto.
    const longas = Array.from({ length: 200 }, (_, i) =>
      anot(`anotacao-l${String(i).padStart(4, '0')}`, 5, { nota: 'x'.repeat(1_000) }),
    )
    const lotes = lotesPorBytes(longas)
    expect(lotes.length).toBeGreaterThan(1)
    for (const l of lotes) {
      expect(new TextEncoder().encode(JSON.stringify({ anotacoes: l })).length).toBeLessThanOrEqual(MAX_BYTES_DO_LOTE)
    }
    expect(lotes.flat()).toHaveLength(200)

    // O servidor recusa (413) acima de 3 KB: o lote de 3 é partido até caber; a de 5 KB, sozinha, sai da fila.
    const srv = servidor({ maxBytes: 3_000 })
    const r = anotacoesDoLivro('arq:livro', { ...srv.deps, maxBytes: 50_000 })
    await r.gravar(anot('anotacao-c1', 5, { nota: 'a'.repeat(900) }))
    await r.gravar(anot('anotacao-c2', 5, { nota: 'b'.repeat(900) }))
    await r.gravar(anot('anotacao-c3', 5, { nota: 'c'.repeat(3_500) }))
    const res = await r.sincronizar()
    expect(res).toMatchObject({ estado: 'sincronizada', grandes: 1 })
    expect([...srv.linhas.keys()].sort()).toEqual(['anotacao-c1', 'anotacao-c2'])
    expect(srv.pedidos[0].n).toBe(3)
    expect(srv.pedidos.some((p) => p.n === 1)).toBe(true)
    // A grande continua no aparelho (só não sobe) e não trava a próxima sincronização.
    expect((await r.vivas()).map((x) => x.id)).toContain('anotacao-c3')
    expect(await estante.pendentes()).toEqual([])
  })

  it('o teto somado da citação de livro trazido: a escrita que passaria de 20 mil caracteres não grava', async () => {
    const r = anotacoesDoLivro('arq:livro', servidor().deps)
    const cit = (n: number) => citacaoDe('y'.repeat(n), 0, n)
    for (let i = 0; i < 40; i++) {
      expect(await r.gravar(anot(`anotacao-t${String(i).padStart(3, '0')}`, 5, { citacao: cit(500) }))).toBe(true)
    }
    expect(await r.gravar(anot('anotacao-t-extra', 5, { citacao: cit(1) }))).toBe(false)
    // Livro do catálogo: sem teto somado.
    const cat = anotacoesDoLivro('cat:x', servidor().deps)
    for (let i = 0; i < 41; i++) {
      expect(
        await cat.gravar({
          ...anot(`anotacao-u${String(i).padStart(3, '0')}`, 5, { citacao: cit(500) }),
          livroId: 'cat:x',
        }),
      ).toBe(true)
    }
  })

  it('reancorar no aparelho não "edita": não sobe, e a lápide de outro aparelho vence (o bug do F5)', async () => {
    const srv = servidor()
    const a = anotacoesDoLivro('arq:livro', srv.deps)
    await a.gravar(anot('anotacao-a4', 5))
    await a.sincronizar()
    // Outro aparelho apaga no servidor.
    srv.escrever({ ...srv.linhas.get('anotacao-a4')!, apagadoEm: 50 })
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
      idRemoto: async (id) => id,
      enviar: async () => ({ ok: false as const, status: 0, error: 'sem rede' }),
      ler: vi.fn(),
    })
    await r.gravar(anot('anotacao-a3', 5))
    expect((await r.sincronizar()).estado).toBe('erro')
    expect((await estante.pendentes()).map((x) => x.id)).toEqual(['anotacao-a3'])
  })

  it('livro trazido sem a chave (sem rede): não sincroniza e o hash não sai', async () => {
    const enviar = vi.fn()
    const r = anotacoesDoLivro('arq:livro', {
      pode: async () => true,
      idRemoto: async () => null,
      enviar,
      ler: vi.fn(),
    })
    await r.gravar(anot('anotacao-a5', 5))
    expect((await r.sincronizar()).estado).toBe('erro')
    expect(enviar).not.toHaveBeenCalled()
  })
})

describe('o teto da estante e a remoção em "Meus livros"', () => {
  beforeEach(zerarEstante)

  const livro = (livroId: string, abertoEm: number, n: number) => ({
    livroId,
    titulo: `Livro ${livroId}`,
    formato: 'epub' as const,
    origem: 'usuario' as const,
    arquivo: new Blob([new Uint8Array(n)]),
    nomeDoArquivo: `${livroId}.epub`,
    adicionadoEm: abertoEm,
    abertoEm,
  })

  it('passou do teto (livros ou bytes): sai o aberto há mais tempo, e a tela fica sabendo quais', async () => {
    const teto = { livros: 3, bytes: 1_000 }
    consumirRemovidosDaEstante()
    expect(await estante.guardarLivro(livro('arq:a', 1, 100), teto)).toEqual([])
    expect(await estante.guardarLivro(livro('arq:b', 2, 100), teto)).toEqual([])
    expect(await estante.guardarLivro(livro('arq:c', 3, 100), teto)).toEqual([])
    // O quarto livro: sai o mais antigo (a).
    expect(await estante.guardarLivro(livro('arq:d', 4, 100), teto)).toEqual(['Livro arq:a'])
    // Abrir o b o torna recente; um livro grande tira os mais antigos até caber nos bytes.
    await estante.marcarAberto('arq:b', 10)
    expect(await estante.guardarLivro(livro('arq:e', 11, 850), teto)).toEqual(['Livro arq:c', 'Livro arq:d'])
    expect((await estante.livros()).map((l) => l.livroId)).toEqual(['arq:e', 'arq:b'])
    expect(consumirRemovidosDaEstante()).toEqual(['Livro arq:a', 'Livro arq:c', 'Livro arq:d'])
    expect(consumirRemovidosDaEstante()).toEqual([])
  })

  it('remover de "Meus livros" apaga a cópia na estante do leitor e a posição deste aparelho', async () => {
    const disco = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => disco.get(k) ?? null,
      setItem: (k: string, v: string) => void disco.set(k, v),
      removeItem: (k: string) => void disco.delete(k),
    })
    vi.stubGlobal('window', { dispatchEvent: () => true })
    const meu: MeuLivro = {
      id: 'meu-remover1',
      titulo: 'Para remover',
      origem: 'arquivo',
      formato: 'epub',
      adicionadoEm: 5,
      status: 'lendo',
      etiquetas: [],
      progresso: null,
    }
    guardarMeuLivro(meu)
    await guardarConteudo({ id: meu.id, arquivo: new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]), capitulos: [] })
    await prepararMeuLivro(meu)
    posicoes.gravar({ livroId: meu.id, cfi: 'epubcfi(/6/4!/4/2/1:0)', secao: 1, fracao: 0.3, atualizadaEm: 1 })
    expect(await estante.livro(meu.id)).toBeTruthy()
    expect(posicoes.ler(meu.id)).toBeTruthy()
    await removerMeuLivro(meu.id)
    expect(await estante.livro(meu.id)).toBeUndefined()
    expect(posicoes.ler(meu.id)).toBeNull()
    vi.unstubAllGlobals()
  })
})
