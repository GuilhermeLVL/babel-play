// @vitest-environment jsdom
/**
 * O DESENHO NOVO NO CELULAR (08/10/2026) — a versão de celular do protótipo de polimento:
 *   · a barra flutuante de cinco destinos (`celular.css:57-62` conta os botões pela posição: o trilho
 *     precisa ter os oito do protótipo, com o "Mais" em oitavo);
 *   · Estatísticas e Personalizar viram ladrilhos no começo do "Mais" (`prototipo.js:410-424`) e o
 *     destaque deles vai para o "Mais" (`prototipo.js:243`);
 *   · a barra some ao rolar e volta ao subir, no fim e em toda troca de tela (`sentidos.js:279-304`);
 *   · o "Mais" sobe de baixo e fecha arrastado (`prototipo.js:428-469, 502-509, 546-549`).
 * Os números são os do protótipo: se um mudar, o teste acusa.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'celular-bom' as string }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  /* O celular e o tablet de verdade têm tela de toque; o jsdom não tem nenhuma. */
  const perfilDoDispositivo = () => {
    const p = real.perfilDoDispositivo()
    const toques = aparelho.tipo.startsWith('celular') ? 5 : 0
    return { ...p, tipo: aparelho.tipo, sinais: { ...p.sinais, toques } }
  }
  return { ...real, perfilDoDispositivo }
})

import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import { EG, MOLA_SUAVE } from '../src/lib/polimento/base'
import { barraDeCinco, instalarCelular } from '../src/lib/polimento/celular'
import { instalarFolhas } from '../src/lib/polimento/folha'

/** A largura da janela: até 720 px é o celular do protótipo. */
let estreita = true
const ouvintes = new Set<() => void>()
const mudarLargura = (v: boolean) => {
  estreita = v
  ouvintes.forEach((f) => f())
}

interface Chamada {
  el: Element
  quadros: Keyframe[]
  o: KeyframeAnimationOptions
}
let chamadas: Chamada[] = []
const vez = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  aparelho.tipo = 'celular-bom'
  estreita = true
  ouvintes.clear()
  chamadas = []
  window.matchMedia = ((q: string) => ({
    media: q,
    get matches() {
      return q.includes('max-width: 720px') ? estreita : false
    },
    addEventListener: (_: string, f: () => void) => ouvintes.add(f),
    removeEventListener: (_: string, f: () => void) => ouvintes.delete(f),
  })) as never
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    chamadas.push({ el: this, quadros, o })
    return { finished: new Promise<void>(() => undefined), cancel: () => undefined } as unknown as Animation
  } as never
  Element.prototype.getAnimations = () => []
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  localStorage.clear()
  delete document.documentElement.dataset.px
})

const montar = (activeView = 'hub', extra: Record<string, unknown> = {}) => {
  const ir = vi.fn()
  const aoBuscar = vi.fn()
  const r = render(
    <TrilhoDoQuest
      activeView={activeView as never}
      onChangeView={ir}
      aoBuscar={aoBuscar}
      ageProfile="pro"
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
      {...extra}
    />,
  )
  return { ir, aoBuscar, ...r }
}
const botoes = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.q-trilho > button.q-item')]

