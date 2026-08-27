// @vitest-environment jsdom
/**
 * O compartilhamento de tela pede as CONSTRAINTS completas (systemAudio/monitorTypeSurfaces/...)
 * e transforma "escolheu janela, sem áudio" num erro TIPADO que a UI usa para abrir o guia.
 */
import { describe, expect, it, vi } from 'vitest'
import { startSystemAudioCapture } from '../src/gateway/capture/systemAudio'

function streamFalso(surface: string) {
  const parar = vi.fn()
  return {
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface: surface }), stop: parar, addEventListener: vi.fn() }],
    getAudioTracks: () => [],
    getTracks: () => [{ stop: parar }, { stop: parar }],
  } as unknown as MediaStream
}

describe('captura de tela/janela', () => {
  it('passa as constraints novas e tipa o erro da JANELA sem áudio', async () => {
    let recebidas: Record<string, unknown> = {}
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async (c: Record<string, unknown>) => { recebidas = c; return streamFalso('window') }),
      },
    })
    const erro = await startSystemAudioCapture({ onUtterance: vi.fn() } as never).then(
      () => null,
      (e: Error & { code?: string }) => e,
    )
    expect(recebidas.systemAudio).toBe('include')
    expect(recebidas.monitorTypeSurfaces).toBe('include')
    expect(recebidas.selfBrowserSurface).toBe('exclude')
    expect(recebidas.surfaceSwitching).toBe('include')
    expect((recebidas.audio as Record<string, unknown>).suppressLocalAudioPlayback).toBe(false)
    expect(erro?.code).toBe('JANELA_SEM_AUDIO')
    expect(erro?.message).toMatch(/TELA INTEIRA/)
  })

  it('tela sem o checkbox de áudio vira SEM_AUDIO_COMPARTILHADO', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn(async () => streamFalso('monitor')) },
    })
    const erro = await startSystemAudioCapture({ onUtterance: vi.fn() } as never).then(
      () => null,
      (e: Error & { code?: string }) => e,
    )
    expect(erro?.code).toBe('SEM_AUDIO_COMPARTILHADO')
  })
})
