// @vitest-environment jsdom
/**
 * O PIPELINE DE FALA E A NUVEM DE ALÍVIO (A10): os dois fios.
 *  1. O chão da escada do regulador (o aparelho não acompanha nem com o modelo menor) pergunta à tela
 *     se há nuvem grátis; se a tela mostrou a oferta, o aviso genérico de sempre não sai.
 *  2. Aceita a oferta, `ligarNuvemDeAlivio` refaz a rota com o cabeçalho do alívio e, se o servidor
 *     responder, a transcrição vai à nuvem primeiro, sem trocar o modelo local (a reserva). Se o
 *     servidor recusar, nada muda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: true }) }
})

import { apiFetch } from '../src/data/api'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import { _reiniciarAlivio, aceitarAlivio } from '../src/lib/nuvemDeAlivio/estado'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>
const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

/** Um regulador que já chegou ao chão: todo final local pede a oferta do nativo/nuvem. */
function reguladorNoChao() {
  return {
    reiniciar: vi.fn(),
    registrarFalha: vi.fn(),
    aoFinal: vi.fn((_m: unknown, efeitos: { oferecerNativoOuNuvem: () => void }) => {
      efeitos.oferecerNativoOuNuvem()
      return ['oferecer-nativo-ou-nuvem']
    }),
    aoParcial: vi.fn(() => []),
    modeloEmUso: () => 'onnx-community/whisper-base',
    parciaisCortados: false,
    parciaisDoMicPausados: false,
  }
}

function montar(extra: Record<string, unknown> = {}) {
  const setRoute = vi.fn()
  const setFeedbackMsg = vi.fn()
  const setSttRouteLabel = vi.fn()
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(async () => ({ text: 'Olá, tudo bem?', engine: 'whisper-local' })),
        transcribePartial: vi.fn(async () => ({ text: 'Olá' })),
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(async () => null),
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(async () => {}),
        setRoute,
      },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('es-ES'),
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
    setFeedbackMsg,
    setModelPrep: vi.fn(),
    setSttRouteLabel,
    sistemaAtivo: () => false,
    ...extra,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, setRoute, setFeedbackMsg, setSttRouteLabel, gateway: deps.gateway }
}

beforeEach(() => {
  api.mockReset()
  api.mockResolvedValue({ ok: false })
  _reiniciarAlivio()
})

describe('o chão da escada pergunta pela nuvem grátis', () => {
  it('a tela mostrou a oferta: o aviso genérico não sai, e o motivo é o travamento', async () => {
    const pedirNuvemDeAlivio = vi.fn(async () => true)
    const { p, setFeedbackMsg } = montar({ reguladorRef: ref(reguladorNoChao()), pedirNuvemDeAlivio })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16_000), 16_000, 1)
    await vi.waitFor(() => expect(pedirNuvemDeAlivio).toHaveBeenCalled())
    await esperar()
    const [motivo, aparelho] = pedirNuvemDeAlivio.mock.calls[0] as unknown as [string, { travamento: boolean }]
    expect(motivo).toBe('travamento')
    expect(aparelho.travamento).toBe(true)
    expect(setFeedbackMsg).not.toHaveBeenCalledWith(expect.stringMatching(/não está acompanhando/))
  })

  it('sem oferta (fora do Grátis, sem franquia): o aviso de sempre', async () => {
    const pedirNuvemDeAlivio = vi.fn(async () => false)
    const { p, setFeedbackMsg } = montar({ reguladorRef: ref(reguladorNoChao()), pedirNuvemDeAlivio })
    p.micHandlers.onSpeechStart(1)
    p.micHandlers.onUtterance(new Float32Array(16_000), 16_000, 1)
    await vi.waitFor(() => expect(setFeedbackMsg).toHaveBeenCalledWith(expect.stringMatching(/não está acompanhando/)))
  })
})

describe('a preparação no aparelho fraco', () => {
  /* O que muda entre os dois casos é só a opção da preparação: sem microfone no Whisper, o áudio da aba
     no reconhecedor do navegador (A9a) deixa o aparelho sem modelo de fala nenhum para aliviar. */
  const preparar = async (opcoes: Record<string, unknown>) => {
    const pedirNuvemDeAlivio = vi.fn(async () => true)
    const { p } = montar({ micEnabled: false, pedirNuvemDeAlivio })
    await p.prepareModels(opcoes as never).catch(() => undefined)
    return pedirNuvemDeAlivio
  }

  it('com o Whisper local na rota, oferece a nuvem grátis pelo aparelho', async () => {
    const pedir = await preparar({})
    expect(pedir).toHaveBeenCalledWith('aparelho', expect.objectContaining({ leve: true }))
  })

  it('com o áudio da aba no reconhecedor do navegador, não oferece (não há o que aliviar)', async () => {
    const pedir = await preparar({ sistemaNoNavegador: true })
    expect(pedir).not.toHaveBeenCalled()
  })
})

describe('a preparação no modo intérprete (Whisper)', () => {
  it('carrega o tradutor dos DOIS sentidos: a primeira fala do outro lado não espera download', async () => {
    const preload = vi.fn(async () => {})
    // O gateway falso do `montar` não tem tradutor: põe um que só conta os pares.
    const m = montar({ micEnabled: false, captureScenarioRef: ref('interprete') })
    ;(m.gateway as unknown as { mt: unknown }).mt = { preload }
    await m.p.prepareModels({} as never).catch(() => undefined)
    await vi.waitFor(() => expect(preload).toHaveBeenCalledTimes(2))
    const pares = (preload.mock.calls as unknown as Array<[string, string]>).map(([de, para]) => `${de}>${para}`).sort()
    expect(pares).toEqual(['es>pt', 'pt>es'])
  })

  it('fora do intérprete, só o sentido de sempre', async () => {
    const preload = vi.fn(async () => {})
    const m = montar({ micEnabled: false })
    ;(m.gateway as unknown as { mt: unknown }).mt = { preload }
    await m.p.prepareModels({} as never).catch(() => undefined)
    await vi.waitFor(() => expect(preload).toHaveBeenCalledTimes(1))
    await esperar()
    expect(preload).toHaveBeenCalledTimes(1)
  })
})

describe('ligarNuvemDeAlivio', () => {
  it('com o aceite, a disponibilidade leva o cabeçalho e a rota passa à nuvem sem trocar o modelo local', async () => {
    aceitarAlivio()
    api.mockImplementation(async (caminho: string) => ({ ok: caminho === '/api/ai/stt/available' }))
    const { p, setRoute, setSttRouteLabel } = montar()
    expect(await p.ligarNuvemDeAlivio()).toBe(true)
    const chamada = api.mock.calls.find((c) => c[0] === '/api/ai/stt/available')
    expect((chamada?.[1] as { headers: Record<string, string> }).headers['x-nuvem-alivio']).toBe('1')
    expect(setRoute).toHaveBeenCalledWith({ preferCloud: true })
    expect(setSttRouteLabel).toHaveBeenCalledWith(expect.stringMatching(/nuvem grátis/))
  })

  it('o servidor recusou: nada muda, a legenda segue no aparelho', async () => {
    aceitarAlivio()
    api.mockResolvedValue({ ok: false })
    const { p, setRoute } = montar()
    expect(await p.ligarNuvemDeAlivio()).toBe(false)
    expect(setRoute).not.toHaveBeenCalled()
  })
})
