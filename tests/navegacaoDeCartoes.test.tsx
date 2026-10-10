// @vitest-environment jsdom
/**
 * A REVISÃO E O VOCABULÁRIO MORAM EM CARTÕES (10/10/2026) — a navegação que ainda fala os nomes
 * antigos (`study`, `metrics`) e os endereços antigos (`/revisar`, `/vocabulario`) chegam ao lugar novo:
 *   · `study` abre a rodada dentro de Cartões, SEM prender a rodada à sessão mais recente (era o que
 *     acontecia enquanto ela era uma aba da sessão) e sem exigir que exista uma gravação;
 *   · `metrics` abre a aba "Palavras";
 *   · a barra de endereço mostra `/cartoes/...`.
 */
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useNavegacao } from '../src/lib/estado/useNavegacao'
import type { ViewType } from '../src/types'

function useCasca() {
  const [activeView, setActiveView] = useState<ViewType>('hub')
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null)
  const [, setResumingRecordingId] = useState<string | null>(null)
  const [lojaAba, setLojaAba] = useState<string | null>(null)
  const nav = useNavegacao({
    activeView,
    setActiveView,
    selectedRecordingId,
    setSelectedRecordingId,
    setResumingRecordingId,
    recordings: [],
    lojaAba,
    setLojaAba,
    setPedindoLogin: () => {},
  })
  return { activeView, selectedRecordingId, ...nav }
}

const abrirEm = (caminho: string) => {
  window.history.replaceState({}, '', caminho)
  return renderHook(() => useCasca())
}

beforeEach(() => {
  localStorage.clear()
  document.body.className = ''
})
afterEach(() => window.history.replaceState({}, '', '/'))

describe('a navegação de Cartões', () => {
  it('`study` abre a rodada em Cartões, sem sessão escolhida, e o endereço é /cartoes/estudar', () => {
    const { result } = abrirEm('/')
    act(() => result.current.navigateTo('study'))
    expect(result.current.activeView).toBe('cartoes')
    expect(result.current.estudo).toEqual({ sessionId: null, limite: undefined, soNovas: undefined })
    expect(result.current.selectedRecordingId).toBeNull()
    expect(window.location.pathname).toBe('/cartoes/estudar')
  })

  it('`study` com sessão, limite ou só novas leva o recorte até a rodada', () => {
    const { result } = abrirEm('/')
    act(() => result.current.navigateTo('study', { id: 's1', limite: 10 }))
    expect(result.current.estudo).toEqual({ sessionId: 's1', limite: 10, soNovas: undefined })
    expect(window.location.pathname).toBe('/cartoes/estudar/s1')
    act(() => result.current.navigateTo('study', { soNovas: true, limite: 5 }))
    expect(result.current.estudo).toEqual({ sessionId: null, limite: 5, soNovas: true })
  })

  it('o voltar da rodada (`cartoes`) fecha a rodada e cai em "Hoje"', () => {
    const { result } = abrirEm('/')
    act(() => result.current.navigateTo('cartoes', { aba: 'memoria' }))
    expect(result.current.cartoesAba).toBe('memoria')
    expect(window.location.pathname).toBe('/cartoes/memoria')
    act(() => result.current.navigateTo('study'))
    act(() => result.current.navigateTo('cartoes'))
    expect(result.current.estudo).toBeNull()
    expect(result.current.cartoesAba).toBe('hoje')
    expect(window.location.pathname).toBe('/cartoes')
  })

  it('`metrics`, o nome antigo do Vocabulário, abre a aba "Palavras"', () => {
    const { result } = abrirEm('/')
    act(() => result.current.navigateTo('metrics'))
    expect(result.current.activeView).toBe('cartoes')
    expect(result.current.cartoesAba).toBe('palavras')
    expect(window.location.pathname).toBe('/cartoes/palavras')
  })

  it('trocar de aba na tela publica o endereço da aba', () => {
    const { result } = abrirEm('/cartoes')
    act(() => result.current.setCartoesAba('baralhos'))
    expect(window.location.pathname).toBe('/cartoes/baralhos')
  })

  it.each([
    ['/revisar', 'cartoes', { sessionId: null }, 'hoje', '/cartoes/estudar'],
    ['/revisar/s9', 'cartoes', { sessionId: 's9' }, 'hoje', '/cartoes/estudar/s9'],
    ['/vocabulario', 'cartoes', null, 'palavras', '/cartoes/palavras'],
    ['/cartoes/trazer', 'cartoes', null, 'trazer', '/cartoes/trazer'],
  ] as const)('o endereço %s abre %s no lugar novo', (endereco, view, estudo, aba, canonico) => {
    const { result } = abrirEm(endereco)
    expect(result.current.activeView).toBe(view)
    if (estudo) expect(result.current.estudo).toMatchObject(estudo)
    else expect(result.current.estudo).toBeNull()
    expect(result.current.cartoesAba).toBe(aba)
    expect(window.location.pathname).toBe(canonico)
  })
})
