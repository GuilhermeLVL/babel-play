/**
 * O cliente do AnkiConnect (`src/lib/anki/ankiConnect.ts`) com `fetch` simulado: sucesso, Anki fechado,
 * origem não liberada (CORS), permissão negada, versão antiga, duplicatas, lotes e o escape do HTML.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mapeamentoPadrao } from '../src/core/anki/paraAnkiConnect'
import {
  ANKI_CONNECT_URL,
  enviarCartoes,
  ErroDoAnkiConnect,
  linhaDeConfiguracao,
  listarBaralhos,
  TAMANHO_DO_LOTE,
  testarConexao,
} from '../src/lib/anki/ankiConnect'

type Corpo = { action: string; version: number; params?: Record<string, unknown> }
type Rota = (corpo: Corpo) => unknown

const resposta = (result: unknown, error: unknown = null) =>
  new Response(JSON.stringify({ result, error }), { status: 200 })

/** Simula o AnkiConnect: `rotas` por ação; chamadas guardadas em `chamadas`. */
function anki(rotas: Record<string, Rota>) {
  const chamadas: Corpo[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe(ANKI_CONNECT_URL)
    const corpo = JSON.parse(String(init?.body)) as Corpo
    chamadas.push(corpo)
    const rota = rotas[corpo.action]
    if (!rota) throw new Error(`ação sem rota: ${corpo.action}`)
    const r = rota(corpo)
    return r instanceof Response ? r : resposta(r)
  })
  vi.stubGlobal('fetch', fn)
  return { chamadas, fn }
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://app.frasy.test' })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('testarConexao', () => {
  it('pede permissão, depois a versão, e devolve a versão', async () => {
    const { chamadas } = anki({
      requestPermission: () => ({ permission: 'granted', requireApiKey: false, version: 6 }),
      version: () => 6,
    })
    await expect(testarConexao()).resolves.toEqual({ versao: 6 })
    expect(chamadas.map((c) => c.action)).toEqual(['requestPermission', 'version'])
    expect(chamadas.every((c) => c.version === 6)).toBe(true)
  })

  it('manda o corpo como texto simples, sem Content-Type JSON (sem preflight) e sem cookies', async () => {
    const { fn } = anki({
      requestPermission: () => ({ permission: 'granted', version: 6 }),
      version: () => 6,
    })
    await testarConexao()
    const init = fn.mock.calls[0]![1] as RequestInit
    expect(init.headers).toBeUndefined()
    expect(init.credentials).toBe('omit')
    expect(init.method).toBe('POST')
  })

  it('Anki fechado: o fetch falha e a sonda no-cors também => anki-fechado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const e = (await testarConexao().catch((x: unknown) => x)) as ErroDoAnkiConnect
    expect(e).toBeInstanceOf(ErroDoAnkiConnect)
    expect(e.motivo).toBe('anki-fechado')
    expect(e.message).toMatch(/Anki/)
  })

  it('CORS: o fetch falha mas a sonda no-cors responde => origem-nao-liberada, com a linha exata do config', async () => {
    const fn = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.mode === 'no-cors') return new Response(null)
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fn)
    const e = (await testarConexao().catch((x: unknown) => x)) as ErroDoAnkiConnect
    expect(e.motivo).toBe('origem-nao-liberada')
    const linha = '"webCorsOriginList": ["http://localhost", "https://app.frasy.test"]'
    expect(linhaDeConfiguracao()).toBe(linha)
    expect(e.message).toContain(linha)
  })

  it('permissão negada pelo usuário', async () => {
    anki({ requestPermission: () => ({ permission: 'denied' }) })
    await expect(testarConexao()).rejects.toMatchObject({ motivo: 'permissao-negada' })
  })

  it('chave de API obrigatória', async () => {
    anki({ requestPermission: () => ({ permission: 'granted', requireApiKey: true, version: 6 }) })
    await expect(testarConexao()).rejects.toMatchObject({ motivo: 'chave-obrigatoria' })
  })

  it('versão antiga', async () => {
    anki({ requestPermission: () => ({ permission: 'granted', version: 5 }), version: () => 5 })
    await expect(testarConexao()).rejects.toMatchObject({ motivo: 'versao-antiga' })
  })

  it('resposta que não é do AnkiConnect', async () => {
    anki({ requestPermission: () => new Response('<html>', { status: 200 }) })
    await expect(testarConexao()).rejects.toMatchObject({ motivo: 'resposta-invalida' })
  })

  it('tempo esgotado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timeout', 'TimeoutError')
      }),
    )
    await expect(testarConexao()).rejects.toMatchObject({ motivo: 'tempo-esgotado' })
  })
})

describe('ações simples', () => {
  it('deckNames vem ordenado; o erro do Anki vira erro-do-anki com o texto dele', async () => {
    anki({ deckName: () => null, deckNames: () => ['Z', 'a', 'B'] })
    await expect(listarBaralhos()).resolves.toEqual(['a', 'B', 'Z'])
    anki({ deckNames: () => resposta(null, 'collection is not available') })
    await expect(listarBaralhos()).rejects.toMatchObject({
      motivo: 'erro-do-anki',
      detalhe: 'collection is not available',
    })
  })
})

