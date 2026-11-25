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

import { type EventoDeHipotese, simularExibicao } from '../src/core/legendas/exibicaoDoParcial'
import { FLAG_PARCIAIS_PARAKEET, FLAG_PARCIAIS_VIVOS } from '../src/core/planos'
import { lerParcialVivo, limparParcialVivo } from '../src/lib/captura/parcialVivo'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'

const ref = <T>(current: T) => ({ current })
/** O motor da cadeia no teste: os parciais vivos só valem com o Parakeet ativo. */
const motor = { parakeet: true }

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

function montar(decodes: string[], sourceLang = 'pt-BR') {
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
        parakeetAtivo: () => motor.parakeet,
      },
    },
    sourceLang,
    sourceLangRef: ref(sourceLang),
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
  flags.ligadas = new Set([FLAG_PARCIAIS_VIVOS, FLAG_PARCIAIS_PARAKEET])
  motor.parakeet = true
  // Sem `babel.lab.parciaisModo`: o modo é o PADRÃO (`acrescenta-decode`).
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

/**
 * O ESCOPO: com `parciais_vivos` ligada, o parcial vivo só existe na rota do Parakeet (pt/es, `parciais_parakeet` ligada e o Parakeet ativo).
 * Em qualquer outra rota o pipeline tem de se comportar EXATAMENTE como com as flags desligadas: mesma história do balão, mesmos pedidos ao
 * motor (sem `onUpdate` nem `parakeet`), nada no armazém, sem cadência adaptativa.
 */
describe('parciais_vivos: escopo só na rota do Parakeet', () => {
  /** Uma hipótese que diverge: com o vivo (só acrescenta) a tela fica em 'Olá tudo'; sem ele, troca para 'Alô tudo bem'. */
  const decodes = ['Olá tudo', 'Alô tudo bem', 'Alô tudo bem hoje']

  async function rodar(ligadas: string[], opts: { parakeet?: boolean; lang?: string } = {}) {
    flags.ligadas = new Set(ligadas)
    motor.parakeet = opts.parakeet ?? true
    armazem.escritas = []
    const m = montar(decodes, opts.lang ?? 'pt-BR')
    m.p.micHandlers.onSpeechStart(1)
    const cadencia = m.p.micHandlers.cadenciaDoParcial?.({
      seq: 1,
      janelaS: 2,
      msDesdeUltimo: 1000,
      amostrasNovas: 16000,
      silencioMs: 0,
    })
    for (const n of [1600, 3200, 4800]) {
      await parcial(m.p, n)
      await vi.advanceTimersByTimeAsync(300)
    }
    const id = m.falas.ler().id
    const noArmazem = lerParcialVivo(id)
    limparParcialVivo(id) // o armazém é global: a próxima rodada começa limpa
    return {
      historia: m.falas.historia,
      balao: m.falas.ler(),
      pedidos: m.transcribePartial.mock.calls.map((c) => {
        const o = ((c as unknown[])[2] ?? {}) as { languageHint?: string; onUpdate?: unknown; parakeet?: boolean }
        return { dica: o.languageHint, onUpdate: typeof o.onUpdate, parakeet: o.parakeet }
      }),
      chamadasDoEstado: m.falas.set.mock.calls.length,
      noArmazem,
      escritas: armazem.escritas,
      cadencia,
    }
  }
  const TODAS = [FLAG_PARCIAIS_VIVOS, FLAG_PARCIAIS_PARAKEET]

  it('na rota do Parakeet o parcial é vivo: cadência adaptativa, só acrescenta, armazém e `parakeet: true` no pedido', async () => {
    const r = await rodar(TODAS)
    expect(typeof r.cadencia).toBe('boolean')
    expect(r.pedidos.every((p) => p.parakeet === true)).toBe(true)
    expect(r.escritas.length).toBeGreaterThan(0)
    expect(r.historia.filter((x) => x)).toEqual(['Olá tudo']) // o estado só leva o 1º texto
    expect(r.noArmazem?.originalText.startsWith('Olá tudo')).toBe(true) // só acrescentou: nunca virou 'Alô…'
  })

  const rotasForaDoParakeet: Array<[string, string[], { parakeet?: boolean; lang?: string }]> = [
    ['inglês (Parakeet ativo, mas fora de pt/es)', TODAS, { lang: 'en-US' }],
    ['Whisper/Moonshine (Parakeet fora da cadeia)', TODAS, { parakeet: false }],
    ['só `parciais_vivos` (sem `parciais_parakeet`)', [FLAG_PARCIAIS_VIVOS], {}],
    ['só `parciais_parakeet` (sem `parciais_vivos`)', [FLAG_PARCIAIS_PARAKEET], {}],
  ]
  for (const [nome, ligadas, opts] of rotasForaDoParakeet) {
    it(`${nome}: idêntico a flags desligadas (história do balão, pedidos ao motor, nada no armazém, sem cadência)`, async () => {
      const desligadas = await rodar([], opts)
      const r = await rodar(ligadas, opts)
      expect(r.historia).toEqual(desligadas.historia)
      expect(r.balao).toMatchObject({ originalText: desligadas.balao.originalText, isPartial: true })
      expect(r.pedidos).toEqual(desligadas.pedidos)
      expect(r.chamadasDoEstado).toBe(desligadas.chamadasDoEstado)
      expect(r.noArmazem).toBeUndefined()
      expect(r.escritas).toEqual([])
      expect(r.cadencia).toBeUndefined() // a captura segue o tique fixo de sempre
      expect(desligadas.cadencia).toBeUndefined()
      expect(r.historia).toContain('Alô tudo bem hoje') // a prova de que não é o modo que só acrescenta
    })
  }
})

