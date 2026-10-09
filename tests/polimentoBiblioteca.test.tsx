// @vitest-environment jsdom
/**
 * A BIBLIOTECA NO DESENHO NOVO — a marcação é a do protótipo (`htmlDaBib()`, `telas.js:396-434`) e o
 * movimento é o de `redesenharBib()` (`telas.js:436-454`), com as gravações de verdade.
 *
 * A igualdade de medidas e de movimento com o protótipo é provada pelo comparador
 * (`scripts/polimento/roteiros/biblioteca*.json`); aqui fica o que o comparador não alcança com uma
 * gravação só na conta local: as páginas, a troca de gravação, os filtros e os números do movimento.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BibliotecaDoQuest from '../src/components/views/biblioteca/quest/BibliotecaDoQuest'
import { EO } from '../src/lib/polimento/base'
import { redesenharBib } from '../src/lib/polimento/biblioteca'
import type { Recording } from '../src/types'

const gravacao = (id: string, extra: Partial<Recording> = {}): Recording => ({
  id,
  title: `Sessão ${id}`,
  date: 'Ontem',
  durationStr: '38:10',
  wordCount: 120,
  type: 'audio',
  tags: [],
  status: 'Processado',
  idioma: 'en',
  ...extra,
})
const seis = [
  gravacao('a', { pinned: true }),
  gravacao('b'),
  gravacao('c', { type: 'video' }),
  gravacao('d'),
  gravacao('e', { type: 'document', durationStr: '-' }),
  gravacao('f', { type: 'video', wordCount: 0, pronta: false }),
]

/** Cada `Element.animate` da tela: quem, os quadros e o tempo. */
interface Animacao {
  quem: Element
  quadros: Keyframe[]
  duration?: number
  delay?: number
  easing?: string
}
let animacoes: Animacao[] = []
const ligarPolimento = () => {
  document.documentElement.dataset.px = 'on'
  document.body.classList.add('animations-on')
}

beforeEach(() => {
  animacoes = []
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    animacoes.push({ quem: this, quadros, duration: o.duration as number, delay: o.delay, easing: o.easing })
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
  } as typeof Element.prototype.animate
  ligarPolimento()
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.px
  document.body.classList.remove('animations-on')
  delete (Element.prototype as { animate?: unknown }).animate
})

function Bancada({
  inicio,
  ...extra
}: { inicio: Recording[] } & Partial<React.ComponentProps<typeof BibliotecaDoQuest>>) {
  const [busca, setBusca] = React.useState('')
  const achadas = inicio.filter((g) => g.title.toLowerCase().includes(busca.toLowerCase()))
  return (
    <BibliotecaDoQuest
      gravacoes={achadas}
      total={inicio}
      ordem="recentes"
      aoTrocarOrdem={() => undefined}
      aoAbrir={() => undefined}
      aoJogar={() => undefined}
      aoRevisar={() => undefined}
      aoCapturar={() => undefined}
      aoImportar={() => undefined}
      aoFixar={() => undefined}
      aoRenomear={() => undefined}
      aoExcluir={() => undefined}
      aoExportar={() => undefined}
      aoRetomar={() => undefined}
      busca={busca}
      aoBuscar={setBusca}
      {...extra}
    />
  )
}

const linhas = () => [...document.querySelectorAll<HTMLButtonElement>('.q-lista > .q-linha')]
const titulos = () => linhas().map((l) => l.querySelector('b')?.textContent)
const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
const aba = (nome: RegExp) => screen.getByRole('radio', { name: nome }) as HTMLButtonElement
const texto = (seletor: string) => document.querySelector(seletor)?.textContent?.replace(/\s+/g, ' ').trim()

