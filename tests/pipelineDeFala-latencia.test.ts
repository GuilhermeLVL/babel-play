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
/* O perfil do aparelho também muda por caso. Sem o mock, o jsdom (sem getDisplayMedia, sem WebGPU)
   seria classificado como celular fraco — leve — em todos os testes. */
const aparelho = vi.hoisted(() => ({ leve: false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: aparelho.leve }) }
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
/** Um quadro de pintura (o jsdom do vitest tem `requestAnimationFrame`). */
const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

interface Balao {
  id: string
  originalText: string
  isPartial: boolean
}
/** Um `setSpeechSegments` de verdade em miniatura: guarda o estado e conta as chamadas. */
function falasFalsas() {
  let estado: Balao[] = []
  const set = vi.fn((a: Balao[] | ((p: Balao[]) => Balao[])) => {
    estado = typeof a === 'function' ? a(estado) : a
  })
  return { set, ler: () => estado }
}

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
    const regulador = {
      parciaisCortados: false,
      parciaisDoMicPausados: false,
      aoFinal: vi.fn(),
      aoParcial: vi.fn(),
      reiniciar: vi.fn(),
    }
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
    const regulador = {
      parciaisCortados: false,
      parciaisDoMicPausados: true,
      aoFinal: vi.fn(),
      aoParcial: vi.fn(),
      reiniciar: vi.fn(),
    }
    const { p, transcribePartial } = montar({ regulador })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).not.toHaveBeenCalled()
    p.sysHandlers.onSpeechStart(1)
    p.sysHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).toHaveBeenCalledTimes(1)
  })

  it('final da nuvem não alimenta o regulador (mede a rede, não o aparelho)', async () => {
    const regulador = {
      parciaisCortados: false,
      parciaisDoMicPausados: false,
      aoFinal: vi.fn(),
      aoParcial: vi.fn(),
      reiniciar: vi.fn(),
    }
    const { p, transcribePcm } = montar({ regulador })
    transcribePcm.mockResolvedValueOnce({ text: 'Olá', engine: 'groq-whisper' })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await esperar()
    expect(regulador.aoFinal).not.toHaveBeenCalled()
  })

  it('cada parcial decodificado alimenta aoParcial com a latência; worker ocupado não mede nada', async () => {
    const regulador = {
      parciaisCortados: false,
      parciaisDoMicPausados: false,
      aoFinal: vi.fn(),
      aoParcial: vi.fn(),
      reiniciar: vi.fn(),
    }
    const { p, transcribePartial } = montar({ regulador })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    await esperar()
    expect(regulador.aoParcial).toHaveBeenCalledTimes(1)
    const [latenciaMs, efeitos] = regulador.aoParcial.mock.calls[0]
    expect(latenciaMs).toBeGreaterThanOrEqual(0)
    expect(typeof efeitos.trocarModelo).toBe('function')
    transcribePartial.mockResolvedValueOnce(null as never) // worker ocupado: o parcial foi descartado
    p.micHandlers.onPartialAudio(new Float32Array(3200), 16000, 1)
    await esperar()
    expect(regulador.aoParcial).toHaveBeenCalledTimes(1)
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
    await quadro() // o progresso vai para a tela no quadro seguinte (um setState por quadro)
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

/**
 * UM setState POR QUADRO ("Grátis sem travar", A1): o streaming do final e o progresso dos modelos
 * chegavam à tela como dezenas de `setState` por segundo. As atualizações de um mesmo quadro viram
 * uma; o final passa na frente de tudo o que estava pendente, na mesma chamada.
 */
describe('um setState por quadro', () => {
  it('cinco tokens do streaming do final no mesmo quadro → UM setSpeechSegments', async () => {
    const falas = falasFalsas()
    const { p, transcribePcm } = montar({ extra: { setSpeechSegments: falas.set } })
    transcribePcm.mockImplementationOnce(((_pcm: Float32Array, _sr: number, o: { onUpdate: (t: string) => void }) => {
      for (const t of ['Olá', 'Olá, tu', 'Olá, tudo', 'Olá, tudo be', 'Olá, tudo bem']) o.onUpdate(t)
      return new Promise(() => {})
    }) as never)
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(1600), 16000, 1)
    const antes = falas.set.mock.calls.length
    await quadro()
    expect(falas.set.mock.calls.length - antes).toBe(1)
    expect(falas.ler()[0]).toMatchObject({ originalText: 'Olá, tudo bem', isPartial: true })
  })

  it('o final chega com streaming pendente: aplica os dois em ordem e nada velho cai depois dele', async () => {
    const falas = falasFalsas()
    const { p, transcribePcm } = montar({ extra: { setSpeechSegments: falas.set } })
    transcribePcm.mockImplementationOnce(((_pcm: Float32Array, _sr: number, o: { onUpdate: (t: string) => void }) => {
      o.onUpdate('Olá, tu')
      return Promise.resolve({ text: 'Olá, tudo bem?', engine: 'whisper-local' })
    }) as never)
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(1600), 16000, 1)
    await esperar()
    expect(falas.ler()[0]).toMatchObject({ originalText: 'Olá, tudo bem?', isPartial: false })
    const depoisDoFinal = falas.set.mock.calls.length
    await quadro()
    expect(falas.set.mock.calls.length).toBe(depoisDoFinal) // o quadro não tinha mais nada a aplicar
    expect(falas.ler()[0]).toMatchObject({ originalText: 'Olá, tudo bem?', isPartial: false })
  })

  it('rajada de progresso do modelo no mesmo quadro → UM setModelPrep', async () => {
    let progresso: ((p: number, l?: string, b?: { loaded: number; total: number }) => void) | undefined
    const preload = vi.fn((_de: string, _para: string, cb?: typeof progresso) => {
      progresso = cb
      return new Promise<void>(() => {})
    })
    const { p, deps } = montar()
    ;(deps.gateway as unknown as { mt: unknown }).mt = { preload }
    p.prepararTradutorDaFala()
    for (let i = 1; i <= 20; i++) progresso!(i / 100, 'baixando', { loaded: i, total: 100 })
    expect(deps.setModelPrep).not.toHaveBeenCalled()
    await quadro()
    expect(deps.setModelPrep).toHaveBeenCalledTimes(1)
    const atualizar = (deps.setModelPrep as ReturnType<typeof vi.fn>).mock.calls[0][0] as (s: unknown) => unknown
    expect(atualizar(null)).toMatchObject({ mt: 0.2, mtBytes: { loaded: 20, total: 100 } })
  })
})

