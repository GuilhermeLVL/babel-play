// @vitest-environment jsdom
/**
 * O CICLO "PARAR → ENCERRAR → CONTINUAR/SALVAR" DA CAPTURA (protótipo, C8).
 *
 * Com falas na tela, "Parar" PAUSA as fontes (não as encerra) e abre o Encerrar. "Continuar
 * gravando" retoma as MESMAS fontes, sem pedir o compartilhamento de novo e sem perder o áudio de
 * antes, e o relógio das legendas pula o trecho pausado.
 *
 * SALVAR (relato do dono, 2026-09-28: "encerrar trava e eu fico preso"): a tela para NA HORA, antes
 * de qualquer espera, e o TEXTO é salvo sem esperar o áudio — um gravador que não devolve o áudio
 * não segura nem a sessão nem a navegação. O áudio sobe depois, quando chega.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ burstFromElement: vi.fn() }))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  bulkAddCards: vi.fn(async () => ({ cards: [], skipped: [] })),
  criarSessaoEmLotes: vi.fn(async () => ({ id: 's1', title: 'T' })),
  patchSessionMeta: vi.fn(),
  substituirFalasEmLotes: vi.fn(),
  updateSession: vi.fn(),
  uploadSessionAudio: vi.fn(async () => '/audio.webm'),
}))

import { criarSalvarSessao } from '../src/lib/captura/salvarSessao'

const ref = <T>(current: T) => ({ current })

function fonte() {
  return {
    startedAtMs: 1000,
    setMuted: vi.fn(),
    setPaused: vi.fn(),
    stop: vi.fn(async () => new Blob(['a'], { type: 'audio/webm' })),
  }
}

function montar(nFalas = 2) {
  const sistema = fonte()
  const estado = {
    modal: false,
    pausado: false,
    gravando: true,
  }
  const deps = {
    gateway: { mt: { warmup: vi.fn(), prepararNativo: vi.fn(async () => {}), translate: vi.fn() } },
    onSave: vi.fn(),
    recordings: [],
    speechSegments: Array.from({ length: nFalas }, (_, i) => ({
      id: `f${i}`,
      speakerId: 'system',
      source: 'system',
      timestamp: '00:01',
      originalText: 'hello there',
      translatedText: 'olá',
      words: [],
      isPartial: false,
    })),
    timer: 12,
    sourceLang: 'pt-BR',
    targetLang: 'en-US',
    micEnabled: false,
    systemEnabled: true,
    micEngine: 'whisper',
    captureScenario: 'media',
    speakerAutoId: false,
    resumeId: null,
    customSessionTitle: 'Minha sessão',
    customSessionImage: '',
    startMic: vi.fn(async () => {}),
    handleStartSystemCapture: vi.fn(async () => {}),
    systemCaptureRef: ref<ReturnType<typeof fonte> | null>(sistema),
    micCaptureRef: ref(null),
    webSpeechRef: ref(null),
    webSpeechPartialIdRef: ref(null),
    meterRef: ref(null),
    recordedAudioRef: ref<Blob | null>(null),
    isRecordingRef: ref(true),
    sessionStartMsRef: ref(5000),
    shouldAnchorClockRef: ref(false),
    micStartedAtRef: ref(0),
    partialIdRef: ref(null),
    seqToSegmentRef: ref(new Map()),
    lastPartialTextRef: ref(new Map()),
    ordemMtRef: ref({ limpar: vi.fn() }),
    clustererRef: ref({ reset: vi.fn() }),
    dominantLangRef: ref({ reset: vi.fn() }),
    perfilIdiomaRef: ref({ reset: vi.fn() }),
    altTargetNotifiedRef: ref(false),
    lastVoiceIdRef: ref(null),
    provisionalUttsRef: ref(new Map()),
    speakerProfilesRef: ref([]),
    setIsRecording: vi.fn((v: boolean) => {
      estado.gravando = v
    }),
    setTimer: vi.fn(),
    setSpeechSegments: vi.fn(),
    setIdiomaObservado: vi.fn(),
    setSpeakerIdStatus: vi.fn(),
    setModelPrep: vi.fn(),
    setResumeId: vi.fn(),
    setShowSaveModal: vi.fn((v: boolean) => {
      estado.modal = v
    }),
    setCustomSessionTitle: vi.fn(),
    setCustomSessionImage: vi.fn(),
    setImgQuery: vi.fn(),
    setFeedbackMsg: vi.fn(),
    setSessaoSalva: vi.fn(),
    setPausado: vi.fn((v: boolean) => {
      estado.pausado = v
    }),
    pausaInicioRef: ref(0),
  }
  const ciclo = criarSalvarSessao(deps as never)
  return { ciclo, deps, sistema, estado }
}

describe('Parar abre o Encerrar com a gravação de pé', () => {
  it('com falas, Parar PAUSA a fonte (não encerra) e abre o Encerrar', async () => {
    const { ciclo, sistema, estado, deps } = montar()
    ciclo.handleStopRecording()
    expect(sistema.setPaused).toHaveBeenCalledWith(true)
    expect(sistema.stop).not.toHaveBeenCalled()
    expect(estado.modal).toBe(true)
    expect(estado.pausado).toBe(true)
    expect(estado.gravando).toBe(true)
    expect(deps.systemCaptureRef.current).toBe(sistema)
  })

  it('Continuar gravando retoma a MESMA fonte, sem reabrir o compartilhamento, e o relógio pula a pausa', async () => {
    const { ciclo, sistema, estado, deps } = montar()
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    ciclo.handleStopRecording()
    vi.setSystemTime(103_000) // 3 s com o Encerrar aberto
    ciclo.handleCancelStop()
    vi.useRealTimers()
    expect(sistema.setPaused).toHaveBeenLastCalledWith(false)
    expect(deps.handleStartSystemCapture).not.toHaveBeenCalled()
    expect(sistema.stop).not.toHaveBeenCalled()
    expect(deps.sessionStartMsRef.current).toBe(5000 + 3000)
    expect(estado.modal).toBe(false)
    expect(estado.pausado).toBe(false)
  })

  it('Salvar encerra a fonte NA HORA (antes de qualquer espera), salva e sobe o áudio', async () => {
    const { ciclo, sistema, estado, deps } = montar()
    ciclo.handleStopRecording()
    const salvando = ciclo.handleFinalizeSave(false)
    // Síncrono: a tela já está parada quando o Salvar volta.
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(deps.systemCaptureRef.current).toBeNull()
    expect(estado.gravando).toBe(false)
    expect(estado.modal).toBe(false)
    await salvando
    expect(deps.onSave).toHaveBeenCalledTimes(1)
    const api = await import('../src/data/api')
    expect(api.uploadSessionAudio).toHaveBeenCalled()
  })

  it('um gravador que nunca devolve o áudio não segura o salvamento do texto', async () => {
    const { ciclo, sistema, deps } = montar()
    sistema.stop.mockImplementation(() => new Promise<Blob>(() => {}))
    ciclo.handleStopRecording()
    let navegou = false
    deps.onSave.mockImplementation(() => {
      navegou = true
    })
    void ciclo.handleFinalizeSave(true)
    await vi.waitFor(() => expect(navegou).toBe(true), { timeout: 2000 })
    const api = await import('../src/data/api')
    expect(api.criarSessaoEmLotes).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Minha sessão', origemLocalId: expect.stringMatching(/^captura-/) }),
      expect.any(Function),
    )
  })

  it('uma recusa NÃO reabre o Encerrar (era o laço sem saída)', async () => {
    const { ciclo, estado } = montar()
    const api = await import('../src/data/api')
    vi.mocked(api.criarSessaoEmLotes).mockRejectedValueOnce(new api.ErroDeSessao('limite', 507, 'TETO_ANONIMO'))
    ciclo.handleStopRecording()
    await ciclo.handleFinalizeSave(false)
    expect(estado.modal).toBe(false)
  })

  it('a fala que chega DEPOIS do Salvar (em voo) entra na sessão', async () => {
    const { ciclo, deps } = montar(1)
    const falas = [...deps.speechSegments, { ...deps.speechSegments[0], id: 'voo', originalText: '', isPartial: true }]
    const lerFalas = () => falas
    const ciclo2 = criarSalvarSessao({ ...deps, lerFalas } as never)
    void ciclo
    setTimeout(() => {
      falas[1] = { ...falas[1], originalText: 'the late one', isPartial: false }
    }, 50)
    ciclo2.handleStopRecording()
    await ciclo2.handleFinalizeSave(false)
    const api = await import('../src/data/api')
    const payload = vi.mocked(api.criarSessaoEmLotes).mock.calls.at(-1)![0] as {
      utterances: Array<{ sourceText: string }>
    }
    expect(payload.utterances.map((u) => u.sourceText)).toEqual(['hello there', 'the late one'])
  })

  it('no teto sem conta, Iniciar não começa uma captura: avisa', () => {
    const { deps } = montar(0)
    const aoTetoAtingido = vi.fn()
    const ciclo = criarSalvarSessao({
      ...deps,
      isRecordingRef: ref(false),
      tetoAtingido: true,
      aoTetoAtingido,
    } as never)
    ciclo.handleStartOrResume()
    expect(aoTetoAtingido).toHaveBeenCalled()
    expect(deps.setIsRecording).not.toHaveBeenCalled()
  })

  it('sem fala nenhuma, Parar encerra a fonte e não abre o Encerrar', async () => {
    const { ciclo, sistema, estado } = montar(0)
    ciclo.handleStopRecording()
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(estado.modal).toBe(false)
    expect(estado.gravando).toBe(false)
  })

  it('descartar de dentro da pausa fecha a fonte de verdade', async () => {
    const { ciclo, sistema, deps } = montar()
    ciclo.handleStopRecording()
    await ciclo.encerrarFontes()
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(deps.isRecordingRef.current).toBe(false)
  })
})

/* O PAUSAR DA TELA ENXUTA (protótipo `telas-enxutas`, `pausarOuRetomar()` de `enxuto.js:125-139`): o
   botão ao lado do Encerrar usa a MESMA pausa das fontes, sem o diálogo. */
