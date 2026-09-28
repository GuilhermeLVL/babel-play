/**
 * RETRADUÇÃO QUANDO O TRADUTOR LOCAL FICA PRONTO (Quest emulado, 2026-09-28).
 *
 * Enquanto o opus-mt carrega, os finais sem outro motor degradam para "(texto original)". Quando o
 * modelo fica pronto, essas falas voltam a "…" e são traduzidas de novo — só as últimas 20 (uma
 * sessão longa não dispara centenas de traduções de uma vez) — e o aviso vem do PRÓPRIO gateway
 * (`mt.aoFicarPronto`), não só da barra de preparação: o modelo pode ficar pronto por um aquecimento
 * ou por um pedido de tradução, caminhos que não passam pela barra.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import {
  criarTraducaoDaFala,
  type DepsDaTraducaoDaFala,
  MAX_RETRADUCOES,
} from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

const seg = (i: number, traducao: string): SpeechSegment => ({
  id: `s${i}`,
  speakerId: 'me',
  source: 'mic',
  timestamp: '0:00',
  originalText: `fala ${i}`,
  translatedText: traducao,
  words: [],
})

function montar(segsIniciais: SpeechSegment[], gatewayExtra: Record<string, unknown> = {}) {
  let segs = segsIniciais
  const translate = vi.fn(async (texto: string) => ({ text: `[mt] ${texto}`, engine: 'opus-mt-local' }))
  const deps = (): DepsDaTraducaoDaFala => ({
    gateway: { mt: { translate, ...gatewayExtra } } as unknown as GatewayDaCaptura,
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
    setFeedbackMsg: () => {},
    memoriaPersistente: null,
  })
  return { deps, translate, segs: () => segs }
}

describe('retraduzirDegradados', () => {
  it('retraduz as falas que degradaram para "(original)" e deixa as traduzidas em paz', async () => {
    const m = montar([seg(1, '(fala 1)'), seg(2, 'já traduzida'), seg(3, '(fala 3)')])
    criarTraducaoDaFala(m.deps()).retraduzirDegradados()
    await esperar()
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(2)
    expect(m.segs().map((s) => s.translatedText)).toEqual(['[mt] fala 1', 'já traduzida', '[mt] fala 3'])
  })

  it(`limita às últimas ${20}: uma sessão longa não dispara centenas de traduções`, async () => {
    expect(MAX_RETRADUCOES).toBe(20)
    const m = montar(Array.from({ length: 30 }, (_, i) => seg(i, `(fala ${i})`)))
    criarTraducaoDaFala(m.deps()).retraduzirDegradados()
    await esperar()
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(20)
    const textos = m.segs().map((s) => s.translatedText)
    expect(textos[9]).toBe('(fala 9)') // as antigas ficam como estavam
    expect(textos[10]).toBe('[mt] fala 10')
    expect(textos[29]).toBe('[mt] fala 29')
  })

  it('o aviso de "tradutor pronto" do gateway dispara a retradução — com a fábrica do render MAIS NOVO', async () => {
    let avisar: (() => void) | null = null
    const aoFicarPronto = vi.fn((fn: () => void) => {
      avisar = fn
      return () => {}
    })
    const m = montar([seg(1, '(fala 1)')], { aoFicarPronto })
    const gateway = m.deps().gateway
    // A tela recria a fábrica a cada render; o gateway é o mesmo. Um ouvinte só.
    criarTraducaoDaFala({ ...m.deps(), gateway })
    criarTraducaoDaFala({ ...m.deps(), gateway })
    expect(aoFicarPronto).toHaveBeenCalledTimes(1)
    avisar!()
    await esperar()
    await esperar()
    expect(m.translate).toHaveBeenCalledTimes(1)
    expect(m.segs()[0].translatedText).toBe('[mt] fala 1')
  })

  it('gateway sem aoFicarPronto (testes antigos, outras telas) não quebra', () => {
    const m = montar([seg(1, '(fala 1)')])
    expect(() => criarTraducaoDaFala(m.deps())).not.toThrow()
  })
})
