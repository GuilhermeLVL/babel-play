// @vitest-environment jsdom
/**
 * A TELA "Modelos no aparelho" (Ajustes → Processamento), com um Cache Storage falso: o estado de cada
 * modelo vem do `modelManifest` de verdade (manifesto + arquivos no cache), e "Apagar" apaga de fato.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { chaveDoManifesto } from '../src/gateway/modelManifest'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const espioes = vi.hoisted(() => ({
  apagar: vi.fn(),
  baixar: vi.fn(async (_id: string, aoProgresso?: (f: number) => void) => {
    aoProgresso?.(0.5)
    return 'baixado' as const
  }),
  proibido: vi.fn(async (_id: string) => false),
  permitir: vi.fn(async (_id: string) => undefined),
  esquecer: vi.fn(async (_id: string) => undefined),
  medir: vi.fn(),
  perfil: { memoriaGb: null as number | null },
}))

vi.mock('../src/gateway/modelManifest', async (original) => {
  const real = await original<typeof import('../src/gateway/modelManifest')>()
  return {
    ...real,
    apagarModelo: vi.fn(async (id: string) => {
      espioes.apagar(id)
      return real.apagarModelo(id)
    }),
  }
})
vi.mock('../src/gateway/baixarModelo', () => ({ baixarModelo: espioes.baixar }))
vi.mock('../src/lib/dispositivo/sonda', () => ({
  modeloProibido: espioes.proibido,
  permitirModelo: espioes.permitir,
  sondaGuardada: async () => null,
  sondarEMedir: espioes.medir,
}))
vi.mock('../src/lib/captura/sentinelaDoModelo', () => ({ esquecerQuedas: espioes.esquecer }))
vi.mock('../src/lib/dispositivo/useSondaGuardada', () => ({ useSondaGuardada: () => null }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...real,
    perfilDoDispositivo: () => {
      const p = real.perfilDoDispositivo()
      return {
        ...p,
        tipo: 'desktop-sem-gpu',
        poucaMemoria: espioes.perfil.memoriaGb == null,
        sinais: { ...p.sinais, memoriaGb: espioes.perfil.memoriaGb, economiaDeDados: false },
      }
    },
  }
})

import ModelosNoAparelho from '../src/components/views/ajustes/ModelosNoAparelho'

/** Cache Storage falso: um `transformers-cache` com url → bytes. */
function cacheFalso(arquivos: Record<string, number>) {
  const mapa = new Map(Object.entries(arquivos))
  const cache = {
    keys: async () => [...mapa.keys()].map((url) => ({ url })),
    match: async (r: string | { url: string }) => {
      const url = typeof r === 'string' ? r : r.url
      return mapa.has(url) ? { blob: async () => ({ size: mapa.get(url)! }) } : undefined
    },
    delete: async (r: { url: string }) => mapa.delete(r.url),
  }
  vi.stubGlobal('caches', { open: async () => cache })
  return mapa
}

function guardar(modelId: string, dtype: string, url: string, bytes: number) {
  localStorage.setItem(
    chaveDoManifesto(modelId, dtype, 'wasm'),
    JSON.stringify({
      modelId,
      dtype,
      device: 'wasm',
      arquivos: [{ url, bytes }],
      bytesTotais: bytes,
      gravadoEm: Date.now(),
    }),
  )
}

