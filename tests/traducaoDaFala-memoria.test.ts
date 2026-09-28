/**
 * MEMÓRIA DE TRADUÇÃO PERSISTENTE DA LEGENDA AO VIVO + PARCIAL SEM TRADUÇÃO LOCAL.
 *
 * Auditoria de eficiência da IA (2026-09-28), achados 1 e 2:
 *  - o cache do cliente era um `Map` de 300 entradas por aba: recarregar a página esquecia "thank
 *    you", "let's go", "ok" — e a próxima sessão pagava de novo a mesma tradução;
 *  - o parcial sem tradutor local pronto não pode virar "(texto original)" nem aviso de falha: o
 *    balão espera o final.
 *
 * O armazém do IndexedDB não roda no Node (sem fake-indexeddb no projeto): os casos usam o armazém
 * em memória, que implementa o MESMO contrato (limite, validade, recência) e é também o que o
 * navegador usa quando o IndexedDB falha (aba privada).
 */
import { describe, expect, it, vi } from 'vitest'

const plano = vi.hoisted(() => ({ managedCloudLlm: false }))
vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => plano }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'
import {
  type ArmazemDeTraducoes,
  criarArmazemEmMemoria,
  criarArmazemIndexedDb,
  deveGuardarNaMemoria,
  MAX_PALAVRAS_GUARDADAS,
  TTL_DA_MEMORIA_MS,
} from '../src/lib/traducao/memoriaDeTraducao'
import { criarMemoriaEmCamadas } from '../src/lib/traducao/memoriaEmCamadas'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

type Resposta = { text: string; engine: string; approximate?: boolean }

function montar(
  armazem: ArmazemDeTraducoes,
  resposta: (t: string) => Resposta = (t) => ({ text: `[mt] ${t}`, engine: 'server-llm-mt' }),
) {
  let segs: SpeechSegment[] = [
    { id: 'u1', speakerId: 'me', source: 'mic', timestamp: '0:00', originalText: 'x', translatedText: '…', words: [] },
    {
      id: 'u0',
      speakerId: 'me',
      source: 'mic',
      timestamp: '0:00',
      originalText: 'Fala anterior',
      translatedText: 'y',
      words: [],
    },
  ]
  const translate = vi.fn(async (texto: string, _src: string | null, _tgt: string, _o?: Record<string, unknown>) =>
    resposta(texto),
  )
  const avisos: string[] = []
  const { translateSegment } = criarTraducaoDaFala({
    gateway: { mt: { translate } } as unknown as GatewayDaCaptura,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('en'),
    targetLangRef: ref('pt'),
    idiomaObservadoRef: ref('en'),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: {
      get current() {
        return segs
      },
    },
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(false),
    degradacaoAvisadaRef: ref(false),
    setSpeechSegments: (u) => {
      segs = typeof u === 'function' ? u(segs) : u
    },
    setFeedbackMsg: (m) => avisos.push(m),
    memoriaPersistente: armazem,
  })
  return { translateSegment, translate, traducao: () => segs[0].translatedText, avisos }
}

describe('memória persistente: sobrevive ao recarregar', () => {
  it('a tradução final curta volta da memória numa aba nova, sem chamar o tradutor', async () => {
    const armazem = criarArmazemEmMemoria()
    const antes = montar(armazem)
    antes.translateSegment('u1', 'Thank you so much!', 'en', 'pt', { falada: true })
    await esperar()
    expect(antes.translate).toHaveBeenCalledTimes(1)

    const depois = montar(armazem) // página recarregada: Map da aba novo, mesma memória
    depois.translateSegment('u1', 'thank you so much', 'en', 'pt', { falada: true })
    await esperar()
    expect(depois.translate).not.toHaveBeenCalled()
    expect(depois.traducao()).toBe('[mt] Thank you so much!')
  })

  it('tradução de PARCIAL não entra em memória nenhuma (nem a da aba)', async () => {
    const armazem = criarArmazemEmMemoria()
    const m = montar(armazem, (t) => ({ text: `[local] ${t}`, engine: 'opus-mt-local' }))
    m.translateSegment('u1', 'Thank you', 'en', 'pt', { falada: true, descartarSeOcupado: true })
    await esperar()
    expect(await armazem.ler('en|pt|thank you')).toBeUndefined()
    // O final da mesma fala vai ao tradutor (não herda a tradução literal do parcial).
    m.translateSegment('u1', 'Thank you', 'en', 'pt', { falada: true })
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(2)
  })

  it('fala longa (> 12 palavras) não é guardada: limita o dado pessoal retido', async () => {
    const armazem = criarArmazemEmMemoria()
    const m = montar(armazem)
    const longa = 'I told my sister that we would meet her at the station near the old bridge tomorrow'
    m.translateSegment('u1', longa, 'en', 'pt', { falada: true })
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(deveGuardarNaMemoria(longa)).toBe(false)
    expect(await armazem.ler(`en|pt|${longa.toLowerCase()}`)).toBeUndefined()
  })

  it('tradução aproximada (MyMemory, "≈") não é guardada', async () => {
    const armazem = criarArmazemEmMemoria()
    const m = montar(armazem, (t) => ({ text: `[mm] ${t}`, engine: 'mymemory', approximate: true }))
    m.translateSegment('u1', 'Good morning', 'en', 'pt')
    await esperar()
    expect(await armazem.ler('en|pt|good morning')).toBeUndefined()
  })

  it('quem paga pela nuvem não recebe da memória a tradução literal do motor local', async () => {
    const armazem = criarArmazemEmMemoria()
    await armazem.gravar('en|pt|good morning', 'Bom manhã', 'opus-mt-local')
    plano.managedCloudLlm = true
    try {
      const m = montar(armazem)
      m.translateSegment('u1', 'Good morning', 'en', 'pt')
      await esperar()
      expect(m.translate).toHaveBeenCalledTimes(1)
    } finally {
      plano.managedCloudLlm = false
    }
  })
})

