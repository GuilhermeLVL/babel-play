// @vitest-environment jsdom
/**
 * NATIVO PRIMEIRO NO PRÉ-AQUECIMENTO (plano "Grátis sem travar", A9a).
 *
 * Com o idioma do vídeo escolhido e o reconhecimento do navegador no aparelho (`processLocally`), o
 * áudio da aba vai à Web Speech local e o Whisper não baixa nem carrega (`webSpeechDoSistema.ts`). Mas o
 * pré-aquecimento da tela aberta carregava o Whisper do cache mesmo assim: centenas de MB na memória e
 * o decode de aquecimento na CPU do desktop que mais sofre com isso — para um modelo que a captura não
 * ia usar. Agora ele pergunta a MESMA decisão da captura antes de aquecer.
 *
 * E a pergunta da oferta "Legenda sem baixar nada" (`decidirMotorDoSistema({ multiIdioma: false })`):
 * com a detecção automática ligada, "e se a pessoa escolhesse o idioma, o navegador transcreveria?".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
const sonda = vi.hoisted(() => ({ noAparelho: 'available' as string | null }))
vi.mock('../src/lib/dispositivo/sonda', () => ({
  agendarSondaDoAparelho: vi.fn(async () => {}),
  sondaGuardada: vi.fn(async () => null),
  modeloProibido: vi.fn(async () => false),
  webSpeechComTrilhaLembrada: vi.fn(async () => null),
  disponibilidadeDoSttNoAparelho: vi.fn(async () => sonda.noAparelho),
}))
vi.mock('../src/gateway/modelCache', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelCache')>()),
  areModelsCached: vi.fn(async () => true),
}))

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

function montar(o: { autoDetect: boolean; cenario?: 'media' | 'mic'; micEngine?: 'browser' | 'whisper' }) {
  const warmup = vi.fn()
  const preloadModel = vi.fn(async () => {})
  const cenario = o.cenario ?? 'media'
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
    autoDetectLangRef: ref(o.autoDetect),
    autoDetectMyLangRef: ref(false),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(cenario),
    perfModeRef: ref(false),
    micEnabled: cenario === 'mic',
    micEngine: o.micEngine ?? 'whisper',
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

/** Desktop comum sem GPU (o "desktop fraco"), Chrome com o reconhecimento no aparelho. */
function desktopSemGpuComReconhecimentoLocal() {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0',
    hardwareConcurrency: 4,
    deviceMemory: 8,
    maxTouchPoints: 0,
    mediaDevices: { getDisplayMedia: () => undefined },
  })
  class ReconhecedorFalso {}
  Object.defineProperty(ReconhecedorFalso.prototype, 'processLocally', { value: false, writable: true })
  vi.stubGlobal('SpeechRecognition', ReconhecedorFalso)
}

beforeEach(() => {
  esquecerAdaptadorWebGpu()
  sonda.noAparelho = 'available'
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerAdaptadorWebGpu()
})

describe('preaquecerModelos com o áudio da aba no reconhecedor do navegador', () => {
  it('idioma do vídeo escolhido + reconhecimento no aparelho: o Whisper NÃO aquece; o tradutor segue ao gateway', async () => {
    desktopSemGpuComReconhecimentoLocal()
    const { p, warmup, preloadModel } = montar({ autoDetect: false })
    await p.preaquecerModelos()
    expect(preloadModel).not.toHaveBeenCalled()
    // O tradutor continua indo ao gateway, que pergunta ao nativo antes do opus-mt.
    expect(warmup).toHaveBeenCalledWith([['en', 'pt']])
  })

  it('detecção automática ligada: a Web Speech precisa de UM idioma — o Whisper aquece como antes', async () => {
    desktopSemGpuComReconhecimentoLocal()
    const { p, preloadModel } = montar({ autoDetect: true })
    await p.preaquecerModelos()
    expect(preloadModel).toHaveBeenCalled()
  })

  it('o idioma sem o pacote no aparelho: o Whisper aquece como antes', async () => {
    desktopSemGpuComReconhecimentoLocal()
    sonda.noAparelho = 'downloadable'
    const { p, preloadModel } = montar({ autoDetect: false })
    await p.preaquecerModelos()
    expect(preloadModel).toHaveBeenCalled()
  })

  it('a SUA voz no Whisper (só microfone, Privado): o Whisper aquece — quem usa é o microfone', async () => {
    desktopSemGpuComReconhecimentoLocal()
    const { p, preloadModel } = montar({ autoDetect: false, cenario: 'mic', micEngine: 'whisper' })
    await p.preaquecerModelos()
    expect(preloadModel).toHaveBeenCalled()
  })
})

describe('decidirMotorDoSistema({ multiIdioma: false }) — a pergunta da oferta', () => {
  it('com a detecção ligada, responde como se o idioma estivesse escolhido', async () => {
    desktopSemGpuComReconhecimentoLocal()
    const { p } = montar({ autoDetect: true })
    await expect(p.decidirMotorDoSistema()).resolves.toMatchObject({ motor: 'pipeline', motivo: 'multi-idioma' })
    await expect(p.decidirMotorDoSistema({ multiIdioma: false })).resolves.toMatchObject({
      motor: 'web-speech-local',
    })
  })

  it('sem o pacote do idioma: nem com o idioma escolhido (a oferta não aparece)', async () => {
    desktopSemGpuComReconhecimentoLocal()
    sonda.noAparelho = 'unavailable'
    const { p } = montar({ autoDetect: true })
    await expect(p.decidirMotorDoSistema({ multiIdioma: false })).resolves.toMatchObject({
      motor: 'pipeline',
      motivo: 'idioma-indisponivel',
    })
  })
})
