// @vitest-environment jsdom
/**
 * O PIPELINE DE FALA COM O "APARELHO PRIMEIRO" E O PARAKEET DE RESERVA (Fase B, itens 5 e 6).
 *
 *  - Item 6 (flag `stt_aparelho_primeiro`): a rota põe o Parakeet como motor (`nuvemNoAudioDificil`).
 *    Falas locais difíceis (confiança baixa) fazem a histerese subir: o gateway passa a nuvem para a
 *    frente e o selo troca o previsto; depois do mínimo de falas na nuvem, volta ao aparelho. Sem a
 *    flag (rota sem `nuvemNoAudioDificil`), as mesmas falas não mexem na rota.
 *  - Item 5: rota de nuvem com o Parakeet de reserva no computador — o gateway começa com o Whisper base
 *    quente, e o Parakeet só entra (e carrega) na primeira falha da nuvem.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cena = vi.hoisted(() => ({
  rota: null as null | Record<string, unknown>,
}))

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  const desktop = { ...m.perfilDoDispositivo(), tipo: 'desktop-com-gpu' as const, leve: false }
  return { ...m, perfilDoDispositivo: () => desktop, medirPerfilDoDispositivo: async () => desktop }
})
vi.mock('../src/gateway/sttRouter', async (original) => {
  const m = await original<typeof import('../src/gateway/sttRouter')>()
  return {
    ...m,
    routeStt: (e: Parameters<typeof m.routeStt>[0]) => (cena.rota ?? m.routeStt(e)) as ReturnType<typeof m.routeStt>,
  }
})

import { LIMIARES_DO_AUDIO_DIFICIL } from '../src/core/rota/audioDificil'
import type { DecisaoDeRota } from '../src/core/rota/politicaDeRota'
import { ADAPTADOR_DO_PARAKEET, ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { avisarFalhaDaNuvemDoStt } from '../src/gateway/falhaDaNuvemDoStt'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })
const FALA_DIFICIL = { text: 'a gente combinou de ver o filme amanhã', engine: ADAPTADOR_DO_PARAKEET, confidence: 0.4 }
const FALA_FACIL = { ...FALA_DIFICIL, confidence: 0.97 }

function montar() {
  const setRoute = vi.fn()
  const setRotaPrevista = vi.fn()
  const setSttRouteLabel = vi.fn()
  const preloadModel = vi.fn(async () => {})
  const transcribePcm = vi.fn(async (): Promise<Record<string, unknown>> => FALA_DIFICIL)
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial: vi.fn(async () => null),
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(async () => null),
        trocarModeloLocal: vi.fn(),
        preloadModel,
        setRoute,
      },
      mt: { preload: vi.fn(async () => {}) },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('pt-BR'),
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
    setModelPrep: vi.fn(),
    setSttRouteLabel,
    setRotaPrevista,
    sistemaAtivo: () => false,
  }
  const p = criarPipelineDeFala(deps as never)
  let seq = 0
  /** Uma fala do microfone até o final ser processado. */
  const falar = async () => {
    seq++
    const antes = transcribePcm.mock.results.length
    p.micHandlers.onSpeechStart(seq)
    p.micHandlers.onUtterance(new Float32Array(16_000).fill(0.1), 16_000, seq)
    await vi.waitFor(() => expect(transcribePcm.mock.results.length).toBeGreaterThan(antes))
    await transcribePcm.mock.results.at(-1)?.value
    await new Promise((r) => setTimeout(r, 0))
  }
  return { p, setRoute, setRotaPrevista, setSttRouteLabel, preloadModel, transcribePcm, falar }
}

const nuvemPrimeiro = (setRoute: ReturnType<typeof vi.fn>) =>
  setRoute.mock.calls
    .filter((c) => c.length === 1 && Object.keys(c[0] as object).join() === 'preferCloud')
    .map((c) => (c[0] as { preferCloud: boolean }).preferCloud)

beforeEach(() => {
  cena.rota = null
})

