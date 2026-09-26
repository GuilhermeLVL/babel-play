// @vitest-environment jsdom
/**
 * O PIPELINE DE FALA E A LATÊNCIA (auditoria de 2026-09-26): o final especulativo é reaproveitado
 * sem novo decode; a fala fechada não pede parcial; no "Detectar" os parciais usam o idioma MEDIDO
 * no final anterior da mesma fonte.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

function montar(opts: { nuvem?: boolean; autoMic?: boolean } = {}) {
  const transcribePcm = vi.fn(async () => ({ text: 'Olá, tudo bem?', engine: 'whisper-local' }))
  const transcribePartial = vi.fn(async () => ({ text: 'Olá' }))
  const translateSegment = vi.fn()
  const contexto = new ContextoDoStt()
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial,
        pendingCount: () => 0,
        finalNaNuvem: () => opts.nuvem === true,
      },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    autoDetectLangRef: ref(false),
    autoDetectMyLangRef: ref(opts.autoMic === true),
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
    contextoDoSttRef: ref(contexto),
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
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, deps, transcribePcm, transcribePartial, translateSegment, contexto }
}

const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('final especulativo no pipeline', () => {
  it('o decode especulativo É o final: nenhum decode novo, a mesma tradução', async () => {
    const { p, transcribePcm, translateSegment } = montar()
    p.micHandlers.onSpeechStart(1)
    const handle = p.micHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)
    expect(handle).not.toBeNull()
    expect(transcribePcm).toHaveBeenCalledTimes(1)
    const opcoes = (transcribePcm.mock.calls[0] as unknown as [Float32Array, number, { signal: AbortSignal }])[2]
    expect(opcoes.signal).toBeInstanceOf(AbortSignal)
    p.micHandlers.onUtterance(new Float32Array(1600), 16000, 1, handle!)
    await esperar()
    expect(transcribePcm).toHaveBeenCalledTimes(1)
    expect(translateSegment).toHaveBeenCalledWith(expect.any(String), 'Olá, tudo bem?', 'pt', 'en', { falada: true })
  })

  it('cancelar aborta o decode especulativo', () => {
    const { p, transcribePcm } = montar()
    p.micHandlers.onSpeechStart(1)
    const handle = p.micHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)!
    handle.cancelar()
    const opcoes = (transcribePcm.mock.calls[0] as unknown as [Float32Array, number, { signal: AbortSignal }])[2]
    expect(opcoes.signal.aborted).toBe(true)
  })

  it('na nuvem não especula (cada pedido custa)', () => {
    const { p, transcribePcm } = montar({ nuvem: true })
    expect(p.micHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)).toBeNull()
    expect(transcribePcm).not.toHaveBeenCalled()
  })
})

describe('parciais e o fim da fala', () => {
  it('depois que a fala fecha, nenhum parcial dela é pedido', async () => {
    const { p, transcribePartial } = montar()
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(1600), 16000, 1)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).not.toHaveBeenCalled()
  })

  it('"Detectar": sem final anterior, sem parcial; depois dele, parcial com o idioma MEDIDO', async () => {
    const { p, transcribePartial, contexto } = montar({ autoMic: true })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).not.toHaveBeenCalled()
    contexto.registrar('mic', 'Olá, tudo bem?', 'pt')
    p.micHandlers.onSpeechStart(2)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 2)
    expect(transcribePartial).toHaveBeenCalledWith(expect.any(Float32Array), 16000, { languageHint: 'pt' })
  })
})
