// @vitest-environment jsdom
/**
 * A TRADUÇÃO PARCIAL ESTÁVEL no pipeline do intérprete (task 3.2), atrás da chave `parcialTraduzido`:
 *   - desligada (`nao`; a chave nasce LIGADA desde 5c267486), cada parcial novo pede tradução como sempre;
 *   - ligada, só o trecho estável (duas leituras iguais + fronteira de oração) é traduzido, com a janela de 1,2 s;
 *   - o parcial é sempre pedido como `descartarSeOcupado` (só local, nunca à nuvem) e nunca chama o aviso do final;
 *   - fora do intérprete a chave não vale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: false, tipo: 'desktop' }) }
})
vi.mock('../src/gateway/capture/systemAudio', () => ({
  MAX_SPEECH_MS_LOCAL: 6000,
  MAX_SPEECH_MS_NUVEM: 12000,
  startSystemAudioCapture: vi.fn(),
  startMicCapture: vi.fn(),
  startServerLoopbackCapture: vi.fn(),
  startSystemLoopbackCapture: vi.fn(),
}))

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { direcaoDoLado } from '../src/lib/captura/interprete'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))
const PCM = new Float32Array(16000)
const MIC = 1_000_000
const CHAVE = 'babel.interprete.parcialTraduzido'

function montar(o: { cenario?: string; leituras: string[] }) {
  let estado: SpeechSegment[] = []
  const set = vi.fn((a: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    estado = typeof a === 'function' ? a(estado) : a
  })
  const fila = [...o.leituras]
  const transcribePartial = vi.fn(async () => ({ text: fila.shift() ?? '' }))
  const translateSegment = vi.fn()
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(async () => ({ text: 'x', engine: 'whisper-local' })),
        transcribePartial,
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(),
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(async () => {}),
      },
    },
    sourceLang: 'pt-BR',
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    autoDetectLangRef: ref(false),
    autoDetectMyLangRef: ref(false),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(o.cenario ?? 'interprete'),
    perfModeRef: ref(false),
    micEnabled: true,
    micEngine: 'whisper',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments: set,
    seqToSegmentRef: ref(new Map<number, string>()),
    lastPartialTextRef: ref(new Map<number, string>()),
    contextoDoSttRef: ref(new ContextoDoStt()),
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
    sistemaAtivo: () => false,
    direcaoDoMicrofone: () => direcaoDoLado('outro', { meu: 'pt-BR', outro: 'en-US' }),
    aoFimDaFala: vi.fn(),
  }
  const p = criarPipelineDeFala(deps as never)
  /** Uma leitura do parcial da fala 1, `ms` depois do começo. */
  const ler = async (ms: number) => {
    agora = ms
    p.micHandlers.onPartialAudio(PCM, 16000, 1)
    await esperar()
    await esperar()
  }
  p.micHandlers.onSpeechStart(1)
  return { ler, translateSegment, transcribePartial, p, set, falas: () => estado }
}

let agora = 0
beforeEach(() => {
  agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const ID = `mic-${MIC + 1}`

describe('pipeline: tradução parcial estável (chave parcialTraduzido)', () => {
  it('desligada: cada parcial novo pede tradução, como sempre', async () => {
    /* A chave nasce ligada (`testesDoInterprete.ts`: só o valor `nao` desliga). */
    localStorage.setItem(CHAVE, 'nao')
    const m = montar({ leituras: ['Where is', 'Where is the station'] })
    await m.ler(1000)
    await m.ler(2200)
    expect(m.translateSegment).toHaveBeenCalledTimes(2)
  })

  it('ligada: só o trecho estável (duas leituras iguais com pontuação) é traduzido', async () => {
    localStorage.setItem(CHAVE, 'sim')
    const m = montar({ leituras: ['Where is', 'I want to buy rice,', 'I want to buy rice,'] })
    await m.ler(1000)
    await m.ler(2200)
    expect(m.translateSegment).not.toHaveBeenCalled()
    await m.ler(3400)
    expect(m.translateSegment).toHaveBeenCalledTimes(1)
    expect(m.translateSegment).toHaveBeenCalledWith(ID, 'I want to buy rice,', 'en', 'pt', {
      descartarSeOcupado: true,
      falada: true,
    })
  })

  it('ligada: a mesma frase estável não é traduzida duas vezes', async () => {
    localStorage.setItem(CHAVE, 'sim')
    const m = montar({ leituras: ['Good morning, friend.', 'Good morning, friend.', 'Good morning, friend.'] })
    await m.ler(1000)
    await m.ler(2200)
    await m.ler(3400)
    expect(m.translateSegment).toHaveBeenCalledTimes(1)
  })

  it('ligada, mas fora do intérprete: o caminho antigo', async () => {
    localStorage.setItem(CHAVE, 'sim')
    const m = montar({ cenario: 'media', leituras: ['Where is'] })
    await m.ler(1000)
    expect(m.translateSegment).toHaveBeenCalledTimes(1)
  })
})

/**
 * A TRADUÇÃO PARCIAL NÃO É APAGADA NO FINAL: o balão volta a "…" (o resto do motor depende disso), e a
 * parcial que estava na tela vai à parte, em `traducaoProvisoria`, para a legenda mantê-la até a do final.
 */
describe('pipeline: o final guarda a tradução parcial que a tela já mostrava', () => {
  const fechar = async (m: ReturnType<typeof montar>) => {
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    for (let i = 0; i < 6; i++) await esperar()
    return m.falas().find((s) => s.id === ID)!
  }

  it('a fala abre sem texto, com a tradução a caminho', () => {
    const m = montar({ leituras: [] })
    expect(m.falas()).toHaveLength(1)
    expect(m.falas()[0]).toMatchObject({ id: ID, originalText: '', translatedText: '…', isPartial: true })
  })

  it('com tradução parcial na tela: ela segue em `traducaoProvisoria` e o balão volta a "…"', async () => {
    const m = montar({ leituras: [] })
    m.set((prev) => prev.map((s) => ({ ...s, originalText: 'Where is', translatedText: 'Onde fica' })))
    const f = await fechar(m)
    expect(f).toMatchObject({
      originalText: 'x',
      translatedText: '…',
      isPartial: false,
      traducaoProvisoria: 'Onde fica',
    })
    expect(m.translateSegment).toHaveBeenCalledWith(ID, 'x', 'en', 'pt', { falada: true })
  })

  it('sem tradução parcial: nada muda (o balão fica em "…", sem provisória)', async () => {
    const m = montar({ leituras: [] })
    m.set((prev) => prev.map((s) => ({ ...s, originalText: 'Where is' })))
    const f = await fechar(m)
    expect(f).toMatchObject({ originalText: 'x', translatedText: '…', isPartial: false })
    expect('traducaoProvisoria' in f).toBe(false)
  })
})
