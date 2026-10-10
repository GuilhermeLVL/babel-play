// @vitest-environment jsdom
/**
 * O PREVISTO DO SELO SAI AO ABRIR A TELA, EM TODO CASO (nível de serviço na captura, 10/10/2026).
 *
 * A marca "onde a fala é processada" fica sempre visível na tela pronta, e o texto dela é o selo da
 * fala. Até aqui o previsto só era publicado quando o pré-aquecimento chegava a aquecer um modelo em
 * cache: num navegador sem nada baixado, ou com o modelo já pronto, a tela não teria o que dizer.
 * Agora `preaquecerModelos` publica o previsto da política sempre, e SÓ ISSO muda: nada baixa nem
 * aquece por causa dele.
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
  areModelsCached: vi.fn(async () => false), // nada baixado neste navegador
}))

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

function montar(estado: { modeloPronto?: boolean; preparando?: boolean } = {}) {
  const warmup = vi.fn()
  const preloadModel = vi.fn(async () => {})
  const setRoute = vi.fn()
  const setRotaPrevista = vi.fn()
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(),
        transcribePartial: vi.fn(),
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(),
        trocarModeloLocal: vi.fn(),
        setRoute,
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
    captureScenarioRef: ref('media'),
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
    modelReadyRef: ref(!!estado.modeloPronto),
    prepareEmVooRef: ref(!!estado.preparando),
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
    setRotaPrevista,
    sistemaAtivo: () => false,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, warmup, preloadModel, setRoute, setRotaPrevista }
}

beforeEach(() => {
  esquecerAdaptadorWebGpu()
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    onLine: true,
    gpu: { requestAdapter: async () => ({ info: { vendor: 'amd' } }) },
    mediaDevices: { getDisplayMedia: () => undefined },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerAdaptadorWebGpu()
})

describe('preaquecerModelos publica o previsto do selo', () => {
  it('sem nada em cache: o previsto sai, e nada é aquecido nem baixado', async () => {
    const { p, setRotaPrevista, preloadModel, warmup, setRoute } = montar()
    await p.preaquecerModelos()
    expect(setRotaPrevista).toHaveBeenCalledTimes(1)
    const previstos = setRotaPrevista.mock.calls[0][0]
    expect(previstos.length).toBeGreaterThan(0)
    // Sem nuvem neste servidor (`/api/ai/stt/available` não responde): o previsto é o aparelho.
    expect(previstos[0].processamento).toEqual({ onde: 'aparelho', enviaDadosA: null })
    expect(preloadModel).not.toHaveBeenCalled()
    expect(warmup).not.toHaveBeenCalled()
    expect(setRoute).not.toHaveBeenCalled()
  })

  it('com o modelo já pronto (uma captura anterior): o previsto se atualiza, sem aquecer de novo', async () => {
    const { p, setRotaPrevista, preloadModel, setRoute } = montar({ modeloPronto: true })
    await p.preaquecerModelos()
    expect(setRotaPrevista).toHaveBeenCalledTimes(1)
    expect(preloadModel).not.toHaveBeenCalled()
    expect(setRoute).not.toHaveBeenCalled()
  })

  it('com uma preparação em curso: quem publica é ela', async () => {
    const { p, setRotaPrevista } = montar({ preparando: true })
    await p.preaquecerModelos()
    expect(setRotaPrevista).not.toHaveBeenCalled()
  })
})
