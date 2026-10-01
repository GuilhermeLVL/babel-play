// @vitest-environment jsdom
/**
 * A DIREÇÃO PELO LADO no modo intérprete (E2 da Fase E): as duas pessoas falam no MESMO microfone, e
 * é o lado tocado — não a configuração da captura — que diz em que idioma ouvir e para qual traduzir.
 *
 *   - PIPELINE (Whisper/VAD): `langs()` usa o idioma do lado ativo na dica do Whisper, no parcial e na
 *     tradução; a fala guarda o lado com que COMEÇOU (tocar o outro lado no meio não a vira); o balão
 *     sai com `lado`; o fim da fala avisa `aoFimDaFala` (é ele que fecha o microfone). Fora do cenário
 *     `interprete`, a direção é ignorada;
 *   - FONTES (Web Speech): o reconhecedor abre no idioma do lado e REINICIA no idioma do lado tocado;
 *     fechar encerra a sessão (nada de religar sozinho); com o Whisper, só o mudo muda (a dica vai a
 *     cada fala) — sem reinício, que no Android apitaria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/entitlements', async (original) => {
  const m = await original<typeof import('../src/lib/entitlements')>()
  return { ...m, getEntitlements: () => ({ ...m.getEntitlements(), managedCloudStt: false }) }
})
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: false }) }
})
const captura = vi.hoisted(() => ({ cbDoMic: null as null | Record<string, unknown> }))
vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(),
  startMicCapture: vi.fn(async (_id: unknown, cb: Record<string, unknown>) => {
    captura.cbDoMic = cb
    return { setMuted: vi.fn(), startedAtMs: 1, stop: vi.fn() }
  }),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarFontesDeAudio } from '../src/lib/captura/fontesDeAudio'
import { direcaoDoLado } from '../src/lib/captura/interprete'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import type { DirecaoDaFala, LadoDoInterprete, SpeechSegment } from '../src/lib/captura/tiposDaFala'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))
const IDIOMAS = { meu: 'pt-BR', outro: 'en-US' }

/** Um `setSpeechSegments` de verdade em miniatura. */
function falasFalsas() {
  let estado: SpeechSegment[] = []
  const set = vi.fn((a: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    estado = typeof a === 'function' ? a(estado) : a
  })
  return { set, ler: () => estado }
}

function montarPipeline(o: { cenario?: string; lado: { current: LadoDoInterprete } }) {
  const transcribePcm = vi.fn(async () => ({ text: 'Where is the station?', engine: 'whisper-local' }))
  const transcribePartial = vi.fn(async () => ({ text: 'Where is' }))
  const translateSegment = vi.fn()
  const aoFimDaFala = vi.fn()
  const falas = falasFalsas()
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial,
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(),
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(async () => {}),
      },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    autoDetectLangRef: ref(false),
    autoDetectMyLangRef: ref(false),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(o.cenario ?? 'interprete'),
    perfModeRef: ref(false),
    micEnabled: true,
    micEngine: 'whisper',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments: falas.set,
    seqToSegmentRef: ref(new Map<number, string>()),
    lastPartialTextRef: ref(new Map<number, string>()),
    contextoDoSttRef: ref(new ContextoDoStt()),
    pendingUtterancesRef: ref([]),
    suppressedSeqsRef: ref(new Set<number>()),
    modelReadyRef: ref(true),
    prepareEmVooRef: ref(false),
    speakerProfilesRef: ref([]),
    setSpeakerProfiles: vi.fn(),
    speakerAutoIdRef: ref(false),
    clustererRef: ref({}),
    lastVoiceIdRef: ref(null),
    provisionalUttsRef: ref(new Map()),
    ensureVoiceProfile: vi.fn(),
    dominantLangRef: ref({ dominant: () => '', push: vi.fn() }),
    perfilIdiomaRef: ref({ observado: () => '', observar: vi.fn(), ler: () => ({ idioma: '', estado: 'ouvindo' }) }),
    perfilMicRef: ref({ observar: vi.fn(), ler: () => ({ idioma: '', estado: 'ouvindo' }) }),
    avisoIdiomaMicRef: ref(false),
    setIdiomaObservado: vi.fn(),
    sysFalasRef: ref([]),
    sysAbertasRef: ref(new Map()),
    micInicioRef: ref(new Map()),
    avisoVazamentoRef: ref(false),
    translateSegment,
    retraduzirDegradados: vi.fn(),
    setFeedbackMsg: vi.fn(),
    setModelPrep: vi.fn(),
    setSttRouteLabel: vi.fn(),
    sistemaAtivo: () => false,
    direcaoDoMicrofone: (): DirecaoDaFala => direcaoDoLado(o.lado.current, IDIOMAS),
    aoFimDaFala,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, transcribePcm, transcribePartial, translateSegment, aoFimDaFala, falas }
}