describe('a barra de cinco destinos', () => {
  it('o trilho tem os oito botões do protótipo, na ordem que `celular.css` conta, com o "Mais" em oitavo', () => {
    const { container } = montar()
    expect(botoes(container).map((b) => b.querySelector('span')?.textContent)).toEqual([
      'Início',
      'Capturar',
      'Intérprete',
      'Jogar',
      'Estatísticas',
      'Personalizar',
      'Buscar',
      'Mais',
    ])
    expect(botoes(container)[7].classList.contains('q-mais-botao')).toBe(true)
  })

  it('a busca do trilho, no celular, não fala de teclado: sem tecla, sem atalho, e abre a busca', () => {
    const { aoBuscar } = montar()
    const busca = screen.getByTestId('busca-no-trilho')
    expect(busca.querySelector('.q-tecla')).toBeNull()
    expect(busca.hasAttribute('aria-keyshortcuts')).toBe(false)
    expect(busca.hasAttribute('title')).toBe(false)
    expect(busca.getAttribute('aria-label')).toBe('Buscar')
    fireEvent.click(busca)
    expect(aoBuscar).toHaveBeenCalledTimes(1)
  })

  it('em Estatísticas e em Personalizar o destaque é do "Mais", e o botão escondido não fica marcado', async () => {
    for (const tela of ['estatisticas', 'loja']) {
      const { container, unmount } = montar(tela)
      /* A marca da camada (`data-px`) chega com o trilho montado: a barra de cinco acompanha. */
      await act(vez)
      const marcados = [...container.querySelectorAll('.q-item[aria-current="page"]')]
      expect(
        marcados.map((b) => b.textContent),
        tela,
      ).toEqual(['Mais'])
      unmount()
    }
  })

  it('os dois destinos escondidos não são achados pela camada: o toque neles marca o "Mais"', () => {
    const { container } = montar()
    expect(botoes(container).map((b) => b.dataset.pxRota ?? null)).toEqual([
      'hub',
      'capture',
      'interprete',
      'play',
      null,
      null,
      null,
      null,
    ])
  })

  it('o "Mais" começa com Estatísticas e Personalizar, nessa ordem, e o toque leva à tela', () => {
    const { ir } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const ladrilhos = [...screen.getByRole('dialog').querySelectorAll('.q-grade .q-tile b')].map((b) => b.textContent)
    expect(ladrilhos.slice(0, 2)).toEqual(['Estatísticas', 'Personalizar'])
    expect(ladrilhos.filter((r) => r === 'Estatísticas')).toHaveLength(1)
    fireEvent.click(screen.getByRole('dialog').querySelector('.q-grade .q-tile')!)
    expect(ir).toHaveBeenLastCalledWith('estatisticas')
  })

  it('acima de 720 px (o tablet) vale o trilho de seis: sem os ladrilhos, e Estatísticas marcada no trilho', () => {
    estreita = false
    const { container } = montar('estatisticas')
    expect(barraDeCinco()).toBe(false)
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Estatísticas')
    expect(botoes(container)[4].dataset.pxRota).toBe('estatisticas')
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const ladrilhos = [...screen.getByRole('dialog').querySelectorAll('.q-grade .q-tile b')].map((b) => b.textContent)
    expect(ladrilhos).not.toContain('Estatísticas')
    expect(ladrilhos).not.toContain('Personalizar')
  })

  it('girar o aparelho troca de uma para a outra sem recarregar', () => {
    const { container } = montar('loja')
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Mais')
    act(() => mudarLargura(false))
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Personalizar')
    act(() => mudarLargura(true))
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Mais')
  })

  it('com a camada desligada (animações desligadas) a barra de cinco não existe: nada vai para o "Mais"', async () => {
    document.body.className = 'animations-off'
    const { container } = montar('estatisticas')
    await act(vez)
    expect(document.documentElement.dataset.px).toBe('off')
    expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Estatísticas')
  })
})

