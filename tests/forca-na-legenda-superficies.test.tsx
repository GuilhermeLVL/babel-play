// @vitest-environment jsdom
/**
 * A FORÇA NA LEGENDA (openspec `status-da-palavra-na-legenda`, 3.1): `data-forca` nos nós de palavra da legenda, da
 * janela flutuante e da folha da frase, sem mudar `data-etiqueta` nem o texto acessível. Sem a flag
 * `forca_na_legenda` o etiquetador devolve `undefined` e o atributo não existe.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import FolhasDoPrototipo from '../src/components/views/captura/celular/FolhasDoPrototipo'
import LinhaDaLegenda, { type LegendaAoVivo } from '../src/components/views/captura/legendas/LinhaDaLegenda'
import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { Forca } from '../src/core/learning/forcaDoCartao'
import type { Etiquetador } from '../src/lib/etiquetas/indiceDeEtiquetas'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const FORCAS: Record<string, Forca> = { report: 2, answer: 3, scrutinize: 1 }

const norm = (p: string) => p.trim().toLowerCase()

function etiquetadorCom(ligado: boolean): Etiquetador {
  const e: Etiquetador = {
    etiqueta: (p) => (norm(p) in FORCAS ? 'aprendendo' : undefined),
    salva: (p) => norm(p) in FORCAS,
    forca: (p) => (ligado ? FORCAS[norm(p)] : undefined),
    semNova: () => e,
  }
  return e
}

const original = window.matchMedia
beforeEach(() => {
  prepararDialogoNoJsdom()
  window.matchMedia = ((q: string) => ({
    matches: /min-width/.test(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never
})
afterEach(() => {
  cleanup()
  window.matchMedia = original
})

const forcasNo = (raiz: ParentNode, seletor: string) =>
  Object.fromEntries([...raiz.querySelectorAll(seletor)].map((e) => [e.textContent, e.getAttribute('data-forca')]))

const TEXTO = 'The report answer scrutinize'
const ao = { aoTocarPalavra: () => {}, aoCopiar: () => {} }
const aoVivo: LegendaAoVivo = { id: '1', quem: 'Outros', original: TEXTO, traducao: '', lado: 'eles', lang: 'en' }

describe('data-forca nas três superfícies', () => {
  it('legenda da captura: a força nas palavras, texto idêntico', () => {
    const falas = [
      { id: '1', timestamp: '10:00', originalText: TEXTO, translatedText: 'x', lang: 'en', isPartial: false },
    ] as never
    const { container } = render(
      <HistoricoDoPrototipo
        falas={falas}
        escala={1}
        idiomaPadrao="en"
        aoTocar={() => {}}
        etiquetador={etiquetadorCom(true)}
      />,
    )
    expect(forcasNo(container, '.q-o [data-forca]')).toEqual({ report: '2', answer: '3', scrutinize: '1' })
    expect(container.querySelector('.q-o')?.textContent).toBe(TEXTO)
  })

  it('janela flutuante: a força nas palavras, data-etiqueta preservado', () => {
    const { container } = render(
      <LinhaDaLegenda
        fala={aoVivo}
        modo="jogo"
        modoDaTraducao="sempre"
        traducaoVisivel
        emFoco
        etiquetador={etiquetadorCom(true)}
        {...ao}
      />,
    )
    expect(forcasNo(container, '[data-palavra][data-forca]')).toEqual({ report: '2', answer: '3', scrutinize: '1' })
    expect(container.querySelector('[data-palavra="report"]')?.getAttribute('data-etiqueta')).toBe('aprendendo')
    expect(container.querySelector('.leg-o')?.textContent).toBe(TEXTO)
  })

  it('folha da frase: a força nos botões; o nome acessível não muda', () => {
    const fala = { id: '1', texto: TEXTO, traducao: 'x', lang: 'en', langDaTraducao: 'pt-BR' }
    const montar = (ligado: boolean) =>
      render(
        <FolhasDoPrototipo
          fala={fala}
          palavra={null}
          modal
          aoOuvir={() => {}}
          aoTocarPalavra={() => {}}
          aoConsultar={async () => ({ traducao: '' })}
          aoSalvar={async () => ''}
          aoFechar={() => {}}
          etiquetador={etiquetadorCom(ligado)}
        />,
      )
    const ligada = montar(true)
    expect(forcasNo(ligada.container, '.folha-palavras button[data-forca]')).toEqual({
      report: '2',
      answer: '3',
      scrutinize: '1',
    })
    expect(screen.getByRole('button', { name: 'report' }).getAttribute('data-etiqueta')).toBe('aprendendo')
    ligada.unmount()
    const desligada = montar(false)
    expect(desligada.container.querySelector('[data-forca]')).toBeNull()
    expect(screen.getByRole('button', { name: 'report' })).toBeTruthy()
  })

  it('flag desligada: a legenda não traz data-forca', () => {
    const { container } = render(
      <LinhaDaLegenda
        fala={aoVivo}
        modo="jogo"
        modoDaTraducao="sempre"
        traducaoVisivel
        emFoco
        etiquetador={etiquetadorCom(false)}
        {...ao}
      />,
    )
    expect(container.querySelector('[data-forca]')).toBeNull()
  })
})

void React
