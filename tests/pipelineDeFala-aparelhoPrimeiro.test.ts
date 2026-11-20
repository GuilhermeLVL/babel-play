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
import { avisarFalhaDaNuvemDoStt, avisarRespostaDaNuvemDoStt } from '../src/gateway/falhaDaNuvemDoStt'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'
import { criarPipelineDeFala, soltarOuvintesDaCaptura } from '../src/lib/captura/pipelineDeFala'
import { RESPOSTAS_PARA_SOLTAR_O_PARAKEET } from '../src/lib/captura/reservaLocal'

const ref = <T>(current: T) => ({ current })
const FALA_DIFICIL = { text: 'a gente combinou de ver o filme amanhã', engine: ADAPTADOR_DO_PARAKEET, confidence: 0.4 }
const FALA_FACIL = { ...FALA_DIFICIL, confidence: 0.97 }

/** Um regulador que, no primeiro final local, desce o modelo (o caso do aparelho que trava). */
function reguladorQueDesce(modelo: string) {
  let desceu = false
  return {
    reiniciar: vi.fn(),
    registrarFalha: vi.fn(),
    aoFinal: vi.fn((_m: unknown, efeitos: { trocarModelo: (m: string) => void }) => {
      if (desceu) return []
      desceu = true
      efeitos.trocarModelo(modelo)
      return ['trocar-modelo']
    }),
    aoParcial: vi.fn(() => []),
    modeloEmUso: () => modelo,
    parciaisCortados: false,
    parciaisDoMicPausados: false,
  }
}

function montar(extra: Record<string, unknown> = {}) {
  /** O Parakeet está na cadeia do gateway falso? (`setRoute`/`trocarModeloLocal` mexem como o de verdade.) */
  const cadeia = { parakeet: false }
  const setRoute = vi.fn((r: { localModel?: string }) => {
    if (r.localModel) cadeia.parakeet = r.localModel === ID_DO_PARAKEET
  })
  const trocarModeloLocal = vi.fn((m: string) => {
    cadeia.parakeet = m === ID_DO_PARAKEET
  })
  const reservaParakeet = vi.fn(async (ativa: boolean) => {
    cadeia.parakeet = ativa
  })
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
        trocarModeloLocal,
        preloadModel,
        setRoute,
        parakeetAtivo: () => cadeia.parakeet,
        reservaParakeet,
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
    ...extra,
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
  return { p, setRoute, setRotaPrevista, setSttRouteLabel, preloadModel, transcribePcm, falar, cadeia, reservaParakeet }
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

/* Rodada de correção 1, item 1: o Parakeet saiu da cadeia no "aparelho primeiro" → a nuvem volta à frente
   e a histerese desliga; quem paga não fica preso no Whisper. */
describe('aparelho primeiro sem o Parakeet na cadeia', () => {
  const rotaAparelhoPrimeiro = {
    localModel: ID_DO_PARAKEET,
    device: 'wasm',
    preferCloud: false,
    nuvemNoAudioDificil: true,
    label: 'local · Parakeet v3 · nuvem para o áudio difícil',
  }

  it('o Parakeet não carregou (o gateway o tirou da cadeia): a nuvem volta à frente, e a histerese para', async () => {
    cena.rota = rotaAparelhoPrimeiro
    const m = montar()
    m.preloadModel.mockImplementation(async () => {
      m.cadeia.parakeet = false // o que o gateway faz quando a carga falha
    })
    await m.p.prepareModels()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
    expect(m.setSttRouteLabel).toHaveBeenLastCalledWith('nuvem (large-v3-turbo) · reserva local')
    // O selo troca para o previsto SEM o Parakeet (a decisão em si: `politicaDeRota-aparelhoPrimeiro.test.ts`).
    const [doAparelho, semParakeet] = m.setRotaPrevista.mock.calls.slice(-2).map((c) => c[0])
    expect(semParakeet).not.toBe(doAparelho)
    for (let i = 0; i < 6; i++) await m.falar() // falas "difíceis" do Whisper não mexem mais
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
  })

  it('o regulador desceu o Parakeet a um Whisper: a nuvem volta à frente', async () => {
    cena.rota = rotaAparelhoPrimeiro
    const m = montar({ reguladorRef: ref(reguladorQueDesce(WHISPER_MODELS.base)) })
    m.transcribePcm.mockResolvedValue(FALA_FACIL)
    await m.p.prepareModels()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([])
    await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
  })
})

/* Rodada de correção 1, item 4: com a histerese em cima, a nuvem que pausa devolve ao aparelho na hora. */
describe('a nuvem pausa com a histerese em cima', () => {
  it('pausa: o aparelho volta à frente sem esperar o mínimo', async () => {
    cena.rota = {
      localModel: ID_DO_PARAKEET,
      device: 'wasm',
      preferCloud: false,
      nuvemNoAudioDificil: true,
      label: 'local · Parakeet v3 · nuvem para o áudio difícil',
    }
    const m = montar()
    await m.p.prepareModels()
    for (let i = 0; i < 3; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
    avisarFalhaDaNuvemDoStt({ pausou: false }) // soluço: segue na nuvem
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
    avisarFalhaDaNuvemDoStt({ pausou: true })
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true, false])
  })
})