/**
 * WORKERS QUE DESCANSAM ("Grátis sem travar", A5): o pipeline diz à captura se quer o parcial ANTES de
 * ela copiar o áudio, espaça os parciais no aparelho leve e não especula onde o aparelho não acompanha.
 */
describe('workers que descansam', () => {
  const reguladorFalso = () => ({
    parciaisCortados: false,
    parciaisDoMicPausados: false,
    aoFinal: vi.fn(),
    aoParcial: vi.fn(),
    reiniciar: vi.fn(),
  })

  it('`querParcial`: não no modo desempenho, com parciais cortados, e (só no mic) com a aba escondida', () => {
    const regulador = reguladorFalso()
    const { p, deps } = montar({ regulador })
    expect(p.micHandlers.querParcial()).toBe(true)
    expect(p.sysHandlers.querParcial()).toBe(true)
    regulador.parciaisDoMicPausados = true
    expect(p.micHandlers.querParcial()).toBe(false)
    expect(p.sysHandlers.querParcial()).toBe(true) // o sistema segue: é o "só ouvir"
    regulador.parciaisDoMicPausados = false
    regulador.parciaisCortados = true
    expect(p.micHandlers.querParcial()).toBe(false)
    expect(p.sysHandlers.querParcial()).toBe(false)
    regulador.parciaisCortados = false
    deps.perfModeRef.current = true
    expect(p.micHandlers.querParcial()).toBe(false)
    expect(p.sysHandlers.querParcial()).toBe(false)
  })

  it('`querParcial` falso: um parcial que chegue mesmo assim não vai ao STT', () => {
    const { p, deps, transcribePartial } = montar()
    deps.perfModeRef.current = true
    expect(p.sysHandlers.querParcial()).toBe(false)
    p.sysHandlers.onSpeechStart(1)
    p.sysHandlers.onPartialAudio(new Float32Array(1600), 16000, 1)
    expect(transcribePartial).not.toHaveBeenCalled()
  })

  it('`intervaloDosParciais`: 1,1 s de padrão, 2,2 s no aparelho leve', () => {
    expect(montar().p.micHandlers.intervaloDosParciais()).toBe(1100)
    aparelho.leve = true
    try {
      const { p } = montar()
      expect(p.micHandlers.intervaloDosParciais()).toBe(2200)
      expect(p.sysHandlers.intervaloDosParciais()).toBe(2200)
    } finally {
      aparelho.leve = false
    }
  })

  it('sem final especulativo no aparelho leve — nenhum decode a mais', () => {
    aparelho.leve = true
    try {
      const { p, transcribePcm } = montar()
      p.micHandlers.onSpeechStart(1)
      expect(p.micHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)).toBeNull()
      expect(transcribePcm).not.toHaveBeenCalled()
    } finally {
      aparelho.leve = false
    }
  })

  it('sem final especulativo com parciais cortados pelo regulador', () => {
    const regulador = { ...reguladorFalso(), parciaisCortados: true }
    const { p, transcribePcm } = montar({ regulador })
    p.sysHandlers.onSpeechStart(1)
    expect(p.sysHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)).toBeNull()
    expect(transcribePcm).not.toHaveBeenCalled()
  })

  it('sem final especulativo no modo desempenho', () => {
    const { p, deps, transcribePcm } = montar()
    deps.perfModeRef.current = true
    p.micHandlers.onSpeechStart(1)
    expect(p.micHandlers.onFinalEspeculativo(new Float32Array(1600), 16000, 1)).toBeNull()
    expect(transcribePcm).not.toHaveBeenCalled()
  })
})

