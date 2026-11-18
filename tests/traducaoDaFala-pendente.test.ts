/**
 * TRADUÇÃO A CAMINHO, NÃO "INDISPONÍVEL" (relato do dono no celular, 2026-09-29: "a tradução não
 * funciona"). Na edição estática, sem consentimento de nuvem, o celular não tem o tradutor do Chrome e o
 * opus-mt só começa a baixar (113 MB) no primeiro final: cada final desse intervalo virava o original
 * entre parênteses e a faixa "Tradução indisponível agora…".
 *
 * O contrato: quando a cadeia falha SÓ porque um motor ainda carrega (`soFaltaCarregar`), o balão fica
 * PENDENTE (`traducaoPendente`, a linha diz "Baixando o tradutor…") e a faixa não aparece; ela é para
 * falha de verdade. Quando o tradutor fica pronto, os pendentes são traduzidos. Se ele NÃO carrega
 * (`aoFalharCarga`), os pendentes mostram o original e a tela é avisada uma vez (`aoFalharOTradutorLocal`).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import { NoRouteError } from '../src/core'
import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

const balao = (id: string, texto: string): SpeechSegment => ({
  id,
  speakerId: 'user',
  source: 'mic',
  timestamp: '00:00',
  originalText: texto,
  translatedText: '…',
  words: [],
})

function montar(o: { nuvemConsentida?: boolean } = {}) {
  let segs: SpeechSegment[] = [balao('a', 'o carro azul'), balao('b', 'a mesa grande')]
  let pronto = false
  let avisarPronto: (() => void) | null = null
  let avisarFalha: (() => void) | null = null
  const translate = vi.fn(async (texto: string) => {
    if (!pronto) throw new NoRouteError('mt', new Error('opus-mt ainda carregando'), true)
    return { text: `[mt] ${texto}`, engine: 'opus-mt-local' }
  })
  const avisos: string[] = []
  const aoFalharOTradutorLocal = vi.fn()
  const aoTraduzirNoAparelho = vi.fn()
  const gateway = {
    mt: {
      translate,
      aoFicarPronto: (fn: () => void) => {
        avisarPronto = fn
        return () => {}
      },
      aoFalharCarga: (fn: () => void) => {
        avisarFalha = fn
        return () => {}
      },
    },
  } as unknown as GatewayDaCaptura
  const traducao = criarTraducaoDaFala({
    gateway,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('pt'),
    targetLangRef: ref('en'),
    idiomaObservadoRef: ref(''),
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
    memoriaPersistente: null,
    aoFalharOTradutorLocal,
    aoTraduzirNoAparelho,
    nuvemConsentida: () => o.nuvemConsentida === true,
  })
  return {
    traducao,
    translate,
    avisos,
    aoFalharOTradutorLocal,
    aoTraduzirNoAparelho,
    segs: () => segs,
    ficarPronto: () => {
      pronto = true
      avisarPronto!()
    },
    falharCarga: () => avisarFalha!(),
  }
}

describe('a linha sem tradução diz o motivo (CEL-01)', () => {
  it('par sem rota no aparelho (hindi): "sem-rota", e o DOM da linha não teria o original repetido', async () => {
    const m = montar()
    m.translate.mockRejectedValueOnce(new NoRouteError('mt', new Error('sem adaptador'), false))
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'hi', { falada: true })
    await esperar()
    await esperar()
    expect(m.segs()[0]).toMatchObject({ translatedText: '', semTraducao: 'sem-rota' })
  })

  it('com a nuvem consentida, a mesma queda é "falhou" (a web pode voltar: "Tentar de novo" serve)', async () => {
    const m = montar({ nuvemConsentida: true })
    m.translate.mockRejectedValueOnce(new NoRouteError('mt', new Error('cota'), false))
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'hi', { falada: true })
    await esperar()
    await esperar()
    expect(m.segs()[0].semTraducao).toBe('falhou')
  })

  it('a linha que falhou volta a ser traduzida quando o tradutor fica pronto (e perde o motivo)', async () => {
    const m = montar()
    m.translate.mockRejectedValueOnce(new NoRouteError('mt', new Error('rede'), false))
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    expect(m.segs()[0].semTraducao).toBe('falhou')
    m.ficarPronto()
    for (let i = 0; i < 10; i++) await esperar()
    expect(m.segs()[0].translatedText).toBe('[mt] o carro azul')
    expect(m.segs()[0].semTraducao).toBeUndefined()
  })

  it('"Tentar de novo" de uma linha: traduz só ela de novo', async () => {
    const m = montar()
    m.translate.mockRejectedValueOnce(new NoRouteError('mt', new Error('rede'), false))
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    m.ficarPronto()
    m.translate.mockClear()
    m.traducao.tentarTraduzirDeNovo('a')
    for (let i = 0; i < 10; i++) await esperar()
    expect(m.segs()[0].translatedText).toBe('[mt] o carro azul')
  })
})

describe('o tradutor local assumiu (COMP-03)', () => {
  it('a primeira tradução de um final pelo opus-mt avisa a tela (o cartão do nativo some)', async () => {
    const m = montar()
    m.ficarPronto()
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    for (let i = 0; i < 5; i++) await esperar()
    expect(m.aoTraduzirNoAparelho).toHaveBeenCalled()
  })
})

describe('tradução pendente enquanto o tradutor local carrega', () => {
  it('o final fica PENDENTE (sem o original entre parênteses) e a faixa de falha não aparece', async () => {
    const m = montar()
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    expect(m.segs()[0]).toMatchObject({ translatedText: '…', traducaoPendente: true })
    expect(m.avisos).toEqual([])
  })

  it('pronto o tradutor, TODOS os pendentes são traduzidos (e deixam de ser pendentes)', async () => {
    const m = montar()
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    m.traducao.translateSegment('b', 'a mesa grande', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    m.ficarPronto()
    for (let i = 0; i < 10; i++) await esperar()
    expect(m.segs().map((s) => s.translatedText)).toEqual(['[mt] o carro azul', '[mt] a mesa grande'])
    expect(m.segs().some((s) => s.traducaoPendente)).toBe(false)
  })

  it('falha de verdade (sem motor carregando) continua degradando, com a faixa', async () => {
    const m = montar()
    m.translate.mockRejectedValueOnce(new NoRouteError('mt', new Error('rede'), false))
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    // A linha não finge que traduziu (CEL-01): sem o original entre parênteses, com o motivo.
    expect(m.segs()[0]).toMatchObject({ translatedText: '', semTraducao: 'falhou' })
    expect(m.segs()[0].traducaoPendente).toBeFalsy()
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).not.toMatch(/parênteses/)
  })

  it('o tradutor local NÃO carregou: os pendentes ficam sem tradução (com o motivo) e a tela é avisada UMA vez', async () => {
    const m = montar()
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    m.falharCarga()
    m.falharCarga()
    expect(m.segs()[0]).toMatchObject({ translatedText: '', semTraducao: 'falhou' })
    expect(m.segs()[0].traducaoPendente).toBeFalsy()
    expect(m.aoFalharOTradutorLocal).toHaveBeenCalledTimes(1)
    // A mensagem clara substitui a faixa genérica.
    expect(m.avisos).toEqual([])
  })
})
