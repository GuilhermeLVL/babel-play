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
  cbDoMic: null as null | Record<string, unknown>,
}))

vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(),
  startMicCapture: vi.fn(async (_id: unknown, cb: Record<string, unknown>, opcoes: Record<string, unknown>) => {
    estado.cbDoMic = cb
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
  querParcial: vi.fn(() => false),
  intervaloDosParciais: vi.fn(() => 2200),
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
  estado.cbDoMic = null
  getUserMedia.mockClear()
  vi.stubGlobal('window', { SpeechRecognition: ReconhecedorFalso })
  vi.stubGlobal('SpeechRecognition', ReconhecedorFalso)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/* A PAUSA PEDIDA PELA PESSOA (o Pausar da tela enxuta): a tela diz "nada está sendo ouvido", então uma
   fonte pedida no meio da pausa não pode nascer ouvindo. O microfone abre na retomada (`retomarFontes`). */
describe('com a captura pausada, nenhuma fonte nova abre', () => {
  it('o microfone pedido durante a pausa não abre (nem pelo navegador, nem pelo Whisper)', async () => {
    for (const escolha of ['rapido', 'privado'] as const) {
      const { fontes, d } = montar(escolha, { pausada: () => true })
      await fontes.startMic()
      expect(ReconhecedorFalso.ultimo).toBeNull()
      expect(getUserMedia).not.toHaveBeenCalled()
      expect(d.micCaptureRef.current).toBeNull()
      expect(d.webSpeechRef.current).toBeNull()
    }
  })

  it('o som do computador pedido durante a pausa não abre, e a tela diz por quê', async () => {
    const { fontes, d } = montar('privado', { pausada: () => true })
    await fontes.handleStartSystemCapture()
    expect(d.systemCaptureRef.current).toBeNull()
    expect(d.setFeedbackMsg).toHaveBeenCalledWith('A captura está pausada. Retome para abrir o som do computador.')
  })

  it('fora da pausa o microfone abre como sempre', async () => {
    const { fontes } = montar('rapido', { pausada: () => false })
    await fontes.startMic()
    expect(ReconhecedorFalso.ultimo).not.toBeNull()
  })
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

describe('a fala do navegador guarda se foi reconhecida no aparelho ou enviada', () => {
  type Seg = { engine?: string; source: string; isPartial?: boolean }
  const comSegmentos = () => {
    let segs: Seg[] = []
    return {
      segs: () => segs,
      setSpeechSegments: (f: (p: Seg[]) => Seg[]) => {
        segs = f(segs)
      },
    }
  }
  /** Um interino e depois o final (o caminho do computador: o final é comprometido na hora). */
  const falar = (texto: string) => {
    const rec = ReconhecedorFalso.ultimo!
    const resultado = (fim: boolean) => ({
      results: [Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: fim })],
    })
    rec.onresult?.(resultado(false))
    rec.onresult?.(resultado(true))
  }

  it('Rápido (sem `processLocally`): `web-speech`, o que envia', async () => {
    const tela = comSegmentos()
    const { fontes } = montar('rapido', { setSpeechSegments: tela.setSpeechSegments })
    await fontes.startMic()
    falar('olá tudo bem')
    const finais = tela.segs().filter((s) => !s.isPartial)
    expect(finais).toHaveLength(1)
    expect(finais[0]).toMatchObject({ source: 'mic', engine: 'web-speech' })
  })

  it('o navegador reconhece no aparelho (`processLocally`): `web-speech-local`', async () => {
    class ReconhecedorLocal extends ReconhecedorFalso {
      static available = async () => 'available'
      processLocally = false
    }
    vi.stubGlobal('window', { SpeechRecognition: ReconhecedorLocal })
    vi.stubGlobal('SpeechRecognition', ReconhecedorLocal)
    const tela = comSegmentos()
    // Sem consentimento do "Rápido": só o reconhecimento no aparelho pode ter aberto a Web Speech.
    const { fontes } = montar('privado', { setSpeechSegments: tela.setSpeechSegments })
    await fontes.startMic()
    expect((ReconhecedorFalso.ultimo as unknown as { processLocally: boolean }).processLocally).toBe(true)
    falar('olá tudo bem')
    const finais = tela.segs().filter((s) => !s.isPartial)
    expect(finais).toHaveLength(1)
    expect(finais[0]).toMatchObject({ source: 'mic', engine: 'web-speech-local' })
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

  it('o parcial e o espaçamento dele são do pipeline (a captura pergunta antes de copiar o áudio)', async () => {
    estado.abrirMic = async () => ({ startedAtMs: 5, setMuted: vi.fn(), setPaused: vi.fn(), stop: vi.fn() })
    const { fontes, d } = montar('privado')
    await fontes.startMic()
    const cb = estado.cbDoMic as { querParcial: () => boolean; intervaloDosParciais: () => number }
    expect(cb.querParcial()).toBe(false)
    expect(d.micHandlers.querParcial).toHaveBeenCalled()
    expect(cb.intervaloDosParciais()).toBe(2200)
  })
})