describe('fala curta vai sem contexto', () => {
  it('≤ 4 palavras: nenhum contexto (a mesma frase acerta o cache do servidor); longa: com contexto', async () => {
    const m = montar(criarArmazemEmMemoria())
    m.translateSegment('u1', 'Thank you', 'en', 'pt', { falada: true })
    await esperar()
    expect(m.translate.mock.calls[0][3]?.contexto).toBeUndefined()
    m.translateSegment('u1', 'Can you send me the report later today', 'en', 'pt', { falada: true })
    await esperar()
    expect(m.translate.mock.calls[1][3]?.contexto).toEqual(['Eu: Fala anterior'])
  })
})

describe('parcial sem tradutor local pronto', () => {
  it('resposta vazia do parcial: o balão continua esperando o final, sem "(original)" nem aviso', async () => {
    const m = montar(criarArmazemEmMemoria(), () => ({ text: '', engine: 'parcial-sem-motor-local' }))
    m.translateSegment('u1', 'Thank you', 'en', 'pt', { falada: true, descartarSeOcupado: true })
    await esperar()
    expect(m.traducao()).toBe('…')
    expect(m.avisos).toEqual([])
  })
})

describe('armazém em memória: limite e validade', () => {
  it('expira depois de 30 dias', async () => {
    let agora = 1_000
    const a = criarArmazemEmMemoria({ agora: () => agora })
    await a.gravar('k', 'v', 'server-llm-mt')
    expect((await a.ler('k'))?.texto).toBe('v')
    agora += TTL_DA_MEMORIA_MS + 1
    expect(await a.ler('k')).toBeUndefined()
  })

  it('passado o limite, sai a entrada usada há mais tempo', async () => {
    let agora = 0
    const a = criarArmazemEmMemoria({ agora: () => ++agora, limite: 2 })
    await a.gravar('a', '1', 'x')
    await a.gravar('b', '2', 'x')
    await a.ler('a') // "a" fica mais recente que "b"
    await a.gravar('c', '3', 'x')
    expect(await a.ler('b')).toBeUndefined()
    expect((await a.ler('a'))?.texto).toBe('1')
    expect((await a.ler('c'))?.texto).toBe('3')
  })

  it(`guarda até ${MAX_PALAVRAS_GUARDADAS} palavras`, () => {
    expect(deveGuardarNaMemoria('one two three four five six seven eight nine ten eleven twelve')).toBe(true)
    expect(deveGuardarNaMemoria('one two three four five six seven eight nine ten eleven twelve thirteen')).toBe(false)
  })
})

describe('armazém do IndexedDB: sem IndexedDB, cai para a memória em silêncio', () => {
  it('sem `indexedDB` (Node, aba privada antiga) continua guardando e lendo', async () => {
    const a = criarArmazemIndexedDb({ fabrica: undefined })
    await a.gravar('k', 'v', 'server-llm-mt')
    expect((await a.ler('k'))?.texto).toBe('v')
  })

  it('`open` que falha (Firefox privado) também cai para a memória', async () => {
    const quebrada = {
      open: () => {
        throw new Error('InvalidStateError')
      },
    } as unknown as IDBFactory
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = criarArmazemIndexedDb({ fabrica: quebrada })
    await a.gravar('k', 'v', 'server-llm-mt')
    expect((await a.ler('k'))?.texto).toBe('v')
    aviso.mockRestore()
  })
})

describe('memória aproximada no balão (harness §1.2, M2)', () => {
  const guardada = 'en|pt|can you please send me the final report before the meeting tomorrow'
  const parecida = 'Can you please send me the final reports before the meeting tomorrow'

  it('frase parecida com diferença segura: sem tradutor, com "≈"', async () => {
    const memoria = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: null })
    await memoria.gravar(guardada, 'pode me mandar o relatório final antes da reunião amanhã?', 'server-llm-mt')
    const m = montar(memoria)
    m.translateSegment('u1', parecida, 'en', 'pt')
    await esperar()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.traducao()).toBe('≈ Pode me mandar o relatório final antes da reunião amanhã?')
  })

  it('só pontuação diferente: reaproveita sem "≈"', async () => {
    const memoria = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: null })
    await memoria.gravar('en|pt|how are you doing today', 'como você está hoje?', 'server-llm-mt')
    const m = montar(memoria)
    m.translateSegment('u1', 'How are you doing, today?', 'en', 'pt')
    await esperar()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.traducao()).toBe('Como você está hoje?')
  })

  it('quem paga: parecida abaixo de 0,97 vai ao tradutor', async () => {
    const memoria = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: null })
    await memoria.gravar(guardada, 'x', 'server-llm-mt')
    plano.managedCloudLlm = true
    try {
      const m = montar(memoria)
      m.translateSegment('u1', parecida, 'en', 'pt')
      await esperar()
      expect(m.translate).toHaveBeenCalledTimes(1)
    } finally {
      plano.managedCloudLlm = false
    }
  })
})