/* Rodada de correção 1, item 5: o sinal `lento` mede só o decode (`decodeMs`), não a espera na fila. */
describe('o sinal lento mede o decode, não a fila', () => {
  it('falas confiantes com decode acima do tempo da fala sobem; sem `decodeMs`, a demora não conta', async () => {
    cena.rota = {
      localModel: ID_DO_PARAKEET,
      device: 'wasm',
      preferCloud: false,
      nuvemNoAudioDificil: true,
      label: 'local · Parakeet v3 · nuvem para o áudio difícil',
    }
    const m = montar()
    await m.p.prepareModels()
    // 1 s de fala; a resposta demora (fila), mas o motor não diz o decode: não é "lento".
    m.transcribePcm.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return FALA_FACIL
    })
    for (let i = 0; i < 3; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([])
    m.transcribePcm.mockResolvedValue({ ...FALA_FACIL, decodeMs: 1500 })
    for (let i = 0; i < 3; i++) await m.falar()
    expect(nuvemPrimeiro(m.setRoute)).toEqual([true])
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

describe('Parakeet de reserva da nuvem (item 5, rodada de correção 1)', () => {
  const rotaDeNuvemComParakeet = {
    localModel: ID_DO_PARAKEET,
    device: 'wasm',
    preferCloud: true,
    label: 'nuvem (large-v3-turbo) · reserva local',
  }

  it('começa com o Whisper base quente; um SOLUÇO da nuvem não liga o Parakeet', async () => {
    cena.rota = rotaDeNuvemComParakeet
    const m = montar()
    await m.p.prepareModels()
    expect(m.setRoute).toHaveBeenCalledTimes(1)
    expect(m.setRoute).toHaveBeenLastCalledWith({
      preferCloud: true,
      localModel: WHISPER_MODELS.base,
      dtype: 'hybrid',
      device: undefined,
    })
    avisarFalhaDaNuvemDoStt({ pausou: false })
    avisarFalhaDaNuvemDoStt({ pausou: false })
    expect(m.reservaParakeet).not.toHaveBeenCalled()
  })

  it('a nuvem PAUSOU: o Parakeet entra (uma vez), sem setRoute que mexa no Whisper; respostas boas seguidas o soltam', async () => {
    cena.rota = rotaDeNuvemComParakeet
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt({ pausou: true })
    avisarFalhaDaNuvemDoStt({ pausou: true })
    expect(m.reservaParakeet.mock.calls).toEqual([[true]])
    expect(m.setRoute).toHaveBeenCalledTimes(1) // o modelo do Whisper (que o regulador pode ter descido) não é tocado
    for (let i = 0; i < RESPOSTAS_PARA_SOLTAR_O_PARAKEET - 1; i++) avisarRespostaDaNuvemDoStt()
    expect(m.reservaParakeet.mock.calls).toEqual([[true]])
    avisarRespostaDaNuvemDoStt()
    expect(m.reservaParakeet.mock.calls).toEqual([[true], [false]])
  })

  /* Rodada de correção 2, B e C. */
  it('a pausa por nuvem OCUPADA (colisão da captura dupla) não liga o Parakeet', async () => {
    cena.rota = rotaDeNuvemComParakeet
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'ocupada' })
    expect(m.reservaParakeet).not.toHaveBeenCalled()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'cota' })
    expect(m.reservaParakeet.mock.calls).toEqual([[true]])
  })

  it('uma entrada por preparação: depois de sair, outra pausa não liga de novo', async () => {
    cena.rota = rotaDeNuvemComParakeet
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'indisponivel' })
    for (let i = 0; i < RESPOSTAS_PARA_SOLTAR_O_PARAKEET; i++) avisarRespostaDaNuvemDoStt()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'indisponivel' })
    expect(m.reservaParakeet.mock.calls).toEqual([[true], [false]])
  })

  it('a captura parou (`soltarOuvintesDaCaptura`): pausa e respostas atrasadas não mexem em nada', async () => {
    cena.rota = rotaDeNuvemComParakeet
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'cota' })
    soltarOuvintesDaCaptura()
    for (let i = 0; i < RESPOSTAS_PARA_SOLTAR_O_PARAKEET; i++) avisarRespostaDaNuvemDoStt()
    avisarFalhaDaNuvemDoStt({ pausou: true, motivo: 'cota' })
    expect(m.reservaParakeet.mock.calls).toEqual([[true]]) // nenhum `false` atrasado recarregando o Whisper
  })

  it('reserva Whisper base (sem o Parakeet pronto): nem a pausa troca nada', async () => {
    cena.rota = {
      localModel: WHISPER_MODELS.base,
      dtype: 'hybrid',
      preferCloud: true,
      label: 'nuvem (large-v3-turbo) · reserva local',
    }
    const m = montar()
    await m.p.prepareModels()
    avisarFalhaDaNuvemDoStt({ pausou: true })
    expect(m.setRoute).toHaveBeenCalledTimes(1)
    expect(m.reservaParakeet).not.toHaveBeenCalled()
  })
})
