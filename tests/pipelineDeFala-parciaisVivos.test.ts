// @vitest-environment jsdom
/**
 * O PIPELINE COM `parciais_vivos` LIGADA (variante V4 de `parciais-incrementais`): o limitador de 125 ms da tela do parcial junta as
 * hipóteses intermediárias (fica a última), o modo `acrescenta-decode` só acrescenta, e o FINAL nunca é segurado nem sobrescrito por
 * um parcial que o limitador ainda guardava. Os decodes entram por `transcribePartial` (o modo `acrescenta-decode` não pinta o `onUpdate`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: false }) }
})
const flags = vi.hoisted(() => ({ ligadas: new Set<string>() }))
/** Cada texto que a tela recebeu pelo armazém do parcial vivo (V6): o que a linha mostra entre o 1º texto e o final. */
const armazem = vi.hoisted(() => ({ escritas: [] as string[] }))
vi.mock('../src/lib/captura/parcialVivo', async (original) => {
  const m = await original<typeof import('../src/lib/captura/parcialVivo')>()
  return {
    ...m,
    escreverParcialVivo: (id: string, v: Parameters<typeof m.escreverParcialVivo>[1]) => {
      if (armazem.escritas.at(-1) !== v.originalText) armazem.escritas.push(v.originalText) // só as mudanças, como a história do estado
      m.escreverParcialVivo(id, v)
    },
  }
})
vi.mock('../src/lib/flags', async (original) => {
  const m = await original<typeof import('../src/lib/flags')>()
  return { ...m, flagLigada: (nome: string) => flags.ligadas.has(nome) }
})

import { FLAG_PARCIAIS_VIVOS } from '../src/core/planos'
import { lerParcialVivo } from '../src/lib/captura/parcialVivo'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })

interface Balao {
  id: string
  originalText: string
  isPartial: boolean
}

/** Um `setSpeechSegments` em miniatura que guarda o estado e a HISTÓRIA do texto do balão (cada mudança). */
function falasFalsas() {
  let estado: Balao[] = []
  const historia: string[] = []
  const set = vi.fn((a: Balao[] | ((p: Balao[]) => Balao[])) => {
    estado = typeof a === 'function' ? a(estado) : a
    const texto = estado[0]?.originalText
    if (texto !== undefined && texto !== historia.at(-1)) historia.push(texto)
  })
  return { set, ler: () => estado[0], historia }
}

function montar(decodes: string[]) {
  const falas = falasFalsas()
  const fila = [...decodes]
  const transcribePartial = vi.fn(async () => ({ text: fila.shift() ?? '' }))
  const transcribePcm = vi.fn(async () => ({ text: 'Olá, tudo bem?', engine: 'whisper-local' }))
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial,
        pendingCount: () => 0,
        finalNaNuvem: () => false,
        transcribePcmNaNuvem: vi.fn(async () => null),
        trocarModeloLocal: vi.fn(),
        preloadModel: vi.fn(async () => {}),
        parakeetAtivo: () => false,
      },
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
    setSpeechSegments: falas.set,
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
    setSttRouteLabel: vi.fn(),
    sistemaAtivo: () => false,
  }
  return { p: criarPipelineDeFala(deps as never), falas, transcribePartial, transcribePcm }
}

/** Um parcial decodificado: pede o decode e deixa a promessa e o quadro de pintura rodarem. */
async function parcial(p: ReturnType<typeof montar>['p'], amostras: number) {
  p.micHandlers.onPartialAudio(new Float32Array(amostras), 16000, 1)
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  armazem.escritas = []
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  flags.ligadas = new Set([FLAG_PARCIAIS_VIVOS])
  localStorage.setItem('babel.lab.parciaisModo', 'acrescenta-decode')
  localStorage.setItem('babel.lab.parciaisMascara', '0') // sem máscara: o texto da hipótese vai inteiro, se estender o que já está na tela
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  flags.ligadas = new Set()
})

