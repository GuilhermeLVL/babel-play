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

const opcoes = {
  modelos: [],
  langDoMic: 'pt-BR',
  sondarMic: false,
  gravando: false,
  parDoTradutor: ['pt', 'en'] as const,
}

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

/**
 * O INTÉRPRETE FALA NOS DOIS SENTIDOS (relato do dono no celular, 2026-09-30): o aviso de download
 * contava só o par da SUA fala, e a primeira fala do outro lado baixava o resto sem aviso. A folha do
 * intérprete precisa saber se o navegador traduz os DOIS sentidos, e se reconhece os DOIS idiomas.
 */
describe('usePreparoDoInicio: os dois sentidos do intérprete', () => {
  it('o navegador traduz um sentido e não o outro: só o nosso tradutor cobre a conversa', async () => {
    const availability = vi.fn(async ({ sourceLanguage }: { sourceLanguage: string }) =>
      sourceLanguage === 'pt' ? 'available' : 'downloadable',
    )
    vi.stubGlobal('Translator', { availability })
    const { result } = renderHook(() => usePreparoDoInicio(opcoes))
    await waitFor(() => expect(result.current.tradutorNativo).toBe(true))
    await waitFor(() => expect(availability).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'pt' }))
    expect(result.current.tradutorNativoNosDois).toBe(false)
  })

  it('os dois sentidos disponíveis no navegador: nenhum tradutor nosso a baixar', async () => {
    vi.stubGlobal('Translator', { availability: async () => 'available' })
    const { result } = renderHook(() => usePreparoDoInicio(opcoes))
    await waitFor(() => expect(result.current.tradutorNativoNosDois).toBe(true))
  })

  it('sem a API do tradutor: nenhum dos dois', async () => {
    const { result } = renderHook(() => usePreparoDoInicio(opcoes))
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.tradutorNativoNosDois).toBe(false)
  })

  const comSonda = (porIdioma: Record<string, string>) => {
    const available = vi.fn(async ({ langs }: { langs: string[] }) => porIdioma[langs[0]] ?? 'unavailable')
    vi.stubGlobal('SpeechRecognition', { available })
    return available
  }
  const comMic = { ...opcoes, sondarMic: true, outroLangDoMic: 'en-US' }

  it('o reconhecimento no aparelho dos DOIS idiomas: vale o pior', async () => {
    comSonda({ 'pt-BR': 'available', 'en-US': 'unavailable' })
    const { result } = renderHook(() => usePreparoDoInicio(comMic))
    await waitFor(() => expect(result.current.noAparelho).toBe('available'))
    await waitFor(() => expect(result.current.noAparelhoNosDois).toBe('unavailable'))
  })

  it('os dois idiomas disponíveis: disponível; um a baixar: a baixar', async () => {
    comSonda({ 'pt-BR': 'available', 'en-US': 'available' })
    const a = renderHook(() => usePreparoDoInicio(comMic))
    await waitFor(() => expect(a.result.current.noAparelhoNosDois).toBe('available'))
    a.unmount()
    comSonda({ 'pt-BR': 'available', 'en-US': 'downloadable' })
    const b = renderHook(() => usePreparoDoInicio(comMic))
    await waitFor(() => expect(b.result.current.noAparelhoNosDois).toBe('downloadable'))
  })

  it('sem o segundo idioma, `noAparelhoNosDois` é o do primeiro (a captura de sempre)', async () => {
    comSonda({ 'pt-BR': 'available' })
    const { result } = renderHook(() => usePreparoDoInicio({ ...opcoes, sondarMic: true }))
    await waitFor(() => expect(result.current.noAparelhoNosDois).toBe('available'))
  })
})