/**
 * O MODO DESEMPENHO DA PESSOA × O AUTOMÁTICO (A6b, medido na bancada A0 em 30/09/2026). O da pessoa
 * promete na tela "Legenda só no fim de cada frase" e cumpre, também no aparelho leve. O automático
 * (o perfil leve o liga de fábrica, sem a pessoa escolher) guarda UM parcial por fala, com 1,5 s de
 * fala: é o que traz a 1ª legenda de ~5 s de volta para ~2 s sem pagar os parciais da fala inteira.
 */
describe('modo desempenho: o da pessoa × o automático', () => {
  const comAparelhoLeve = (corpo: () => void | Promise<void>) => async () => {
    aparelho.leve = true
    try {
      await corpo()
    } finally {
      aparelho.leve = false
    }
  }
  const montarNoModo = (escolhido: boolean, regulador?: unknown) => {
    const r = montar({ regulador, extra: { perfModeEscolhidoRef: ref(escolhido) } })
    r.deps.perfModeRef.current = true
    return r
  }

  it(
    'ESCOLHIDO pela pessoa: nenhum parcial, nem no aparelho leve ("só no fim de cada frase")',
    comAparelhoLeve(async () => {
      const { p, transcribePartial } = montarNoModo(true)
      expect(p.sysHandlers.querParcial()).toBe(false)
      expect(p.micHandlers.querParcial()).toBe(false)
      p.sysHandlers.onSpeechStart(1)
      p.sysHandlers.onPartialAudio(new Float32Array(24000), 16000, 1)
      p.micHandlers.onSpeechStart(1)
      p.micHandlers.onPartialAudio(new Float32Array(24000), 16000, 1)
      await esperar()
      expect(transcribePartial).not.toHaveBeenCalled()
    }),
  )

  it(
    'AUTOMÁTICO: quer o parcial, o 1º espera 1,5 s de fala e não há 2º',
    comAparelhoLeve(() => {
      const { p } = montarNoModo(false)
      for (const h of [p.sysHandlers, p.micHandlers]) {
        expect(h.querParcial()).toBe(true)
        expect(h.primeiroParcialComMs()).toBe(1500)
        expect(h.intervaloDosParciais()).toBe(Infinity)
      }
    }),
  )

  it(
    'AUTOMÁTICO: um parcial só por fala, mesmo que outro chegue (em voo ou depois do texto)',
    comAparelhoLeve(async () => {
      const { p, transcribePartial, translateSegment } = montarNoModo(false)
      p.sysHandlers.onSpeechStart(1)
      p.sysHandlers.onPartialAudio(new Float32Array(24000), 16000, 1)
      p.sysHandlers.onPartialAudio(new Float32Array(28000), 16000, 1) // o 1º ainda decodifica
      await esperar()
      p.sysHandlers.onPartialAudio(new Float32Array(40000), 16000, 1) // o 1º já trouxe o texto
      expect(transcribePartial).toHaveBeenCalledTimes(1)
      expect(translateSegment).toHaveBeenCalledTimes(1) // o parcial também é traduzido, uma vez
      // A fala seguinte tem o seu.
      p.sysHandlers.onSpeechStart(2)
      p.sysHandlers.onPartialAudio(new Float32Array(24000), 16000, 2)
      expect(transcribePartial).toHaveBeenCalledTimes(2)
    }),
  )

  it(
    'AUTOMÁTICO: o regulador ainda corta o parcial único quando o aparelho não acompanha',
    comAparelhoLeve(() => {
      const regulador = {
        parciaisCortados: true,
        parciaisDoMicPausados: false,
        aoFinal: vi.fn(),
        aoParcial: vi.fn(),
        reiniciar: vi.fn(),
      }
      const { p } = montarNoModo(false, regulador)
      expect(p.sysHandlers.querParcial()).toBe(false)
      expect(p.micHandlers.querParcial()).toBe(false)
    }),
  )

  it(
    'a pessoa DESLIGA o modo: parciais de volta, no espaçamento do aparelho leve',
    comAparelhoLeve(() => {
      const { p, deps } = montarNoModo(true)
      deps.perfModeRef.current = false
      expect(p.sysHandlers.querParcial()).toBe(true)
      expect(p.sysHandlers.intervaloDosParciais()).toBe(2200)
      expect(p.sysHandlers.primeiroParcialComMs()).toBe(0)
    }),
  )

  it('sem o modo desempenho, o 1º parcial sai no mínimo da própria captura', () => {
    const { p } = montar()
    expect(p.sysHandlers.primeiroParcialComMs()).toBe(0)
    expect(p.micHandlers.primeiroParcialComMs()).toBe(0)
  })

  it('sem saber quem ligou (quem monta o pipeline não diz): vale a promessa, nenhum parcial', () => {
    const { p, deps } = montar()
    deps.perfModeRef.current = true
    expect(p.sysHandlers.querParcial()).toBe(false)
  })
})