describe('enviarCartoes', () => {
  const alvo = { baralho: 'Frasy', modelo: 'Basic', mapeamento: mapeamentoPadrao(['Front', 'Back']) }
  const cartao = (n: number) => ({ palavra: `w${n}`, traducao: `t${n}`, frase: `I say w${n} here`, etiquetas: ['B1'] })

  it('cria o baralho, monta as notas (duplicatas fora) e resume', async () => {
    const { chamadas } = anki({
      createDeck: () => 1,
      canAddNotes: ({ params }) => (params!.notes as unknown[]).map((_n, i) => i !== 1),
      addNotes: ({ params }) => (params!.notes as unknown[]).map((_n, i) => (i === 0 ? null : 100 + i)),
    })
    const progresso: number[] = []
    const r = await enviarCartoes([cartao(1), cartao(2), cartao(3), cartao(4)], alvo, {
      aoProgredir: (feitos) => progresso.push(feitos),
    })
    // 4 notas: 1 duplicada (canAddNotes), das 3 novas 1 recusada (null) e 2 entram
    expect(r).toEqual({ adicionados: 2, duplicados: 1, erros: 1 })
    expect(progresso).toEqual([4])
    expect(chamadas.map((c) => c.action)).toEqual(['createDeck', 'canAddNotes', 'addNotes'])
    const nota = (chamadas[2]!.params!.notes as Array<Record<string, unknown>>)[0]!
    expect(nota).toMatchObject({
      deckName: 'Frasy',
      modelName: 'Basic',
      tags: ['B1', 'frasy'],
      options: { allowDuplicate: false, duplicateScope: 'deck' },
    })
    expect(nota.fields).toEqual({
      Front: 'w1',
      Back: 't1<br><br><i>I say <b>w1</b> here</i>',
    })
  })

  it('manda em lotes de 50 e reporta o progresso a cada lote', async () => {
    const { chamadas } = anki({
      createDeck: () => 1,
      canAddNotes: ({ params }) => (params!.notes as unknown[]).map(() => true),
      addNotes: ({ params }) => (params!.notes as unknown[]).map((_n, i) => i + 1),
    })
    const progresso: Array<[number, number]> = []
    const todos = Array.from({ length: TAMANHO_DO_LOTE + 5 }, (_x, i) => cartao(i))
    const r = await enviarCartoes(todos, alvo, { aoProgredir: (f, t) => progresso.push([f, t]) })
    expect(r.adicionados).toBe(TAMANHO_DO_LOTE + 5)
    expect(progresso).toEqual([
      [TAMANHO_DO_LOTE, TAMANHO_DO_LOTE + 5],
      [TAMANHO_DO_LOTE + 5, TAMANHO_DO_LOTE + 5],
    ])
    expect(chamadas.filter((c) => c.action === 'addNotes')).toHaveLength(2)
  })

  it('escapa o HTML da pessoa: <script> e & viram texto', async () => {
    const { chamadas } = anki({
      createDeck: () => 1,
      canAddNotes: () => [true],
      addNotes: () => [1],
    })
    await enviarCartoes([{ palavra: 'a<b', traducao: '<img src=x onerror=alert(1)> & co', frase: 'x a<b y' }], alvo)
    const campos = (chamadas[2]!.params!.notes as Array<{ fields: Record<string, string> }>)[0]!.fields
    expect(campos.Front).toBe('a&lt;b')
    expect(campos.Back).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; co<br><br><i>x <b>a&lt;b</b> y</i>')
    expect(JSON.stringify(campos)).not.toMatch(/<img|<script/)
  })

  it('sem palavra não vira nota e conta como erro, sem chamar o Anki para ela', async () => {
    const { chamadas } = anki({ createDeck: () => 1 })
    const r = await enviarCartoes([{ palavra: '  ', traducao: 'x' }], alvo)
    expect(r).toEqual({ adicionados: 0, duplicados: 0, erros: 1 })
    expect(chamadas.map((c) => c.action)).toEqual(['createDeck'])
  })

  it('o Anki cai no meio: relança o erro tipado', async () => {
    const { fn } = anki({ createDeck: () => 1, canAddNotes: () => [true], addNotes: () => [1] })
    fn.mockImplementationOnce(async () => resposta(1)).mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(enviarCartoes([cartao(1)], alvo)).rejects.toMatchObject({ motivo: 'anki-fechado' })
  })

  it('recusa nome de baralho/modelo vazio ou com controle, e excesso de cartões', async () => {
    anki({})
    await expect(enviarCartoes([cartao(1)], { ...alvo, baralho: ' ' })).rejects.toMatchObject({
      motivo: 'entrada-invalida',
    })
    await expect(enviarCartoes([cartao(1)], { ...alvo, modelo: 'a\nb' })).rejects.toMatchObject({
      motivo: 'entrada-invalida',
    })
    await expect(
      enviarCartoes(
        Array.from({ length: 5001 }, (_x, i) => cartao(i)),
        alvo,
      ),
    ).rejects.toMatchObject({ motivo: 'entrada-invalida' })
  })

  it('o sinal de cancelamento para entre lotes', async () => {
    const ctl = new AbortController()
    anki({
      createDeck: () => 1,
      canAddNotes: ({ params }) => (params!.notes as unknown[]).map(() => true),
      addNotes: ({ params }) => {
        ctl.abort()
        return (params!.notes as unknown[]).map((_n, i) => i + 1)
      },
    })
    const todos = Array.from({ length: TAMANHO_DO_LOTE * 2 }, (_x, i) => cartao(i))
    const r = await enviarCartoes(todos, alvo, { sinal: ctl.signal })
    expect(r.adicionados).toBe(TAMANHO_DO_LOTE)
  })
})
