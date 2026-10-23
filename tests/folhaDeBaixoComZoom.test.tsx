// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import FolhaDeBaixo from '../src/components/views/captura/celular/FolhaDeBaixo'

/**
 * ARRASTAR A FOLHA DE BAIXO COM O TAMANHO DO TEXTO (zoom no body).
 *
 * `clientY` vem em px da janela; o `translateY(Npx)` da folha vale N × zoom px da janela. Sem converter,
 * a folha andava zoom vezes o caminho do dedo (no G, 30% a mais).
 */
describe('FolhaDeBaixo: o arrastar acompanha o dedo com zoom', () => {
  afterEach(() => {
    cleanup()
    document.body.style.removeProperty('zoom')
  })

  const arrastar = async (zoom: string, dedo: number) => {
    document.body.style.setProperty('zoom', zoom)
    await Promise.resolve()
    await Promise.resolve() // o cache do zoom é refeito por um observador de mutações
    const { container } = render(
      <FolhaDeBaixo titulo="Folha" aoFechar={() => undefined}>
        <p>conteúdo</p>
      </FolhaDeBaixo>,
    )
    const pega = container.querySelector('.folha-pega') as HTMLElement
    const dialogo = container.querySelector('dialog') as HTMLElement
    fireEvent.pointerDown(pega, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(pega, { clientY: 100 + dedo, pointerId: 1 })
    return dialogo.style.transform
  }

  it('sem zoom, anda o mesmo que o dedo', async () => {
    expect(await arrastar('1', 60)).toBe('translateY(60px)')
  })

  it('no tamanho G (zoom 1,3), anda em px do body: o que o dedo andou na janela dividido pelo zoom', async () => {
    // 78 px de dedo na janela = 60 px do body; o body pinta 60 × 1,3 = 78 px: debaixo do dedo.
    expect(await arrastar('1.3', 78)).toBe('translateY(60px)')
  })

  it('no tamanho P (zoom 0,94) também', async () => {
    expect(await arrastar('0.94', 47)).toBe('translateY(50px)')
  })
})
