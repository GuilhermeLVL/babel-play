/**
 * O MICROFONE ABRE DE VERDADE ANTES DE A TELA DIZER "OUVINDO…" — a costura em `fontesDeAudio.ts`
 * (relato do dono no celular, 2026-09-28):
 *   · Rápido (Web Speech): `aoAbrirFonte` só com o `onaudiostart`; o erro fatal encerra a sessão, vai
 *     ao `aoFalharMicrofone` com `motorRapido` e desliga a gravação (era só `clog`);
 *   · no celular (`semMedidorParalelo`), nenhum segundo `getUserMedia` para o medidor: o indicador
 *     segue o som que a Web Speech anuncia;
 *   · Privado (Whisper): `aoAbrirFonte` depois do `getUserMedia` + VAD; a falha vai à ajuda; o
 *     contexto de áudio do clique chega à captura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  abrirMic: null as null | (() => Promise<unknown>),
  opcoesDoMic: null as null | Record<string, unknown>,
}))

vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(),
  startMicCapture: vi.fn(async (_id: unknown, _cb: unknown, opcoes: Record<string, unknown>) => {
    estado.opcoesDoMic = opcoes
    return estado.abrirMic!()
  }),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

const { criarFontesDeAudio } = await import('../src/lib/captura/fontesDeAudio')
const { abrirContextoDoClique } = await import('../src/lib/captura/contextoDoClique')

class ReconhecedorFalso {
  static ultimo: ReconhecedorFalso | null = null
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onsoundstart: (() => void) | null = null
  onsoundend: (() => void) | null = null
  constructor() {
    ReconhecedorFalso.ultimo = this
  }
  start() {}
  stop() {}
  abort() {}
}

const ref = <T>(current: T) => ({ current })
const handlers = () => ({
  onSpeechStart: vi.fn(),
  onMisfire: vi.fn(),
  onPartialAudio: vi.fn(),
  onUtterance: vi.fn(),
  onFinalEspeculativo: vi.fn(() => null),
})

function montar(escolha: 'rapido' | 'privado', extra: Record<string, unknown> = {}) {
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
    micEnabled: true,
    systemEnabled: false,
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
    consentiuNavegador: () => escolha === 'rapido',
    rapidoPermitido: () => true,
    escolhaDoMic: () => escolha,
    perfilId: () => 'hybrid',
    aoAbrirFonte: vi.fn(),
    aoFalharMicrofone: vi.fn(),
    semMedidorParalelo: true,
    ...extra,
  }
  const fontes = criarFontesDeAudio(d as unknown as Parameters<typeof criarFontesDeAudio>[0])
  return { fontes, d }
}

const getUserMedia = vi.fn(async () => ({ getTracks: () => [] }))

beforeEach(() => {
  ReconhecedorFalso.ultimo = null
  estado.abrirMic = null
  estado.opcoesDoMic = null
  getUserMedia.mockClear()
  vi.stubGlobal('window', { SpeechRecognition: ReconhecedorFalso })
  vi.stubGlobal('SpeechRecognition', ReconhecedorFalso)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('microfone pelo Rápido (Web Speech)', () => {
  it('a fonte só "abre" com o onaudiostart; nenhum segundo getUserMedia no celular', async () => {
    const { fontes, d } = montar('rapido')
    await fontes.startMic()
    expect(ReconhecedorFalso.ultimo).not.toBeNull()
    expect(d.aoAbrirFonte).not.toHaveBeenCalled()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    expect(d.aoAbrirFonte).toHaveBeenCalledWith('mic')
    expect(d.anchorSessionClock).toHaveBeenCalledWith(expect.any(Number), 'mic')
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('o tradutor da fala começa a carregar quando o áudio ABRE (não na primeira legenda)', async () => {
    const prepararTradutorDaFala = vi.fn()
    const { fontes } = montar('rapido', { prepararTradutorDaFala })
    await fontes.startMic()
    expect(prepararTradutorDaFala).not.toHaveBeenCalled()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    expect(prepararTradutorDaFala).toHaveBeenCalledTimes(1)
  })

  it('com o áudio do sistema ligado, quem prepara o tradutor é a preparação do sistema', async () => {
    const prepararTradutorDaFala = vi.fn()
    const { fontes } = montar('rapido', { prepararTradutorDaFala, systemEnabled: true })
    await fontes.startMic()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    expect(prepararTradutorDaFala).not.toHaveBeenCalled()
  })

  it('o som anunciado anima o indicador (sem medidor paralelo)', async () => {
    vi.useFakeTimers()
    const { fontes, d } = montar('rapido')
    await fontes.startMic()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    ReconhecedorFalso.ultimo!.onsoundstart?.()
    vi.advanceTimersByTime(350)
    expect(d.pushLevel).toHaveBeenCalled()
    d.pushLevel.mockClear()
    ReconhecedorFalso.ultimo!.onsoundend?.()
    vi.advanceTimersByTime(350)
    expect(d.pushLevel).not.toHaveBeenCalled()
  })

  it('no desktop (com medidor), o medidor abre depois do áudio', async () => {
    const { fontes } = montar('rapido', { semMedidorParalelo: false })
    await fontes.startMic()
    expect(getUserMedia).not.toHaveBeenCalled()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    expect(getUserMedia).toHaveBeenCalled()
  })

  it.each(['not-allowed', 'service-not-allowed', 'audio-capture', 'network'])(
    'erro fatal %s: ajuda com motorRapido, sessão encerrada, gravação desligada',
    async (codigo) => {
      const { fontes, d } = montar('rapido')
      await fontes.startMic()
      ReconhecedorFalso.ultimo!.onerror?.({ error: codigo })
      expect(d.aoFalharMicrofone).toHaveBeenCalledTimes(1)
      const [erro, o] = d.aoFalharMicrofone.mock.calls[0] as [{ codigo?: string }, { motorRapido: boolean }]
      expect(erro.codigo).toBe(codigo)
      expect(o.motorRapido).toBe(true)
      expect(d.webSpeechRef.current).toBeNull()
      expect(d.setIsRecording).toHaveBeenCalledWith(false)
      expect(d.isRecordingRef.current).toBe(false)
      expect(d.aoAbrirFonte).not.toHaveBeenCalled()
    },
  )

  it('no-speech é aviso: a sessão segue', async () => {
    const { fontes, d } = montar('rapido')
    await fontes.startMic()
    ReconhecedorFalso.ultimo!.onaudiostart?.()
    ReconhecedorFalso.ultimo!.onerror?.({ error: 'no-speech' })
    expect(d.aoFalharMicrofone).not.toHaveBeenCalled()
    expect(d.webSpeechRef.current).not.toBeNull()
    expect(d.setFeedbackMsg).toHaveBeenCalledWith(expect.stringMatching(/Não ouvi nada/))
  })

  it('o áudio que nunca abre vira falha "sem-audio" no prazo (a tela não fica em Abrindo para sempre)', async () => {
    vi.useFakeTimers()
    const { fontes, d } = montar('rapido')
    await fontes.startMic()
    vi.advanceTimersByTime(21_000)
    expect(d.aoFalharMicrofone).toHaveBeenCalledTimes(1)
    expect((d.aoFalharMicrofone.mock.calls[0][0] as { codigo?: string }).codigo).toBe('sem-audio')
  })

  it('o erro depois de a pessoa mutar não é notícia', async () => {
    const { fontes, d } = montar('rapido')
    await fontes.startMic()
    const rec = ReconhecedorFalso.ultimo!
    d.webSpeechRef.current = null // o mudo/pausa encerra o reconhecedor
    rec.onerror?.({ error: 'network' })
    expect(d.aoFalharMicrofone).not.toHaveBeenCalled()
  })
})

describe('microfone pelo Privado (Whisper)', () => {
  it('abre depois do getUserMedia + VAD, com o contexto do clique', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running'
        resume = vi.fn(async () => {})
        close = vi.fn(async () => {})
      },
    )
    const ctx = abrirContextoDoClique()
    estado.abrirMic = async () => ({ startedAtMs: 5, setMuted: vi.fn(), setPaused: vi.fn(), stop: vi.fn() })
    const { fontes, d } = montar('privado')
    await fontes.startMic()
    expect(estado.opcoesDoMic?.audioContext).toBe(ctx)
    expect(d.aoAbrirFonte).toHaveBeenCalledWith('mic')
  })

  it('permissão negada: a ajuda (sem "Trocar para Privado"), a gravação desliga', async () => {
    estado.abrirMic = async () => {
      throw Object.assign(new Error('Permissão do microfone negada.'), { nomeDoErro: 'NotAllowedError' })
    }
    const { fontes, d } = montar('privado')
    await fontes.startMic()
    expect(d.aoFalharMicrofone).toHaveBeenCalledWith(expect.objectContaining({ nomeDoErro: 'NotAllowedError' }), {
      motorRapido: false,
    })
    expect(d.aoAbrirFonte).not.toHaveBeenCalled()
    expect(d.setIsRecording).toHaveBeenCalledWith(false)
  })
})