describe('a barra some ao rolar (sentidos.js:279-304)', () => {
  let desligar: () => void
  let palco: HTMLElement
  const rolar = (y: number, altura = 600, total = 3000) => {
    Object.defineProperty(palco, 'scrollTop', { value: y, configurable: true })
    Object.defineProperty(palco, 'clientHeight', { value: altura, configurable: true })
    Object.defineProperty(palco, 'scrollHeight', { value: total, configurable: true })
    palco.dispatchEvent(new Event('scroll'))
  }
  const sumiu = () => document.querySelector('.q-trilho')!.classList.contains('px-some')

  beforeEach(() => {
    document.body.innerHTML =
      '<nav class="q-trilho"></nav><main><div class="px-tela"><div class="q-palco"></div></div></main>'
    palco = document.querySelector('.q-palco')!
    desligar = instalarCelular()
  })
  afterEach(() => desligar())

  it('some depois de 90 px rolando para baixo mais de 6 px; volta ao subir mais de 6 px', () => {
    rolar(60)
    expect(sumiu()).toBe(false) // ainda não passou de 90
    rolar(95)
    expect(sumiu()).toBe(true)
    rolar(92)
    expect(sumiu()).toBe(true) // subiu só 3 px
    rolar(80)
    expect(sumiu()).toBe(false)
  })

  it('no fim da página (folga de 24 px) a barra fica à vista', () => {
    rolar(200)
    expect(sumiu()).toBe(true)
    rolar(2380) // 2380 + 600 >= 3000 - 24
    expect(sumiu()).toBe(false)
  })

  it('uma tela nova traz a barra de volta e zera a conta', async () => {
    rolar(400)
    expect(sumiu()).toBe(true)
    document.querySelector('.px-tela')!.innerHTML = '<div class="q-palco"></div>'
    await vez()
    expect(sumiu()).toBe(false)
    palco = document.querySelector('.q-palco')!
    rolar(100)
    expect(sumiu()).toBe(true) // conta a partir do zero: 100 > 0 + 6 e > 90
  })

  it('um diálogo que abre por cima não é tela nova', async () => {
    rolar(400)
    document.querySelector('main')!.insertAdjacentHTML('beforeend', '<dialog><div class="rolagem"></div></dialog>')
    await vez()
    expect(sumiu()).toBe(true)
  })

  it('fora do celular, ou com a camada desligada, a barra não se mexe', () => {
    estreita = false
    rolar(400)
    expect(sumiu()).toBe(false)
    estreita = true
    document.documentElement.dataset.px = 'off'
    rolar(800)
    expect(sumiu()).toBe(false)
  })
})

