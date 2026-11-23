// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/gateway/modelCache', () => ({
  areModelsCached: async () => true,
  expectedModelIds: () => ['stt', 'mt'],
}))

vi.mock('../src/lib/langConfig', () => ({
  useLangConfig: () => ({ mine: 'pt-BR', studying: 'en-US', daInterface: 'pt-BR' }),
}))

import AvisoSemRede from '../src/components/conta/AvisoSemRede'

function definirOnLine(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

afterEach(() => {
  cleanup()
  definirOnLine(true)
  sessionStorage.clear()
})

describe('AvisoSemRede', () => {
  it('não aparece online', async () => {
    definirOnLine(true)
    render(<AvisoSemRede />)
    await act(async () => {})
    expect(screen.queryByTestId('aviso-sem-rede')).toBeNull()
  })

  it('aparece quando a rede cai e some quando volta', async () => {
    definirOnLine(true)
    render(<AvisoSemRede />)
    await act(async () => {})
    await act(async () => {
      definirOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('aviso-sem-rede').textContent).toContain('Sem internet.')
    await act(async () => {
      definirOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByTestId('aviso-sem-rede')).toBeNull()
  })
})
