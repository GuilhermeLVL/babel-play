// @vitest-environment jsdom
/**
 * Correção C do diagnóstico do Safari (22/10/2026): o modelo de fala que não baixa (no WebKit,
 * `TypeError: Load failed`) tem de virar o erro do painel ("Não foi possível preparar o modelo ·
 * Tentar de novo"), nunca uma captura em "Legendando" sem legenda. O adapter rejeita a preparação
 * (`tests/whisperLocal-gpu.test.ts`); aqui, o pipeline leva a rejeição ao estado da tela.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/gateway/modelCache', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelCache')>()),
  areModelsCached: async () => false,
}))

import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

type Prep = { error: string | null; done: boolean } | null

function montar(preloadModel: () => Promise<void>) {
  let prep: Prep = null
  const setModelPrep = vi.fn((acao: Prep | ((p: Prep) => Prep)) => {
    prep = typeof acao === 'function' ? acao(prep) : acao
  })
  const modelReadyRef = ref(false)
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(async () => ({ text: '', engine: 'whisper-local' })),
        transcribePartial: vi.fn(async () => null),
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(async () => null),
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(preloadModel),
        setRoute: vi.fn(),
      },
      mt: { preload: vi.fn(async () => {}), warmup: vi.fn() },
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
    pendingUtterancesRef: ref([]),
    suppressedSeqsRef: ref(new Set<number>()),
    modelReadyRef,
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
  const p = criarPipelineDeFala(deps as never)
  return { p, lerPrep: () => prep, modelReadyRef }
}

describe('modelo de fala que não baixa (rede)', () => {
  it('"Load failed" do WebKit: o painel termina em erro com a mensagem, e o modelo não é dado como pronto', async () => {
    const { p, lerPrep, modelReadyRef } = montar(async () => {
      throw new TypeError('Load failed')
    })
    await p.prepareModels({} as never).catch(() => undefined)
    await vi.waitFor(() => expect(lerPrep()?.error).toBe('Load failed'))
    expect(lerPrep()?.done).toBe(false)
    expect(modelReadyRef.current).toBe(false)
  })
})
