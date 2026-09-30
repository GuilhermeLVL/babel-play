// @vitest-environment jsdom
/**
 * A SESSÃO DO MODO INTÉRPRETE no ciclo da captura (E3 da Fase E):
 *   - começa SEM abrir fonte nenhuma: o microfone só abre no toque de um lado, e o som do computador
 *     não entra (as duas pessoas falam no mesmo microfone);
 *   - "Continuar gravando" do Encerrar não reabre o microfone sozinho;
 *   - o salvamento marca a sessão (`scenario: interprete`) e grava cada fala no idioma do LADO dela,
 *     com a tradução no idioma do outro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  bulkAddCards: vi.fn(async () => ({ cards: [], skipped: [] })),
  criarSessaoEmLotes: vi.fn(async (_p: unknown) => ({ id: 's1', title: 'T' })),
  patchSessionMeta: vi.fn(async () => null),
  substituirFalasEmLotes: vi.fn(),
  updateSession: vi.fn(),
  uploadSessionAudio: vi.fn(async () => null),
}))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ burstFromElement: vi.fn() }))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  ...api,
}))

import { criarSalvarSessao } from '../src/lib/captura/salvarSessao'

const ref = <T>(current: T) => ({ current })

function montar(extra: Record<string, unknown> = {}) {
  const deps = {
    gateway: {
      mt: { warmup: vi.fn(), prepararNativo: vi.fn(async () => {}), translate: vi.fn(async () => ({ text: 'x' })) },
    },
    onSave: vi.fn(),
    recordings: [],
    speechSegments: [
      {
        id: 'a',
        speakerId: 'user',
        source: 'mic',
        timestamp: '00:01',
        originalText: 'bom dia',
        translatedText: 'good morning',
        words: [],
        lado: 'meu',
        lang: 'pt',
      },
      {
        id: 'b',
        speakerId: 'user',
        source: 'mic',
        timestamp: '00:03',
        originalText: 'good morning to you',
        translatedText: 'bom dia para você',
        words: [],
        lado: 'outro',
        lang: 'en',
      },
    ],
    timer: 12,
    sourceLang: 'pt-BR',
    targetLang: 'en-US',
    micEnabled: true,
    systemEnabled: true,
    micEngine: 'browser',
    captureScenario: 'conversation',
    speakerAutoId: true,
    resumeId: null,
    customSessionTitle: 'Conversa',
    customSessionImage: '',
    startMic: vi.fn(async () => {}),
    handleStartSystemCapture: vi.fn(async () => {}),
    systemCaptureRef: ref(null),
    micCaptureRef: ref(null),
    webSpeechRef: ref<unknown>(null),
    webSpeechPartialIdRef: ref(null),
    meterRef: ref(null),
    recordedAudioRef: ref<Blob | null>(null),
    isRecordingRef: ref(false),
    sessionStartMsRef: ref(0),
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
    setIsRecording: vi.fn(),
    setTimer: vi.fn(),
    setSpeechSegments: vi.fn(),
    setIdiomaObservado: vi.fn(),
    setSpeakerIdStatus: vi.fn(),
    setModelPrep: vi.fn(),
    setResumeId: vi.fn(),
    setShowSaveModal: vi.fn(),
    setCustomSessionTitle: vi.fn(),
    setCustomSessionImage: vi.fn(),
    setImgQuery: vi.fn(),
    setFeedbackMsg: vi.fn(),
    setSessaoSalva: vi.fn(),
    setPausado: vi.fn(),
    pausaInicioRef: ref(0),
    soNoToque: () => true,
    ...extra,
  }
  return { ciclo: criarSalvarSessao(deps as never), deps }
}

beforeEach(() => {
  localStorage.clear()
  for (const f of Object.values(api)) f.mockClear()
})

describe('a sessão do intérprete', () => {
  it('começa sem abrir o microfone nem o som do computador, e sem a identificação de voz', () => {
    const { ciclo, deps } = montar({ speechSegments: [] })
    ciclo.handleStartOrResume()
    expect(deps.isRecordingRef.current).toBe(true)
    expect(deps.startMic).not.toHaveBeenCalled()
    expect(deps.handleStartSystemCapture).not.toHaveBeenCalled()
    expect(deps.setSpeakerIdStatus).toHaveBeenCalledWith('off')
    /* Os dois sentidos do tradutor aquecem: as duas pessoas falam. */
    expect(deps.gateway.mt.prepararNativo).toHaveBeenCalledWith(
      [
        ['pt', 'en'],
        ['en', 'pt'],
      ],
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('Continuar gravando não reabre o microfone sozinho', () => {
    const webSpeech = { stop: vi.fn() }
    const { ciclo, deps } = montar({ isRecordingRef: ref(true), webSpeechRef: ref(webSpeech) })
    ciclo.handleStopRecording()
    expect(deps.webSpeechRef.current).toBeNull()
    ciclo.handleCancelStop()
    expect(deps.startMic).not.toHaveBeenCalled()
  })

  it('o salvamento marca o cenário e grava cada lado no idioma dele', async () => {
    const { ciclo } = montar({ cenarioDaSessao: () => 'interprete' })
    await ciclo.handleFinalizeSave(false)
    await vi.waitFor(() => expect(api.criarSessaoEmLotes).toHaveBeenCalled())
    const payload = api.criarSessaoEmLotes.mock.calls[0][0] as {
      utterances: Array<{ sourceLang: string; targetLang: string }>
    }
    expect(payload.utterances.map((u) => [u.sourceLang, u.targetLang])).toEqual([
      ['pt-BR', 'en-US'],
      ['en-US', 'pt-BR'],
    ])
    await vi.waitFor(() => expect(api.patchSessionMeta).toHaveBeenCalledWith('s1', { scenario: 'interprete' }))
  })

  it('fora do intérprete, o salvamento não marca nada', async () => {
    const { ciclo } = montar({ soNoToque: () => false })
    await ciclo.handleFinalizeSave(false)
    await vi.waitFor(() => expect(api.criarSessaoEmLotes).toHaveBeenCalled())
    expect(api.patchSessionMeta).not.toHaveBeenCalled()
  })
})
