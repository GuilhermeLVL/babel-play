// @vitest-environment jsdom
/**
 * REGRESSÃO (2026-09-26): a TELA INTEIRA com áudio no Chrome/Windows passou a falhar com
 * NotReadableError ("Could not start audio source") depois que o getDisplayMedia começou a pedir
 * echoCancellation/noiseSuppression/autoGainControl = false (39f69d7). Pedir o DSP desligado leva o
 * Chrome ao pipeline de áudio SEM processamento, que abre o loopback do WASAPI com os parâmetros
 * nativos do dispositivo; o pedido antigo (DSP padrão) usava o pipeline processado, que funcionava.
 *
 * Contrato: a 1ª tentativa continua rica (ABA ganha o áudio sem DSP); só em NotReadableError /
 * OverconstrainedError a captura repete UMA vez com as constraints que funcionavam antes. O texto
 * longo de "limitação do Windows" só aparece se a repetição também falhar.
 */
import { describe, expect, it, vi } from 'vitest'

import { acquireDisplayStream, startSystemAudioCapture } from '../src/gateway/capture/systemAudio'

function streamFalso(surface: string, comAudio = true) {
  const parar = vi.fn()
  return {
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface: surface }), stop: parar, addEventListener: vi.fn() }],
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

describe('tela inteira: NotReadableError com DSP desligado → repete no modo compatível', () => {
  it('rica → NotReadableError → repete sem as chaves de DSP → devolve o stream', async () => {
    const tela = streamFalso('monitor')
    const { chamadas } = instalar([erroDom('NotReadableError'), tela])
    const aoRepetir = vi.fn()

    const stream = await acquireDisplayStream(aoRepetir)

    expect(stream).toBe(tela)
    expect(chamadas).toHaveLength(2)
    // 1ª: rica (sem DSP de chamada)
    expect(audioDe(chamadas[0]).echoCancellation).toBe(false)
    expect(audioDe(chamadas[0]).noiseSuppression).toBe(false)
    expect(audioDe(chamadas[0]).autoGainControl).toBe(false)
    // 2ª: a que funcionava antes de 39f69d7 — sem NENHUMA chave de DSP, resto igual
    const a2 = audioDe(chamadas[1])
    expect('echoCancellation' in a2).toBe(false)
    expect('noiseSuppression' in a2).toBe(false)
    expect('autoGainControl' in a2).toBe(false)
    expect(a2.suppressLocalAudioPlayback).toBe(false)
    expect(chamadas[1].systemAudio).toBe('include')
    expect(chamadas[1].monitorTypeSurfaces).toBe('include')
    expect(aoRepetir).toHaveBeenCalledTimes(1)
  })

  it('OverconstrainedError na 1ª também repete', async () => {
    const tela = streamFalso('monitor')
    const { chamadas } = instalar([erroDom('OverconstrainedError', ''), tela])
    await expect(acquireDisplayStream()).resolves.toBe(tela)
    expect(chamadas).toHaveLength(2)
  })

  it('ABA: uma chamada só, com as constraints ricas', async () => {
    const aba = streamFalso('browser')
    const { chamadas } = instalar([aba])
    await expect(acquireDisplayStream()).resolves.toBe(aba)
    expect(chamadas).toHaveLength(1)
    expect(audioDe(chamadas[0]).echoCancellation).toBe(false)
    expect(audioDe(chamadas[0]).noiseSuppression).toBe(false)
    expect(audioDe(chamadas[0]).autoGainControl).toBe(false)
  })

  it('cancelar o seletor (NotAllowedError) NÃO repete', async () => {
    const { chamadas } = instalar([erroDom('NotAllowedError', 'Permission denied')])
    await expect(acquireDisplayStream()).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(chamadas).toHaveLength(1)
  })

  it('pelo fluxo da captura: a repetição que obtém o stream NÃO mostra o texto de limitação do Windows', async () => {
    // Stream sem áudio → cai no erro tipado de "não marcou o áudio", prova de que passou da aquisição.
    const { chamadas } = instalar([erroDom('NotReadableError'), streamFalso('monitor', false)])
    const onStatus = vi.fn()
    const erro = await startSystemAudioCapture({ onUtterance: vi.fn(), onStatus } as never).then(
      () => null,
      (e: Error & { code?: string }) => e,
    )
    expect(chamadas).toHaveLength(2)
    expect(erro?.code).toBe('SEM_AUDIO_COMPARTILHADO')
    expect(erro?.message).not.toMatch(/O Windows não conseguiu/)
    expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/de novo/i))
  })

  it('a repetição também falha com NotReadableError → mantém a mensagem de limitação do Windows', async () => {
    const { chamadas } = instalar([erroDom('NotReadableError'), erroDom('NotReadableError')])
    const erro = await startSystemAudioCapture({ onUtterance: vi.fn() } as never).then(
      () => null,
      (e: Error) => e,
    )
    expect(chamadas).toHaveLength(2)
    expect(erro?.message).toMatch(/O Windows não conseguiu INICIAR a captura do áudio da TELA/)
  })

  it('a repetição sem gesto do usuário (InvalidStateError): pede novo clique e a PRÓXIMA já vai no modo compatível', async () => {
    const { chamadas } = instalar([erroDom('NotReadableError'), erroDom('InvalidStateError', 'no activation')])
    const erro = await startSystemAudioCapture({ onUtterance: vi.fn() } as never).then(
      () => null,
      (e: Error) => e,
    )
    expect(chamadas).toHaveLength(2)
    expect(erro?.message).toMatch(/clique/i)
    expect(erro?.message).not.toMatch(/O Windows não conseguiu/)

    // Novo clique: vai direto nas constraints compatíveis (uma chamada só)…
    const tela = streamFalso('monitor')
    const segunda = instalar([tela])
    await expect(acquireDisplayStream()).resolves.toBe(tela)
    expect(segunda.chamadas).toHaveLength(1)
    expect('echoCancellation' in audioDe(segunda.chamadas[0])).toBe(false)

    // …e o modo compatível foi de UMA vez: a seguinte volta às ricas (não piora a ABA).
    const terceira = instalar([streamFalso('browser')])
    await acquireDisplayStream()
    expect(audioDe(terceira.chamadas[0]).echoCancellation).toBe(false)
  })
})
