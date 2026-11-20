// @vitest-environment jsdom
/**
 * Correção G do diagnóstico do Safari (22/10/2026): só PASSAR pela Capturar (sem tocar em Iniciar)
 * carregava ~320 MB no WebKit (Whisper base + opus-mt + motor do Bergamot) e deixava os workers vivos
 * enquanto a pessoa usava as outras telas. O caminho era o pré-aquecimento da tela aberta: com os
 * modelos em cache de uma captura anterior, ele subia o worker do Whisper e o tradutor (medido no
 * Chromium com o cache cheio: o worker do Whisper nasce 0,9 s depois de abrir a tela, e ainda busca
 * no Hub um arquivo que não estava em cache). Agora a tela, ao abrir, só publica o previsto
 * (`preaquecerModelos({ aquecer: false })`): nenhum worker, nenhum fetch de modelo ou de WASM. A carga
 * fica para o "Iniciar" (o `prepareModels`).
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
  areModelsCached: vi.fn(async () => true), // tudo em cache: uma captura anterior baixou
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

const buscas: string[] = []

beforeEach(() => {
  buscas.length = 0
  esquecerAdaptadorWebGpu()
  vi.stubGlobal('crossOriginIsolated', true)
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    onLine: true,
    gpu: { requestAdapter: async () => ({ info: { vendor: 'amd' } }) },
    mediaDevices: { getDisplayMedia: () => undefined },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: unknown) => {
      buscas.push(String(u))
      return new Response('{}', { status: 404 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerAdaptadorWebGpu()
})

const deModeloOuWasm = (u: string) => /huggingface|hf\.co|ort-wasm|\.wasm|\.onnx|bergamot|opus-mt|whisper/i.test(u)

describe('abrir a Capturar não carrega modelo', () => {
  it('ao abrir (aquecer: false), com tudo em cache: publica o previsto e não sobe worker nem busca modelo/WASM', async () => {
    const { p, setRotaPrevista, preloadModel, warmup, setRoute } = montar()
    await p.preaquecerModelos({ aquecer: false })
    expect(setRotaPrevista).toHaveBeenCalledTimes(1)
    expect(preloadModel).not.toHaveBeenCalled()
    expect(warmup).not.toHaveBeenCalled()
    expect(setRoute).not.toHaveBeenCalled()
    expect(buscas.filter(deModeloOuWasm)).toEqual([])
  })

  it('o pré-aquecimento completo (o de antes) é que subia o Whisper e o tradutor com o cache cheio', async () => {
    const { p, preloadModel, warmup } = montar()
    await p.preaquecerModelos()
    expect(preloadModel).toHaveBeenCalled()
    expect(warmup).toHaveBeenCalled()
  })
})
