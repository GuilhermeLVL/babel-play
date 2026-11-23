/**
 * MESMO IDIOMA NÃO ESCREVE NO ESTADO À TOA (V6 de `parciais-incrementais`): cada parcial passava por `translateSegment`, e no mesmo idioma
 * o `map` que zerava a tradução devolvia um objeto NOVO por parcial, o que re-renderizava a tela de captura inteira. Agora só escreve
 * quando a tradução do balão não está vazia; o estado fica com a MESMA identidade.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: true }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })

function montar(translatedText: string) {
  let segs: SpeechSegment[] = [
    {
      id: 'a',
      speakerId: 'user',
      source: 'mic',
      timestamp: '00:00',
      originalText: 'olá',
      translatedText,
      isPartial: true,
      words: [],
    },
  ]
  let escritas = 0
  const traducao = criarTraducaoDaFala({
    gateway: { mt: { translate: vi.fn() } } as unknown as GatewayDaCaptura,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('pt'),
    targetLangRef: ref('pt'),
    idiomaObservadoRef: ref(''),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: {
      get current() {
        return segs
      },
    },
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(true),
    degradacaoAvisadaRef: ref(false),
    setSpeechSegments: (u) => {
      const novo = typeof u === 'function' ? u(segs) : u
      if (novo !== segs) escritas++
      segs = novo
    },
    setFeedbackMsg: () => undefined,
    memoriaPersistente: null,
  })
  return { traducao, escritas: () => escritas, segs: () => segs }
}

describe('traduzir um parcial no mesmo idioma', () => {
  it('tradução já vazia: o estado das falas não muda (a mesma lista), por parcial que chega', async () => {
    const m = montar('')
    const antes = m.segs()
    for (const texto of ['olá', 'olá tudo', 'olá tudo bem'])
      await m.traducao.translateSegment('a', texto, 'pt', 'pt', { descartarSeOcupado: true, falada: false })
    expect(m.segs()).toBe(antes)
    expect(m.escritas()).toBe(0)
  })

  it('o marcador "…" do balão novo ainda é limpo (uma escrita), e a seguinte não escreve', async () => {
    const m = montar('…')
    await m.traducao.translateSegment('a', 'olá', 'pt', 'pt', { descartarSeOcupado: true, falada: false })
    expect(m.segs()[0].translatedText).toBe('')
    expect(m.escritas()).toBe(1)
    await m.traducao.translateSegment('a', 'olá tudo', 'pt', 'pt', { descartarSeOcupado: true, falada: false })
    expect(m.escritas()).toBe(1)
  })
})
