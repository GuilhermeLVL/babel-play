/**
 * A orquestração da importação no navegador: lê o arquivo, ABRE o import, manda as notas em lotes
 * (por quantidade E por bytes, em sequência) e FECHA. `fetch`/`apiFetch` e o leitor são simulados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotaAnki } from '../src/core/anki'

vi.mock('../src/lib/anki/lerBaralho', () => ({ lerBaralhoNoNavegador: vi.fn() }))
vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(),
  IMPORT_TIMEOUT_MS: 600_000,
  lerErro: async (res: Response) => {
    const c = (await res.json().catch(() => ({}))) as { error?: string }
    return { status: res.status, error: c.error ?? `o servidor respondeu ${res.status}` }
  },
}))

import { apiFetch } from '../src/data/api'
import { BYTES_POR_LOTE, importarBaralhoAnki, LOTE, type ProgressoDaImportacao } from '../src/data/importarAnki'
import { lerBaralhoNoNavegador } from '../src/lib/anki/lerBaralho'

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>
const lerMock = lerBaralhoNoNavegador as unknown as ReturnType<typeof vi.fn>

function nota(i: number, tamanhoBruto = 0): NotaAnki {
  return {
    guid: `g${i}`,
    frente: `palavra ${i}`,
    verso: `traducao ${i}`,
    tags: [],
    campos: ['Front', 'Back'],
    camposBrutos: { Front: `palavra ${i}`, Back: 'x'.repeat(tamanhoBruto) },
  }
}

function leitura(notas: NotaAnki[]) {
  return {
    notas,
    formato: 'collection.anki21',
    campos: ['Front', 'Back'],
    descartadas: 0,
    temMidia: false,
    baralhos: ['Meu'],
  }
}

const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  ({ ok: status < 400, status, json: async () => corpo, headers: new Headers(cabecalhos) }) as unknown as Response

const lote = { novas: 0, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} }

/** Servidor falso: devolve a resposta certa por rota e guarda o corpo de cada chamada. */
function servidor(extra?: (url: string, n: number) => Response | undefined) {
  const chamadas: Array<{ url: string; corpo: any }> = []
  let nLotes = 0
  let enviadas = 0
  apiFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.endsWith('/notas')) {
      nLotes++
      const r = extra?.(url, nLotes)
      if (r) return r
      const n = chamadas[chamadas.length - 1].corpo.notas.length
      enviadas += n
      return json({ ...lote, novas: n })
    }
    if (url.endsWith('/fechar'))
      return json({
        importId: 'imp',
        deckId: 'deck',
        resumo: { ...lote, ativadas: 3, notas: enviadas, novas: enviadas },
      })
    return json({ importId: 'imp', deckId: 'deck', idiomaOrigem: 'en', avisoIdioma: 'aviso' })
  })
  return chamadas
}

