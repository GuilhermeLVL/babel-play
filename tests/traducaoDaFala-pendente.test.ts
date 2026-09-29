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

function montar() {
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
  })
  return {
    traducao,
    translate,
    avisos,
    aoFalharOTradutorLocal,
    segs: () => segs,
    ficarPronto: () => {
      pronto = true
      avisarPronto!()
    },
    falharCarga: () => avisarFalha!(),
  }
}

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
    expect(m.segs()[0].translatedText).toBe('(o carro azul)')
    expect(m.segs()[0].traducaoPendente).toBeFalsy()
    expect(m.avisos).toHaveLength(1)
  })

  it('o tradutor local NÃO carregou: os pendentes mostram o original e a tela é avisada UMA vez', async () => {
    const m = montar()
    m.traducao.translateSegment('a', 'o carro azul', 'pt', 'en', { falada: true })
    await esperar()
    await esperar()
    m.falharCarga()
    m.falharCarga()
    expect(m.segs()[0]).toMatchObject({ translatedText: '(o carro azul)' })
    expect(m.segs()[0].traducaoPendente).toBeFalsy()
    expect(m.aoFalharOTradutorLocal).toHaveBeenCalledTimes(1)
    // A mensagem clara substitui a faixa genérica.
    expect(m.avisos).toEqual([])
  })
})
