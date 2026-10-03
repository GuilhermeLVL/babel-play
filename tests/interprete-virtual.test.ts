// @vitest-environment jsdom
/**
 * A CONVERSA VIRTUAL (Intérprete v3, Fase 4): o áudio do computador ("Eles") e o microfone ("Você")
 * rodam JUNTOS, cada um com a direção FIXA da sua fonte, sem alternar turnos:
 *   - o SISTEMA é a outra pessoa: ouve o idioma dela, traduz para o meu, e a fala sai com `lado: 'outro'`;
 *   - o MICROFONE sou eu: ouve o meu idioma, traduz para o dela, `lado: 'meu'`;
 *   - as duas traduções são "faladas" (`falada: true`), para o intérprete poder ler; fora da conversa
 *     virtual o sistema continua `falada: false`;
 *   - o fim de cada fala avisa o lado; o anti-eco continua valendo para as duas fontes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../src/lib/speakerId', () => ({ embedUtterance: vi.fn(async () => null) }))
const eco = vi.hoisted(() => ({ ativo: false }))
vi.mock('../src/lib/tts', () => ({ isTtsActive: () => eco.ativo }))
vi.mock('../src/lib/entitlements', async (original) => {
  const m = await original<typeof import('../src/lib/entitlements')>()
  return { ...m, getEntitlements: () => ({ ...m.getEntitlements(), managedCloudStt: false }) }
})
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), leve: false }) }
})

import { ContextoDoStt } from '../src/gateway/promptDeStt'
import { criarPipelineDeFala } from '../src/lib/captura/pipelineDeFala'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

function falasFalsas() {
  let estado: SpeechSegment[] = []
  const set = vi.fn((a: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    estado = typeof a === 'function' ? a(estado) : a
  })
  return { set, ler: () => estado }
}

function montar(o: {
  virtual: boolean
  cenario?: string
  autoDetect?: boolean
  detecta?: boolean
  /** O que o motor devolve a cada transcrição, na ordem (idioma medido, texto). */
  falas?: Array<{ language: string; text: string }>
}) {
  const respostas = [...(o.falas ?? [])]
  const transcribePcm = vi.fn(async () => {
    const r = respostas.shift()
    return r
      ? { text: r.text, language: r.language, confiancaDoIdioma: 0.95, engine: 'whisper-local' }
      : { text: 'Where is the station?', engine: 'whisper-local' }
  })
  const translateSegment = vi.fn()
  const aoFimDaFala = vi.fn()
  const falas = falasFalsas()
  const deps = {
    gateway: {
      stt: {
        transcribePcm,
        transcribePartial: vi.fn(async () => ({ text: 'Where is' })),
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
    autoDetectLangRef: ref(o.autoDetect ?? true),
    autoDetectMyLangRef: ref(o.autoDetect ?? true),
    idiomaObservadoRef: ref(''),
    captureScenarioRef: ref(o.cenario ?? 'interprete'),
    perfModeRef: ref(false),
    micEnabled: true,
    micEngine: 'whisper',
    timerRef: ref(0),
    nowRel: () => 0,
    setSpeechSegments: falas.set,
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
    sistemaAtivo: () => true,
    direcaoDoMicrofone: () => null,
    aoFimDaFala,
    interpreteVirtual: () => o.virtual,
    virtualDetectaIdioma: () => !!o.detecta,
  }
  const p = criarPipelineDeFala(deps as never)
  return { p, transcribePcm, translateSegment, aoFimDaFala, falas }
}

const PCM = new Float32Array(16000)
const MIC = 1_000_000

beforeEach(() => {
  eco.ativo = false
})

describe('conversa virtual: a direção é fixa por fonte', () => {
  it('"Eles" (sistema): ouve o idioma do outro, traduz para o meu, lado "outro", fala "falada"', async () => {
    const m = montar({ virtual: true })
    m.p.sysHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0]).toMatchObject({ id: 'sys-1', source: 'system', lado: 'outro' })
    m.p.sysHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'en' }))
    expect(m.translateSegment).toHaveBeenCalledWith('sys-1', 'Where is the station?', 'en', 'pt', { falada: true })
    expect(m.aoFimDaFala).toHaveBeenCalledWith({ segId: 'sys-1', source: 'system', lado: 'outro' })
  })

  it('"Você" (microfone): ouve o meu idioma, traduz para o do outro, lado "meu", mesmo com a detecção automática ligada', async () => {
    const m = montar({ virtual: true })
    m.p.micHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0]).toMatchObject({ id: `mic-${MIC + 1}`, source: 'mic', lado: 'meu' })
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'pt' }))
    expect(m.translateSegment).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'pt', 'en', {
      falada: true,
    })
    expect(m.aoFimDaFala).toHaveBeenCalledWith({ segId: `mic-${MIC + 1}`, source: 'mic', lado: 'meu' })
  })

  it('as duas fontes juntas não se misturam: cada fala guarda o seu lado', async () => {
    const m = montar({ virtual: true })
    m.p.sysHandlers.onSpeechStart(1)
    m.p.micHandlers.onSpeechStart(1)
    m.p.sysHandlers.onUtterance(PCM, 16000, 1)
    m.p.micHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    const lados = Object.fromEntries(m.falas.ler().map((f) => [f.id, f.lado]))
    expect(lados).toEqual({ 'sys-1': 'outro', [`mic-${MIC + 1}`]: 'meu' })
  })

  it('fora da conversa virtual, o sistema segue sem lado e "não falado"', async () => {
    const m = montar({ virtual: false })
    m.p.sysHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0].lado).toBeUndefined()
    m.p.sysHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.translateSegment).toHaveBeenCalledWith('sys-1', expect.any(String), expect.any(String), expect.any(String), {
      falada: false,
    })
  })

  it('fora do cenário intérprete, a conversa virtual não muda nada', () => {
    const m = montar({ virtual: true, cenario: 'conversation' })
    m.p.sysHandlers.onSpeechStart(1)
    expect(m.falas.ler()[0].lado).toBeUndefined()
  })

  it('o anti-eco vale para as duas fontes: fala iniciada durante a voz do app é descartada', () => {
    const m = montar({ virtual: true })
    eco.ativo = true
    m.p.sysHandlers.onSpeechStart(1)
    m.p.micHandlers.onSpeechStart(1)
    expect(m.falas.ler()).toHaveLength(0)
  })
})

