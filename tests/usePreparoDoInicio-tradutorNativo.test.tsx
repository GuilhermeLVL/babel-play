// @vitest-environment jsdom
/**
 * O TRADUTOR DO NAVEGADOR NA FOLHA DO INÍCIO (relato do dono no celular, 2026-09-29): a folha conta o
 * download do nosso tradutor em toda escolha — mas quando o navegador já traduz o par no aparelho
 * (`Translator.availability` = 'available'), o opus-mt não baixa, e a folha não pode prometer 113 MB.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/gateway/modelManifest', () => ({ modeloDisponivel: async () => ({ completo: false }) }))

import { usePreparoDoInicio } from '../src/lib/captura/usePreparoDoInicio'

const opcoes = { modelos: [], langDoMic: 'pt-BR', sondarMic: false, gravando: false, parDoTradutor: ['pt', 'en'] as const }

afterEach(() => vi.unstubAllGlobals())

describe('usePreparoDoInicio: tradutor nativo', () => {
  it("par 'available' no navegador: tradutorNativo", async () => {
    const availability = vi.fn(async () => 'available')
    vi.stubGlobal('Translator', { availability })
    const { result } = renderHook(() => usePreparoDoInicio(opcoes))
    await waitFor(() => expect(result.current.tradutorNativo).toBe(true))
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'pt', targetLanguage: 'en' })
  })

  it("a baixar ('downloadable') ou sem a API (o Android): o nosso tradutor conta", async () => {
    vi.stubGlobal('Translator', { availability: async () => 'downloadable' })
    const { result } = renderHook(() => usePreparoDoInicio(opcoes))
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.tradutorNativo).toBe(false)
    vi.unstubAllGlobals()
    const sem = renderHook(() => usePreparoDoInicio(opcoes))
    expect(sem.result.current.tradutorNativo).toBe(false)
  })
})