describe('aparelho primeiro (flag ligada: a rota traz `nuvemNoAudioDificil`)', () => {
  const rotaAparelhoPrimeiro = {
    localModel: ID_DO_PARAKEET,
    device: 'wasm',
    preferCloud: false,
    nuvemNoAudioDificil: true,
    label: 'local · Parakeet v3 · nuvem para o áudio difícil',
  }

  it('3 falas difíceis sobem à nuvem (o gateway e o selo acompanham); o mínimo na nuvem devolve ao aparelho', async () => {
    cena.rota = rotaAparelhoPrimeiro
    const m = montar()
    await m.p.prepareModels()
    expect(m.setRoute).toHaveBeenCalledWith(expect.objectContaining({ preferCloud: false, localModel: ID_DO_PARAKEET }))
    const previstoInicial = m.setRotaPrevista.mock.calls.at(-1)?.[0] as DecisaoDeRota[]

    await m.falar()
    await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([]) // duas difíceis: ainda no aparelho
    await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
    expect(m.setSttRouteLabel).toHaveBeenLastCalledWith(expect.stringMatching(/áudio difícil/))
    const previstoNaNuvem = m.setRotaPrevista.mock.calls.at(-1)?.[0] as DecisaoDeRota[]
    expect(previstoNaNuvem).not.toBe(previstoInicial)

    // A nuvem atende: depois do mínimo, o aparelho volta à frente, com o previsto e o rótulo do aparelho.
    m.transcribePcm.mockResolvedValue({ text: 'a nuvem ouviu bem esta fala', engine: 'groq-whisper' })
    for (let i = 0; i < LIMIARES_DO_AUDIO_DIFICIL.minimoNaNuvem - 1; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
    await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true, false])
    expect(m.setSttRouteLabel).toHaveBeenLastCalledWith(rotaAparelhoPrimeiro.label)
    expect(m.setRotaPrevista.mock.calls.at(-1)?.[0]).toBe(previstoInicial)
  })

  it('falas fáceis não mexem na rota', async () => {
    cena.rota = rotaAparelhoPrimeiro
    const m = montar()
    m.transcribePcm.mockResolvedValue(FALA_FACIL)
    await m.p.prepareModels()
    for (let i = 0; i < 6; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([])
  })
})

describe('flag desligada: a rota de hoje', () => {
  it('rota local sem `nuvemNoAudioDificil`: falas difíceis não trocam quem vai primeiro', async () => {
    cena.rota = {
      localModel: ID_DO_PARAKEET,
      device: 'wasm',
      preferCloud: false,
      label: 'local · modelo preciso (Parakeet v3)',
    }
    const m = montar()
    await m.p.prepareModels()
    for (let i = 0; i < 6; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([])
  })
})

describe('Parakeet de reserva da nuvem (item 5)', () => {
  it('começa com o Whisper base quente; na primeira falha da nuvem, o Parakeet entra na cadeia e carrega', async () => {
    cena.rota = {
      localModel: ID_DO_PARAKEET,
      device: 'wasm',
      preferCloud: true,
      label: 'nuvem (large-v3-turbo) · reserva local',
    }
    const m = montar()
    await m.p.prepareModels()
    expect(m.setRoute).toHaveBeenCalledTimes(1)
    expect(m.setRoute).toHaveBeenLastCalledWith({
      preferCloud: true,
      localModel: WHISPER_MODELS.base,
      dtype: 'hybrid',
      device: undefined,
    })
    const cargasAntes = m.preloadModel.mock.calls.length
    avisarFalhaDaNuvemDoStt()
    expect(m.setRoute).toHaveBeenLastCalledWith({ preferCloud: true, localModel: ID_DO_PARAKEET, device: 'wasm' })
    expect(m.preloadModel.mock.calls.length).toBe(cargasAntes + 1)
    // Só uma vez: a segunda falha não recarrega nada.
    avisarFalhaDaNuvemDoStt()
    expect(m.setRoute).toHaveBeenCalledTimes(2)
    expect(m.preloadModel.mock.calls.length).toBe(cargasAntes + 1)
  })

  it('reserva Whisper base (sem o Parakeet pronto): a falha não troca nada', async () => {
    cena.rota = {
      localModel: WHISPER_MODELS.base,
      dtype: 'hybrid',
      preferCloud: true,
      label: 'nuvem (large-v3-turbo) · reserva local',
    }
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt()
    expect(m.setRoute).toHaveBeenCalledTimes(1)
  })
})
