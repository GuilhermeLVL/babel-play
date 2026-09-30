// @vitest-environment jsdom
/**
 * O PRÉ-AQUECIMENTO CARREGA UM SENTIDO DO TRADUTOR, NÃO DOIS (plano "Grátis sem travar", A7).
 *
 * Ao abrir a captura, `preaquecerModelos` aquecia os DOIS sentidos do opus-mt que estivessem no
 * navegador (o que você ouve → o seu idioma, e o contrário): ~113 MB cada, somados ao Whisper, antes de
 * a pessoa apertar Iniciar. Agora só o par que a preparação carrega (`mtDe → mtPara`); o outro sentido
 * carrega quando é pedido (o microfone da conversa). E o tradutor espera o Whisper sempre que a carga
 * é "um de cada vez" (`umModeloDeCadaVez`) — antes, só no aparelho de pouca memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/sonda', () => ({
  agendarSondaDoAparelho: vi.fn(async () => {}),
  sondaGuardada: vi.fn(async () => null),
  modeloProibido: vi.fn(async () => false),
}))
vi.mock('../src/gateway/modelCache', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelCache')>()),
  areModelsCached: vi.fn(async () => true),
}))

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

function montar(cenario: 'media' | 'mic', sttPronto: Promise<void> = Promise.resolve()) {
  const warmup = vi.fn()
  const preloadModel = vi.fn(() => sttPronto)
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(),
        transcribePartial: vi.fn(),
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(),
        trocarModeloLocal: vi.fn(),
        setRoute: vi.fn(),
        preloadModel,
      },
      mt: { warmup, preload: vi.fn(async () => {}) },
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
    micEngine: 'whisper',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments: vi.fn(),
    seqToSegmentRef: ref(new Map<number, string>()),
    lastPartialTextRef: ref(new Map<number, string>()),
    contextoDoSttRef: ref({}),
    pendingUtterancesRef: ref([]),
    suppressedSeqsRef: ref(new Set<number>()),
    modelReadyRef: ref(false),
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
    setModelPrep: vi.fn(),
    setSttRouteLabel: vi.fn(),
    sistemaAtivo: () => false,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, warmup, preloadModel }
}

/** Desktop Chrome com GPU de verdade e 8 GB: o único perfil em que STT e tradutor carregam juntos. */
const desktopComGpu = () =>
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    gpu: { requestAdapter: async () => ({ info: { vendor: 'amd' } }) },
    mediaDevices: { getDisplayMedia: () => undefined },
  })

beforeEach(() => esquecerAdaptadorWebGpu())
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerAdaptadorWebGpu()
})

describe('preaquecerModelos', () => {
  it('mídia/conversa: aquece só "o que você ouve → o seu idioma"', async () => {
    desktopComGpu()
    const { p, warmup } = montar('media')
    await p.preaquecerModelos()
    expect(warmup).toHaveBeenCalledTimes(1)
    expect(warmup).toHaveBeenCalledWith([['en', 'pt']])
  })

  it('só microfone: aquece só "a sua fala → Traduzir para"', async () => {
    desktopComGpu()
    const { p, warmup } = montar('mic')
    await p.preaquecerModelos()
    expect(warmup).toHaveBeenCalledTimes(1)
    expect(warmup).toHaveBeenCalledWith([['pt', 'en']])
  })

  it('desktop com GPU e 8 GB: o tradutor não espera o Whisper', async () => {
    desktopComGpu()
    const { p, warmup, preloadModel } = montar('media', new Promise<void>(() => {}))
    await p.preaquecerModelos()
    expect(preloadModel).toHaveBeenCalled()
    expect(warmup).toHaveBeenCalledTimes(1)
  })

  it('desktop SEM GPU: um de cada vez — o tradutor só depois do Whisper pronto', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      maxTouchPoints: 0,
      mediaDevices: { getDisplayMedia: () => undefined },
    })
    let pronto!: () => void
    const { p, warmup, preloadModel } = montar('media', new Promise<void>((r) => (pronto = r)))
    const aquecendo = p.preaquecerModelos()
    for (let i = 0; i < 20 && preloadModel.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 0))
    expect(preloadModel).toHaveBeenCalled()
    await new Promise((r) => setTimeout(r, 0))
    expect(warmup).not.toHaveBeenCalled()
    pronto()
    await aquecendo
    expect(warmup).toHaveBeenCalledWith([['en', 'pt']])
  })
})
