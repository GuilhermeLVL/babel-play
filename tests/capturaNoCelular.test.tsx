// @vitest-environment jsdom
/**
 * A CAPTURA NO CELULAR, no que é regra e não desenho:
 *   · a frase vira botões de palavra (sem pontuação, sem repetir);
 *   · a tela fica acesa enquanto grava (Screen Wake Lock), e a trava volta quando a aba reaparece.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { palavrasDaFrase } from '../src/components/views/captura/celular/FolhaDaFrase'
import { useTelaAcesa } from '../src/lib/captura/telaAcesa'

afterEach(cleanup)

describe('palavrasDaFrase', () => {
  it('tira a pontuação das pontas, ignora número solto e não repete', () => {
    expect(palavrasDaFrase('The weather, the WEATHER is great! 42 — ok?')).toEqual([
      'The',
      'weather',
      'is',
      'great',
      'ok',
    ])
  })
  it('mantém o apóstrofo e o hífen de dentro da palavra', () => {
    expect(palavrasDaFrase("I'm well-known.")).toEqual(["I'm", 'well-known'])
  })
})

describe('useTelaAcesa', () => {
  function escopoFalso() {
    const soltar = vi.fn(async () => undefined)
    const trava = { release: soltar, released: false }
    const request = vi.fn(async () => trava)
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    return {
      escopo: { navigator: { wakeLock: { request } }, document: doc } as unknown as typeof globalThis,
      request,
      soltar,
      trava,
      doc,
    }
  }

  it('pede a trava ao gravar e a solta ao parar', async () => {
    const f = escopoFalso()
    const { rerender } = renderHook(({ ativo }) => useTelaAcesa(ativo, f.escopo), { initialProps: { ativo: true } })
    await act(async () => undefined)
    expect(f.request).toHaveBeenCalledWith('screen')
    rerender({ ativo: false })
    await act(async () => undefined)
    expect(f.soltar).toHaveBeenCalled()
  })

  it('pede de novo quando a aba volta (o navegador solta a trava ao esconder)', async () => {
    const f = escopoFalso()
    renderHook(() => useTelaAcesa(true, f.escopo))
    await act(async () => undefined)
    f.trava.released = true
    await act(async () => {
      f.doc.dispatchEvent(new Event('visibilitychange'))
    })
    expect(f.request).toHaveBeenCalledTimes(2)
  })

  it('sem a API, não faz nada (a tela só apaga como antes)', () => {
    expect(() => renderHook(() => useTelaAcesa(true, { navigator: {} } as unknown as typeof globalThis))).not.toThrow()
  })
})
