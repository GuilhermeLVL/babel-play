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

function montar(o: { virtual: boolean; cenario?: string; autoDetect?: boolean }) {
  const transcribePcm = vi.fn(async () => ({ text: 'Where is the station?', engine: 'whisper-local' }))
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