describe('a marcação do protótipo (telas.js:408-434)', () => {
  it('cabeçalho: a sobrancelha da biblioteca inteira e os dois chips, sem "Tela completa"', () => {
    render(<Bancada inicio={seis} />)
    // Cinco gravações de 38:10 = 190,8 min → 191 min; cinco com 120 palavras.
    expect(texto('.q-cab .q-sobre')).toBe('6 gravações · 191 min · 600 palavras')
    expect(texto('.q-cab h1')).toBe('Biblioteca')
    expect([...document.querySelectorAll('.q-cab .q-chip')].map((c) => c.textContent?.trim())).toEqual([
      'Mais recentes',
      'Importar',
    ])
    expect(screen.queryByText('Tela completa')).toBeNull()
  })

  it('as quatro abas de tipo, com a contagem e `aria-checked`, e sem ícone', () => {
    render(<Bancada inicio={seis} />)
    const abas = [...document.querySelectorAll('.q-bib > .q-abas .q-aba')]
    expect(abas.map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Todas 6',
      'Áudio 3',
      'Vídeo 2',
      'Texto 1',
    ])
    expect(abas.map((a) => a.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false'])
    expect(document.querySelector('.q-bib > .q-abas svg')).toBeNull()
  })

  it('a contagem das abas e a sobrancelha não mudam enquanto se busca', () => {
    render(<Bancada inicio={seis} />)
    fireEvent.change(screen.getByLabelText('Buscar por título'), { target: { value: 'Sessão a' } })
    expect(titulos()).toEqual(['Sessão a'])
    expect(texto('.q-cab .q-sobre')).toBe('6 gravações · 191 min · 600 palavras')
    expect(aba(/Todas/).textContent).toContain('6')
  })

  it('quatro linhas por página, o convite de capturar e a paginação sempre à vista', () => {
    render(<Bancada inicio={seis.slice(0, 2)} />)
    expect(titulos()).toEqual(['Sessão a', 'Sessão b'])
    expect(texto('.q-bib-nova b')).toBe('Capturar outra sessão')
    expect(texto('.q-bib-paginas .q-tempo')).toBe('1 / 1')
    expect(botao(/Anterior/).disabled).toBe(true)
    expect(botao(/Próxima/).disabled).toBe(true)
  })

  it('a linha diz as palavras ou "Processando", e o painel traz as etiquetas e os quatro fatos', () => {
    render(<Bancada inicio={seis} />)
    expect(linhas()[0].querySelector('.q-fim')?.textContent).toBe('120 palavras')
    expect([...document.querySelectorAll('.q-bib-tags .q-tag')].map((x) => x.textContent)).toEqual(['Áudio', 'Fixada'])
    expect([...document.querySelectorAll('.q-bib-fatos > div')].map((d) => d.textContent)).toEqual([
      'Palavras120',
      'Duração38 min',
      'IdiomaInglês',
      'DataOntem',
    ])
    expect(texto('.q-bib-acoes > .q-ctl.pri')).toBe('Abrir')
    expect([...document.querySelectorAll('.q-bib-acoes .q-acoes .q-ctl')].map((b) => b.textContent?.trim())).toEqual([
      'Jogar com esta',
      'Revisar palavras',
      'Exportar transcrição',
      'Retomar captura',
      'Desafixar',
      'Renomear',
      'Excluir',
    ])
  })

  it('"Retomar captura" só vale para sessão de áudio; a que ainda processa não joga nem revisa', () => {
    render(<Bancada inicio={seis} />)
    fireEvent.click(botao(/Próxima/))
    fireEvent.click(linhas()[1]) // "Sessão f": vídeo, ainda processando
    expect(botao('Retomar captura').disabled).toBe(true)
    expect(botao(/Jogar com esta/).disabled).toBe(true)
    expect(botao('Revisar palavras').disabled).toBe(true)
    expect(texto('.q-bib-tags .q-tag.off')).toBe('Sem texto ainda')
  })

  it('sem resultado: o aviso do protótipo e "Limpar a busca" devolve a lista', () => {
    render(<Bancada inicio={seis} />)
    fireEvent.change(screen.getByLabelText('Buscar por título'), { target: { value: 'zzz' } })
    expect(texto('.q-vazio h2')).toBe('Nenhum resultado')
    expect(texto('.q-vazio p')).toBe('Nenhuma gravação tem “zzz” no título.')
    fireEvent.click(botao('Limpar a busca'))
    expect(titulos()).toHaveLength(4)
  })
})

describe('o comportamento do protótipo (telas.js:539-556)', () => {
  it('a gravação escolhida continua escolhida ao mudar de página', () => {
    render(<Bancada inicio={seis} />)
    fireEvent.click(linhas()[1])
    expect(texto('.q-bib-det h2')).toBe('Sessão b')
    fireEvent.click(botao(/Próxima/))
    expect(titulos()).toEqual(['Sessão e', 'Sessão f'])
    expect(texto('.q-bib-det h2')).toBe('Sessão b')
  })

  it('filtrar por tipo volta para a primeira gravação da primeira página', () => {
    render(<Bancada inicio={seis} />)
    fireEvent.click(botao(/Próxima/))
    fireEvent.click(aba(/Vídeo/))
    expect(aba(/Vídeo/).getAttribute('aria-checked')).toBe('true')
    expect(titulos()).toEqual(['Sessão c', 'Sessão f'])
    expect(texto('.q-bib-det h2')).toBe('Sessão c')
    expect(texto('.q-bib-paginas .q-tempo')).toBe('1 / 1')
  })

  it('um tipo sem nenhuma gravação fica desligado', () => {
    render(<Bancada inicio={seis.filter((g) => g.type !== 'document')} />)
    expect(aba(/Texto/).disabled).toBe(true)
    expect(aba(/Vídeo/).disabled).toBe(false)
  })
})

describe('o movimento de redesenharBib() (telas.js:446-453)', () => {
  it('trocar de gravação: o painel volta do desfoque em 460 ms e os fatos e as ações sobem em cascata', () => {
    render(<Bancada inicio={seis} />)
    animacoes = []
    fireEvent.click(linhas()[2])
    const [painel, ...resto] = animacoes
    expect(painel.quem.matches('.q-bib-det')).toBe(true)
    expect(painel.quadros).toEqual([
      { opacity: 0.2, transform: 'scale(0.97)', filter: 'blur(8px)' },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
    ])
    expect(painel.duration).toBe(460)
    expect(painel.easing).toBe(EO)
    // Quatro fatos e as quatro fileiras de ações (o botão "Abrir" e três grupos).
    expect(resto).toHaveLength(8)
    expect(resto.map((a) => a.delay)).toEqual([60, 105, 150, 195, 240, 285, 330, 375])
    for (const a of resto) {
      expect(a.duration).toBe(420)
      expect(a.quadros).toEqual([
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ])
    }
  })

  it('página seguinte entra pela direita, a anterior pela esquerda: 46 px, 460 ms, 55 ms entre as linhas', () => {
    render(<Bancada inicio={seis} />)
    animacoes = []
    fireEvent.click(botao(/Próxima/))
    expect(animacoes.map((a) => a.quem)).toEqual(linhas())
    expect(animacoes.map((a) => a.delay)).toEqual([0, 55])
    expect(animacoes[0].duration).toBe(460)
    expect(animacoes[0].quadros[0]).toEqual({ opacity: 0, transform: 'translateX(46px)' })

    animacoes = []
    fireEvent.click(botao(/Anterior/))
    expect(animacoes.map((a) => a.delay)).toEqual([0, 55, 110, 165])
    expect(animacoes[0].quadros[0]).toEqual({ opacity: 0, transform: 'translateX(-46px)' })
  })

  it('digitar na busca e trocar o filtro refazem a lista pelo lado, e o campo não perde o foco', () => {
    render(<Bancada inicio={seis} />)
    const campo = screen.getByLabelText('Buscar por título') as HTMLInputElement
    campo.focus()
    animacoes = []
    fireEvent.change(campo, { target: { value: 'Sessão' } })
    expect(animacoes).toHaveLength(4)
    expect(animacoes[1].quadros[0]).toEqual({ opacity: 0, transform: 'translateX(46px)' })
    expect(document.activeElement).toBe(campo)

    animacoes = []
    fireEvent.click(aba(/Áudio/))
    expect(animacoes.map((a) => a.delay)).toEqual([0, 55, 110])
  })

  it('sem a camada ligada, ou com menos movimento pedido, nada anima', () => {
    render(<Bancada inicio={seis} />)
    delete document.documentElement.dataset.px
    animacoes = []
    fireEvent.click(linhas()[1])
    fireEvent.click(botao(/Próxima/))
    expect(animacoes).toHaveLength(0)

    ligarPolimento()
    document.body.classList.remove('animations-on')
    const media = vi.fn(() => ({ matches: true }))
    vi.stubGlobal('matchMedia', media)
    redesenharBib(document, 'lista')
    redesenharBib(document, 'detalhe')
    expect(animacoes).toHaveLength(0)
    vi.unstubAllGlobals()
  })
})
