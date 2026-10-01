// @vitest-environment jsdom
/**
 * OS DOIS LADOS DO INTÉRPRETE FUNCIONAM (relato do dono, 30/09: "em português traduziu e pronunciou
 * certinho; em inglês, tocando o outro lado e falando, não aconteceu nada").
 *
 * A CAUSA: o motor do microfone era decidido — e o pacote de voz do navegador, conferido e instalado —
 * só para o idioma "Eu falo" da captura. O lado do outro abria a Web Speech NO APARELHO no idioma dele
 * sem perguntar se o Chrome o reconhece localmente; sem o pacote, o Chrome recusa
 * (`language-not-supported`) e a fala some. O e2e não pegava: sob automação a sonda não pergunta.
 *
 * O CONTRATO: no intérprete, a decisão vale para OS DOIS idiomas da conversa (`idiomasDaConversa`):
 *   - os dois no aparelho → Web Speech no aparelho nos dois lados;
 *   - um deles sem pacote e o "Rápido" consentido → Web Speech na nuvem (que ouve qualquer idioma);
 *   - um deles sem pacote e sem o "Rápido" → o nosso Whisper, que ouve os dois;
 *   - pacote a baixar → `install()` dos dois idiomas, no toque.
 * E a falha do microfone no intérprete não encerra a sessão: o lado volta a "parado" e pode tentar de novo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
const captura = vi.hoisted(() => ({ abriuWhisper: 0 }))
vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(),
  startMicCapture: vi.fn(async () => {
    captura.abriuWhisper++
    return { setMuted: vi.fn(), startedAtMs: 1, stop: vi.fn() }
  }),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarFontesDeAudio } from '../src/lib/captura/fontesDeAudio'
import { direcaoDoLado } from '../src/lib/captura/interprete'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import type { DirecaoDaFala, LadoDoInterprete } from '../src/lib/captura/tiposDaFala'

const ref = <T>(current: T) => ({ current })
const IDIOMAS = { meu: 'pt-BR', outro: 'en-US' }

type Disp = 'available' | 'downloadable' | 'unavailable'

class ReconhecedorFalso {
  static todos: ReconhecedorFalso[] = []
  /** O que o Chrome reconhece NO APARELHO, por idioma. */
  static noAparelho: Record<string, Disp> = {}
  static instalou: string[][] = []
  static available = vi.fn(async ({ langs }: { langs: string[] }) => {
    const d = langs.map((l) => ReconhecedorFalso.noAparelho[l] ?? 'unavailable')
    if (d.includes('unavailable')) return 'unavailable'
    return d.includes('downloadable') ? 'downloadable' : 'available'
  })
  static install = vi.fn(async ({ langs }: { langs: string[] }) => {
    ReconhecedorFalso.instalou.push(langs)
    for (const l of langs) ReconhecedorFalso.noAparelho[l] = 'available'
    return true
  })
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  processLocally = false
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
    consentiuNavegador: () => true,
    rapidoPermitido: () => true,
    escolhaDoMic: () => 'rapido',
    perfilId: () => 'hybrid',
    semMedidorParalelo: true,
    direcaoDoMicrofone: (): DirecaoDaFala => direcaoDoLado(lado.current, IDIOMAS),
    idiomasDaConversa: () => [IDIOMAS.meu, IDIOMAS.outro],
    aoFimDaFala: vi.fn(),
    aoFalharMicrofone: vi.fn(),
    ...extra,
  }
  const fontes = criarFontesDeAudio(d as unknown as Parameters<typeof criarFontesDeAudio>[0])
  return { fontes, d }
}

/** Um lado fala: abre no lado, e o fim da fala fecha (como o controle do intérprete faz). */
async function falarNoLado(
  m: ReturnType<typeof montarFontes>,
  lado: { current: LadoDoInterprete },
  qual: LadoDoInterprete,
) {
  lado.current = qual
  await m.fontes.abrirMicrofoneNoLado()
  const rec = ReconhecedorFalso.todos.at(-1)
  m.fontes.fecharMicrofoneDoLado()
  return rec
}