describe('Pausar e Retomar pelo botão da tela', () => {
  it('Pausar pausa a MESMA fonte e para o relógio, sem encerrar nem abrir o Encerrar', () => {
    const { ciclo, sistema, estado, deps } = montar()
    expect(ciclo.pausarCaptura()).toBe(true)
    expect(sistema.setPaused).toHaveBeenCalledWith(true)
    expect(sistema.stop).not.toHaveBeenCalled()
    expect(estado.pausado).toBe(true)
    expect(estado.modal).toBe(false)
    expect(estado.gravando).toBe(true)
    expect(deps.systemCaptureRef.current).toBe(sistema)
    // Já pausada: o segundo toque não é outra pausa.
    expect(ciclo.pausarCaptura()).toBe(false)
  })

  it('Retomar volta a ouvir a MESMA fonte, e o relógio das legendas pula o trecho pausado', () => {
    const { ciclo, sistema, estado, deps } = montar()
    vi.useFakeTimers()
    vi.setSystemTime(200_000)
    ciclo.pausarCaptura()
    vi.setSystemTime(207_000) // 7 s pausada
    expect(ciclo.retomarCaptura()).toBe(true)
    vi.useRealTimers()
    expect(sistema.setPaused).toHaveBeenLastCalledWith(false)
    expect(deps.handleStartSystemCapture).not.toHaveBeenCalled()
    expect(deps.sessionStartMsRef.current).toBe(5000 + 7000)
    expect(estado.pausado).toBe(false)
    // Sem pausa em curso não há o que retomar.
    expect(ciclo.retomarCaptura()).toBe(false)
  })

  it('pausada pelo botão, o Encerrar não recomeça a conta da pausa; "Continuar gravando" retoma tudo', () => {
    const { ciclo, sistema, estado, deps } = montar()
    vi.useFakeTimers()
    vi.setSystemTime(300_000)
    ciclo.pausarCaptura()
    vi.setSystemTime(304_000) // 4 s pausada, e então Encerrar
    ciclo.handleStopRecording()
    expect(estado.modal).toBe(true)
    expect(sistema.stop).not.toHaveBeenCalled()
    vi.setSystemTime(306_000) // mais 2 s com o Encerrar aberto
    ciclo.handleCancelStop()
    vi.useRealTimers()
    // O relógio pula a pausa INTEIRA (6 s), não só o tempo do diálogo.
    expect(deps.sessionStartMsRef.current).toBe(5000 + 6000)
    expect(sistema.setPaused).toHaveBeenLastCalledWith(false)
    expect(estado.pausado).toBe(false)
  })

  it('o microfone do navegador (sem áudio a preservar) é encerrado na pausa e reabre na retomada', () => {
    const { deps } = montar()
    const reconhecedor = { stop: vi.fn() }
    const ciclo = criarSalvarSessao({
      ...deps,
      micEnabled: true,
      systemCaptureRef: ref(null),
      webSpeechRef: ref(reconhecedor),
    } as never)
    expect(ciclo.pausarCaptura()).toBe(true)
    expect(reconhecedor.stop).toHaveBeenCalledTimes(1)
    expect(deps.startMic).not.toHaveBeenCalled()
    ciclo.retomarCaptura()
    expect(deps.startMic).toHaveBeenCalledTimes(1)
  })

  it('fora de uma gravação não há o que pausar', () => {
    const { deps, sistema } = montar()
    const ciclo = criarSalvarSessao({ ...deps, isRecordingRef: ref(false) } as never)
    expect(ciclo.pausarCaptura()).toBe(false)
    expect(sistema.setPaused).not.toHaveBeenCalled()
    expect(deps.setPausado).not.toHaveBeenCalled()
  })
})
