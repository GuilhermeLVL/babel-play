// @vitest-environment jsdom
/**
 * O CICLO "PARAR → ENCERRAR → CONTINUAR/SALVAR" DA CAPTURA (protótipo, C8).
 *
 * Com falas na tela, "Parar" PAUSA as fontes (não as encerra) e abre o Encerrar. "Continuar
 * gravando" retoma as MESMAS fontes, sem pedir o compartilhamento de novo e sem perder o áudio de
 * antes, e o relógio das legendas pula o trecho pausado. Salvar encerra as fontes e só então grava.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ burstFromElement: vi.fn() }))
vi.mock('../src/data/api', () => ({
  bulkAddCards: vi.fn(async () => ({ cards: [], skipped: [] })),
  createSession: vi.fn(async () => ({ id: 's1', title: 'T' })),
  patchSessionMeta: vi.fn(),
  replaceSessionUtterances: vi.fn(),
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
    await ciclo.handleStopRecording()
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
    await ciclo.handleStopRecording()
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

  it('Salvar a partir do Encerrar encerra a fonte, guarda o áudio e só então grava', async () => {
    const { ciclo, sistema, estado, deps } = montar()
    await ciclo.handleStopRecording()
    await ciclo.handleFinalizeSave(false)
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(deps.systemCaptureRef.current).toBeNull()
    expect(estado.gravando).toBe(false)
    expect(deps.onSave).toHaveBeenCalledTimes(1)
    const api = await import('../src/data/api')
    expect(api.uploadSessionAudio).toHaveBeenCalled()
  })

  it('sem fala nenhuma, Parar encerra a fonte e não abre o Encerrar', async () => {
    const { ciclo, sistema, estado } = montar(0)
    await ciclo.handleStopRecording()
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(estado.modal).toBe(false)
    expect(estado.gravando).toBe(false)
  })

  it('descartar de dentro da pausa fecha a fonte de verdade', async () => {
    const { ciclo, sistema, deps } = montar()
    await ciclo.handleStopRecording()
    await ciclo.encerrarFontes()
    expect(sistema.stop).toHaveBeenCalledTimes(1)
    expect(deps.isRecordingRef.current).toBe(false)
  })
})
