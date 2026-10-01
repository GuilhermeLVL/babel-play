// @vitest-environment jsdom
/**
 * O CAMINHO LEVE DO QUEST (relato do dono, 01/10/2026: "todo o Quest trava quando inicio a captura").
 *
 * A Meta dá a um app ~3 núcleos em clock reduzido, e o rastreamento e o compositor do headset disputam
 * os mesmos (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`). Ao iniciar a captura o app somava,
 * no headset: o microbenchmark da sonda (CPU + GPU), o Whisper base com 2 threads, o tradutor, o VAD na
 * thread principal e um parcial por fala. Aqui, o que o pipeline decide diferente no Quest:
 *
 *   · a sonda é agendada SEM o microbenchmark (ele roda na página de diagnóstico, a pedido);
 *   · nenhum parcial: cada parcial é um decode inteiro a mais do Whisper;
 *   · só microfone com a fala em inglês → Moonshine tiny (32 MB, sem preencher 30 s), não o Whisper base
 *     que o idioma de DESTINO puxava.
 *
 * O navegador do Quest é emulado COM `getDisplayMedia`, como o de verdade (Browser 36.5, jan/2025).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/sonda', () => ({
  agendarSondaDoAparelho: vi.fn(async () => null),
  sondaGuardada: vi.fn(async () => null),
  modeloProibido: vi.fn(async () => false),
}))
vi.mock('../src/gateway/modelCache', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelCache')>()),
  areModelsCached: vi.fn(async () => true),
}))

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import { agendarSondaDoAparelho } from '../src/lib/dispositivo/sonda'

const ref = <T>(current: T) => ({ current })

function montar(opcoes: { euFalo?: string; traduzirPara?: string; cenario?: 'media' | 'mic' } = {}) {
  const euFalo = opcoes.euFalo ?? 'pt-BR'
  const setRoute = vi.fn()
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
        preloadModel: vi.fn(async () => {}),
      },
      mt: { warmup: vi.fn(), preload: vi.fn(async () => {}) },
    },
    sourceLang: euFalo,
    sourceLangRef: ref(euFalo),
    targetLangRef: ref(opcoes.traduzirPara ?? 'en-US'),
    autoDetectLangRef: ref(false),
    autoDetectMyLangRef: ref(false),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(opcoes.cenario ?? 'mic'),
    /* O modo desempenho ligado SÓ pelo perfil leve (a pessoa não escolheu): `LiveCapture` nasce assim no
       Quest e no celular fraco. É o caso em que ainda saía um parcial por fala. */
    perfModeRef: ref(true),
    perfModeEscolhidoRef: ref(false),
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
  return { p: criarPipelineDeFala(deps as never), setRoute }
}

/** O Meta Quest Browser de verdade: UA do Oculus, WebXR, sem toque, COM getDisplayMedia e WebGPU. */
const quest3 = () =>
  vi.stubGlobal('navigator', {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/41.0.0.0 Chrome/150.0.0.0 VR Safari/537.36',
    hardwareConcurrency: 6,
    deviceMemory: 8,
    maxTouchPoints: 0,
    xr: {},
    gpu: { requestAdapter: async () => ({ info: { vendor: 'qualcomm' } }) },
    mediaDevices: { getDisplayMedia: () => undefined },
  })

/** Um notebook de 2 núcleos sem GPU: também é "leve", mas não é o Quest. */
const notebookFraco = () =>
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
    hardwareConcurrency: 2,
    deviceMemory: 2,
    maxTouchPoints: 0,
    mediaDevices: { getDisplayMedia: () => undefined },
  })

beforeEach(() => {
  esquecerAdaptadorWebGpu()
  vi.mocked(agendarSondaDoAparelho).mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerAdaptadorWebGpu()
})

describe('a sonda no início da captura', () => {
  it('Quest: agendada SEM o microbenchmark (CPU e GPU em disputa com a carga do modelo)', async () => {
    quest3()
    await montar().p.preaquecerModelos()
    expect(agendarSondaDoAparelho).toHaveBeenCalledWith(undefined, { semBenchmark: true })
  })

  it('fora do Quest: o microbenchmark continua (é ele que prova a GPU do celular e do desktop)', async () => {
    notebookFraco()
    await montar({ cenario: 'media' }).p.preaquecerModelos()
    expect(agendarSondaDoAparelho).toHaveBeenCalledWith(undefined, { semBenchmark: false })
  })
})

describe('parciais', () => {
  it('Quest: nenhum parcial — nem o parcial único do modo desempenho automático', () => {
    quest3()
    const { p } = montar()
    expect(p.micHandlers.querParcial()).toBe(false)
    expect(p.sysHandlers.querParcial()).toBe(false)
  })

  it('outro aparelho leve (notebook de 2 núcleos): o parcial único por fala continua', () => {
    notebookFraco()
    expect(montar({ cenario: 'media' }).p.sysHandlers.querParcial()).toBe(true)
  })
})

describe('o modelo do Quest, só com o microfone', () => {
  it('a fala é em INGLÊS (vídeo no alto-falante, legenda em português): Moonshine tiny', async () => {
    quest3()
    const { p, setRoute } = montar({ euFalo: 'en-US', traduzirPara: 'pt-BR' })
    await p.preaquecerModelos()
    expect(setRoute).toHaveBeenCalledWith(expect.objectContaining({ localModel: MOONSHINE_MODELS.tiny, dtype: 'q8' }))
  })

  it('a fala é em português: Whisper base q8 no WASM (o Moonshine só decodifica inglês)', async () => {
    quest3()
    const { p, setRoute } = montar({ euFalo: 'pt-BR', traduzirPara: 'en-US' })
    await p.preaquecerModelos()
    expect(setRoute).toHaveBeenCalledWith(
      expect.objectContaining({ localModel: WHISPER_MODELS.base, dtype: 'q8', device: 'wasm' }),
    )
  })
})
