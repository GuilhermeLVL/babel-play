// @vitest-environment jsdom
/**
 * A REDE NA CONFIRMAÇÃO DO DOWNLOAD (carga-rapida-no-celular, 3.3): a estimativa de tempo pela vazão medida, o aviso
 * de rede lenta também sem `navigator.connection` (iPhone) e, para o adulto, a legenda do navegador dizendo para onde
 * vai o áudio.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AvisoDaRedeNoDownload from '../src/components/views/captura/AvisoDaRedeNoDownload'

afterEach(() => cleanup())

describe('AvisoDaRedeNoDownload', () => {
  it('iPhone em 3G (sem tipo de rede, vazão medida): o aviso e a estimativa', () => {
    render(<AvisoDaRedeNoDownload mb={193} redeLenta tipoDeRede={null} vazaoMbps={1.2} />)
    expect(screen.getByTestId('aviso-de-rede-lenta').textContent).toMatch(
      /A conexão parece lenta: o download pode demorar/,
    )
    expect(screen.getByTestId('estimativa-do-download').textContent).toMatch(/cerca de \d+ a \d+ min/)
  })

  it('rede boa: só a estimativa, sem aviso nem saída', () => {
    render(
      <AvisoDaRedeNoDownload
        mb={90}
        redeLenta={false}
        tipoDeRede="4g"
        vazaoMbps={30}
        legendaDoNavegador={{ mbTradutor: 0, aoUsar: () => undefined }}
      />,
    )
    expect(screen.queryByTestId('aviso-de-rede-lenta')).toBeNull()
    expect(screen.queryByTestId('usar-legenda-do-navegador')).toBeNull()
    expect(screen.getByTestId('estimativa-do-download')).toBeTruthy()
  })

  it('rede lenta e adulto: a legenda do navegador diz o que baixa e para onde vai o áudio', () => {
    const aoUsar = vi.fn()
    render(
      <AvisoDaRedeNoDownload
        mb={193}
        redeLenta
        tipoDeRede="3g"
        vazaoMbps={null}
        legendaDoNavegador={{ mbTradutor: 113, aoUsar }}
      />,
    )
    const botao = screen.getByTestId('usar-legenda-do-navegador')
    expect(botao.textContent).toMatch(/só o tradutor \(113 MB\)/)
    expect(botao.textContent).toMatch(/reconhecimento do navegador \(Google ou Apple\)/)
    fireEvent.click(botao)
    expect(aoUsar).toHaveBeenCalledTimes(1)
  })
})
