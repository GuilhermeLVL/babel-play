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
// O plano (transcrição de nuvem) muda por caso; o resto das permissões é o de sempre.
const plano = vi.hoisted(() => ({ nuvemStt: false }))
vi.mock('../src/lib/entitlements', async (original) => {
  const m = await original<typeof import('../src/lib/entitlements')>()
  return { ...m, getEntitlements: () => ({ ...m.getEntitlements(), managedCloudStt: plano.nuvemStt }) }
})

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

function montar(
  opts: { nuvem?: boolean; autoMic?: boolean; regulador?: unknown; extra?: Record<string, unknown> } = {},
) {
  const transcribePcm = vi.fn(async () => ({ text: 'Olá, tudo bem?', engine: 'whisper-local' }))
  const transcribePartial = vi.fn(async () => ({ text: 'Olá' }))
  const translateSegment = vi.fn()
  const transcribePcmNaNuvem = vi.fn(async () => ({ text: 'A gente vai falar disso amanhã.', engine: 'groq-whisper' }))
  const contexto = new ContextoDoStt()
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial,
        pendingCount: () => 0,
        finalNaNuvem: () => opts.nuvem === true,
        transcribePcmNaNuvem,
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(async () => {}),
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
    reguladorRef: opts.regulador ? ref(opts.regulador) : undefined,
    sistemaAtivo: () => false,
    ...opts.extra,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, deps, transcribePcm, transcribePartial, translateSegment, contexto, transcribePcmNaNuvem }
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

describe('regulador de desempenho no pipeline', () => {
  it('cada final LOCAL alimenta o regulador (RTF, fila, latência); parciais cortados não decodificam', async () => {
    const regulador = { parciaisCortados: false, parciaisDoMicPausados: false, aoFinal: vi.fn(), reiniciar: vi.fn() }
    const { p, transcribePartial } = montar({ regulador })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await esperar()
    expect(regulador.aoFinal).toHaveBeenCalledTimes(1)
    const [medida, efeitos] = regulador.aoFinal.mock.calls[0]
    expect(medida).toMatchObject({ filaPendente: 0, modoSoOuvir: false })
    expect(typeof efeitos.trocarModelo).toBe('function')
    regulador.parciaisCortados = true
    p.micHandlers.onSpeechStart(2)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 2)
    expect(transcribePartial).not.toHaveBeenCalled()
  })

  it('aba escondida: os parciais do MIC param, os do sistema seguem', () => {
    const regulador = { parciaisCortados: false, parciaisDoMicPausados: true, aoFinal: vi.fn(), reiniciar: vi.fn() }
    const { p, transcribePartial } = montar({ regulador })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).not.toHaveBeenCalled()
    p.sysHandlers.onSpeechStart(1)
    p.sysHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).toHaveBeenCalledTimes(1)
  })

  it('final da nuvem não alimenta o regulador (mede a rede, não o aparelho)', async () => {
    const regulador = { parciaisCortados: false, parciaisDoMicPausados: false, aoFinal: vi.fn(), reiniciar: vi.fn() }
    const { p, transcribePcm } = montar({ regulador })
    transcribePcm.mockResolvedValueOnce({ text: 'Olá', engine: 'groq-whisper' })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await esperar()
    expect(regulador.aoFinal).not.toHaveBeenCalled()
  })
})

describe('porta de qualidade do STT no pipeline', () => {
  const LACO = 'a gente vai '.repeat(10).trim()

  it('final local em laço + plano com nuvem → só este trecho sobe; a nuvem vence', async () => {
    plano.nuvemStt = true
    try {
      const { p, transcribePcm, transcribePcmNaNuvem, translateSegment } = montar()
      transcribePcm.mockResolvedValueOnce({ text: LACO, engine: 'whisper-local' })
      p.micHandlers.onSpeechStart(1)
      p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
      await esperar()
      await esperar()
      expect(transcribePcmNaNuvem).toHaveBeenCalledTimes(1)
      expect(translateSegment).toHaveBeenCalledWith(expect.any(String), 'A gente vai falar disso amanhã.', 'pt', 'en', {
        falada: true,
      })
    } finally {
      plano.nuvemStt = false
    }
  })

  it('grátis: o laço fica local (sem nuvem)', async () => {
    const { p, transcribePcm, transcribePcmNaNuvem } = montar()
    transcribePcm.mockResolvedValueOnce({ text: LACO, engine: 'whisper-local' })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await esperar()
    expect(transcribePcmNaNuvem).not.toHaveBeenCalled()
  })

  it('fala normal não sobe, nem com plano', async () => {
    plano.nuvemStt = true
    try {
      const { p, transcribePcmNaNuvem } = montar()
      p.micHandlers.onSpeechStart(1)
      p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
      await esperar()
      expect(transcribePcmNaNuvem).not.toHaveBeenCalled()
    } finally {
      plano.nuvemStt = false
    }
  })
})

describe('o tradutor da fala do Rápido (não há modelo de transcrição a esperar)', () => {
  it('carrega JÁ o tradutor da SUA fala (pt→en), com a barra na preparação, e retraduz no 100%', async () => {
    let progresso: ((p: number, l?: string, b?: { loaded: number; total: number }) => void) | undefined
    const preload = vi.fn((_de: string, _para: string, cb?: typeof progresso) => {
      progresso = cb
      return new Promise<void>(() => {})
    })
    const { p, deps } = montar()
    ;(deps.gateway as unknown as { mt: unknown }).mt = { preload }
    p.prepararTradutorDaFala()
    expect(preload).toHaveBeenCalledWith('pt', 'en', expect.any(Function))
    // Sem progresso ainda, nenhum painel (o nativo pronto nem chega a baixar nada).
    expect(deps.setModelPrep).not.toHaveBeenCalled()
    progresso!(0.3, 'baixando', { loaded: 30, total: 100 })
    const atualizar = (deps.setModelPrep as ReturnType<typeof vi.fn>).mock.calls[0][0] as (s: unknown) => unknown
    expect(atualizar(null)).toMatchObject({ whisper: null, mt: 0.3, mtBytes: { loaded: 30, total: 100 }, done: false })
    expect(deps.retraduzirDegradados).not.toHaveBeenCalled()
    progresso!(1)
    expect(deps.retraduzirDegradados).toHaveBeenCalledTimes(1)
  })

  it('a sua fala já no idioma da legenda: nada carrega', () => {
    const preload = vi.fn(async () => {})
    const { p, deps } = montar({ extra: { targetLangRef: ref('pt-PT') } })
    ;(deps.gateway as unknown as { mt: unknown }).mt = { preload }
    p.prepararTradutorDaFala()
    expect(preload).not.toHaveBeenCalled()
  })
})
