// @vitest-environment jsdom
/**
 * O INTÉRPRETE DO PROTÓTIPO NO DESENHO NOVO (`fidelidade/casca-e-telas.md`, 4.3, itens D19 a D31).
 * O que se prende:
 *   - a tela abre direto na conversa (duas metades, a de cima virada, a faixa no meio), parada;
 *   - o primeiro toque em "Falar" começa a sessão e a conversa em curso já ouve aquele lado;
 *   - os números do movimento são os do protótipo (`telas2.js:258-279, 569-582`);
 *   - o automático com cadeado avisa, treme e oferece os Planos; o X volta à origem.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** O aparelho do teste: celular (frente a frente) por padrão; os testes do monitor ligam o computador. */
const aparelho = vi.hoisted(() => ({ computador: false }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => ({
  ...(await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
  noComputador: () => aparelho.computador,
}))
vi.mock('../src/lib/tts', async (original) => {
  const real = await original<typeof import('../src/lib/tts')>()
  return { ...real, nativeTts: { speak: () => {}, cancel: () => {}, isSpeaking: () => false } }
})

import ModoInterprete, { type FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import PaginaDoInterprete from '../src/components/views/captura/interprete/PaginaDoInterprete'
import {
  entradaDaConversa,
  estadoDaTela,
  mudarEstadoDaTela,
  pedirConversa,
  tomarPedidoDaConversa,
} from '../src/lib/polimento/interprete'

interface Gravada {
  quem: string
  quadros: Keyframe[]
  d: number
  atraso: number
}
let gravadas: Gravada[] = []

beforeEach(() => {
  gravadas = []
  aparelho.computador = false
  localStorage.clear()
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  mudarEstadoDaTela({ emCurso: false, trocados: false, preparoVirtual: false, depois: null })
  tomarPedidoDaConversa()
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    gravadas.push({ quem: this.className, quadros, d: Number(o.duration), atraso: Number(o.delay ?? 0) })
    return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.px
  document.body.className = ''
})

function pagina(extra: Partial<React.ComponentProps<typeof PaginaDoInterprete>> = {}) {
  const aoComecar = vi.fn()
  const aoVoltar = vi.fn()
  const aoEscolherIdiomas = vi.fn()
  const aoConhecerOPremium = vi.fn()
  render(
    <PaginaDoInterprete
      idiomas={{ meu: 'pt-BR', outro: 'en-US' }}
      possivel
      abrindo={false}
      aviso={null}
      automatico="premium"
      aoConhecerOPremium={aoConhecerOPremium}
      aoComecar={aoComecar}
      aoEscolherIdiomas={aoEscolherIdiomas}
      aoInverter={() => {}}
      aoVoltar={aoVoltar}
      {...extra}
    />,
  )
  return { aoComecar, aoVoltar, aoEscolherIdiomas, aoConhecerOPremium }
}

describe('a tela pronta (o Intérprete abre direto na conversa)', () => {
  it('desenha as duas metades, a de cima virada, e a faixa do protótipo', () => {
    pagina()
    const raiz = screen.getByTestId('conversa-pronta')
    expect(raiz.className).toBe('int px-int')
    const filhos = [...raiz.children].map((f) => f.className)
    expect(filhos).toEqual(['int-metade', 'int-faixa', 'int-metade'])
    const [cima, baixo] = [...raiz.querySelectorAll<HTMLElement>('.int-metade')]
    expect(cima.dataset.lado).toBe('outro')
    expect(cima.hasAttribute('data-virada')).toBe(true)
    expect(baixo.dataset.lado).toBe('meu')
    expect(baixo.hasAttribute('data-virada')).toBe(false)
    expect(cima.querySelector('.int-quem')?.textContent).toBe('A outra pessoa')
    expect(baixo.querySelector('.int-quem')?.textContent).toBe('Você')
    expect(baixo.querySelector('.int-dica')?.textContent).toBe(
      'Toque em Falar e fale. A tradução aparece do outro lado e é lida em voz alta.',
    )
    expect([...baixo.querySelectorAll('.int-acoes > button')].map((b) => b.textContent)).toEqual([
      'Repetir',
      'Falar',
      'Parar voz',
    ])
    expect([...raiz.querySelectorAll('.int-esq > button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Trocar os lados',
      'Modo automático: o app reconhece quem fala qual idioma',
      'Ver a conversa em lista',
    ])
    expect(raiz.querySelectorAll('.px-int-idioma')).toHaveLength(2)
    // No celular a conversa não declara layout: é o frente a frente de sempre.
    expect(raiz.hasAttribute('data-layout')).toBe(false)
  })

  it('NO COMPUTADOR: duas colunas (`data-layout`), e nenhuma metade virada', () => {
    aparelho.computador = true
    pagina()
    const raiz = screen.getByTestId('conversa-pronta')
    expect(raiz.dataset.layout).toBe('computador')
    const metades = [...raiz.querySelectorAll<HTMLElement>('.int-metade')]
    expect(metades.map((m) => m.dataset.lado)).toEqual(['outro', 'meu'])
    expect(metades.map((m) => m.hasAttribute('data-virada'))).toEqual([false, false])
    // Trocar os lados troca as colunas, e segue sem virar ninguém.
    fireEvent.click(screen.getByLabelText('Trocar os lados'))
    const trocadas = [...document.querySelectorAll<HTMLElement>('.int-metade')]
    expect(trocadas.map((m) => m.dataset.lado)).toEqual(['meu', 'outro'])
    expect(trocadas.map((m) => m.hasAttribute('data-virada'))).toEqual([false, false])
  })

  it('a entrada usa os números do protótipo (telas2.js:275-278)', () => {
    pagina()
    const de = (classe: string) => gravadas.filter((g) => g.quem === classe)
    expect(de('int-metade').map((g) => [g.d, g.quadros[0].transform])).toEqual([
      [700, 'translateY(-60px)'],
      [700, 'translateY(60px)'],
    ])
    expect(de('int-faixa').map((g) => [g.d, g.atraso, g.quadros[0].transform])).toEqual([[600, 150, 'scaleX(0.6)']])
    expect(de('int-falar').map((g) => [g.d, g.atraso, g.quadros[0].transform])).toEqual([
      [700, 300, 'scale(0.4)'],
      [700, 420, 'scale(0.4)'],
    ])
  })

  it('sem a camada ligada, nada anima', () => {
    document.documentElement.dataset.px = 'off'
    const raiz = document.createElement('div')
    raiz.innerHTML = '<section class="int-metade"></section><div class="int-faixa"></div>'
    entradaDaConversa(raiz)
    expect(gravadas).toHaveLength(0)
  })

  it('o toque em Falar guarda o lado e começa a sessão; o X volta à origem', () => {
    const { aoComecar, aoVoltar } = pagina()
    fireEvent.click(screen.getByTestId('falar-outro'))
    expect(aoComecar).toHaveBeenCalledOnce()
    expect(tomarPedidoDaConversa()).toBe('outro')
    fireEvent.click(screen.getByLabelText('Sair do modo intérprete'))
    expect(aoVoltar).toHaveBeenCalledOnce()
  })

  it('o automático com cadeado avisa, treme o botão e oferece os Planos (telas2.js:260-263)', () => {
    const { aoConhecerOPremium } = pagina()
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe('')
    gravadas = []
    fireEvent.click(screen.getByTestId('modo-automatico'))
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe(
      'O modo automático faz parte do Premium: o app reconhece sozinho quem fala qual idioma.',
    )
    expect(gravadas).toHaveLength(1)
    expect(gravadas[0].d).toBe(360)
    expect(gravadas[0].quadros.map((q) => q.transform)).toEqual([
      'translateX(0px)',
      'translateX(-5px)',
      'translateX(5px)',
      'translateX(-3px)',
      'translateX(3px)',
      'translateX(0px)',
    ])
    fireEvent.click(screen.getByText('Conhecer o Premium'))
    expect(aoConhecerOPremium).toHaveBeenCalledOnce()
  })

  it('quem tem o automático começa nele: os botões viram "Ouvir" e o toque pede a escuta', () => {
    const { aoComecar } = pagina({ automatico: 'disponivel' })
    expect(screen.getByTestId('falar-meu').textContent).toBe('Ouvir')
    expect(screen.getByTestId('aviso-do-interprete').textContent).toBe(
      'Automático ligado: é só conversar. O app reconhece quem fala qual idioma.',
    )
    fireEvent.click(screen.getByTestId('falar-meu'))
    expect(aoComecar).toHaveBeenCalledOnce()
    expect(tomarPedidoDaConversa()).toBe('ouvir')
  })

  it('trocar os lados leva "Você" para cima, virado, com o FLIP do protótipo (telas2.js:569-580)', () => {
    pagina()
    gravadas = []
    fireEvent.click(screen.getByLabelText('Trocar os lados'))
    const [cima, baixo] = [...document.querySelectorAll<HTMLElement>('.int-metade')]
    expect(cima.dataset.lado).toBe('meu')
    expect(cima.hasAttribute('data-virada')).toBe(true)
    expect(cima.querySelector('.int-quem')?.textContent).toBe('Você')
    expect(baixo.dataset.lado).toBe('outro')
    expect(estadoDaTela().trocados).toBe(true)
    expect(gravadas.map((g) => [g.quem, g.d, Object.keys(g.quadros[0])])).toEqual([
      ['int-metade', 620, ['translate']],
      ['int-metade', 620, ['translate']],
    ])
  })

  it('a lista esconde as metades e, vazia, diz que a conversa aparece ali', () => {
    pagina()
    fireEvent.click(screen.getByTestId('tela-conversa'))
    expect([...document.querySelectorAll<HTMLElement>('.int-metade')].map((m) => m.hidden)).toEqual([true, true])
    expect(screen.getByTestId('interprete-conversa').textContent).toContain(
      'A conversa aparece aqui conforme vocês falam.',
    )
  })
})

describe('a conversa em curso no desenho novo', () => {
  function conversa(falas: FalaDoInterprete[] = []) {
    const abrir = vi.fn()
    const aoSair = vi.fn()
    const props = {
      idiomas: { meu: 'pt-BR', outro: 'en-US' },
      microfone: { abrir, fechar: vi.fn() },
      registrarPonte: vi.fn(),
      vozNaturalDisponivel: false,
      layout: 'computador' as const,
      automatico: 'premium' as const,
      aoSair,
    }
    const r = render(<ModoInterprete {...props} falas={falas} />)
    return {
      abrir,
      aoSair,
      trocarFalas: (f: FalaDoInterprete[]) => r.rerender(<ModoInterprete {...props} falas={f} />),
    }
  }
  const esperar = () => act(() => new Promise<void>((r) => setTimeout(r, 10)))

  it('monta a tela do protótipo, sem entrada, e esconde a tela pronta que fica por baixo', async () => {
    conversa()
    await esperar()
    expect(screen.getByTestId('modo-interprete').className).toBe('int px-int')
    expect(estadoDaTela().emCurso).toBe(true)
    expect(gravadas).toHaveLength(0)
    cleanup()
    expect(estadoDaTela().emCurso).toBe(false)
  })

  it('no computador a conversa em curso também fica em duas colunas, sem metade virada', async () => {
    aparelho.computador = true
    conversa()
    await esperar()
    const raiz = screen.getByTestId('modo-interprete')
    expect(raiz.dataset.layout).toBe('computador')
    expect(raiz.querySelectorAll('.int-metade[data-virada]')).toHaveLength(0)
  })

  it('começa ouvindo o lado tocado na tela pronta', async () => {
    pedirConversa('meu')
    const { abrir } = conversa()
    await esperar()
    expect(abrir).toHaveBeenCalledOnce()
    expect(screen.getByTestId('falar-meu').textContent).toBe('Parar')
    expect(screen.getByTestId('falar-meu').hasAttribute('data-ouvindo')).toBe(true)
    // O cursor do app só passa à tinta sobre o botão LARANJA (parado); ouvindo, o botão não é laranja.
    expect(screen.getByTestId('falar-meu').dataset.cursor).toBeUndefined()
    expect(screen.getByTestId('falar-outro').dataset.cursor).toBe('tinta')
  })

  it('a tradução aparece do lado de quem escuta, com o original embaixo, e anima uma vez', async () => {
    const { trocarFalas } = conversa()
    await esperar()
    gravadas = []
    trocarFalas([
      { id: 'f1', originalText: 'Oi, tudo bem?', translatedText: 'Hi, how are you?', isPartial: false, lado: 'meu' },
    ])
    await esperar()
    const cima = screen.getByTestId('interprete-outro')
    expect(cima.querySelector('.int-traducao')?.textContent).toBe('Hi, how are you?')
    expect(cima.querySelector('.int-original')?.textContent).toBe('Oi, tudo bem?')
    expect(cima.classList.contains('px-lendo')).toBe(true)
    /* quem falou continua vendo o que disse */
    expect(screen.getByTestId('interprete-meu').querySelector('.int-ao-vivo')?.textContent?.trim()).toBe(
      'Oi, tudo bem?',
    )
    expect(gravadas.map((g) => [g.quem, g.d, g.atraso])).toEqual([
      ['int-faixa', 700, 0],
      ['int-traducao', 620, 0],
      ['int-original', 400, 260],
    ])
  })

  it('sem nada dito, o X encerra e pede a volta à origem; com falas, só encerra', async () => {
    const { aoSair, trocarFalas } = conversa()
    await esperar()
    fireEvent.click(screen.getByLabelText('Sair do modo intérprete'))
    expect(aoSair).toHaveBeenCalledOnce()
    expect(estadoDaTela().depois).toBe('voltar')
    mudarEstadoDaTela({ depois: null })
    trocarFalas([{ id: 'f1', originalText: 'Oi', translatedText: 'Hi', isPartial: false, lado: 'meu' }])
    fireEvent.click(screen.getByLabelText('Sair do modo intérprete'))
    expect(estadoDaTela().depois).toBe(null)
  })
})
