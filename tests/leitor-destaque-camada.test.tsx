// @vitest-environment jsdom
/**
 * A CAMADA DO DESTAQUE (openspec `leitura-assistida`, Fatia C, C3 e C6): grifa o capítulo, publica o resumo e, SÓ com a
 * opção ligada, marca como conhecidas as palavras novas e comuns da página que ficou para trás, nunca as tocadas.
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  fetchDeck: vi.fn(),
  fetchPalavrasMarcadas: vi.fn(),
  marcarLotePalavras: vi.fn(),
  desfazerLotePalavras: vi.fn(),
}))
vi.mock('../src/data/api', async (orig) => ({ ...(await orig<typeof import('../src/data/api')>()), ...api }))

import CamadaDeDestaque, { type EstadoDoDestaque } from '../src/components/views/leitor/CamadaDeDestaque'
import { PERFIL_PADRAO } from '../src/core/leitura/perfilDeLeitura'
import { esquecerIndiceDeEtiquetas } from '../src/lib/etiquetas/indiceDeEtiquetas'

const TEXTO =
  '<p>The lantern swung over the harbor. The lantern lit the harbor. The lantern shook. The harbor slept. The quill rested.</p>' +
  '<p>Next the anchor dropped.</p>'

function montarMotor() {
  const registro = new Map<string, unknown>()
  const janela = document.defaultView as unknown as Record<string, unknown>
  janela.CSS = { highlights: registro }
  janela.Highlight = function (...ranges: Range[]) {
    return { ranges }
  }
  const motor = { documentos: () => [{ doc: document, index: 0 }], posicao: { section: { current: 0, total: 3 } } }
  return { motor, registro }
}

const paginaDe = (fracao: number, indiceDoParagrafo = 0) => {
  const r = document.createRange()
  r.selectNodeContents(document.querySelectorAll('p')[indiceDoParagrafo])
  return { range: r, fracao }
}

function montarCamada(o: {
  marcarAoPaginar: boolean
  palavraAberta?: string
  pagina: ReturnType<typeof paginaDe> | null
}) {
  const { motor, registro } = montarMotor()
  const aoEstado = vi.fn<(e: EstadoDoDestaque) => void>()
  const aoSecaoCarregada = { current: null as (() => void) | null }
  const props = {
    motorRef: { current: motor as never },
    aoSecaoCarregada,
    idioma: 'en',
    perfil: PERFIL_PADRAO,
    palavraAberta: o.palavraAberta,
    marcarAoPaginar: o.marcarAoPaginar,
    aoEstado,
  }
  const r = render(<CamadaDeDestaque {...props} pagina={o.pagina} />)
  return { ...r, props, aoEstado, registro }
}

beforeEach(() => {
  document.body.innerHTML = TEXTO
  esquecerIndiceDeEtiquetas()
  api.fetchDeck.mockReset().mockResolvedValue([])
  api.fetchPalavrasMarcadas.mockReset().mockResolvedValue([])
  api.marcarLotePalavras
    .mockReset()
    .mockImplementation(async (_l: string, chaves: string[]) => ({ criadas: chaves, ignoradas: [] }))
  api.desfazerLotePalavras.mockReset().mockImplementation(async (_l: string, chaves: string[]) => chaves)
})
afterEach(cleanup)

describe('CamadaDeDestaque', () => {
  it('grifa o capítulo quando o caderno chega e publica a densidade', async () => {
    const { aoEstado, registro } = montarCamada({ marcarAoPaginar: false, pagina: paginaDe(0) })
    await waitFor(() => expect(aoEstado).toHaveBeenCalled(), { timeout: 3000 })
    const e = aoEstado.mock.calls.at(-1)![0]
    expect(e.resumo?.novas).toBeGreaterThan(0)
    expect(e.candidatas[0]).toBe('lantern')
    expect(registro.size).toBeGreaterThan(0)
  })

  it('PADRÃO: virar a página NÃO marca nada como conhecida', async () => {
    const { aoEstado, rerender, props } = montarCamada({ marcarAoPaginar: false, pagina: paginaDe(0) })
    await waitFor(() => expect(aoEstado).toHaveBeenCalled(), { timeout: 3000 })
    rerender(<CamadaDeDestaque {...props} pagina={paginaDe(0.5, 1)} />)
    await new Promise((r) => setTimeout(r, 100))
    expect(api.marcarLotePalavras).not.toHaveBeenCalled()
  })

  it('opção ligada: marca as novas e comuns da página que ficou, menos a tocada; dá para desfazer', async () => {
    const { aoEstado, rerender, props } = montarCamada({
      marcarAoPaginar: true,
      palavraAberta: 'harbor',
      pagina: paginaDe(0),
    })
    await waitFor(() => expect(aoEstado).toHaveBeenCalled(), { timeout: 3000 })
    rerender(<CamadaDeDestaque {...props} palavraAberta="harbor" pagina={paginaDe(0.5, 1)} />)
    await waitFor(() => expect(api.marcarLotePalavras).toHaveBeenCalled(), { timeout: 3000 })
    const chaves = api.marcarLotePalavras.mock.calls[0][1] as string[]
    expect(chaves).toContain('lantern')
    expect(chaves).not.toContain('harbor') // tocada
    await waitFor(() => expect(aoEstado.mock.calls.at(-1)![0].desfazerPagina).toBeTypeOf('function'))
    aoEstado.mock.calls.at(-1)![0].desfazerPagina!()
    await waitFor(() => expect(api.desfazerLotePalavras).toHaveBeenCalledWith('en', chaves))
  })

  it('voltar a página não marca nada', async () => {
    const { aoEstado, rerender, props } = montarCamada({ marcarAoPaginar: true, pagina: paginaDe(0.5, 1) })
    await waitFor(() => expect(aoEstado).toHaveBeenCalled(), { timeout: 3000 })
    rerender(<CamadaDeDestaque {...props} pagina={paginaDe(0, 0)} />)
    await new Promise((r) => setTimeout(r, 100))
    expect(api.marcarLotePalavras).not.toHaveBeenCalled()
  })
})