const PCM = new Float32Array(16000)
const MIC = 1_000_000

describe('pipeline: a direção vem do lado', () => {
  it('o lado de lá: o Whisper ouve inglês e a tradução vai para o português', async () => {
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarPipeline({ lado })
    m.p.micHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0]).toMatchObject({ id: `mic-${MIC + 1}`, lado: 'outro' })
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'en' }))
    expect(m.translateSegment).toHaveBeenCalledWith(`mic-${MIC + 1}`, 'Where is the station?', 'en', 'pt', {
      falada: true,
    })
    expect(m.falas.ler()[0]).toMatchObject({ lado: 'outro', isPartial: false, lang: 'en' })
  })

  it('o meu lado: português para o inglês', async () => {
    const m = montarPipeline({ lado: ref<LadoDoInterprete>('meu') })
    m.p.micHandlers.onSpeechStart(1)
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'pt' }))
    expect(m.translateSegment).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'pt', 'en', {
      falada: true,
    })
  })

  it('a fala guarda o lado com que começou: tocar o outro lado no meio não a vira', async () => {
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarPipeline({ lado })
    m.p.micHandlers.onSpeechStart(1)
    lado.current = 'meu'
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'en' }))
    expect(m.translateSegment).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'en', 'pt', {
      falada: true,
    })
  })

  it('o parcial usa o idioma do lado', async () => {
    const m = montarPipeline({ lado: ref<LadoDoInterprete>('outro') })
    m.p.micHandlers.onSpeechStart(1)
    m.p.micHandlers.onPartialAudio(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePartial).toHaveBeenCalledWith(PCM, 16000, { languageHint: 'en' })
  })

  it('o fim da fala avisa aoFimDaFala com o balão e o lado (é o que fecha o microfone)', () => {
    const m = montarPipeline({ lado: ref<LadoDoInterprete>('outro') })
    m.p.micHandlers.onSpeechStart(1)
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    expect(m.aoFimDaFala).toHaveBeenCalledWith({ segId: `mic-${MIC + 1}`, source: 'mic', lado: 'outro' })
  })

  it('fora do cenário intérprete, a direção do lado não vale', async () => {
    const m = montarPipeline({ cenario: 'mic', lado: ref<LadoDoInterprete>('outro') })
    m.p.micHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0].lado).toBeUndefined()
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'pt' }))
    expect(m.translateSegment).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'pt', 'en', {
      falada: true,
    })
  })
})

/* ───────────────────────────── as fontes: a Web Speech no idioma do lado ───────────────────────────── */

class ReconhecedorFalso {
  static todos: ReconhecedorFalso[] = []
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
  parou = false
  constructor() {
    ReconhecedorFalso.todos.push(this)
  }
  start() {}
  stop() {
    this.parou = true
  }
  abort() {}
  emitir(texto: string, isFinal: boolean) {
    const res = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: res } })
  }
}

const handlers = () => ({
  onSpeechStart: vi.fn(),
  onMisfire: vi.fn(),
  onPartialAudio: vi.fn(),
  onUtterance: vi.fn(),
  onFinalEspeculativo: vi.fn(() => null),
  querParcial: vi.fn(() => false),
  intervaloDosParciais: vi.fn(() => 2200),
})

function montarFontes(lado: { current: LadoDoInterprete }, extra: Record<string, unknown> = {}) {
  const falas = falasFalsas()
  const translateSegment = vi.fn()
  const aoFimDaFala = vi.fn()
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
    translateSegment,
    marcarMicrofone: vi.fn(),
    setSpeechSegments: falas.set,
    setFeedbackMsg: vi.fn(),
    setIsFocusMode: vi.fn(),
    setGuiaDeAudio: vi.fn(),
    setModelPrep: vi.fn(),
    setIsRecording: vi.fn(),
    setMicAbrindo: vi.fn(),
    consentiuNavegador: () => true,
    rapidoPermitido: () => true,
    escolhaDoMic: () => 'rapido',
    perfilId: () => 'hybrid',
    semMedidorParalelo: true,
    direcaoDoMicrofone: (): DirecaoDaFala => direcaoDoLado(lado.current, IDIOMAS),
    aoFimDaFala,
    ...extra,
  }
  const fontes = criarFontesDeAudio(d as unknown as Parameters<typeof criarFontesDeAudio>[0])
  return { fontes, d, falas, translateSegment, aoFimDaFala }
}