describe('conversa virtual com detecção de idioma', () => {
  const FALA_LONGA = new Float32Array(16000 * 4)

  it('"Eles" sem dica de idioma: o motor mede e a tradução parte do idioma medido', async () => {
    const m = montar({ virtual: true, detecta: true, falas: [{ language: 'es', text: 'Donde esta la estacion?' }] })
    m.p.sysHandlers.onSpeechStart(1)
    m.p.sysHandlers.onUtterance(FALA_LONGA, 16000, 1)
    await esperar()
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(FALA_LONGA, 16000, expect.objectContaining({ languageHint: '' }))
    expect(m.translateSegment).toHaveBeenCalledWith('sys-1', 'Donde esta la estacion?', 'es', 'pt', { falada: true })
    expect(m.falas.ler()[0]).toMatchObject({ lado: 'outro', lang: 'es', paraLang: 'pt', semTraducao: false })
  })

  it('várias pessoas em idiomas diferentes, e a minha resposta vai para o último idioma ouvido', async () => {
    const m = montar({
      virtual: true,
      detecta: true,
      falas: [
        { language: 'en', text: 'Hello everyone' },
        { language: 'fr', text: 'Bonjour a tous, comment allez-vous' },
        { language: 'pt', text: 'Estou bem, obrigado' },
      ],
    })
    m.p.sysHandlers.onSpeechStart(1)
    m.p.sysHandlers.onUtterance(FALA_LONGA, 16000, 1)
    await esperar()
    await esperar()
    m.p.sysHandlers.onSpeechStart(2)
    m.p.sysHandlers.onUtterance(FALA_LONGA, 16000, 2)
    await esperar()
    await esperar()
    expect(m.translateSegment).toHaveBeenLastCalledWith('sys-2', expect.any(String), 'fr', 'pt', { falada: true })
    /* Eu respondo: o microfone traduz do meu idioma para o francês, o de quem falou por último. */
    m.p.micHandlers.onSpeechStart(1)
    expect(m.p.micHandlers.querParcial).toBeDefined()
    m.p.micHandlers.onUtterance(FALA_LONGA, 16000, 1)
    await esperar()
    await esperar()
    expect(m.translateSegment).toHaveBeenLastCalledWith(`mic-${MIC + 1}`, 'Estou bem, obrigado', 'pt', 'fr', {
      falada: true,
    })
  })

  it('"Eles" falam o meu idioma: a fala fica sem tradução', async () => {
    const m = montar({ virtual: true, detecta: true, falas: [{ language: 'pt', text: 'Bom dia, pessoal' }] })
    m.p.sysHandlers.onSpeechStart(1)
    m.p.sysHandlers.onUtterance(FALA_LONGA, 16000, 1)
    await esperar()
    await esperar()
    expect(m.falas.ler()[0]).toMatchObject({ lang: 'pt', semTraducao: true, translatedText: '' })
  })

  it('desligada a detecção, a direção fixa de antes continua valendo', async () => {
    const m = montar({ virtual: true, detecta: false, falas: [{ language: 'es', text: 'Hola' }] })
    m.p.sysHandlers.onSpeechStart(1)
    m.p.sysHandlers.onUtterance(PCM, 16000, 1)
    await esperar()
    expect(m.transcribePcm).toHaveBeenCalledWith(PCM, 16000, expect.objectContaining({ languageHint: 'en' }))
  })
})
