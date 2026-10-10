// @vitest-environment jsdom
/**
 * O PEDAÇO DA TELA DESCE ANTES DE ELA SER PEDIDA (`src/lib/polimento/precarga.ts`; auditoria de desempenho
 * de 10/10/2026, G6): uma vez por tela, no toque sempre, e por palpite (foco do teclado, navegador
 * ocioso) só quando a pessoa não pediu economia de dados e a conexão não é lenta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  conexaoPoupada,
  pedirTela,
  precarregarNoOcioso,
  registrarTelas,
  zerarPrecargaParaTeste,
} from '../src/lib/polimento/precarga'

const conexao = (c: { saveData?: boolean; effectiveType?: string } | undefined) =>
  Object.defineProperty(navigator, 'connection', { configurable: true, value: c })

/** O ocioso de mentira: cada `ocioso()` é um intervalo livre do navegador. */
let ociosos: Array<() => void> = []
const ocioso = () => {
  const fila = ociosos
  ociosos = []
  fila.forEach((f) => f())
}
const vez = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  zerarPrecargaParaTeste()
  ociosos = []
  conexao(undefined)
  vi.stubGlobal('requestIdleCallback', (f: () => void) => ociosos.push(f))
  vi.stubGlobal('cancelIdleCallback', () => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  conexao(undefined)
})

describe('pedir o pedaço de uma tela', () => {
  it('pede uma vez só, por mais que o toque se repita; tela sem pedaço registrado não pede nada', async () => {
    const jogar = vi.fn(() => Promise.resolve({}))
    registrarTelas({ play: jogar })
    expect(pedirTela('play')).toBeInstanceOf(Promise)
    expect(pedirTela('play')).toBeNull()
    await vez()
    expect(pedirTela('play')).toBeNull()
    expect(jogar).toHaveBeenCalledTimes(1)
    expect(pedirTela('hub')).toBeNull()
  })

  it('o pedido que falhou não trava a tela: a falha não sobe e o próximo toque pede de novo', async () => {
    const captura = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('sem rede'))
      .mockResolvedValue({})
    registrarTelas({ capture: captura })
    await expect(pedirTela('capture')).resolves.toBeUndefined()
    expect(pedirTela('capture')).toBeInstanceOf(Promise)
    expect(captura).toHaveBeenCalledTimes(2)
  })

  it('com economia de dados o palpite não pede; o toque, que é a própria navegação, pede', () => {
    const ajustes = vi.fn(() => Promise.resolve({}))
    registrarTelas({ settings: ajustes })
    conexao({ saveData: true })
    expect(conexaoPoupada()).toBe(true)
    expect(pedirTela('settings', true)).toBeNull()
    expect(ajustes).not.toHaveBeenCalled()
    expect(pedirTela('settings')).toBeInstanceOf(Promise)
    expect(ajustes).toHaveBeenCalledTimes(1)
  })

  it('conexão lenta (2G e 3G) conta como economia; 4G e navegador sem a informação, não', () => {
    for (const tipo of ['slow-2g', '2g', '3g']) {
      conexao({ effectiveType: tipo })
      expect(conexaoPoupada()).toBe(true)
    }
    conexao({ effectiveType: '4g' })
    expect(conexaoPoupada()).toBe(false)
    conexao(undefined)
    expect(conexaoPoupada()).toBe(false)
  })
})

describe('com o navegador ocioso', () => {
  it('pede os destinos um por vez: o seguinte só depois de o anterior chegar e de outro ocioso', async () => {
    let chegou: () => void = () => undefined
    const captura = vi.fn(() => new Promise<void>((r) => (chegou = r)))
    const jogar = vi.fn(() => Promise.resolve())
    registrarTelas({ capture: captura, play: jogar })
    const cancelar = precarregarNoOcioso(['capture', 'play'])
    expect(captura).not.toHaveBeenCalled()
    ocioso()
    expect(captura).toHaveBeenCalledTimes(1)
    expect(ociosos).toHaveLength(0)
    expect(jogar).not.toHaveBeenCalled()
    chegou()
    await vez()
    expect(jogar).not.toHaveBeenCalled()
    ocioso()
    expect(jogar).toHaveBeenCalledTimes(1)
    await vez()
    /* A fila acabou: ninguém mais espera o ocioso. */
    expect(ociosos).toHaveLength(0)
    cancelar()
  })

  it('o que o toque já pediu não é pedido de novo', async () => {
    const jogar = vi.fn(() => Promise.resolve())
    registrarTelas({ play: jogar })
    void pedirTela('play')
    precarregarNoOcioso(['play'])
    ocioso()
    await vez()
    expect(jogar).toHaveBeenCalledTimes(1)
  })

  it('com economia de dados ou conexão lenta, nada é pedido', async () => {
    const captura = vi.fn(() => Promise.resolve())
    registrarTelas({ capture: captura, play: captura })
    conexao({ saveData: true })
    precarregarNoOcioso(['capture', 'play'])
    for (let i = 0; i < 5; i++) {
      ocioso()
      await vez()
    }
    conexao({ effectiveType: '2g' })
    precarregarNoOcioso(['capture', 'play'])
    for (let i = 0; i < 5; i++) {
      ocioso()
      await vez()
    }
    expect(captura).not.toHaveBeenCalled()
  })

  it('cancelado (a casca desmontou), não pede mais', async () => {
    const captura = vi.fn(() => Promise.resolve())
    registrarTelas({ capture: captura })
    const cancelar = precarregarNoOcioso(['capture'])
    cancelar()
    ocioso()
    await vez()
    expect(captura).not.toHaveBeenCalled()
  })

  it('espera a página terminar de carregar', () => {
    const captura = vi.fn(() => Promise.resolve())
    registrarTelas({ capture: captura })
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' })
    try {
      precarregarNoOcioso(['capture'])
      expect(ociosos).toHaveLength(0)
      window.dispatchEvent(new Event('load'))
      expect(ociosos).toHaveLength(1)
    } finally {
      delete (document as unknown as Record<string, unknown>).readyState
    }
  })
})
