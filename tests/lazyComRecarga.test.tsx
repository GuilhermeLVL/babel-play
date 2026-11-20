// @vitest-environment jsdom
/**
 * O PEDAÇO JÁ BAIXADO NÃO SUSPENDE (`src/lib/lazyComRecarga.ts`, auditoria de 23/10/2026, B3). Antes, mesmo
 * com o pedaço pré-carregado, a primeira montagem do `lazy` suspendia e o `Suspense` mostrava o fallback
 * (~350 ms de tela vazia na primeira visita a cada tela).
 */
import { act, render, screen } from '@testing-library/react'
import React, { Suspense, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { lazyComRecarga } from '../src/lib/lazyComRecarga'

function Tela({ nome }: { nome: string }) {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      {nome} {n}
    </button>
  )
}

describe('lazyComRecarga', () => {
  it('pré-carregado pelo `carregar`, monta direto, sem o fallback', async () => {
    const Preguicosa = lazyComRecarga(async () => ({ default: Tela }))
    await Preguicosa.carregar()
    render(
      <Suspense fallback={<p>carregando</p>}>
        <Preguicosa nome="Intérprete" />
      </Suspense>,
    )
    // Na mesma passada síncrona do render: nenhum quadro com o fallback.
    expect(screen.queryByText('carregando')).toBeNull()
    expect(screen.getByRole('button').textContent).toBe('Intérprete 0')
  })

  it('sem pré-carga, suspende como o `lazy` de sempre e depois mostra a tela', async () => {
    const Preguicosa = lazyComRecarga(async () => ({ default: Tela }))
    render(
      <Suspense fallback={<p>carregando</p>}>
        <Preguicosa nome="Jogar" />
      </Suspense>,
    )
    expect(screen.getByText('carregando')).toBeTruthy()
    expect(await screen.findByRole('button')).toBeTruthy()
  })

  it('a tela montada pelo `lazy` não remonta (nem perde o estado) quando volta a desenhar', async () => {
    const Preguicosa = lazyComRecarga(async () => ({ default: Tela }))
    function Casca() {
      const [, setV] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setV((v) => v + 1)}>
            casca
          </button>
          <Suspense fallback={<p>carregando</p>}>
            <Preguicosa nome="Ajustes" />
          </Suspense>
        </>
      )
    }
    render(<Casca />)
    const tela = await screen.findByText(/^Ajustes/)
    act(() => tela.click())
    expect(screen.getByText(/^Ajustes/).textContent).toBe('Ajustes 1')
    act(() => screen.getByText('casca').click())
    expect(screen.getByText(/^Ajustes/).textContent).toBe('Ajustes 1')
  })
})
