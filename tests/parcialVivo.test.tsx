// @vitest-environment jsdom
/**
 * O PARCIAL VIVO FORA DO ESTADO DAS FALAS (V6 de `parciais-incrementais`, flag `parciais_vivos`).
 *
 * Trava o que a V5 mediu como custo: cada atualização do parcial re-renderizava a tela de captura (e o App) inteira. Com o armazém, quem
 * monta a lista NÃO re-renderiza quando só o texto do parcial muda, e só a linha (ou a janela de legenda) que o mostra atualiza. A contagem é
 * por espião nas funções que cada render do pai chama exatamente uma vez (`blocosDasFalas`) e por um contador no pai da janela.
 */
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))
vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))
const politica = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/politicaDaLegenda', async () => {
  const m = await import('../src/core/moderacao/legendaSegura')
  return {
    politicaDaLegendaAtual: () =>
      politica.ligada ? m.politicaDaLegenda({ protegido: true, opcaoDoAdulto: false }) : m.POLITICA_DESLIGADA,
  }
})
const conta = vi.hoisted(() => ({ lista: 0 }))
vi.mock('../src/lib/captura/blocosDasFalas', async (original) => {
  const m = await original<typeof import('../src/lib/captura/blocosDasFalas')>()
  return {
    ...m,
    blocosDasFalas: (...a: Parameters<typeof m.blocosDasFalas>) => {
      conta.lista++
      return m.blocosDasFalas(...a)
    },
  }
})

import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'
import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import { escreverParcialVivo, lerParcialVivo, limparParcialVivo } from '../src/lib/captura/parcialVivo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

beforeEach(() => {
  localStorage.clear()
  conta.lista = 0
  politica.ligada = true
})
afterEach(() => {
  cleanup()
  limparParcialVivo('p1')
})

const fala = (extra: Partial<SpeechSegment> = {}): SpeechSegment => ({
  id: 'p1',
  speakerId: 'system',
  source: 'system',
  timestamp: '00:03',
  originalText: 'the cat',
  translatedText: '',
  words: [],
  lang: 'en',
  isPartial: true,
  ...extra,
})
const escrever = (originalText: string, textoConfirmado?: string) =>
  act(() => escreverParcialVivo('p1', { originalText, textoConfirmado }))

describe('armazém do parcial vivo', () => {
  it('guarda o último texto, não avisa texto igual e limpa em silêncio', () => {
    escreverParcialVivo('p1', { originalText: 'a' })
    const antes = lerParcialVivo('p1')
    escreverParcialVivo('p1', { originalText: 'a' })
    expect(lerParcialVivo('p1')).toBe(antes) // a MESMA identidade: quem assina não re-renderiza
    escreverParcialVivo('p1', { originalText: 'a b' })
    expect(lerParcialVivo('p1')?.originalText).toBe('a b')
    limparParcialVivo('p1')
    expect(lerParcialVivo('p1')).toBeUndefined()
  })

  it('a legenda segura vale aqui: o termo da política sai antes de entrar no armazém, e o confirmado só vale como prefixo', () => {
    escreverParcialVivo('p1', { originalText: 'reveal the porn quest', textoConfirmado: 'reveal the porn' })
    expect(lerParcialVivo('p1')?.originalText).toBe('reveal the ••• quest')
    expect(lerParcialVivo('p1')?.textoConfirmado).toBe('reveal the •••')
    escreverParcialVivo('p1', { originalText: 'reveal the porn quest', textoConfirmado: 'the' })
    expect(lerParcialVivo('p1')?.textoConfirmado).toBeUndefined()
    politica.ligada = false
    escreverParcialVivo('p1', { originalText: 'reveal the porn quest' })
    expect(lerParcialVivo('p1')?.originalText).toBe('reveal the porn quest')
  })
})

describe('HistoricoDoPrototipo: a atualização do parcial mexe só na linha', () => {
  const montar = (falas: SpeechSegment[]) =>
    render(<HistoricoDoPrototipo falas={falas} escala={1} idiomaPadrao="en" aoTocar={() => {}} />)

  it('5 atualizações do parcial não re-renderizam a lista (o pai); o texto da linha acompanha o armazém', () => {
    const falas = [fala()]
    const { container } = montar(falas)
    expect(conta.lista).toBe(1)
    expect(container.querySelector('.q-t')?.textContent?.trim()).toBe('the cat')
    for (const texto of [
      'the cat sat',
      'the cat sat on',
      'the cat sat on the',
      'the cat sat on the mat',
      'the cat sat on the mat today',
    ])
      escrever(texto)
    expect(container.querySelector('.q-t')?.textContent?.trim()).toBe('the cat sat on the mat today')
    expect(conta.lista).toBe(1)
  })

  it('o final (fala fechada) manda o texto do estado, mesmo que o armazém ainda tenha o parcial', () => {
    escrever('the cat sat on the mat')
    const { container } = montar([fala({ isPartial: false, originalText: 'The cat sat.' })])
    expect(container.querySelector('.q-t, .q-o')?.textContent?.trim()).toContain('The cat sat.')
    expect(container.textContent).not.toContain('on the mat')
  })

  it('sem nada no armazém (flag desligada) a linha usa o texto do estado, como sempre', () => {
    const { container } = montar([fala()])
    expect(container.querySelector('.q-t')?.textContent?.trim()).toBe('the cat')
  })
})

describe('janela de legenda: o texto vivo re-renderiza só a janela', () => {
  const base: LegendaAoVivo = {
    id: 'p1',
    quem: 'Outros',
    traducao: '',
    lado: 'eles',
    original: 'the cat',
    parcial: true,
  }
  let rendersDoPai = 0
  const falas = [base]
  const Pai = () => {
    rendersDoPai++
    return <LegendasFlutuantes falas={falas} aoFechar={vi.fn()} />
  }

  it('cada atualização troca o texto e a cauda provisória sem re-renderizar quem monta a janela', () => {
    rendersDoPai = 0
    const { container } = render(<Pai />)
    expect(rendersDoPai).toBe(1)
    escrever('the cat sat on', 'the cat')
    expect(container.querySelector('.leg-provisoria')?.textContent?.trim()).toBe('sat on')
    escrever('the cat sat on the mat', 'the cat sat')
    expect(container.querySelector('.leg-provisoria')?.textContent?.trim()).toBe('on the mat')
    expect(container.querySelector('.leg-provisoria')?.getAttribute('aria-live')).toBe('off')
    expect(container.querySelector('.leg-anuncio')?.textContent).toBe('') // a região viva nunca leva a cauda
    expect(rendersDoPai).toBe(1)
  })
})
