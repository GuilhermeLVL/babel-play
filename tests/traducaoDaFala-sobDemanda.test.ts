/**
 * TRADUÇÃO SOB DEMANDA NA LEGENDA AO VIVO — os três modos de "Tradução" (harness §1.2, M0).
 *
 *  - `sempre` (padrão, e o que vale sem a preferência): nada muda, toda fala final vai à MT;
 *  - `pedir`: nenhuma chamada de MT; o balão fica "sob demanda" e o toque faz UMA chamada;
 *  - `novas`: fala só de palavras conhecidas não chama a MT; com uma palavra nova, chama.
 * Cada pulo conta em `capMetrics` — é economia, e a taxa é o que diz se o modo vale a pena.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import { criarPalavrasConhecidas } from '../src/core/harness/palavrasConhecidas'
import { capMetrics } from '../src/gateway/capture/captureMetrics'
import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala } from '../src/lib/captura/traducaoDaFala'
import {
  type ConhecidasDaFala,
  type ModoDeTraducao,
  modoDeTraducao,
  type PedidoSobDemanda,
} from '../src/lib/captura/traducaoSobDemanda'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

const conhecidas: ConhecidasDaFala = criarPalavrasConhecidas({
  idioma: 'en',
  nivel: null,
  cartoes: [{ word: 'dog', fsrsState: 'Review', fsrsStability: 30 }, { word: 'kitchen', fsrsState: 'Review', fsrsStability: 30 }],
})

function montar(modo?: ModoDeTraducao) {
  let segs: SpeechSegment[] = [
    { id: 'u1', speakerId: 'sys', source: 'system', timestamp: '0:00', originalText: 'x', translatedText: '…', words: [] },
  ]
  const translate = vi.fn(async (texto: string) => ({ text: `[mt] ${texto}`, engine: 'opus-mt-local' }))
  const pedidos = new Map<string, PedidoSobDemanda>()
  const { translateSegment, revelarTraducao } = criarTraducaoDaFala({
    gateway: { mt: { translate } } as unknown as GatewayDaCaptura,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('pt'),
    targetLangRef: ref('pt'),
    idiomaObservadoRef: ref('en'),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: { get current() { return segs } },
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(false),
    degradacaoAvisadaRef: ref(false),
    setSpeechSegments: (u) => {
      segs = typeof u === 'function' ? u(segs) : u
    },
    setFeedbackMsg: () => {},
    memoriaPersistente: null,
    ...(modo ? { modoDeTraducaoRef: ref(modo), conhecidasRef: ref(conhecidas), pedidosSobDemandaRef: ref(pedidos) } : {}),
  })
  return { translateSegment, revelarTraducao, translate, seg: () => segs[0], pedidos }
}

describe('modo sempre (padrão): nada muda', () => {
  it('sem a preferência, a fala final vai à MT', async () => {
    const m = montar()
    m.translateSegment('u1', 'The dog is in the kitchen', 'en', 'pt')
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(m.seg().translatedText).toBe('[mt] The dog is in the kitchen')
  })

  it('com `sempre` explícito, também — mesmo só com palavras conhecidas', async () => {
    const m = montar('sempre')
    m.translateSegment('u1', 'The dog is in the kitchen', 'en', 'pt')
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
  })
})

describe('modo pedir: só quando eu pedir', () => {
  it('o final não chama a MT; o balão fica sob demanda e conta como pulo', async () => {
    capMetrics.reset()
    const m = montar('pedir')
    m.translateSegment('u1', 'I would like a cup of coffee', 'en', 'pt')
    await esperar()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.seg().translatedText).toBe('')
    expect(m.seg().traducaoSobDemanda).toBe(true)
    expect(capMetrics.summary().mtPuladas).toEqual({ pedido: 1, conhecidas: 0 })
  })

  it('o parcial também não chama, e não ganha o botão (o final decide)', async () => {
    const m = montar('pedir')
    m.translateSegment('u1', 'I would like', 'en', 'pt', { descartarSeOcupado: true })
    await esperar()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.seg().traducaoSobDemanda).toBeUndefined()
  })

  it('revelar faz UMA chamada pelo caminho normal e escreve a tradução', async () => {
    const m = montar('pedir')
    m.translateSegment('u1', 'I would like a cup of coffee', 'en', 'pt')
    await esperar()
    m.revelarTraducao('u1')
    expect(m.seg().translatedText).toBe('…')
    expect(m.seg().traducaoSobDemanda).toBeUndefined()
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(m.translate.mock.calls[0][0]).toBe('I would like a cup of coffee')
    expect(m.seg().translatedText).toBe('[mt] I would like a cup of coffee')
    // Revelar de novo não chama outra vez: o pedido guardado já foi consumido.
    m.revelarTraducao('u1')
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
  })
})

describe('modo novas: só frases com palavra nova', () => {
  it('fala toda conhecida não chama a MT, fica revelável e conta', async () => {
    capMetrics.reset()
    const m = montar('novas')
    m.translateSegment('u1', 'The dog is in the kitchen.', 'en', 'pt')
    await esperar()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.seg().traducaoSobDemanda).toBe(true)
    expect(capMetrics.summary().mtPuladas).toEqual({ pedido: 0, conhecidas: 1 })
    m.revelarTraducao('u1')
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
  })

  it('com uma palavra nova, traduz normalmente', async () => {
    const m = montar('novas')
    m.translateSegment('u1', 'The dog is in the garden', 'en', 'pt')
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(m.seg().traducaoSobDemanda).toBeUndefined()
  })

  it('fala de outro idioma que o do predicado: traduz (nada é "conhecido")', async () => {
    const m = montar('novas')
    m.translateSegment('u1', 'el perro', 'es', 'pt', { falada: true })
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
  })
})

describe('preferência persistida', () => {
  it('o padrão dos ajustes da legenda é `sempre`', () => {
    expect(DEFAULT_TRANSCRIPT_SETTINGS.traducao).toBe('sempre')
  })

  it('ajuste salvo antes do campo, ou com valor estranho, lê como `sempre`', () => {
    expect(modoDeTraducao(undefined)).toBe('sempre')
    expect(modoDeTraducao('talvez')).toBe('sempre')
    expect(modoDeTraducao('pedir')).toBe('pedir')
    expect(modoDeTraducao('novas')).toBe('novas')
  })

  it('o valor gravado em `transcriptSettings` volta igual ao reler', () => {
    const salvo = JSON.stringify({ ...DEFAULT_TRANSCRIPT_SETTINGS, traducao: 'novas' })
    const lido = { ...DEFAULT_TRANSCRIPT_SETTINGS, ...JSON.parse(salvo) }
    expect(modoDeTraducao(lido.traducao)).toBe('novas')
  })
})
