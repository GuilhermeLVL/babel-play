// @vitest-environment jsdom
/**
 * `frasy:legenda:traduzida` (`lab-medicao-legenda-traduzida`, tarefa 2.3, definição D1): a marca sai no quadro
 * (`requestAnimationFrame`) DEPOIS do commit em que o balão passa a mostrar a tradução FINAL, uma vez por balão. Parcial
 * traduzido, fala sem tradução e falha não levam marca (o balão só tem `origemDaTraducao` quando o final foi traduzido).
 */
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { capMetrics } from '../src/gateway/capture/captureMetrics'
import { useMarcaDaLegenda } from '../src/lib/captura/marcaDaLegenda'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { origemDoMotor } from '../src/lib/captura/traducaoDaFala'

let quadros: FrameRequestCallback[] = []
const pintarQuadro = () => {
  const fila = quadros
  quadros = []
  fila.forEach((cb) => cb(performance.now()))
}

function Tela({ falas }: { falas: SpeechSegment[] }) {
  useMarcaDaLegenda(falas)
  return null
}

const balao = (id: string, extra: Partial<SpeechSegment> = {}): SpeechSegment => ({
  id,
  speakerId: 'mic',
  source: 'mic',
  timestamp: '00:00',
  originalText: 'bom dia',
  translatedText: '…',
  words: [],
  isPartial: false,
  ...extra,
})

const marcas = () => performance.getEntriesByName('frasy:legenda:traduzida') as PerformanceMark[]

beforeEach(() => {
  quadros = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => quadros.push(cb))
  performance.clearMarks()
  capMetrics.reset()
  capMetrics.drenarLegenda()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('marca da legenda traduzida', () => {
  it('uma marca por balão, no quadro seguinte ao commit da tradução final, com a origem', () => {
    capMetrics.fimDaVoz('mic-1', performance.now() - 900)
    const { rerender } = render(<Tela falas={[balao('mic-1')]} />)
    pintarQuadro()
    expect(marcas()).toHaveLength(0) // ainda "…": a tradução não chegou

    rerender(<Tela falas={[balao('mic-1', { translatedText: 'Good morning.', origemDaTraducao: 'nuvem' })]} />)
    expect(marcas()).toHaveLength(0) // commitou, mas o quadro ainda não foi pintado
    pintarQuadro()
    expect(marcas()).toHaveLength(1)
    expect(marcas()[0].detail).toEqual({ id: 'mic-1', origem: 'nuvem' })

    // Outro commit com o mesmo balão (e até uma retradução): a marca não se repete.
    rerender(<Tela falas={[balao('mic-1', { translatedText: 'Good day.', origemDaTraducao: 'local' })]} />)
    pintarQuadro()
    expect(marcas()).toHaveLength(1)

    // E o número entrou no acumulador: ~900 ms desde o último quadro de voz.
    const { fimDaFalaAteLegendaMs } = capMetrics.drenarLegenda()
    expect(fimDaFalaAteLegendaMs).toHaveLength(1)
    expect(fimDaFalaAteLegendaMs[0]).toBeGreaterThanOrEqual(900)
  })

  it('nenhuma marca para parcial, fala sem tradução ou falha', () => {
    const falas = [
      balao('mic-1', { isPartial: true, translatedText: 'Good…' }), // parcial traduzido (sem origem: só o final a leva)
      balao('mic-2', { translatedText: '', semTraducao: true }), // mesmo idioma
      balao('mic-3', { translatedText: '', semTraducao: 'falhou' }), // falha
      balao('mic-4', { translatedText: '', traducaoSobDemanda: true }), // "Tradução" por pedido
    ]
    const { rerender } = render(<Tela falas={falas} />)
    pintarQuadro()
    rerender(<Tela falas={[...falas]} />)
    pintarQuadro()
    expect(marcas()).toHaveLength(0)
  })

  it('parcial que traz origem (defensivo) também não marca', () => {
    render(<Tela falas={[balao('mic-1', { isPartial: true, origemDaTraducao: 'local' })]} />)
    pintarQuadro()
    expect(marcas()).toHaveLength(0)
  })

  it('cada balão marca o seu, e uma sessão nova (lista vazia) deixa os mesmos ids marcarem de novo', () => {
    const a = balao('mic-1', { origemDaTraducao: 'memoria' })
    const b = balao('mic-2', { origemDaTraducao: 'dicionario' })
    const { rerender } = render(<Tela falas={[a]} />)
    rerender(<Tela falas={[a, b]} />)
    pintarQuadro()
    expect(marcas().map((m) => (m.detail as { id: string }).id)).toEqual(['mic-1', 'mic-2'])

    rerender(<Tela falas={[]} />)
    rerender(<Tela falas={[a]} />)
    pintarQuadro()
    expect(marcas()).toHaveLength(3)
  })
})

describe('origem da tradução pelo motor que a fez', () => {
  it('navegador, aparelho e nuvem (lista fechada da marca)', () => {
    expect(origemDoMotor('chrome-translator')).toBe('nativo')
    expect(origemDoMotor('opus-mt-local')).toBe('local')
    expect(origemDoMotor('bergamot-local')).toBe('local')
    expect(origemDoMotor('server-llm-mt')).toBe('nuvem')
    expect(origemDoMotor('mymemory')).toBe('nuvem')
    expect(origemDoMotor(undefined)).toBe('nuvem')
  })
})
