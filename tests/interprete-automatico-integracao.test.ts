// @vitest-environment jsdom
/**
 * O AUTOMÁTICO DE PONTA A PONTA, sem tela e sem áudio: o pipeline de fala DE VERDADE ligado ao controle
 * DE VERDADE, como a captura os liga (`LiveCapture`: `interpreteAutomatico`, `ladoDaFalaAutomatica`,
 * `aoFimDaFala`, `aoTraduzirFinal`). O motor de fala é falso e devolve o idioma "medido"; o tradutor é
 * falso e devolve `[idioma] texto`; a voz é falsa e registra em que idioma leria.
 *
 * O que se prova é a CONVERSA: duas pessoas alternando, ninguém toca em lado, e cada fala é lida no
 * idioma de quem ouve — com o microfone fechando para a voz e reabrindo depois dela.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => false }))
/* O detector de TEXTO, determinístico: confirma o espanhol da frase do teste e não sabe o resto. */
vi.mock('../src/lib/langDetect', () => ({
  detectLanguage: vi.fn(async (texto: string) => (texto.includes('¿') ? { lang: 'es' } : null)),
}))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: false }) }
})

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarControleDoInterprete } from '../src/lib/captura/controleDoInterprete'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))
const PCM = new Float32Array(16000 * 3)
const MIC = 1_000_000

