// @vitest-environment jsdom
/**
 * O DEFEITO QUE ESTE ARQUIVO IMPEDE DE VOLTAR.
 *
 * `useCommandPalette` instalava um `keydown` no `window` por instância. Com uma paleta só (a do
 * Study) funcionava. Ao subir a busca global para o shell passaram a existir DUAS: as duas ouviam
 * ⌘K, as duas alternavam, e o efeito visível era o atalho "não funcionar" — uma abria enquanto a
 * outra fechava, no mesmo evento.
 *
 * É um defeito que nenhum teste anterior podia pegar (todos os outros testam funções puras ou um
 * componente isolado) e que ninguém liga ao commit que o causa, porque o sintoma é ausência de
 * comportamento. Daí ele ganhar arquivo próprio.
 *
 * O segundo teste trava a razão de a precedência ser um NÚMERO e não a ordem de montagem: o React
 * roda os efeitos dos filhos antes dos do pai, então "quem montou por último" elegeria o shell numa
 * carga direta em `/revisar`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import React from 'react'
import { useCommandPalette } from '../src/components/CommandPalette'

function ctrlK() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  })
}

/** Um espião de estado: rende "aberto"/"fechado" para a asserção ser sobre o que a tela mostra. */
function Paleta({ nome, prioridade, ativo = true }: { nome: string; prioridade?: number; ativo?: boolean }) {
  const [aberta] = useCommandPalette(ativo, prioridade)
  return <span data-testid={nome}>{aberta ? 'aberto' : 'fechado'}</span>
}

describe('⌘K tem um dono só por vez', () => {
  afterEach(cleanup)

  it('uma paleta sozinha abre e fecha no atalho', () => {
    render(<Paleta nome="unica" />)

    expect(screen.getByTestId('unica').textContent).toBe('fechado')
    ctrlK()
    expect(screen.getByTestId('unica').textContent).toBe('aberto')
    ctrlK()
    expect(screen.getByTestId('unica').textContent).toBe('fechado')
  })

  it('com duas montadas, só a de maior prioridade responde', () => {
    // O pai (shell, prioridade 0) e o filho (Study, prioridade 1) na MESMA árvore: é o caso em que
    // os efeitos do filho rodam primeiro e a ordem de montagem daria a resposta errada.
    render(
      <div>
        <Paleta nome="shell" prioridade={0} />
        <Paleta nome="study" prioridade={1} />
      </div>,
    )

    ctrlK()
    expect(screen.getByTestId('study').textContent).toBe('aberto')
    expect(screen.getByTestId('shell').textContent).toBe('fechado')
  })

  it('a prioridade vence mesmo quando a global monta por último', () => {
    const { rerender } = render(<Paleta nome="study" prioridade={1} />)
    rerender(
      <div>
        <Paleta nome="study" prioridade={1} />
        <Paleta nome="shell" prioridade={0} />
      </div>,
    )

    ctrlK()
    expect(screen.getByTestId('study').textContent).toBe('aberto')
    expect(screen.getByTestId('shell').textContent).toBe('fechado')
  })

  it('saindo da tela específica, a global volta a atender', () => {
    const { rerender } = render(
      <div>
        <Paleta nome="shell" prioridade={0} />
        <Paleta nome="study" prioridade={1} />
      </div>,
    )
    // Study desmonta (navegou para fora).
    rerender(
      <div>
        <Paleta nome="shell" prioridade={0} />
      </div>,
    )

    ctrlK()
    expect(screen.getByTestId('shell').textContent).toBe('aberto')
  })

  it('uma paleta suspensa não disputa o atalho nem fica aberta', () => {
    const { rerender } = render(<Paleta nome="shell" prioridade={0} />)
    ctrlK()
    expect(screen.getByTestId('shell').textContent).toBe('aberto')

    rerender(<Paleta nome="shell" prioridade={0} ativo={false} />)
    expect(screen.getByTestId('shell').textContent).toBe('fechado')

    ctrlK()
    expect(screen.getByTestId('shell').textContent).toBe('fechado')
  })

  it('desmontar a última paleta remove o listener do window', () => {
    const remover = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Paleta nome="unica" />)
    unmount()

    expect(remover).toHaveBeenCalledWith('keydown', expect.any(Function))
    remover.mockRestore()
  })
})
