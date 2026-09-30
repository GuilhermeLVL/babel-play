/**
 * O GANCHO `aoTraduzirFinal` (E2 da Fase E): é ele que alimenta a fila de fala do modo intérprete —
 * a tradução de cada fala, lida em voz alta para o outro lado.
 *
 * Por isso as duas garantias: SÓ FINAIS (o parcial muda a cada segundo; ler parcial seria falar
 * frase pela metade) e UMA VEZ SÓ POR FALA (a retradução do "tradutor pronto", o final da Web Speech
 * que cresce e a fábrica recriada a cada render não podem ler a mesma fala duas vezes). E quando não
 * haverá o que ler — mesmo idioma, tradução que falhou — ele avisa `sem-traducao` uma vez, para a
 * máquina do intérprete não ficar esperando.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala, type TraducaoFinal } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

function montar(translate: (t: string) => Promise<{ text: string; engine: string; approximate?: boolean }>) {
  let segs: SpeechSegment[] = ['s1', 's2'].map((id) => ({
    id,
    speakerId: 'user',
    source: 'mic' as const,
    timestamp: '0:00',
    originalText: 'x',
    translatedText: '…',
    words: [],
    lado: 'outro' as const,
  }))
  const finais: TraducaoFinal[] = []
  const refs = {
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('pt-BR'),
    targetLangRef: ref('en-US'),
    idiomaObservadoRef: ref(''),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: ref(segs),
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(false),
    degradacaoAvisadaRef: ref(false),
  }
  const mt = vi.fn(async (texto: string) => translate(texto))
  /** A fábrica é chamada a cada render, como na tela: os refs são os mesmos, as closures não. */
  const fabrica = () =>
    criarTraducaoDaFala({
      gateway: { mt: { translate: mt } } as unknown as GatewayDaCaptura,
      ...refs,
      memoriaPersistente: null,
      setSpeechSegments: (u) => {
        segs = typeof u === 'function' ? u(segs) : u
        refs.speechSegmentsRef.current = segs
      },
      setFeedbackMsg: () => {},
      aoTraduzirFinal: (f) => finais.push(f),
    })
  return { fabrica, finais, mt, segs: () => segs }
}

describe('aoTraduzirFinal', () => {
  it('o final traduzido avisa uma vez, com o texto a ler (sem o "≈") e o par', async () => {
    const m = montar(async () => ({ text: 'good morning', engine: 'opus-mt-local' }))
    await m.fabrica().translateSegment('s1', 'bom dia', 'pt', 'en', { falada: true })
    expect(m.finais).toEqual([
      {
        segId: 's1',
        original: 'bom dia',
        resultado: 'traduzida',
        traducao: 'Good morning',
        de: 'pt',
        para: 'en',
        aproximada: false,
        falada: true,
      },
    ])
  })

  it('tradução aproximada vai sem o "≈" e com `aproximada`', async () => {
    const m = montar(async () => ({ text: 'good morning', engine: 'mymemory', approximate: true }))
    await m.fabrica().translateSegment('s1', 'bom dia', 'pt', 'en', { falada: true })
    expect(m.finais[0]).toMatchObject({ traducao: 'Good morning', aproximada: true })
    expect(m.segs()[0].translatedText).toBe('≈ Good morning')
  })

  it('o parcial nunca avisa', async () => {
    const m = montar(async () => ({ text: 'good', engine: 'opus-mt-local' }))
    await m.fabrica().translateSegment('s1', 'bom', 'pt', 'en', { falada: true, descartarSeOcupado: true })
    expect(m.finais).toEqual([])
  })

  it('uma vez só por fala: a retradução e a fábrica recriada não repetem', async () => {
    const m = montar(async (t) => ({ text: `${t} (en)`, engine: 'opus-mt-local' }))
    await m.fabrica().translateSegment('s1', 'bom dia', 'pt', 'en', { falada: true })
    await m.fabrica().translateSegment('s1', 'bom dia a todos', 'pt', 'en', { falada: true })
    expect(m.finais).toHaveLength(1)
    await m.fabrica().translateSegment('s2', 'tchau', 'pt', 'en', { falada: true })
    expect(m.finais.map((f) => f.segId)).toEqual(['s1', 's2'])
  })

  it('do cache da aba também avisa (a segunda vez que a frase aparece)', async () => {
    const m = montar(async () => ({ text: 'thanks', engine: 'opus-mt-local' }))
    const t = m.fabrica()
    await t.translateSegment('s1', 'obrigado', 'pt', 'en', { falada: true })
    await t.translateSegment('s2', 'obrigado', 'pt', 'en', { falada: true })
    expect(m.mt).toHaveBeenCalledTimes(1)
    expect(m.finais.map((f) => [f.segId, f.traducao])).toEqual([
      ['s1', 'Thanks'],
      ['s2', 'Thanks'],
    ])
  })

  it('mesmo idioma: `sem-traducao`, sem texto a ler', async () => {
    const m = montar(async () => ({ text: 'x', engine: 'opus-mt-local' }))
    await m.fabrica().translateSegment('s1', 'bom dia', 'pt', 'pt', { falada: true })
    expect(m.finais).toEqual([expect.objectContaining({ segId: 's1', resultado: 'sem-traducao', traducao: '' })])
  })

  it('a tradução falhou (o balão degrada para o original): `sem-traducao` uma vez', async () => {
    const m = montar(async () => {
      throw new Error('sem rota')
    })
    await m.fabrica().translateSegment('s1', 'bom dia', 'pt', 'en', { falada: true })
    await esperar()
    expect(m.finais).toEqual([expect.objectContaining({ segId: 's1', resultado: 'sem-traducao' })])
    expect(m.segs()[0].translatedText).toBe('(bom dia)')
  })
})