describe('intérprete: o motor do microfone serve aos DOIS idiomas da conversa', () => {
  beforeEach(() => {
    ReconhecedorFalso.todos = []
    ReconhecedorFalso.noAparelho = {}
    ReconhecedorFalso.instalou = []
    ReconhecedorFalso.available.mockClear()
    ReconhecedorFalso.install.mockClear()
    captura.abriuWhisper = 0
    vi.stubGlobal('SpeechRecognition', ReconhecedorFalso)
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: ReconhecedorFalso })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('o português no aparelho e o inglês sem pacote, com o Rápido: o lado do inglês NÃO abre "no aparelho"', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available' }
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado)
    await falarNoLado(m, lado, 'meu')
    const doIngles = await falarNoLado(m, lado, 'outro')
    expect(doIngles?.lang).toBe('en-US')
    expect(doIngles?.processLocally).toBe(false)
  })

  it('o inglês sem pacote e sem o Rápido: o Whisper ouve os dois lados (nada vai ao Google)', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available' }
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado, { consentiuNavegador: () => false, escolhaDoMic: () => 'privado' })
    await falarNoLado(m, lado, 'meu')
    await falarNoLado(m, lado, 'outro')
    expect(ReconhecedorFalso.todos.filter((r) => !r.processLocally)).toHaveLength(0)
    expect(captura.abriuWhisper).toBe(1)
  })

  it('os dois idiomas no aparelho: os dois lados reconhecem no aparelho', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available', 'en-US': 'available' }
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado, { consentiuNavegador: () => false, escolhaDoMic: () => 'privado' })
    const pt = await falarNoLado(m, lado, 'meu')
    const en = await falarNoLado(m, lado, 'outro')
    expect([pt?.lang, en?.lang]).toEqual(['pt-BR', 'en-US'])
    expect([pt?.processLocally, en?.processLocally]).toEqual([true, true])
    expect(captura.abriuWhisper).toBe(0)
  })

  it('o pacote do inglês a baixar: a instalação pede os DOIS idiomas, e os dois lados ficam no aparelho', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available', 'en-US': 'downloadable' }
    const lado = ref<LadoDoInterprete>('meu')
    const m = montarFontes(lado, { consentiuNavegador: () => false, escolhaDoMic: () => 'privado' })
    await falarNoLado(m, lado, 'meu')
    const en = await falarNoLado(m, lado, 'outro')
    expect(ReconhecedorFalso.instalou).toEqual([['pt-BR', 'en-US']])
    expect(en?.processLocally).toBe(true)
  })

  it('a decisão tomada antes, na captura (só o português), é refeita ao abrir o intérprete', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available' }
    const lado = ref<LadoDoInterprete>('meu')
    let conversa: string[] | null = null
    const m = montarFontes(lado, { idiomasDaConversa: () => conversa })
    await m.fontes.startMic() // a captura de sempre: só o "Eu falo"
    expect(ReconhecedorFalso.todos[0].processLocally).toBe(true)
    m.fontes.fecharMicrofoneDoLado()
    conversa = [IDIOMAS.meu, IDIOMAS.outro]
    const en = await falarNoLado(m, lado, 'outro')
    expect(en?.processLocally).toBe(false)
  })

  it('o reconhecedor recusa no meio do intérprete: a ajuda aparece, mas a sessão NÃO acaba', async () => {
    ReconhecedorFalso.noAparelho = { 'pt-BR': 'available', 'en-US': 'available' }
    const lado = ref<LadoDoInterprete>('outro')
    const m = montarFontes(lado)
    await m.fontes.abrirMicrofoneNoLado()
    ReconhecedorFalso.todos[0].onerror?.({ error: 'language-not-supported' })
    expect(m.d.aoFalharMicrofone).toHaveBeenCalled()
    expect(m.d.setIsRecording).not.toHaveBeenCalledWith(false)
  })
})

/* ─────────────────────── a tradução: os DOIS sentidos prontos antes da primeira fala ─────────────────────── */

function montarPipeline(cenario: string) {
  const preload = vi.fn(async (_de: string, _para: string, aoProgresso?: (p: number) => void) => {
    aoProgresso?.(1)
  })
  const setModelPrep = vi.fn()
  const deps = {
    gateway: {
      stt: { pendingCount: () => 0, preloadModel: vi.fn(async () => {}) },
      mt: { preload },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    autoDetectLangRef: ref(false),
    autoDetectMyLangRef: ref(false),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(cenario),
    perfModeRef: ref(false),
    micEnabled: true,
    micEngine: 'browser',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments: vi.fn(),
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
    translateSegment: vi.fn(),
    retraduzirDegradados: vi.fn(),
    setFeedbackMsg: vi.fn(),
    setModelPrep,
    setSttRouteLabel: vi.fn(),
    sistemaAtivo: () => false,
  }
  return { p: criarPipelineDeFala(deps as never), preload }
}

const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('intérprete: o tradutor dos dois sentidos', () => {
  it('no intérprete, prepara a ida E a volta (o inglês do outro lado não espera um download na hora)', async () => {
    const m = montarPipeline('interprete')
    m.p.prepararTradutorDaFala()
    await esperar()
    await esperar()
    expect(m.preload.mock.calls.map((c) => `${c[0]}→${c[1]}`)).toEqual(['pt→en', 'en→pt'])
  })

  it('fora do intérprete, só o sentido da sua fala (nada de memória a mais)', async () => {
    const m = montarPipeline('conversation')
    m.p.prepararTradutorDaFala()
    await esperar()
    expect(m.preload.mock.calls.map((c) => `${c[0]}→${c[1]}`)).toEqual(['pt→en'])
  })
})