const arquivo = new File(['x'], 'meu.apkg')

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('importarBaralhoAnki — orquestração', () => {
  it('1.200 notas: 1 abertura, lotes de 500/500/200 em sequência e 1 fechamento; progresso 500/1000/1200', async () => {
    lerMock.mockResolvedValue(leitura(Array.from({ length: 1200 }, (_, i) => nota(i))))
    const chamadas = servidor()
    const progresso: ProgressoDaImportacao[] = []

    const r = await importarBaralhoAnki(arquivo, 'en', 'pt', (p) => progresso.push(p))

    expect(chamadas.map((c) => c.url)).toEqual([
      '/api/anki/imports',
      '/api/anki/imports/imp/notas',
      '/api/anki/imports/imp/notas',
      '/api/anki/imports/imp/notas',
      '/api/anki/imports/imp/fechar',
    ])
    expect(chamadas.slice(1, 4).map((c) => c.corpo.notas.length)).toEqual([500, 500, 200])
    expect(LOTE).toBe(500)
    expect(progresso.filter((p) => p.etapa === 'enviando').map((p) => p.feitas)).toEqual([500, 1000, 1200])
    expect(progresso.at(-1)).toMatchObject({ etapa: 'concluindo' })
    // A abertura leva a amostra (200 primeiras) e o que o servidor precisa para conferir idioma.
    const abertura = chamadas[0].corpo
    expect(abertura).toMatchObject({
      arquivo: 'meu.apkg',
      bytes: arquivo.size,
      totalNoArquivo: 1200,
      truncado: false,
      idiomaOrigem: 'en',
      idiomaAlvo: 'pt',
    })
    expect(abertura.amostra).toHaveLength(200)
    // Contrato das telas.
    expect(r).toMatchObject({
      importId: 'imp',
      deckId: 'deck',
      avisoIdioma: 'aviso',
      formato: 'collection.anki21',
      totalNoArquivo: 1200,
    })
    expect(r.resumo).toMatchObject({ notas: 1200, novas: 1200, ativadas: 3 })
    expect(r.amostra).toHaveLength(4)
    expect(r).not.toHaveProperty('estruturaHash')
  })

  it('repassa o progresso da leitura como feitas/total', async () => {
    lerMock.mockImplementation(async (_a: File, aoProgredir: (p: unknown) => void) => {
      aoProgredir({ etapa: 'lendo', notas: 10, total: 40 })
      return leitura([nota(1)])
    })
    servidor()
    const progresso: ProgressoDaImportacao[] = []
    await importarBaralhoAnki(arquivo, 'en', 'pt', (p) => progresso.push(p))
    expect(progresso[0]).toEqual({ etapa: 'lendo', feitas: 10, total: 40 })
  })

  it('fatia também por BYTES: notas pesadas dão lotes bem menores que 500', async () => {
    lerMock.mockResolvedValue(leitura(Array.from({ length: 600 }, (_, i) => nota(i, 10_000))))
    const chamadas = servidor()
    await importarBaralhoAnki(arquivo, 'en', 'pt')
    const lotes = chamadas.filter((c) => c.url.endsWith('/notas'))
    expect(lotes.length).toBeGreaterThanOrEqual(2)
    for (const l of lotes) {
      expect(l.corpo.notas.length).toBeLessThan(500)
      expect(JSON.stringify(l.corpo.notas).length).toBeLessThanOrEqual(BYTES_POR_LOTE)
    }
    expect(lotes.reduce((s, l) => s + l.corpo.notas.length, 0)).toBe(600)
  })

  it('429 com Retry-After: espera e repete o MESMO lote uma vez', async () => {
    vi.useFakeTimers()
    lerMock.mockResolvedValue(leitura([nota(1), nota(2)]))
    const chamadas = servidor((_u, n) =>
      n === 1 ? json({ error: 'devagar' }, 429, { 'Retry-After': '1' }) : undefined,
    )
    const pronto = importarBaralhoAnki(arquivo, 'en', 'pt')
    await vi.advanceTimersByTimeAsync(1000)
    await pronto
    const lotes = chamadas.filter((c) => c.url.endsWith('/notas'))
    expect(lotes).toHaveLength(2)
    expect(lotes[1].corpo).toEqual(lotes[0].corpo)
    expect(chamadas.at(-1)!.url).toMatch(/fechar$/)
  })

  it('segundo 429 seguido lança, e não fecha o import', async () => {
    vi.useFakeTimers()
    lerMock.mockResolvedValue(leitura([nota(1)]))
    const chamadas = servidor(() => json({ error: 'devagar' }, 429, { 'Retry-After': '1' }))
    const pronto = importarBaralhoAnki(arquivo, 'en', 'pt')
    const falha = expect(pronto).rejects.toThrow('devagar')
    await vi.advanceTimersByTimeAsync(1000)
    await falha
    expect(chamadas.some((c) => c.url.endsWith('/fechar'))).toBe(false)
  })

  it('erro de lote lança a mensagem do servidor', async () => {
    lerMock.mockResolvedValue(leitura([nota(1)]))
    servidor(() => json({ error: 'este import já foi fechado', code: 'import_fechado' }, 409))
    await expect(importarBaralhoAnki(arquivo, 'en', 'pt')).rejects.toThrow('este import já foi fechado')
  })
})
