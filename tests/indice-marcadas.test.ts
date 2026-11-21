// @vitest-environment jsdom
/**
 * AS MARCADAS NO ÍNDICE DE ETIQUETAS (`src/lib/etiquetas/indiceDeEtiquetas.ts`): gravações concorrentes, a leitura em
 * voo e a troca de identidade.
 *
 *  - uma falha desfaz SÓ a chave que falhou, e não apaga as outras marcações feitas no meio-tempo;
 *  - na mesma chave, a última intenção vence (as do meio nem vão à rede);
 *  - a leitura inicial que chega depois de uma marcação não a apaga;
 *  - trocar de identidade (entrar/sair da conta sem recarregar) zera as marcadas e relê as da identidade nova.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  geracaoDeEscritas: vi.fn(() => 0),
  fetchDeck: vi.fn(async () => []),
  fetchSessions: vi.fn(async () => []),
  fetchPalavrasVistas: vi.fn(async () => null),
  fetchPalavrasMarcadas: vi.fn(),
  marcarPalavra: vi.fn(),
  desmarcarPalavra: vi.fn(),
}))
vi.mock('../src/data/api', () => api)

import {
  carregarMarcadas,
  desmarcarNoIndice,
  esquecerIndiceDeEtiquetas,
  lerSnapshotDasEtiquetas,
  marcarNoIndice,
} from '../src/lib/etiquetas/indiceDeEtiquetas'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

/** Uma promessa que o teste resolve quando quiser. */
function adiada<T>() {
  let resolver!: (v: T) => void
  const p = new Promise<T>((r) => (resolver = r))
  return { p, resolver }
}

const chaves = () =>
  lerSnapshotDasEtiquetas()
    .listaDeMarcadas.map((m) => `${m.lang}|${m.chave}:${m.estado}`)
    .sort()

beforeEach(() => {
  esquecerIndiceDeEtiquetas()
  _reiniciarIdentidade()
  vi.clearAllMocks()
  api.fetchPalavrasMarcadas.mockResolvedValue([])
})
afterEach(() => esquecerIndiceDeEtiquetas())

describe('gravações concorrentes', () => {
  it('a falha desfaz só a chave que falhou', async () => {
    const lenta = adiada<boolean>()
    api.marcarPalavra.mockImplementation((_l: string, chave: string) =>
      chave === 'hello' ? lenta.p : Promise.resolve(true),
    )
    const a = marcarNoIndice('hello', 'en', 'conhecida')
    await marcarNoIndice('world', 'en', 'ignorada')
    expect(chaves()).toEqual(['en|hello:conhecida', 'en|world:ignorada'])
    lenta.resolver(false)
    expect(await a).toBe(false)
    expect(chaves()).toEqual(['en|world:ignorada'])
  })

  it('na mesma chave, a última intenção vence e as do meio não vão à rede', async () => {
    const primeira = adiada<boolean>()
    api.marcarPalavra.mockImplementationOnce(() => primeira.p).mockResolvedValue(true)
    api.desmarcarPalavra.mockResolvedValue(true)
    const p1 = marcarNoIndice('hello', 'en', 'conhecida')
    await vi.waitFor(() => expect(api.marcarPalavra).toHaveBeenCalledTimes(1)) // a 1ª está na rede
    const p2 = marcarNoIndice('hello', 'en', 'ignorada')
    const p3 = desmarcarNoIndice('hello', 'en')
    const p4 = marcarNoIndice('hello', 'en', 'ignorada')
    primeira.resolver(true)
    expect(await Promise.all([p1, p2, p3, p4])).toEqual([true, true, true, true])
    // A 1ª já tinha saído; a 2ª e a 3ª foram superadas; só a 4ª foi enviada depois.
    expect(api.marcarPalavra).toHaveBeenCalledTimes(2)
    expect(api.desmarcarPalavra).not.toHaveBeenCalled()
    expect(chaves()).toEqual(['en|hello:ignorada'])
  })

  it('a falha de uma intenção superada não desfaz a mais nova', async () => {
    const primeira = adiada<boolean>()
    api.marcarPalavra.mockImplementationOnce(() => primeira.p).mockResolvedValue(true)
    const p1 = marcarNoIndice('hello', 'en', 'conhecida')
    await vi.waitFor(() => expect(api.marcarPalavra).toHaveBeenCalledTimes(1)) // a 1ª está na rede
    const p2 = marcarNoIndice('hello', 'en', 'ignorada')
    primeira.resolver(false)
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(chaves()).toEqual(['en|hello:ignorada'])
  })
})

describe('a leitura em voo', () => {
  it('não apaga a marcação feita antes de ela chegar', async () => {
    const leitura = adiada<unknown>()
    api.fetchPalavrasMarcadas.mockImplementation(() => leitura.p)
    api.marcarPalavra.mockResolvedValue(true)
    const carregando = carregarMarcadas()
    await marcarNoIndice('hello', 'en', 'conhecida')
    leitura.resolver([{ lang: 'es', chave: 'hola', estado: 'conhecida', atualizadoEm: 1 }])
    await carregando
    expect(chaves()).toEqual(['en|hello:conhecida', 'es|hola:conhecida'])
  })

  it('não traz de volta a desmarcada depois de ela começar', async () => {
    api.marcarPalavra.mockResolvedValue(true)
    api.desmarcarPalavra.mockResolvedValue(true)
    await marcarNoIndice('hello', 'en', 'conhecida')
    const leitura = adiada<unknown>()
    api.fetchPalavrasMarcadas.mockImplementation(() => leitura.p)
    const carregando = carregarMarcadas()
    await desmarcarNoIndice('hello', 'en')
    leitura.resolver([{ lang: 'en', chave: 'hello', estado: 'conhecida', atualizadoEm: 1 }])
    await carregando
    expect(chaves()).toEqual([])
  })
})

describe('troca de identidade', () => {
  it('zera as marcadas e relê as da identidade nova', async () => {
    definirIdentidade('anonimo')
    api.fetchPalavrasMarcadas.mockResolvedValueOnce([
      { lang: 'en', chave: 'anonima', estado: 'conhecida', atualizadoEm: 1 },
    ])
    // Alguém assina o índice (uma tela aberta): a primeira leitura acontece.
    const { useSnapshotDasEtiquetas } = await import('../src/lib/etiquetas/indiceDeEtiquetas')
    const { renderHook, waitFor } = await import('@testing-library/react')
    const h = renderHook(() => useSnapshotDasEtiquetas())
    await waitFor(() => expect(chaves()).toEqual(['en|anonima:conhecida']))

    api.fetchPalavrasMarcadas.mockResolvedValueOnce([
      { lang: 'en', chave: 'daconta', estado: 'ignorada', atualizadoEm: 2 },
    ])
    definirIdentidade('conta')
    expect(lerSnapshotDasEtiquetas().marcadas).toBeNull()
    await waitFor(() => expect(chaves()).toEqual(['en|daconta:ignorada']))
    h.unmount()
  })

  it('resposta de gravação da identidade anterior é descartada', async () => {
    definirIdentidade('anonimo')
    const lenta = adiada<boolean>()
    api.marcarPalavra.mockImplementation(() => lenta.p)
    const p = marcarNoIndice('hello', 'en', 'conhecida')
    definirIdentidade('conta')
    lenta.resolver(true)
    await p
    expect(chaves()).toEqual([])
  })
})
