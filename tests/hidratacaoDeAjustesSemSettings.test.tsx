// @vitest-environment jsdom
/**
 * A APRESENTAÇÃO NÃO REPETE QUANDO AS SETTINGS NÃO CHEGAM.
 *
 * A conta de menor sem responsável recebe 403 `responsavel_pendente` em `/api/settings`. `fetchSettings`
 * não lança: devolve `null`. A hidratação lia `null` como "nunca passou pela apresentação" e a mostrava
 * a cada acesso (o `onboarded` nunca gravava, porque a gravação também era recusada). O `catch` que
 * dizia "se settings falhar, não trava o app" era código morto.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchSettings = vi.fn()
vi.mock('../src/data/api', async (orig) => ({
  ...((await orig()) as object),
  fetchSettings: () => fetchSettings(),
}))
vi.mock('../src/lib/identidade', async (orig) => ({
  ...((await orig()) as object),
  estaAnonimo: () => false,
}))

import { useHidratacaoDeAjustes } from '../src/lib/estado/useAparencia'

function alvos() {
  return {
    setThemeState: vi.fn(),
    setDarkMode: vi.fn(),
    setFonteState: vi.fn(),
    setAgeProfileState: vi.fn(),
    setOnboarded: vi.fn(),
  }
}

afterEach(() => vi.clearAllMocks())

describe('useHidratacaoDeAjustes e o onboarding', () => {
  it('settings recusadas (null, como no 403 do menor restrito): NÃO reabre a apresentação', async () => {
    fetchSettings.mockResolvedValue(null)
    const a = alvos()
    renderHook(() => useHidratacaoDeAjustes(a))
    await waitFor(() => expect(a.setOnboarded).toHaveBeenCalled())
    expect(a.setOnboarded).toHaveBeenCalledWith(true)
  })

  it('settings lidas sem `onboarded`: a apresentação aparece (conta nova)', async () => {
    fetchSettings.mockResolvedValue({ id: 'x', activeProfileId: null, targetLanguage: null, ui: null })
    const a = alvos()
    renderHook(() => useHidratacaoDeAjustes(a))
    await waitFor(() => expect(a.setOnboarded).toHaveBeenCalled())
    expect(a.setOnboarded).toHaveBeenCalledWith(false)
  })

  it('settings lidas com `onboarded: true`: segue direto', async () => {
    fetchSettings.mockResolvedValue({
      id: 'x',
      activeProfileId: null,
      targetLanguage: null,
      ui: JSON.stringify({ onboarded: true }),
    })
    const a = alvos()
    renderHook(() => useHidratacaoDeAjustes(a))
    await waitFor(() => expect(a.setOnboarded).toHaveBeenCalledWith(true))
  })
})
