// @vitest-environment jsdom
/**
 * O SELO DE LATÊNCIA E A LEITURA DO ARQUIVO (openspec `latencia-publicada-por-aparelho`, tarefas 2.1 e 2.2): com a flag
 * desligada NENHUMA requisição sai e nada aparece; célula `ok` mostra "metade das legendas" + taxa de falha + ressalva;
 * `insuficiente`, falha de rede, arquivo inválido ou velho = sem selo (e sem "estimativa").
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mundo = vi.hoisted(() => ({ flags: new Set<string>() }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (c: string) => mundo.flags.has(c) }))
vi.mock('../src/lib/flags', () => ({ useFlag: (c: string) => mundo.flags.has(c) }))
vi.mock('../src/lib/langConfig', () => ({
  useLangConfig: () => ({ mine: 'pt-BR', studying: 'en-US', daInterface: 'pt-BR' }),
}))

import SeloDeLatencia, {
  SeloDeLatenciaView,
  taxaDoSelo,
  tempoDoSelo,
} from '../src/components/views/captura/SeloDeLatencia'
import { agregarLatencia, type LatenciaPublicada } from '../src/core/latencia/agregarLatencia'
import { esquecerLatenciaPublicada, lerLatenciaPublicada, urlDaLatencia } from '../src/data/rotas/latencia'

const HOJE = new Date()
const ARQUIVO: LatenciaPublicada = agregarLatencia(
  [
    { classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 100, 140, 0, 0, 0, 0, 0], falas: 250, falhas: 10 },
    { classe: 'quest', idioma: 'en', baldes: [0, 0, 50, 0, 0, 0, 0, 0, 0], falas: 50, falhas: 0 },
  ],
  HOJE,
)

function resposta(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo } as Response
}

beforeEach(() => {
  mundo.flags.clear()
  esquecerLatenciaPublicada()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('leitura do arquivo', () => {
  it('flag desligada: nenhuma requisição', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await lerLatenciaPublicada()).toBeNull()
    mundo.flags.add('latencia_publicada') // só ela: sem `rum_latencia` também não pede
    expect(await lerLatenciaPublicada()).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('as duas ligadas: um GET sem credencial, validado; só um pedido por carga', async () => {
    mundo.flags.add('latencia_publicada').add('rum_latencia')
    const f = vi.fn(async () => resposta(ARQUIVO))
    vi.stubGlobal('fetch', f)
    expect(await lerLatenciaPublicada()).toEqual(ARQUIVO)
    await lerLatenciaPublicada()
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith(urlDaLatencia(), expect.objectContaining({ credentials: 'omit' }))
  })

  it('falha de rede, 404, arquivo inválido e arquivo velho viram null', async () => {
    mundo.flags.add('latencia_publicada').add('rum_latencia')
    for (const f of [
      async () => {
        throw new Error('offline')
      },
      async () => resposta({}, false),
      async () => resposta({ v: 1, celulas: 'x' }),
      async () => resposta({ ...ARQUIVO, geradoEm: '2020-01-01' }),
    ]) {
      esquecerLatenciaPublicada()
      vi.stubGlobal('fetch', vi.fn(f))
      expect(await lerLatenciaPublicada()).toBeNull()
    }
  })
})

describe('o selo', () => {
  it('célula ok: metade das legendas, taxa de falha e ressalva, como nota para o leitor de tela', () => {
    render(<SeloDeLatenciaView arquivo={ARQUIVO} classe="celular-bom" idioma="en-US" />)
    const selo = screen.getByTestId('selo-de-latencia')
    expect(selo.getAttribute('role')).toBe('note')
    const texto = selo.textContent ?? ''
    expect(texto).toContain('metade das legendas traduzidas aparece em até 1,5 s')
    expect(texto).toContain('celular bom')
    expect(texto).toContain('4%')
    expect(texto).toContain('adultos que aceitaram enviar métricas')
    expect(texto).not.toMatch(/garant|só hoje|rápido como|melhor que/i)
  })

  it('insuficiente, classe sem célula ou sem arquivo: nada na tela', () => {
    for (const [arquivo, classe] of [
      [ARQUIVO, 'quest'],
      [ARQUIVO, 'desktop-com-gpu'],
      [null, 'celular-bom'],
    ] as const) {
      const { container, unmount } = render(<SeloDeLatenciaView arquivo={arquivo} classe={classe} idioma="en" />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('formatos: balde alto vira "mais de 10 s" e taxa baixa vira "menos de 1%"', () => {
    expect(tempoDoSelo(30000)).toBe('mais de 10 s')
    expect(tempoDoSelo(500)).toBe('0,5 s')
    expect(taxaDoSelo(0.004)).toBe('menos de 1%')
    expect(taxaDoSelo(0.12)).toBe('12%')
  })

  it('componente com a flag desligada não renderiza e não pede o arquivo', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { container } = render(<SeloDeLatencia classe="celular-bom" />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
    expect(f).not.toHaveBeenCalled()
  })

  it('componente com as flags ligadas mostra o selo depois de ler; falha de rede = sem selo', async () => {
    mundo.flags.add('latencia_publicada').add('rum_latencia')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta(ARQUIVO)),
    )
    render(<SeloDeLatencia classe="celular-bom" />)
    expect(await screen.findByTestId('selo-de-latencia')).toBeTruthy()
    cleanup()
    esquecerLatenciaPublicada()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const { container } = render(<SeloDeLatencia classe="celular-bom" />)
    await act(async () => {})
    expect(container.innerHTML).toBe('')
  })
})