const linha = (nome: string) => screen.getByRole('listitem', { name: nome })

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  espioes.perfil.memoriaGb = null
  espioes.proibido.mockResolvedValue(false)
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: async () => ({ usage: 120 * 1_048_576, quota: 10 * 1024 * 1_048_576 }) },
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ModelosNoAparelho', () => {
  it('mostra os seis modelos de transcrição', async () => {
    cacheFalso({})
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    for (const nome of ['Preciso', 'Preciso com placa de vídeo', 'Equilibrado', 'Rápido', 'Inglês', 'Inglês, rápido'])
      expect(linha(nome)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Modelos no aparelho' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/Espaço usado: 120 MB de 10 GB/)).toBeTruthy())
    expect(screen.getByText(/Parakeet TDT v3 · NVIDIA · CC-BY-4.0/)).toBeTruthy()
    // a promessa vale para quem também usa a nuvem: é sobre ESTES modelos
    expect(
      screen.getByText('Estes modelos rodam no seu aparelho: com eles, nada do que você ouve sai daqui.'),
    ).toBeTruthy()
  })

  it('"Usar este" no Equilibrado fixa o whisper-base e desliga o automático', async () => {
    cacheFalso({})
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const auto = screen.getByRole('switch', { name: 'Automático (recomendado)' })
    expect(auto.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(linha('Equilibrado')).getByRole('button', { name: 'Usar este' }))
    expect(localStorage.getItem('babel.stt.modeloFixo')).toBe('whisper-base')
    expect(auto.getAttribute('aria-checked')).toBe('false')
    // e religar o automático volta ao 'auto' (a chave some)
    fireEvent.click(auto)
    expect(localStorage.getItem('babel.stt.modeloFixo')).toBeNull()
    expect(auto.getAttribute('aria-checked')).toBe('true')
  })

  it('"Apagar" chama apagarModelo com o id e a linha passa a "Não baixado"', async () => {
    const url = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx'
    const mapa = cacheFalso({ [url]: 80 * 1_048_576 })
    guardar(WHISPER_MODELS.base, 'q8', url, 80 * 1_048_576)
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const l = linha('Equilibrado')
    await waitFor(() => expect(within(l).getByText(/No aparelho · baixado em/)).toBeTruthy())
    fireEvent.click(within(l).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(within(l).getByText('Não baixado')).toBeTruthy())
    expect(espioes.apagar).toHaveBeenCalledWith(WHISPER_MODELS.base)
    expect(mapa.size).toBe(0)
  })

  it('o que não cabe tem o botão desabilitado e o motivo à vista', async () => {
    cacheFalso({})
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const preciso = linha('Preciso')
    expect((within(preciso).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(preciso).getByText('Precisa de 8 GB de memória')).toBeTruthy()
    const ingles = linha('Inglês')
    expect((within(ingles).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(ingles).getByText('Só para inglês')).toBeTruthy()
    // Whisper/Moonshine sem cópia: baixam na primeira captura (sem botão "Baixar")
    expect(within(linha('Equilibrado')).queryByRole('button', { name: 'Baixar' })).toBeNull()
    expect(within(linha('Equilibrado')).getByText('Baixa na primeira captura')).toBeTruthy()
  })

  it('em inglês, o Preciso diz que é só para português e espanhol', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    render(<ModelosNoAparelho estudando="en-US" meu="en-US" />)
    expect(within(linha('Preciso')).getByText('Só para português e espanhol')).toBeTruthy()
  })

  it('com 8 GB, o Preciso baixa com progresso e "Usar este" liga a chave do Parakeet', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    localStorage.setItem('babel.stt.parakeet', '0')
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    expect(screen.getByText('Seu computador aguenta o modelo preciso de português e espanhol.')).toBeTruthy()
    const preciso = linha('Preciso')
    const usar = within(preciso).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement
    expect(usar.disabled).toBe(false)
    fireEvent.click(within(preciso).getByRole('button', { name: 'Baixar' }))
    await waitFor(() =>
      expect(espioes.baixar).toHaveBeenCalledWith(ID_DO_PARAKEET, expect.any(Function), expect.anything()),
    )
    fireEvent.click(usar)
    expect(localStorage.getItem('babel.stt.modeloFixo')).toBe('parakeet')
    expect(localStorage.getItem('babel.stt.parakeet')).toBe('1')
  })

  it('o Preciso vetado neste aparelho não pode ser usado, com o porquê', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    espioes.proibido.mockResolvedValue(true)
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const preciso = linha('Preciso')
    await waitFor(() =>
      expect(
        within(preciso).getByText('Este aparelho fechou a página com este modelo carregado; voltamos ao equilibrado.'),
      ).toBeTruthy(),
    )
    expect((within(preciso).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Para este aparelho, o equilibrado é o que roda sem esquentar.')).toBeTruthy()
  })

  it('"Tentar de novo" no Preciso vetado tira o veto e a marca de queda, e o modelo volta a poder ser usado', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    espioes.proibido.mockResolvedValue(true)
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const preciso = linha('Preciso')
    const tentar = await within(preciso).findByRole('button', { name: 'Tentar de novo' })
    fireEvent.click(tentar)
    await waitFor(() => expect(espioes.permitir).toHaveBeenCalledWith(ID_DO_PARAKEET))
    expect(espioes.esquecer).toHaveBeenCalledWith(ID_DO_PARAKEET)
    await waitFor(() =>
      expect((within(preciso).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement).disabled).toBe(false),
    )
    expect(within(preciso).queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('sem veto não há "Tentar de novo"', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    await waitFor(() => expect(espioes.proibido).toHaveBeenCalled())
    expect(within(linha('Preciso')).queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('a lista de tradução vazia explica quando eles baixam', async () => {
    cacheFalso({})
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    expect(
      screen.getByText('Os tradutores baixam quando você traduz um par de idiomas pela primeira vez.'),
    ).toBeTruthy()
  })

  it('estuda inglês e fala português: o Preciso pode ser fixado, com a nota de onde ele vale', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    render(<ModelosNoAparelho estudando="en-US" meu="pt-BR" />)
    const preciso = linha('Preciso')
    expect((within(preciso).getByRole('button', { name: 'Usar este' }) as HTMLButtonElement).disabled).toBe(false)
    expect(within(preciso).getByText('Vale para português; em inglês, o app escolhe sozinho.')).toBeTruthy()
    expect(within(preciso).queryByText('Só para português e espanhol')).toBeNull()
    // o Moonshine também vale em parte (o conteúdo em inglês)
    expect(within(linha('Inglês')).getByText('Vale para inglês; em português, o app escolhe sozinho.')).toBeTruthy()
    expect(screen.getByText('Seu computador aguenta o modelo preciso de português e espanhol.')).toBeTruthy()
  })

  it('com 8 GB e nenhum idioma pt/es, o automático explica que fica no equilibrado pelos idiomas', async () => {
    cacheFalso({})
    espioes.perfil.memoriaGb = 8
    render(<ModelosNoAparelho estudando="en-US" meu="fr-FR" />)
    expect(screen.getByText('Para os seus idiomas, o equilibrado é o que roda melhor neste aparelho.')).toBeTruthy()
  })

  it('sem 8 GB, o automático explica que fica no equilibrado pelo aparelho', async () => {
    cacheFalso({})
    render(<ModelosNoAparelho estudando="es" meu="pt-BR" />)
    expect(screen.getByText('Para este aparelho, o equilibrado é o que roda sem esquentar.')).toBeTruthy()
  })

  it('com uma captura gravando, "Apagar" e "Apagar todos os modelos" ficam desabilitados', async () => {
    const url = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx'
    cacheFalso({ [url]: 80 * 1_048_576 })
    guardar(WHISPER_MODELS.base, 'q8', url, 80 * 1_048_576)
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { query: async () => ({ held: [{ name: 'babel.captura.gravando' }] }) },
    })
    try {
      render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
      const apagar = await within(linha('Equilibrado')).findByRole('button', { name: 'Apagar' })
      await waitFor(() => expect((apagar as HTMLButtonElement).disabled).toBe(true))
      expect((screen.getByRole('button', { name: 'Apagar todos os modelos' }) as HTMLButtonElement).disabled).toBe(true)
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks
    }
  })

  it('apagar o modelo fixado devolve o automático (a próxima captura não baixa sem avisar)', async () => {
    const url = 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx'
    cacheFalso({ [url]: 80 * 1_048_576 })
    guardar(WHISPER_MODELS.base, 'q8', url, 80 * 1_048_576)
    localStorage.setItem('babel.stt.modeloFixo', 'whisper-base')
    render(<ModelosNoAparelho estudando="pt-BR" meu="pt-BR" />)
    const auto = screen.getByRole('switch', { name: 'Automático (recomendado)' })
    expect(auto.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(await within(linha('Equilibrado')).findByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(within(linha('Equilibrado')).getByText('Não baixado')).toBeTruthy())
    expect(localStorage.getItem('babel.stt.modeloFixo')).toBeNull()
    expect(auto.getAttribute('aria-checked')).toBe('true')
  })
})
