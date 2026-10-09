// @vitest-environment jsdom
/**
 * O JOGAR NA CAMADA DE POLIMENTO: o que o protótipo faz e o lobby não fazia.
 *
 *  · os estados que abrem na própria tela ("Por que este?" e a linha da trilha) animam SÓ o que é
 *    novo, com os números de `alternarEstado()` (`telas2.js:527-543`);
 *  · o painel "O que você vai praticar" mora em `main`, ao lado da tela e não dentro dela
 *    (`abrirFolha('fonte')`, `prototipo.js:466-470`): dentro, ele recuava e desfocava junto com ela.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))

const { default: SalaDeEscolha } = await import('../src/components/minigames/SalaDeEscolha')
const { default: PainelTrilha } = await import('../src/components/views/PainelTrilha')
const { entrarOQueAbriu, fotoDaTela } = await import('../src/components/views/play/quest/jogosNoQuest')

interface Chamada {
  el: Element
  quadros: Keyframe[]
  o: KeyframeAnimationOptions
}
let chamadas: Chamada[] = []

beforeEach(() => {
  chamadas = []
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    chamadas.push({ el: this, quadros, o })
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
  } as never
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete document.documentElement.dataset.px
})

describe('os estados que abrem na própria tela', () => {
  const tela = (miolo: string) => {
    document.body.innerHTML = `<main><div class="px-tela"><div class="q-palco">${miolo}</div></div></main>`
    return document.querySelector('.q-palco') as HTMLElement
  }

  it('só as folhas novas entram: 420 ms, 22 ms uma da outra, descendo 10 px do desfoque', () => {
    const palco = tela('<h1>Jogar</h1><p>Sugestão para hoje</p>')
    const antes = fotoDaTela()
    palco.insertAdjacentHTML(
      'beforeend',
      '<ul><li><span>Nada vence agora, vale avançar.</span></li><li><span>Vem da trilha</span></li></ul>',
    )
    entrarOQueAbriu(antes)
    expect(chamadas.map((c) => c.el.textContent)).toEqual(['Nada vence agora, vale avançar.', 'Vem da trilha'])
    expect(chamadas.map((c) => [c.o.duration, c.o.delay])).toEqual([
      [420, 0],
      [420, 22],
    ])
    expect(chamadas[0].quadros).toEqual([
      { opacity: 0, transform: 'translateY(-10px)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
    ])
  })

  it('o que já estava na tela não se mexe, e a cascata para em 24 folhas', () => {
    const palco = tela('<p>igual</p>')
    const antes = fotoDaTela()
    /* A conta do protótipo é o tamanho do texto mais a etiqueta: um <p> de cinco letras já existia. */
    palco.insertAdjacentHTML(
      'beforeend',
      '<p>outro</p>' + Array.from({ length: 30 }, (_, i) => `<i>${'x'.repeat(i + 1)}</i>`).join(''),
    )
    entrarOQueAbriu(antes)
    expect(chamadas).toHaveLength(24)
    expect(chamadas.every((c) => c.el.tagName === 'I')).toBe(true)
    expect(chamadas[23].o.delay).toBe(23 * 22)
  })

  it('com a camada desligada, ou com menos movimento, nada é fotografado nem animado', () => {
    const palco = tela('<p>a</p>')
    document.documentElement.dataset.px = 'off'
    expect(fotoDaTela()).toBeNull()
    document.documentElement.dataset.px = 'on'
    document.body.className = ''
    window.matchMedia = (() => ({ matches: true })) as never
    expect(fotoDaTela()).toBeNull()
    palco.insertAdjacentHTML('beforeend', '<b>novo</b>')
    entrarOQueAbriu(null)
    expect(chamadas).toHaveLength(0)
  })

  it('a linha da trilha abre o painel animando o que chegou; fechar não anima', () => {
    document.body.innerHTML = '<main><div class="px-tela"><div class="q-palco" id="raiz"></div></div></main>'
    const niveis = { A1: [['about', 'sobre']], A2: [['able', 'capaz']] }
    render(
      <PainelTrilha
        dado={{ lang: 'en', escala: 'cefr', niveis } as never}
        deck={[]}
        ageProfile="pro"
        nivel={undefined}
        onEscolherNivel={() => undefined}
        nativo="pt-BR"
        paresDeGlosa={['pt']}
      />,
      { container: document.getElementById('raiz') as HTMLElement },
    )
    const linha = screen.getByRole('button', { expanded: false })
    fireEvent.click(linha)
    expect(document.querySelector('.qj-trilha > .q-cartao')).toBeTruthy()
    expect(chamadas.length).toBeGreaterThan(0)
    expect(chamadas.every((c) => c.o.duration === 420 && !c.el.children.length)).toBe(true)
    expect(chamadas.every((c) => !!c.el.closest('.qj-trilha > .q-cartao, .q-fim'))).toBe(true)
    chamadas = []
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(document.querySelector('.qj-trilha > .q-cartao')).toBeNull()
    expect(chamadas).toHaveLength(0)
  })
})

describe('o painel "O que você vai praticar"', () => {
  it('mora em main, antes da tela, e não dentro dela', () => {
    document.body.innerHTML = '<main><div class="px-tela"><div id="raiz"></div></div></main>'
    const aoFechar = vi.fn()
    const t = render(
      <SalaDeEscolha
        escolhaAtual={{ origem: 'trilha', escopo: 'todas', lang: 'en' }}
        idiomas={[{ lang: 'en', total: 3, jogaveis: 1 }]}
        dificeis={0}
        gravacoes={[]}
        trilhaDe={() => ({ niveis: ['A1'] as never[], total: 2784, porNivel: { A1: 704 } })}
        ageProfile="pro"
        aoConfirmar={vi.fn()}
        aoFechar={aoFechar}
      />,
      { container: document.getElementById('raiz') as HTMLElement },
    )
    const fundo = document.querySelector('.q-mais-fundo') as HTMLElement
    expect(fundo.closest('.px-tela')).toBeNull()
    const lugar = fundo.parentElement as HTMLElement
    expect(lugar.className).toBe('qj-sala-lugar')
    expect(lugar.parentElement?.tagName).toBe('MAIN')
    expect(lugar.nextElementSibling?.className).toBe('px-tela')
    /* O toque no véu continua fechando, e o botão principal continua sendo um só. */
    fireEvent.mouseDown(fundo)
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Usar estas palavras' })).toBeTruthy()
    /* O lugar fica (a saída do painel ainda precisa dele) e é reaproveitado. */
    t.unmount()
    expect(document.querySelectorAll('main > .qj-sala-lugar')).toHaveLength(1)
    expect(document.querySelector('.q-mais-fundo')).toBeNull()
  })
})
