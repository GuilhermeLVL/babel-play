// @vitest-environment jsdom
/**
 * ÁUDIO DO SISTEMA PELA JANELA / TELA INTEIRA (causa provada em 2026-09-27, ver
 * `openspec/audits/2026-09-27-audio-do-sistema/relatorio.md`).
 *
 * O Chrome abre o áudio de janela/tela pelo loopback do WASAPI do dispositivo de saída padrão pedindo
 * ESTÉREO (2 canais, 48 kHz). Numa saída configurada como 5.1/7.1 o Windows recusa esse formato no
 * loopback (`IAudioClient::Initialize` → 0x88890008 AUDCLNT_E_UNSUPPORTED_FORMAT) e o getDisplayMedia
 * falha com NotReadableError "Could not start audio source" — com QUALQUER constraint de DSP, inclusive
 * `audio: true` numa página vazia. O que funciona é `restrictOwnAudio: true`: o Chrome troca para o
 * loopback POR PROCESSO (`loopbackWithoutChrome`), que entrega estéreo em qualquer layout de saída.
 *
 * Contrato:
 *  - todo pedido leva `restrictOwnAudio: true` (a ABA ignora: continua "Tab audio");
 *  - o seletor abre UMA vez por clique: a antiga repetição "modo compatível" mudava só o DSP, que
 *    não é a causa, e abria o seletor de novo para falhar igual;
 *  - NotReadableError do ÁUDIO vira o erro tipado AUDIO_DA_TELA_INDISPONIVEL, com texto curto e as
 *    duas saídas que funcionam (aba, loopback), e fica lembrado neste aparelho.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  acquireDisplayStream,
  audioDaTelaFalhouNesteAparelho,
  probeSystemAudio,
  startSystemAudioCapture,
} from '../src/gateway/capture/systemAudio'

function streamFalso(surface: string, comAudio = true) {
  const parar = vi.fn()
  return {
    getVideoTracks: () => [
      { getSettings: () => ({ displaySurface: surface }), stop: parar, addEventListener: vi.fn() },
    ],
    getAudioTracks: () => (comAudio ? [{ stop: parar, label: 'System Audio' }] : []),
    getTracks: () => [{ stop: parar }, { stop: parar }],
  } as unknown as MediaStream
}

const erroDom = (name: string, msg = 'Could not start audio source') => new DOMException(msg, name)

function instalar(respostas: Array<MediaStream | Error | DOMException>) {
  const chamadas: Array<Record<string, unknown>> = []
  const getDisplayMedia = vi.fn(async (c: Record<string, unknown>) => {
    chamadas.push(c)
    const r = respostas.shift()
    if (!r) throw new Error('getDisplayMedia chamado mais vezes que o esperado')
    // No jsdom o DOMException não herda de Error: testa os dois.
    if (r instanceof Error || r instanceof DOMException) throw r
    return r
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } })
  return { chamadas, getDisplayMedia }
}

const audioDe = (c: Record<string, unknown>) => c.audio as Record<string, unknown>

const falhaDe = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: Error & { code?: string }) => e,
  )

beforeEach(() => {
  localStorage.clear()
})

describe('pedido do áudio da tela', () => {
  it('pede o loopback por processo (restrictOwnAudio) junto com as constraints de sempre', async () => {
    const { chamadas } = instalar([streamFalso('monitor')])
    await acquireDisplayStream()
    expect(chamadas).toHaveLength(1)
    const a = audioDe(chamadas[0])
    expect(a.restrictOwnAudio).toBe(true)
    expect(a.suppressLocalAudioPlayback).toBe(false)
    expect(a.echoCancellation).toBe(false)
    expect(a.noiseSuppression).toBe(false)
    expect(a.autoGainControl).toBe(false)
    expect(chamadas[0].systemAudio).toBe('include')
    expect(chamadas[0].monitorTypeSurfaces).toBe('include')
    expect(chamadas[0].selfBrowserSurface).toBe('exclude')
    expect(chamadas[0].surfaceSwitching).toBe('include')
  })

  it('ABA: uma chamada, o mesmo pedido, o stream volta intacto', async () => {
    const aba = streamFalso('browser')
    const { chamadas } = instalar([aba])
    await expect(acquireDisplayStream()).resolves.toBe(aba)
    expect(chamadas).toHaveLength(1)
  })
})

describe('o Windows não liberou o áudio da janela/tela', () => {
  it('NotReadableError do áudio: NÃO reabre o seletor', async () => {
    const { chamadas } = instalar([erroDom('NotReadableError')])
    await expect(acquireDisplayStream()).rejects.toMatchObject({ name: 'NotReadableError' })
    expect(chamadas).toHaveLength(1)
  })

  it('OverconstrainedError também não reabre o seletor', async () => {
    const { chamadas } = instalar([erroDom('OverconstrainedError', '')])
    await expect(acquireDisplayStream()).rejects.toMatchObject({ name: 'OverconstrainedError' })
    expect(chamadas).toHaveLength(1)
  })

  it('pelo fluxo da captura: erro tipado, texto curto com as saídas que funcionam, sem aviso de "de novo"', async () => {
    const { chamadas } = instalar([erroDom('NotReadableError')])
    const onStatus = vi.fn()
    const erro = await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn(), onStatus } as never))
    expect(chamadas).toHaveLength(1)
    expect(erro?.code).toBe('AUDIO_DA_TELA_INDISPONIVEL')
    expect(erro?.message).toMatch(/aba/i)
    expect(erro?.message).toMatch(/loopback/i)
    expect(erro!.message.length).toBeLessThan(220)
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('o próximo clique pede exatamente o mesmo (não há mais estado de "modo compatível")', async () => {
    instalar([erroDom('NotReadableError')])
    await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn() } as never))
    const { chamadas } = instalar([streamFalso('monitor')])
    await acquireDisplayStream()
    expect(chamadas).toHaveLength(1)
    expect(audioDe(chamadas[0]).restrictOwnAudio).toBe(true)
    expect(audioDe(chamadas[0]).echoCancellation).toBe(false)
  })

  it('falha da IMAGEM (Could not start video source) não é confundida com a do áudio', async () => {
    instalar([erroDom('NotReadableError', 'Could not start video source')])
    const erro = await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn() } as never))
    expect(erro?.code).toBe('TELA_INDISPONIVEL')
    expect(audioDaTelaFalhouNesteAparelho()).toBe(false)
  })

  it('o "Testar a captura" dá o mesmo diagnóstico', async () => {
    instalar([erroDom('NotReadableError')])
    const erro = await falhaDe(probeSystemAudio())
    expect(erro?.code).toBe('AUDIO_DA_TELA_INDISPONIVEL')
  })

  it('cancelar o seletor (NotAllowedError) não repete nem marca falha', async () => {
    const { chamadas } = instalar([erroDom('NotAllowedError', 'Permission denied')])
    const erro = await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn() } as never))
    expect(chamadas).toHaveLength(1)
    expect(erro?.message).toMatch(/cancelado/i)
    expect(audioDaTelaFalhouNesteAparelho()).toBe(false)
  })
})

describe('memória do aparelho', () => {
  it('lembra a falha do áudio da tela e esquece quando a tela/janela volta a entregar áudio', async () => {
    instalar([erroDom('NotReadableError')])
    await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn() } as never))
    expect(audioDaTelaFalhouNesteAparelho()).toBe(true)

    // Uma ABA com áudio não prova nada sobre a tela: a lembrança fica.
    instalar([streamFalso('browser')])
    await falhaDe(probeSystemAudio())
    expect(audioDaTelaFalhouNesteAparelho()).toBe(true)

    // A tela com áudio prova que voltou: esquece.
    instalar([streamFalso('monitor')])
    await falhaDe(probeSystemAudio())
    expect(audioDaTelaFalhouNesteAparelho()).toBe(false)
  })

  it('sem armazenamento (modo privado que lança) a captura segue sem memória', async () => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado')
    }
    try {
      instalar([erroDom('NotReadableError')])
      const erro = await falhaDe(startSystemAudioCapture({ onUtterance: vi.fn() } as never))
      expect(erro?.code).toBe('AUDIO_DA_TELA_INDISPONIVEL')
    } finally {
      Storage.prototype.setItem = orig
    }
  })
})