describe('fontes: a Web Speech abre e reinicia no idioma do lado', () => {
  beforeEach(() => {
    ReconhecedorFalso.todos = []
    captura.cbDoMic = null
    vi.stubGlobal('SpeechRecognition', ReconhecedorFalso)
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: ReconhecedorFalso })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('abre no idioma do lado tocado, e o final sai com o lado, a direção e o aviso do fim', async () => {
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarFontes(lado)
    await m.fontes.startMic()
    const rec = ReconhecedorFalso.todos[0]
    expect(rec.lang).toBe('en-US')
    rec.emitir('where is', false)
    rec.emitir('where is the station', true)
    const fala = m.falas.ler().find((s) => !s.isPartial)!
    /* O idioma do lado vai na fala: a sessão salva narra e estuda cada lado no idioma dele. */
    expect(fala).toMatchObject({ lado: 'outro', lang: 'en', originalText: 'where is the station' })
    expect(m.translateSegment).toHaveBeenCalledWith(fala.id, 'where is the station', 'en', 'pt', { falada: true })
    expect(m.aoFimDaFala).toHaveBeenCalledWith({ segId: fala.id, source: 'mic', lado: 'outro' })
  })

  it('tocar o outro lado reinicia a Web Speech no idioma dele; o mesmo idioma não reinicia', async () => {
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarFontes(lado)
    await m.fontes.startMic()
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos).toHaveLength(1)
    lado.current = 'meu'
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos).toHaveLength(2)
    expect(ReconhecedorFalso.todos[0].parou).toBe(true)
    expect(ReconhecedorFalso.todos[1].lang).toBe('pt-BR')
  })

  it('fechar encerra a sessão (sem religar sozinho); abrir de novo começa outra, no mesmo modo', async () => {
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado)
    await m.fontes.startMic()
    m.fontes.fecharMicrofoneDoLado()
    expect(ReconhecedorFalso.todos[0].parou).toBe(true)
    expect(m.d.webSpeechRef.current).toBeNull()
    lado.current = 'outro'
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos).toHaveLength(2)
    expect(ReconhecedorFalso.todos[1].lang).toBe('en-US')
  })

  it('com o Whisper, trocar de lado só tira o mudo: nada reinicia (a dica vai a cada fala)', async () => {
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado, {
      micEngine: 'whisper',
      consentiuNavegador: () => false,
      escolhaDoMic: () => 'privado',
    })
    await m.fontes.startMic()
    const mic = m.d.micCaptureRef.current as unknown as { setMuted: ReturnType<typeof vi.fn> }
    expect(mic).not.toBeNull()
    m.fontes.fecharMicrofoneDoLado()
    expect(mic.setMuted).toHaveBeenLastCalledWith(true)
    lado.current = 'outro'
    await m.fontes.abrirMicrofoneNoLado()
    expect(mic.setMuted).toHaveBeenLastCalledWith(false)
    expect(ReconhecedorFalso.todos).toHaveLength(0)
  })
})

/* ─────────────── os DOIS idiomas: o lado do inglês não respondia (relato do dono, 2026-09-30) ─────────────── */

/**
 * O Chrome de quem relatou tinha o pacote de voz do português e NÃO o do inglês. A decisão do motor
 * olhava só o idioma de quem abre o microfone: o lado do inglês reabria o reconhecedor LOCAL em
 * en-US sem conferir, o navegador recusava (`language-not-supported`) e a fala se perdia. A decisão
 * agora cobre os DOIS idiomas, e uma falha do microfone no intérprete não encerra a sessão.
 */
class ReconhecedorComPacotes extends ReconhecedorFalso {
  processLocally = false // o navegador que reconhece no aparelho tem a propriedade
  static pacotes: Record<string, string> = {}
  static perguntados: string[] = []
  static async available({ langs }: { langs: string[] }) {
    ReconhecedorComPacotes.perguntados.push(langs[0])
    return ReconhecedorComPacotes.pacotes[langs[0]] ?? 'unavailable'
  }
  static async install() {
    return true
  }
}

