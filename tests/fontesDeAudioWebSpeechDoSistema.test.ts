/**
 * A CAPTURA DA ABA COM A WEB SPEECH NO APARELHO — a costura em `fontesDeAudio.ts`: quem recebe o que
 * o VAD entrega, e quando o Whisper é preparado.
 *   · decisão "caminho de sempre": `prepareModels()` na hora, VAD → pipeline (como antes);
 *   · decisão "no aparelho" e a Web Speech abriu: o VAD NÃO vai ao pipeline (vira o fiscal do teste),
 *     o Whisper não é pedido (`sistemaNoNavegador`), o selo muda;
 *   · a Web Speech caiu: o pipeline volta a receber o VAD e `prepareModels()` chama o Whisper;
 *   · a Web Speech não abriu com a trilha: caminho de sempre, com o que o VAD guardou na espera.
 * A captura e o controlador são falsos (`vi.mock`): o que se prende aqui é o roteamento.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SystemAudioCallbacks } from '../src/gateway/capture/systemAudio'

const estado = vi.hoisted(() => ({
  cb: null as SystemAudioCallbacks | null,
  controle: null as null | { falaComecou: ReturnType<typeof vi.fn>; falaTerminou: ReturnType<typeof vi.fn>; pausar: ReturnType<typeof vi.fn>; parar: ReturnType<typeof vi.fn> },
  aoCair: null as null | ((m: string) => void),
  abre: true,
  opcoesDoNavegador: null as unknown,
}))

vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(async (cb: SystemAudioCallbacks) => {
    estado.cb = cb
    return {
      startedAtMs: 1,
      trilhaDeAudio: { kind: 'audio' },
      setMuted: vi.fn(),
      setPaused: vi.fn(),
      stop: vi.fn(async () => null),
    }
  }),
  startMicCapture: vi.fn(),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

vi.mock('../src/lib/captura/webSpeechDoSistema', () => ({
  iniciarWebSpeechDoSistema: vi.fn((o: { aoCair: (m: string) => void }) => {
    estado.opcoesDoNavegador = o
    if (!estado.abre) return null
    estado.aoCair = o.aoCair
    estado.controle = { falaComecou: vi.fn(), falaTerminou: vi.fn(), pausar: vi.fn(), parar: vi.fn() }
    return estado.controle
  }),
}))

const { criarFontesDeAudio } = await import('../src/lib/captura/fontesDeAudio')

function handlers() {
  return {
    onSpeechStart: vi.fn(),
    onMisfire: vi.fn(),
    onPartialAudio: vi.fn(),
    onUtterance: vi.fn(),
    onFinalEspeculativo: vi.fn(() => null),
  }
}

const ref = <T,>(current: T) => ({ current })

function montar(motor: 'web-speech-local' | 'pipeline', extra: Record<string, unknown> = {}) {
  const sysHandlers = handlers()
  const prepareModels = vi.fn(async () => {})
  const aoMudarMotorDoSistema = vi.fn()
  const systemCaptureRef = ref<unknown>(null)
  const fontes = criarFontesDeAudio({
    sysHandlers,
    micHandlers: handlers(),
    prepareModels,
    decidirMotorDoSistema: async () => ({ motor, motivo: motor === 'pipeline' ? 'nuvem-primeiro' : 'no-aparelho' }),
    aoMudarMotorDoSistema,
    systemSourceRef: ref('display'),
    loopbackDeviceIdRef: ref(''),
    inputDeviceIdRef: ref(''),
    systemCaptureRef,
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
    micEngine: 'browser',
    webSpeechSupported: true,
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
    ...extra,
  } as unknown as Parameters<typeof criarFontesDeAudio>[0])
  return { fontes, sysHandlers, prepareModels, aoMudarMotorDoSistema, systemCaptureRef }
}

const PCM = new Float32Array(16)

beforeEach(() => {
  estado.cb = null
  estado.controle = null
  estado.aoCair = null
  estado.abre = true
  estado.opcoesDoNavegador = null
})

describe('captura da aba × Web Speech no aparelho (fontesDeAudio)', () => {
  it('caminho de sempre: prepara o Whisper e o VAD vai ao pipeline', async () => {
    const m = montar('pipeline')
    await m.fontes.handleStartSystemCapture()
    expect(m.prepareModels).toHaveBeenCalledWith()
    estado.cb!.onSpeechStart!(1)
    estado.cb!.onUtterance(PCM, 16000, 1)
    expect(m.sysHandlers.onSpeechStart).toHaveBeenCalledWith(1)
    expect(m.sysHandlers.onUtterance).toHaveBeenCalled()
    expect(m.aoMudarMotorDoSistema).toHaveBeenLastCalledWith('pipeline')
  })

  it('no aparelho: a Web Speech ouve a trilha e o idioma do CONTEÚDO; o VAD só fiscaliza; o Whisper não é pedido', async () => {
    const m = montar('web-speech-local')
    await m.fontes.handleStartSystemCapture()
    expect(estado.opcoesDoNavegador).toMatchObject({ lang: 'en-US', trilha: { kind: 'audio' } })
    expect(m.prepareModels).toHaveBeenCalledTimes(1)
    expect(m.prepareModels).toHaveBeenCalledWith({ sistemaNoNavegador: true })
    expect(m.aoMudarMotorDoSistema).toHaveBeenLastCalledWith('web-speech-local')
    estado.cb!.onSpeechStart!(1)
    estado.cb!.onPartialAudio!(PCM, 16000, 1)
    expect(estado.cb!.onFinalEspeculativo!(PCM, 16000, 1)).toBeNull()
    estado.cb!.onUtterance(PCM, 16000, 1)
    expect(estado.controle!.falaComecou).toHaveBeenCalled()
    expect(estado.controle!.falaTerminou).toHaveBeenCalled()
    expect(m.sysHandlers.onSpeechStart).not.toHaveBeenCalled()
    expect(m.sysHandlers.onPartialAudio).not.toHaveBeenCalled()
    expect(m.sysHandlers.onUtterance).not.toHaveBeenCalled()
  })

  it('a Web Speech caiu: o pipeline volta a receber o VAD e o Whisper é preparado', async () => {
    const m = montar('web-speech-local')
    await m.fontes.handleStartSystemCapture()
    estado.aoCair!('sem-resultado')
    await vi.waitFor(() => expect(m.prepareModels).toHaveBeenLastCalledWith())
    expect(m.aoMudarMotorDoSistema).toHaveBeenLastCalledWith('pipeline')
    estado.cb!.onUtterance(PCM, 16000, 2)
    expect(m.sysHandlers.onUtterance).toHaveBeenCalled()
  })

  it('a Web Speech não abriu com a trilha: caminho de sempre', async () => {
    estado.abre = false
    const m = montar('web-speech-local')
    await m.fontes.handleStartSystemCapture()
    expect(m.prepareModels).toHaveBeenCalledWith()
    expect(m.prepareModels).not.toHaveBeenCalledWith({ sistemaNoNavegador: true })
    estado.cb!.onUtterance(PCM, 16000, 3)
    expect(m.sysHandlers.onUtterance).toHaveBeenCalled()
  })

  it('parar/pausar a captura faz o mesmo com o reconhecedor; parar tira o selo', async () => {
    const m = montar('web-speech-local')
    await m.fontes.handleStartSystemCapture()
    const cap = m.systemCaptureRef.current as { setPaused(p: boolean): void; stop(): Promise<unknown> }
    cap.setPaused(true)
    expect(estado.controle!.pausar).toHaveBeenCalledWith(true)
    await cap.stop()
    expect(estado.controle!.parar).toHaveBeenCalled()
    expect(m.aoMudarMotorDoSistema).toHaveBeenLastCalledWith(null)
  })

  it('sem `decidirMotorDoSistema` (quem ainda não passa a decisão): exatamente como antes', async () => {
    const m = montar('pipeline', { decidirMotorDoSistema: undefined })
    await m.fontes.handleStartSystemCapture()
    expect(m.prepareModels).toHaveBeenCalledWith()
    estado.cb!.onUtterance(PCM, 16000, 1)
    expect(m.sysHandlers.onUtterance).toHaveBeenCalled()
  })
})