/**
 * GRAVAÇÃO DAS HIPÓTESES (laboratório, ciclo 3): com `babel.lab.gravarHipoteses=1` o pipeline guarda em `window.__hipoteses` cada decode, o
 * fechamento da fala e o final; o simulador, aplicado a esses eventos com a política que estava ligada, reproduz o que a tela recebeu de fato.
 */
describe('parciais_vivos: gravação das hipóteses para o simulador', () => {
  const lista = (): EventoDeHipotese[] => ((globalThis as { __hipoteses?: EventoDeHipotese[] }).__hipoteses ??= [])

  async function falar(lang?: string) {
    const antes = lista().length
    const { p, falas } = montar(['Olá', 'Olá tudo', 'Olá tudo bem'], lang)
    p.micHandlers.onSpeechStart(1)
    for (const n of [1600, 3200, 4800]) {
      await parcial(p, n)
      await vi.advanceTimersByTimeAsync(300)
    }
    p.micHandlers.onUtterance(new Float32Array(16000), 16000, 1)
    await vi.advanceTimersByTimeAsync(0)
    return { falas, eventos: lista().slice(antes) }
  }

  it('desligada (padrão), nada é gravado', async () => {
    const { eventos } = await falar()
    expect(eventos).toEqual([])
  })

  it('ligada: registra os decodes, o fechamento e o final; o simulador reproduz a tela da mesma rodada', async () => {
    localStorage.setItem('babel.lab.gravarHipoteses', '1')
    const { falas, eventos } = await falar()
    expect(eventos.map((e) => e.tipo)).toEqual(['decode', 'decode', 'decode', 'fechada', 'final'])
    expect(eventos.filter((e) => e.tipo === 'decode').map((e) => e.decode)).toEqual([0, 1, 2])
    expect(eventos.at(-1)).toMatchObject({ tipo: 'final', texto: 'Olá, tudo bem?' })
    // Mesma política que o app usou (padrão do código com a máscara 0 da `beforeEach`): acrescenta-decode, limitador de 125 ms.
    const simulada = simularExibicao(eventos, {
      modo: 'acrescenta-decode',
      mascara: 0,
      intervaloMs: 125,
      subamostra: 1,
    })
    expect(simulada.quadros.map((q) => q.texto)).toEqual([...armazem.escritas, 'Olá, tudo bem?'])
    expect(simulada.textoFinal).toBe(falas.ler().originalText)
  })

  it('ligada, grava também fora da rota do Parakeet (inglês/Moonshine), sem o pedido `parakeet`; desligada, o escopo é o de sempre', async () => {
    motor.parakeet = false
    const antes = await falar('en-US')
    expect(antes.eventos).toEqual([])
    localStorage.setItem('babel.lab.gravarHipoteses', '1')
    const { eventos } = await falar('en-US')
    expect(eventos.map((e) => e.tipo)).toEqual(['decode', 'decode', 'decode', 'fechada', 'final'])
  })
})