describe('fontes: o microfone do intérprete cobre os dois idiomas', () => {
  beforeEach(() => {
    ReconhecedorFalso.todos = []
    ReconhecedorComPacotes.perguntados = []
    captura.cbDoMic = null
    vi.stubGlobal('SpeechRecognition', ReconhecedorComPacotes)
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: ReconhecedorComPacotes })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const privado = { consentiuNavegador: () => false, escolhaDoMic: () => 'privado' as const }

  it('o pacote do inglês faltando: o reconhecimento local NÃO abre nos dois lados; o modelo do app atende', async () => {
    ReconhecedorComPacotes.pacotes = { 'pt-BR': 'available', 'en-US': 'unavailable' }
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado, privado)
    await m.fontes.abrirMicrofoneNoLado()
    // Perguntou pelos DOIS idiomas, e nenhum reconhecedor do navegador foi aberto.
    expect(ReconhecedorComPacotes.perguntados.sort()).toEqual(['en-US', 'pt-BR'])
    expect(ReconhecedorFalso.todos).toHaveLength(0)
    expect(m.d.micCaptureRef.current).not.toBeNull()
    // O lado do inglês só tira o mudo: o modelo recebe a dica do idioma a cada fala.
    const mic = m.d.micCaptureRef.current as unknown as { setMuted: ReturnType<typeof vi.fn> }
    m.fontes.fecharMicrofoneDoLado()
    lado.current = 'outro'
    await m.fontes.abrirMicrofoneNoLado()
    expect(mic.setMuted).toHaveBeenLastCalledWith(false)
    expect(ReconhecedorFalso.todos).toHaveLength(0)
  })

  it('os dois pacotes no aparelho: o reconhecimento local abre em cada lado, no idioma dele', async () => {
    ReconhecedorComPacotes.pacotes = { 'pt-BR': 'available', 'en-US': 'available' }
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarFontes(lado, privado)
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos.map((r) => r.lang)).toEqual(['en-US'])
    lado.current = 'meu'
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos.map((r) => r.lang)).toEqual(['en-US', 'pt-BR'])
  })

  it('uma decisão que cobria só um idioma não é reaproveitada no outro lado: decide de novo', async () => {
    ReconhecedorComPacotes.pacotes = { 'pt-BR': 'available', 'en-US': 'unavailable' }
    const lado = ref<LadoDoInterprete>('meu')
    // Uma direção sem o idioma de quem ouve (como a de antes): a decisão cobre só o português.
    const m = montarFontes(lado, {
      ...privado,
      direcaoDoMicrofone: () => {
        const { ouve: _ouve, ...antiga } = direcaoDoLado(lado.current, IDIOMAS)
        return antiga
      },
    })
    await m.fontes.abrirMicrofoneNoLado()
    expect(ReconhecedorFalso.todos.map((r) => r.lang)).toEqual(['pt-BR'])
    lado.current = 'outro'
    await m.fontes.abrirMicrofoneNoLado()
    // O inglês não está coberto: nada de abrir o local em en-US; o modelo do app assume.
    expect(ReconhecedorFalso.todos.map((r) => r.lang)).toEqual(['pt-BR'])
    expect(ReconhecedorFalso.todos[0].parou).toBe(true)
    expect(m.d.micCaptureRef.current).not.toBeNull()
  })

  it('o reconhecedor que falha dentro do intérprete avisa a tela e NÃO encerra a gravação', async () => {
    ReconhecedorComPacotes.pacotes = {}
    const lado = ref<LadoDoInterprete>('outro')
    const aoFalharMicrofone = vi.fn()
    const m = montarFontes(lado, { aoFalharMicrofone })
    await m.fontes.abrirMicrofoneNoLado() // 'rapido' consentido: a Web Speech na nuvem
    ReconhecedorFalso.todos[0].onerror?.({ error: 'language-not-supported' })
    expect(aoFalharMicrofone).toHaveBeenCalledTimes(1)
    expect(aoFalharMicrofone.mock.calls[0][0]).toMatchObject({ codigo: 'language-not-supported' })
    expect(m.d.setIsRecording).not.toHaveBeenCalledWith(false)
    expect(m.d.isRecordingRef.current).toBe(true)
  })

  it('o áudio abriu no intérprete: o tradutor dos DOIS sentidos começa a carregar', async () => {
    ReconhecedorComPacotes.pacotes = { 'pt-BR': 'available', 'en-US': 'available' }
    const prepararTradutorDaFala = vi.fn()
    const m = montarFontes(ref<LadoDoInterprete>('meu'), { ...privado, prepararTradutorDaFala })
    await m.fontes.abrirMicrofoneNoLado()
    ReconhecedorFalso.todos[0].onaudiostart?.()
    expect(prepararTradutorDaFala).toHaveBeenCalledWith({ nosDoisSentidos: true })
  })

  it('fora do intérprete, a falha do reconhecedor segue encerrando a gravação (como sempre)', async () => {
    ReconhecedorComPacotes.pacotes = {}
    const m = montarFontes(ref<LadoDoInterprete>('meu'), { direcaoDoMicrofone: () => null, aoFalharMicrofone: vi.fn() })
    await m.fontes.startMic()
    ReconhecedorFalso.todos[0].onerror?.({ error: 'language-not-supported' })
    expect(m.d.setIsRecording).toHaveBeenCalledWith(false)
  })
})