describe('parciais_vivos: limitador de 125 ms e modo acrescenta-decode', () => {
  it('hipóteses dentro do intervalo se juntam: a 1ª pinta já, a do meio nunca aparece, a última sai quando o intervalo vence', async () => {
    const { p, falas } = montar(['Olá', 'Olá tudo', 'Olá tudo bem'])
    p.micHandlers.onSpeechStart(1)
    await parcial(p, 1600)
    await parcial(p, 3200)
    await parcial(p, 4800)
    await vi.advanceTimersByTimeAsync(20) // o quadro de pintura, ainda dentro dos 125 ms
    expect(falas.ler()).toMatchObject({ originalText: 'Olá', isPartial: true }) // a 1ª aplicou direto
    expect(armazem.escritas).toEqual(['Olá'])
    await vi.advanceTimersByTimeAsync(130)
    /* V6: o 1º texto entra no estado; os seguintes, só no armazém (a linha o lê de lá). */
    expect(falas.ler()).toMatchObject({ originalText: 'Olá', isPartial: true })
    expect(lerParcialVivo(falas.ler().id)?.originalText).toBe('Olá tudo bem')
    expect(armazem.escritas).toEqual(['Olá', 'Olá tudo bem']) // a intermediária foi juntada
    expect(falas.historia.filter((t) => t)).toEqual(['Olá']) // o estado das falas (e a tela de captura) não mudou a cada parcial
  })

  it('só acrescenta: uma hipótese que diverge do que já está na tela não troca nem apaga palavra', async () => {
    const { p, falas } = montar(['Olá tudo', 'Alô tudo bem'])
    p.micHandlers.onSpeechStart(1)
    await parcial(p, 1600)
    await vi.advanceTimersByTimeAsync(200)
    await parcial(p, 3200)
    await vi.advanceTimersByTimeAsync(200)
    expect(armazem.escritas).toEqual(['Olá tudo'])
    expect(falas.historia.filter((t) => t)).toEqual(['Olá tudo'])
  })

  it('o final nunca é segurado: substitui o balão na hora e o parcial que o limitador guardava morre', async () => {
    const { p, falas, transcribePcm } = montar(['Olá', 'Olá tudo', 'Olá tudo bem'])
    p.micHandlers.onSpeechStart(1)
    await parcial(p, 1600) // aplicado
    await parcial(p, 3200) // segurado pelo limitador (agendado para daqui a ~125 ms)
    await parcial(p, 4800) // juntado ao segurado
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await vi.advanceTimersByTimeAsync(0) // SEM esperar o intervalo do limitador
    expect(transcribePcm).toHaveBeenCalledTimes(1)
    expect(falas.ler()).toMatchObject({ originalText: 'Olá, tudo bem?', isPartial: false })
    const chamadasComOFinal = falas.set.mock.calls.length
    await vi.advanceTimersByTimeAsync(500) // o agendamento venceria aqui: o final o cancelou, então nada mais chega à tela
    expect(falas.set.mock.calls.length).toBe(chamadasComOFinal)
    expect(falas.ler()).toMatchObject({ originalText: 'Olá, tudo bem?', isPartial: false })
    expect(falas.historia.at(-1)).toBe('Olá, tudo bem?')
    expect(falas.historia).not.toContain('Olá tudo bem')
    expect(armazem.escritas).toEqual(['Olá']) // o parcial segurado nunca chegou ao armazém
    expect(lerParcialVivo(falas.ler().id)).toBeUndefined() // o final fechou a fala: o armazém a esqueceu
  })

  it('sem a flag o limitador não existe: cada hipótese que chega é pintada no quadro seguinte', async () => {
    flags.ligadas = new Set()
    const { p, falas } = montar(['Olá', 'Olá tudo'])
    p.micHandlers.onSpeechStart(1)
    await parcial(p, 1600)
    await vi.advanceTimersByTimeAsync(20)
    await parcial(p, 3200)
    await vi.advanceTimersByTimeAsync(20)
    expect(falas.historia.filter((t) => t)).toEqual(['Olá', 'Olá tudo'])
    expect(armazem.escritas).toEqual([]) // flag desligada: nada passa pelo armazém, o estado leva cada hipótese
  })
})