describe('o "Mais" como folha de baixo (prototipo.js:428-469, 502-509, 546-549)', () => {
  let desligar: () => void
  const painelHtml = `<div class="q-mais-fundo"><div class="q-mais" role="dialog">
    <div class="q-cab"><h2>Mais</h2><button class="q-ctl">Buscar</button><button class="q-ctl" aria-label="Fechar">x</button></div>
    <div class="q-grade"><button class="q-tile">Estatísticas</button><button class="q-tile">Personalizar</button></div>
    <div class="q-faixa q-faixa-do-mais"></div>
  </div></div>`
  const abrir = async () => {
    document.querySelector('.q-casca')!.insertAdjacentHTML('beforeend', painelHtml)
    const fundo = document.querySelector('.q-mais-fundo') as HTMLElement
    const painel = fundo.querySelector('.q-mais') as HTMLElement
    Object.defineProperty(painel, 'offsetHeight', { value: 600, configurable: true })
    await vez()
    return { fundo, painel }
  }
  const dedo = (el: Element, tipo: string, y: number) => {
    const e = new MouseEvent(tipo, { bubbles: true, clientX: 100, clientY: y })
    Object.defineProperty(e, 'pointerId', { value: 7 })
    el.dispatchEvent(e)
  }

  beforeEach(() => {
    document.body.innerHTML =
      '<div class="q-casca"><nav class="q-trilho"><button class="q-item q-mais-botao">Mais</button></nav><main><div class="px-tela"></div></main></div>'
    desligar = instalarFolhas()
  })
  afterEach(() => desligar())

  it('sobe de baixo em 620 ms na mola suave, com os ladrilhos e a faixa em cascata de 45 ms', async () => {
    const { painel } = await abrir()
    const subida = chamadas.find((c) => c.el === painel)!
    expect(subida.quadros).toEqual([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }])
    expect(subida.o).toMatchObject({ duration: 620, easing: MOLA_SUAVE })
    const cascata = chamadas.filter((c) => c.el !== painel)
    expect(cascata.map((c) => [c.o.duration, c.o.delay])).toEqual([
      [520, 140],
      [520, 185],
      [520, 230],
    ])
    expect(cascata[0].quadros[0]).toEqual({ opacity: 0, transform: 'translateY(26px)' })
    expect(document.querySelector('main')?.classList.contains('px-recuado')).toBe(true)
  })

  it('ao abrir, o foco vai para o botão de fechar (prototipo.js:528)', async () => {
    await abrir()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fechar')
  })

  it('o dedo só pega nos 76 px do topo, e nunca sobre um botão', async () => {
    const { fundo, painel } = await abrir()
    dedo(painel, 'pointerdown', 90)
    dedo(painel, 'pointermove', 300)
    expect(fundo.classList.contains('px-arrastando')).toBe(false)
    dedo(painel.querySelector('.q-ctl')!, 'pointerdown', 20)
    dedo(painel, 'pointermove', 300)
    expect(fundo.classList.contains('px-arrastando')).toBe(false)
  })

  it('segue o dedo para baixo 1:1 depois de 6 px, e o véu acompanha', async () => {
    const { fundo, painel } = await abrir()
    dedo(painel, 'pointerdown', 20)
    dedo(painel, 'pointermove', 24)
    expect(fundo.classList.contains('px-arrastando')).toBe(false)
    dedo(painel, 'pointermove', 140)
    expect(fundo.classList.contains('px-arrastando')).toBe(true)
    expect(painel.style.transform).toBe('translateY(120px)')
    expect(fundo.style.getPropertyValue('--px-prog')).toBe(String(1 - 120 / 600))
  })

  it('para cima resiste (elástico de 90)', async () => {
    const { painel } = await abrir()
    dedo(painel, 'pointerdown', 20)
    dedo(painel, 'pointermove', -130)
    const t = (-150 * 90 * 0.55) / (90 + 0.55 * 150)
    expect(painel.style.transform).toBe(`translateY(${t}px)`)
  })

  it('solto antes de 40% da altura, volta em 520 ms na mola suave', async () => {
    const { fundo, painel } = await abrir()
    const fechou = vi.fn()
    fundo.addEventListener('click', fechou)
    const agora = vi.spyOn(performance, 'now').mockReturnValue(1000)
    dedo(painel, 'pointerdown', 20)
    dedo(painel, 'pointermove', 120)
    chamadas = []
    dedo(painel, 'pointerup', 120)
    agora.mockRestore()
    expect(fechou).not.toHaveBeenCalled()
    expect(chamadas[0].quadros).toEqual([{ transform: 'translateY(100px)' }, { transform: 'translateY(0)' }])
    expect(chamadas[0].o).toMatchObject({ duration: 520, easing: MOLA_SUAVE })
    expect(painel.style.transform).toBe('')
    expect(fundo.classList.contains('px-arrastando')).toBe(false)
  })

  it('solto além de 40% da altura, fecha pelo caminho do app (o toque no véu) e sai em 340 ms', async () => {
    const { fundo, painel } = await abrir()
    /* O app: o toque no véu tira o painel do documento. */
    fundo.addEventListener('click', (e) => e.target === fundo && fundo.remove())
    const agora = vi.spyOn(performance, 'now').mockReturnValue(1000)
    dedo(painel, 'pointerdown', 20)
    dedo(painel, 'pointermove', 300)
    chamadas = []
    dedo(painel, 'pointerup', 300)
    agora.mockRestore()
    await vez()
    const saida = chamadas.find((c) => c.el === painel)!
    expect(saida.quadros).toEqual([{ transform: 'translateY(105%)' }])
    expect(saida.o).toMatchObject({ duration: 340, easing: EG, fill: 'forwards' })
    expect(document.querySelector('main')?.classList.contains('px-recuado')).toBe(false)
  })

  it('jogado com o dedo, fecha mesmo perto do topo e sai mais rápido (340 − velocidade/8, no mínimo 160 ms)', async () => {
    const { fundo, painel } = await abrir()
    fundo.addEventListener('click', (e) => e.target === fundo && fundo.remove())
    const agora = vi.spyOn(performance, 'now')
    agora.mockReturnValue(1000)
    dedo(painel, 'pointerdown', 20)
    agora.mockReturnValue(1050)
    dedo(painel, 'pointermove', 80) // 60 px em 50 ms: 1200 px/s
    chamadas = []
    dedo(painel, 'pointerup', 80)
    agora.mockRestore()
    await vez()
    const saida = chamadas.find((c) => c.el === painel)!
    expect(saida.o.duration).toBe(Math.max(160, 340 - 1200 / 8))
  })
})
