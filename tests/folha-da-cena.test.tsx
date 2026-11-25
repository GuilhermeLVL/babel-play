// @vitest-environment jsdom
/**
 * A FOLHA DA CENA (openspec `cartao-com-captura-de-tela`, tarefa 3.2): nada é gravado antes de "Guardar"; "Descartar" não grava;
 * a cobertura é aplicada ANTES de codificar; tela inteira pede a confirmação extra.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import FolhaDaCena from '../src/components/views/captura/FolhaDaCena'

const ordem = vi.hoisted(() => [] as string[])
vi.mock('../src/lib/cartoes/cenaDoCartao', () => ({
  cobrirNoCanvas: () => void ordem.push('cobrir'),
  codificarCena: async () => {
    ordem.push('codificar')
    return new Blob([new Uint8Array(10)], { type: 'image/webp' })
  },
}))

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(() => {
  cleanup()
  ordem.length = 0
})

const quadro = () => Object.assign(document.createElement('canvas'), { width: 480, height: 270 })

describe('FolhaDaCena', () => {
  it('nada é gravado antes de "Guardar"; Guardar cobre, codifica e entrega a imagem', async () => {
    const aoGuardar = vi.fn(async () => true)
    const aoFechar = vi.fn()
    render(<FolhaDaCena quadro={quadro()} telaInteira={false} aoGuardar={aoGuardar} aoFechar={aoFechar} />)
    expect(aoGuardar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('guardar-cena'))
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledTimes(1))
    expect(ordem).toEqual(['cobrir', 'codificar'])
    await waitFor(() => expect(aoFechar).toHaveBeenCalled())
  })

  it('"Descartar" fecha sem gravar', () => {
    const aoGuardar = vi.fn(async () => true)
    const aoFechar = vi.fn()
    render(<FolhaDaCena quadro={quadro()} telaInteira={false} aoGuardar={aoGuardar} aoFechar={aoFechar} />)
    fireEvent.click(screen.getByTestId('descartar-cena'))
    expect(aoFechar).toHaveBeenCalled()
    expect(aoGuardar).not.toHaveBeenCalled()
  })

  it('tela inteira: "Guardar" só liga depois da confirmação', () => {
    render(<FolhaDaCena quadro={quadro()} telaInteira aoGuardar={async () => true} aoFechar={() => {}} />)
    const botao = screen.getByTestId('guardar-cena') as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(botao.disabled).toBe(false)
  })

  it('se não conseguiu guardar, a folha continua aberta', async () => {
    const aoFechar = vi.fn()
    render(<FolhaDaCena quadro={quadro()} telaInteira={false} aoGuardar={async () => false} aoFechar={aoFechar} />)
    fireEvent.click(screen.getByTestId('guardar-cena'))
    await waitFor(() => expect((screen.getByTestId('guardar-cena') as HTMLButtonElement).disabled).toBe(false))
    expect(aoFechar).not.toHaveBeenCalled()
  })
})
