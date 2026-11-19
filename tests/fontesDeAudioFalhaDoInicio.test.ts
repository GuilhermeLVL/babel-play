/**
 * A FALHA QUE IMPEDIU A CAPTURA DE COMEÇAR (DISP-03/04, change `modelos-confiaveis-e-offline`):
 *   · um toast só (a captura chamava `onError` E lançava: eram dois, um com "Erro na captura do sistema:");
 *   · sem prefixo técnico, no texto do mapa de falhas;
 *   · um aviso PERSISTENTE (`setFalhaDoInicio`) que fica até a próxima tentativa, e não some em 7 s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ erro: null as Error | null }))

vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(async (cb: { onError?: (e: Error) => void }) => {
    // Como a captura real (`systemAudio.ts`): avisa pelo `onError` e lança.
    cb.onError?.(estado.erro!)
    throw estado.erro
  }),
  startMicCapture: vi.fn(),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

const { criarFontesDeAudio } = await import('../src/lib/captura/fontesDeAudio')

const ref = <T>(current: T) => ({ current })
const handlers = () => ({
  onSpeechStart: vi.fn(),
  onMisfire: vi.fn(),
  onPartialAudio: vi.fn(),
  onUtterance: vi.fn(),
  onFinalEspeculativo: vi.fn(() => null),
  querParcial: vi.fn(() => false),
  intervaloDosParciais: vi.fn(() => 2200),
})

function montar() {
  const d = {
    sysHandlers: handlers(),
    micHandlers: handlers(),
    prepareModels: vi.fn(async () => {}),
    systemSourceRef: ref('display'),
    loopbackDeviceIdRef: ref(''),
    inputDeviceIdRef: ref(''),
    systemCaptureRef: ref(null),
    micCaptureRef: ref(null),
    webSpeechRef: ref(null),
    webSpeechPartialIdRef: ref(null),
    meterRef: ref(null),
    isRecordingRef: ref(true),
    micStartedAtRef: ref(0),
    timerRef: ref(0),
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    micEnabled: false,
    systemEnabled: true,
    micEngine: 'whisper',
    webSpeechSupported: false,
    pushLevel: vi.fn(),
    nowRel: () => 0,
    anchorSessionClock: vi.fn(),
    translateSegment: vi.fn(),
    marcarMicrofone: vi.fn(),
    setSpeechSegments: vi.fn(),
    setFeedbackMsg: vi.fn(),
    setIsFocusMode: vi.fn(),
    setGuiaDeAudio: vi.fn(),
    setModelPrep: vi.fn(),
    setIsRecording: vi.fn(),
    setMicAbrindo: vi.fn(),
    setFalhaDoInicio: vi.fn(),
  }
  const fontes = criarFontesDeAudio(d as unknown as Parameters<typeof criarFontesDeAudio>[0])
  return { fontes, d }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const TECNICO = /Failed to fetch|Worker error|protobuf|ERROR_CODE|Can't create|npm install|Erro na captura do sistema/

describe('compartilhamento negado (DISP-04)', () => {
  it('um toast só, sem prefixo técnico, e o aviso persiste em +30 s', async () => {
    estado.erro = new Error(
      'Compartilhamento cancelado ou bloqueado. Clique novamente e escolha uma ABA/TELA com áudio.',
    )
    const { fontes, d } = montar()
    await fontes.handleStartSystemCapture()

    const toasts = d.setFeedbackMsg.mock.calls.map((c) => c[0] as string).filter(Boolean)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).not.toMatch(TECNICO)

    vi.advanceTimersByTime(30_000)
    const ultimo = d.setFalhaDoInicio.mock.calls.at(-1)?.[0]
    expect(ultimo).toMatchObject({ tipo: 'compartilhamento-negado', acao: { rotulo: 'Escolher de novo' } })
  })

  it('a próxima tentativa limpa o aviso antes de abrir de novo', async () => {
    estado.erro = new Error('Worker error')
    const { fontes, d } = montar()
    await fontes.handleStartSystemCapture()
    expect(d.setFalhaDoInicio.mock.calls[0][0]).toBeNull()
    const falha = d.setFalhaDoInicio.mock.calls.at(-1)?.[0]
    expect(falha.texto).not.toMatch(TECNICO)
    expect(falha.tipo).toBe('worker-indisponivel')
  })
})