function montarConversa() {
  /** O que o motor de fala "ouve" a cada vez: o texto e o idioma medido no áudio. */
  const roteiro: Array<{ text: string; language: string }> = []
  const lidas: Array<{ texto: string; lang: string | undefined; fim?: () => void }> = []
  const microfone = { abrir: vi.fn(), fechar: vi.fn() }
  const motor: TtsEngine = {
    speak(texto: string, opts?: SpeakOptions) {
      lidas.push({ texto, lang: opts?.lang, fim: opts?.onEnd })
      opts?.onStart?.()
    },
    cancel: vi.fn(),
    isSpeaking: () => false,
  }
  const controle = criarControleDoInterprete({
    idiomas: () => ({ meu: 'pt-BR', outro: 'en-US' }),
    microfone,
    motor: () => motor,
    nomeDoMotor: () => 'voz-do-aparelho',
    registrarTempo: vi.fn(),
  })

  let falas: SpeechSegment[] = []
  const setSpeechSegments = (a: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    falas = typeof a === 'function' ? a(falas) : a
  }
  /* O tradutor falso: traduz na hora e avisa o controle, como `traducaoDaFala` faz com o final. */
  const translateSegment = vi.fn((segId: string, texto: string, de: string, para: string) => {
    const traducao = `[${para}] ${texto}`
    setSpeechSegments((p) => p.map((s) => (s.id === segId ? { ...s, translatedText: traducao } : s)))
    controle.aoTraduzirFinal({
      segId,
      original: texto,
      resultado: 'traduzida',
      traducao,
      de,
      para,
      aproximada: false,
      falada: true,
    })
  })
  const deps = {
    gateway: {
      stt: {
        transcribePcm: vi.fn(async () => ({ engine: 'groq-whisper', ...roteiro.shift()! })),
        transcribePartial: vi.fn(async () => ({ text: '' })),
        pendingCount: () => 0,
        finalNaNuvem: () => true,
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
    captureScenarioRef: ref('interprete'),
    perfModeRef: ref(false),
    micEnabled: true,
    micEngine: 'whisper',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments,
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
    /* A ponte, como a captura a liga. */
    direcaoDoMicrofone: () => controle.direcao(),
    aoFimDaFala: (fim: Parameters<typeof controle.aoFimDaFala>[0]) => controle.aoFimDaFala(fim),
    interpreteAutomatico: () => controle.automatico(),
    ladoDaFalaAutomatica: (segId: string, pistas: Parameters<typeof controle.ladoDaFala>[1]) =>
      controle.ladoDaFala(segId, pistas),
  }
  const pipeline = criarPipelineDeFala(deps as never)

  let seq = 0
  /** Alguém fala: o VAD abre e fecha, o motor devolve o texto e o idioma medido. */
  const falar = async (text: string, language: string) => {
    roteiro.push({ text, language })
    seq++
    pipeline.micHandlers.onSpeechStart(seq)
    pipeline.micHandlers.onUtterance(PCM, 16000, seq)
    await esperar()
    await esperar()
    return `mic-${MIC + seq}`
  }
  return { controle, microfone, lidas, falar, falas: () => falas, translateSegment }
}

describe('intérprete automático: uma conversa inteira, sem ninguém tocar em lado', () => {
  it('eu falo português, o outro responde em inglês: cada fala vai para a metade certa e é lida na voz de quem ouve', async () => {
    const c = montarConversa()
    c.controle.ouvir()
    expect(c.microfone.abrir).toHaveBeenCalledTimes(1)

    const a = await c.falar('Onde fica a estação?', 'pt')
    expect(c.microfone.fechar).toHaveBeenCalledTimes(1)
    expect(c.falas().find((f) => f.id === a)).toMatchObject({ lado: 'meu', lang: 'pt', isPartial: false })
    expect(c.translateSegment).toHaveBeenLastCalledWith(a, 'Onde fica a estação?', 'pt', 'en', { falada: true })
    expect(c.lidas.at(-1)).toMatchObject({ texto: '[en] Onde fica a estação?', lang: 'en-US' })
    expect(c.controle.estado().fase).toBe('falando')

    /* A voz acaba: o microfone reabre sozinho. */
    c.lidas.at(-1)!.fim?.()
    expect(c.controle.estado()).toMatchObject({ fase: 'ouvindo', automatico: true })
    expect(c.microfone.abrir).toHaveBeenCalledTimes(2)

    const b = await c.falar('Two blocks ahead, on the left.', 'en')
    expect(c.falas().find((f) => f.id === b)).toMatchObject({ lado: 'outro', lang: 'en' })
    expect(c.translateSegment).toHaveBeenLastCalledWith(b, 'Two blocks ahead, on the left.', 'en', 'pt', {
      falada: true,
    })
    expect(c.lidas.at(-1)).toMatchObject({ lang: 'pt-BR' })
    c.lidas.at(-1)!.fim?.()
    expect(c.microfone.abrir).toHaveBeenCalledTimes(3)
  })

  it('o outro fala primeiro, e duas vezes seguidas: as duas vão para o lado dele', async () => {
    const c = montarConversa()
    c.controle.ouvir()
    const a = await c.falar('Excuse me.', 'en')
    c.lidas.at(-1)!.fim?.()
    const b = await c.falar('Do you speak English?', 'en')
    expect(c.falas().find((f) => f.id === a)?.lado).toBe('outro')
    expect(c.falas().find((f) => f.id === b)?.lado).toBe('outro')
    expect(c.lidas.map((l) => l.lang)).toEqual(['pt-BR', 'pt-BR'])
  })

  it('um terceiro idioma entra na conversa: é lido em português, e a minha resposta sai na língua dele', async () => {
    const c = montarConversa()
    c.controle.ouvir()
    const a = await c.falar('¿Dónde está la estación de tren, por favor?', 'es')
    expect(c.falas().find((f) => f.id === a)).toMatchObject({ lado: 'outro', lang: 'es' })
    expect(c.translateSegment).toHaveBeenLastCalledWith(a, expect.any(String), 'es', 'pt', { falada: true })
    expect(c.lidas[0].lang).toBe('pt-BR')
    c.lidas.at(-1)!.fim?.()

    const b = await c.falar('Fica a dois quarteirões.', 'pt')
    expect(c.translateSegment).toHaveBeenLastCalledWith(b, 'Fica a dois quarteirões.', 'pt', 'es', { falada: true })
    expect(String(c.lidas.at(-1)!.lang).toLowerCase().startsWith('es')).toBe(true)
  })

  it('o motor mede um idioma vizinho numa fala curta e o texto não confirma: não vira terceiro idioma', async () => {
    const c = montarConversa()
    c.controle.ouvir()
    const a = await c.falar('Obrigado.', 'gl')
    /* Sem evidência forte, a regra alterna (o dono do aparelho fala primeiro) em vez de traduzir do galego. */
    expect(c.falas().find((f) => f.id === a)).toMatchObject({ lado: 'meu', lang: 'pt' })
    expect(c.translateSegment).toHaveBeenLastCalledWith(a, 'Obrigado.', 'pt', 'en', { falada: true })
  })

  it('"parar" encerra: a fala que chegar depois não reabre o microfone', async () => {
    const c = montarConversa()
    c.controle.ouvir()
    c.controle.parar()
    expect(c.controle.estado()).toMatchObject({ fase: 'parado', automatico: false })
    expect(c.microfone.abrir).toHaveBeenCalledTimes(1)
  })
})
