// @vitest-environment jsdom
/**
 * A LEGENDA LONGA NA TELA (26/10/2026): `HistoricoDoPrototipo` só monta os blocos de falas perto da área visível
 * (`lib/captura/janelaDasFalas`). O jsdom não tem layout, então a lista ganha aqui uma área visível de 600 px e uma
 * rolagem; sem medidas (o ResizeObserver do jsdom é mudo), cada fala vale a altura reservada (84 px).
 *
 * O que se prova: com 600 falas só o fim fica no DOM, com um vão no lugar do resto; rolar ao topo monta o começo, e o
 * bloco que volta entra calado para a região viva e sem refazer a entrada animada; tocar numa fala antiga abre a fala
 * certa; a fala escolhida e a fala com foco seguram o bloco delas; "Ir para a fala atual" volta a janela para o fim.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const entradas: string[] = []
vi.mock('../src/lib/polimento/captura', async (importar) => {
  const real = await importar<typeof import('../src/lib/polimento/captura')>()
  return {
    ...real,
    entrarLinha: (el: HTMLElement) => {
      entradas.push(el.getAttribute('data-fala') ?? '')
      real.entrarLinha(el)
    },
  }
})

import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'

const fala = (i: number): SpeechSegment =>
  ({
    id: `f${i}`,
    speakerId: 'system',
    source: 'system',
    timestamp: '00:03',
    originalText: `frase ${i} aqui`,
    translatedText: `tradução ${i}`,
    words: [],
    isPartial: false,
    lang: 'en',
  }) as unknown as SpeechSegment
const falas = (n: number, de = 0) => Array.from({ length: n }, (_, i) => fala(de + i))

/* A área visível da lista e a altura do conteúdo: a soma dos vãos e das linhas montadas (84 px + 10 de espaço). */
const descritores: Array<[string, PropertyDescriptor | undefined]> = []
beforeAll(() => {
  const ehLista = (el: Element) => el.classList.contains('q-historico')
  const definir = (nome: string, get: (this: HTMLElement) => number) => {
    descritores.push([nome, Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome)])
    Object.defineProperty(HTMLElement.prototype, nome, { configurable: true, get })
  }
  definir('clientHeight', function () {
    return ehLista(this) ? 600 : 0
  })
  definir('clientWidth', function () {
    return ehLista(this) ? 800 : 0
  })
  definir('scrollHeight', function () {
    if (!ehLista(this)) return 0
    let h = 0
    for (const v of this.querySelectorAll<HTMLElement>('.q-vao-das-falas')) h += parseFloat(v.style.height) + 10
    return h + this.querySelectorAll('.q-linha-da-fala').length * 94
  })
  /* A rolagem da lista, presa entre 0 e o fim, e o `scrollTo` (o jsdom não rola). */
  const rolagens = new WeakMap<Element, number>()
  const limitar = (el: HTMLElement, y: number) => Math.max(0, Math.min(y, el.scrollHeight - el.clientHeight))
  descritores.push(['scrollTop', Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')])
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return rolagens.get(this) ?? 0
    },
    set(this: HTMLElement, y: number) {
      const antes = rolagens.get(this) ?? 0
      rolagens.set(this, ehLista(this) ? limitar(this, y) : y)
      /* Como o navegador: a rolagem que mudou avisa a lista. */
      if (ehLista(this) && rolagens.get(this) !== antes) this.dispatchEvent(new Event('scroll'))
    },
  })
  descritores.push(['scrollTo', Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')])
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, o: ScrollToOptions) {
      this.scrollTop = o.top ?? 0
    },
  })
})
afterAll(() => {
  for (const [nome, d] of descritores)
    if (d) Object.defineProperty(HTMLElement.prototype, nome, d)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[nome]
})
afterEach(() => {
  cleanup()
  entradas.length = 0
})

const aoTocar = vi.fn()
const historico = (lista: SpeechSegment[], escolhida: string | null = null) => (
  <HistoricoDoPrototipo falas={lista} escala={1} idiomaPadrao="en" aoTocar={aoTocar} escolhida={escolhida} />
)
const ids = (c: HTMLElement) => [...c.querySelectorAll('.q-linha-da-fala')].map((l) => l.getAttribute('data-fala'))
const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
async function rolarPara(c: HTMLElement, topo: number) {
  const lista = c.querySelector('.q-historico') as HTMLElement
  await act(async () => {
    fireEvent.wheel(lista, { deltaY: -500 }) // a pessoa rola: a lista deixa de seguir a rolagem nossa
    lista.scrollTop = topo
    fireEvent.scroll(lista)
    await quadro()
  })
}

describe('a janela da legenda longa', () => {
  it('600 falas: só o fim fica no DOM, com um vão da altura do resto; a região viva continua na lista', () => {
    const { container } = render(historico(falas(600)))
    const montadas = ids(container)
    expect(montadas.length).toBeLessThanOrEqual(40)
    expect(montadas.at(-1)).toBe('f599')
    expect(container.querySelector('.q-linha-da-fala.atual')?.getAttribute('data-fala')).toBe('f599')
    const vaos = [...container.querySelectorAll<HTMLElement>('.q-vao-das-falas')]
    expect(vaos).toHaveLength(1)
    expect(vaos[0].getAttribute('aria-hidden')).toBe('true')
    // os blocos de fora: (600 − montadas) falas de 84 px, com os espaços de 10 entre elas
    const fora = 600 - montadas.length
    expect(parseFloat(vaos[0].style.height)).toBe(fora * 84 + (fora - 1) * 10)
    expect(container.querySelector('.q-historico')?.getAttribute('aria-live')).toBe('polite')
    // os blocos montados de início não são calados: a fala nova que chegar neles é anunciada
    expect(container.querySelectorAll('.q-bloco-de-falas[aria-live="off"]')).toHaveLength(0)
  })

  it('rolar ao topo monta o começo, calado e sem refazer a entrada; tocar numa fala antiga abre a fala certa', async () => {
    // a tela abre vazia e as 600 falas chegam com ela aberta: todas são novas (entrariam animadas)
    const { container, rerender } = render(historico([]))
    const todas = falas(600)
    rerender(historico(todas))
    expect(ids(container)).not.toContain('f3')
    // só as montadas (as do fim) fizeram a entrada
    expect(entradas.length).toBeGreaterThan(0)
    expect(entradas.every((id) => Number(id.slice(1)) >= 560)).toBe(true)
    entradas.length = 0

    await rolarPara(container, 0)
    expect(ids(container)).toContain('f3')
    expect(ids(container).at(-1)).toBe('f599')
    const primeiro = container.querySelector('[data-fala="f3"]')?.closest('.q-bloco-de-falas')
    expect(primeiro?.getAttribute('aria-live')).toBe('off')
    // o começo volta sem refazer a entrada animada
    expect(entradas).toEqual([])
    // "Ir para a fala atual" aparece: a pessoa saiu do fim
    expect(container.querySelector('.q-ir-para-o-fim')).toBeTruthy()

    fireEvent.click(container.querySelector('[data-fala="f3"] .q-fala') as HTMLElement)
    expect(aoTocar).toHaveBeenLastCalledWith(todas[3], 'en')
  })

  it('a fala escolhida (o painel aberto) segura o bloco dela mesmo com a lista no fim', () => {
    const lista = falas(600)
    const { container, rerender } = render(historico(lista))
    expect(ids(container)).not.toContain('f3')
    rerender(historico(lista, 'f3'))
    expect(ids(container)).toContain('f3')
    expect(container.querySelector('[data-fala="f3"] .q-fala')?.getAttribute('aria-current')).toBe('true')
    expect(ids(container).at(-1)).toBe('f599')
  })

  it('a fala com foco segura o bloco dela quando a lista volta ao fim, e o foco fica nela', async () => {
    const lista = falas(600)
    const { container } = render(historico(lista))
    await rolarPara(container, 0)
    const botao = container.querySelector('[data-fala="f5"] .q-fala') as HTMLElement
    act(() => botao.focus())
    expect(document.activeElement).toBe(botao)

    fireEvent.click(container.querySelector('.q-ir-para-o-fim') as HTMLElement)
    await act(quadro)
    expect(ids(container)).toContain('f5')
    expect(ids(container)).toContain('f599')
    expect(document.activeElement).toBe(botao)
    expect(container.querySelector('.q-ir-para-o-fim')).toBeNull()
  })

  it('"Ir para a fala atual" leva a janela de volta ao fim (o começo sai do DOM)', async () => {
    const { container } = render(historico(falas(600)))
    await rolarPara(container, 0)
    expect(ids(container)).toContain('f0')
    fireEvent.click(container.querySelector('.q-ir-para-o-fim') as HTMLElement)
    await act(quadro)
    expect(ids(container)).not.toContain('f0')
    expect(ids(container).at(-1)).toBe('f599')
  })

  it('a rolagem nossa a caminho do fim não conta como a pessoa saindo dele; a roda do mouse conta', async () => {
    const { container } = render(historico(falas(600)))
    const lista = container.querySelector('.q-historico') as HTMLElement
    await rolarPara(container, 0)
    expect(container.querySelector('.q-ir-para-o-fim')).toBeTruthy()
    // "Ir para a fala atual": a rolagem suave sai do topo e leva alguns quadros (aqui ela não anda sozinha)
    Object.defineProperty(lista, 'scrollTo', { configurable: true, value: () => undefined })
    fireEvent.click(container.querySelector('.q-ir-para-o-fim') as HTMLElement)
    // no meio do caminho, o fim ainda longe: continua acompanhando, e a janela já é a do fim
    await act(async () => {
      lista.scrollTop = 1000
      await quadro()
    })
    expect(container.querySelector('.q-ir-para-o-fim')).toBeNull()
    expect(ids(container)).not.toContain('f0')
    expect(ids(container).at(-1)).toBe('f599')
    // a pessoa rola: para de acompanhar
    await act(async () => {
      fireEvent.wheel(lista, { deltaY: -300 })
      fireEvent.scroll(lista)
      await quadro()
    })
    expect(container.querySelector('.q-ir-para-o-fim')).toBeTruthy()
  })

  it('o dedo que sobe 30 px para de acompanhar: a fala nova não puxa, nem durante o arrasto nem depois', async () => {
    const lista0 = falas(600)
    const { container, rerender } = render(historico(lista0))
    const lista = container.querySelector('.q-historico') as HTMLElement
    const rolar = async (y: number) =>
      act(async () => {
        lista.scrollTop = y
        fireEvent.scroll(lista)
        await quadro()
      })
    // acompanhando: no fim; a fala nova puxa a lista até o fim novo
    await rolar(lista.scrollTop)
    const fim = lista.scrollTop
    expect(fim).toBe(lista.scrollHeight - 600)
    let n = 600
    const maisUma = () => act(() => rerender(historico(falas(++n))))
    maisUma()
    expect(lista.scrollTop).toBe(lista.scrollHeight - 600)
    const fimAgora = lista.scrollTop

    // o dedo encosta e sobe 30 px (dentro da folga de 80): já não é o fim
    fireEvent.touchStart(lista)
    await rolar(fimAgora - 30)
    expect(container.querySelector('.q-ir-para-o-fim')).toBeTruthy()
    maisUma()
    expect(lista.scrollTop).toBe(fimAgora - 30)

    // o arrasto continua até 2.000 px acima: a fala nova não mexe na lista
    fireEvent.touchMove(lista)
    await rolar(fimAgora - 2000)
    maisUma()
    expect(lista.scrollTop).toBe(fimAgora - 2000)
    expect(container.querySelector('.q-ir-para-o-fim')).toBeTruthy()

    // o dedo sai (a inércia acabou): continua parado onde a pessoa deixou
    fireEvent.touchEnd(lista)
    maisUma()
    expect(lista.scrollTop).toBe(fimAgora - 2000)
  })

  it('a lista que encolhe embaixo (sobe sem se afastar do fim) continua acompanhando', async () => {
    const { container } = render(historico(falas(600)))
    const lista = container.querySelector('.q-historico') as HTMLElement
    await act(async () => {
      fireEvent.scroll(lista)
      await quadro()
    })
    // o fim chegou 50 px mais perto (a linha de escuta saiu): a rolagem cai junto, e a distância ao fim não muda
    await act(async () => {
      lista.scrollTop = lista.scrollTop - 50
      Object.defineProperty(lista, 'scrollHeight', { configurable: true, value: lista.scrollHeight - 50 })
      fireEvent.scroll(lista)
      await quadro()
    })
    expect(container.querySelector('.q-ir-para-o-fim')).toBeNull()
  })

  describe('sem `overflow-anchor` (Safari)', () => {
    const supports = globalThis.CSS?.supports
    beforeAll(() => {
      globalThis.CSS ??= {} as typeof CSS
      ;(globalThis.CSS as { supports: unknown }).supports = (p: string) => p !== 'overflow-anchor'
    })
    afterAll(() => {
      ;(globalThis.CSS as { supports: unknown }).supports = supports
    })

    it('o vão acima que cresce (uma fala entrou num bloco de cima) leva a rolagem junto', async () => {
      const lista0 = falas(600)
      const { container, rerender } = render(historico(lista0))
      const lista = container.querySelector('.q-historico') as HTMLElement
      // a pessoa lê o meio da sessão (o bloco 15 começa em 15 × (20 × 94) = 28.200)
      await rolarPara(container, 28_200)
      expect(ids(container)).toContain('f300')
      const antes = lista.scrollTop
      const topoDaF300 = () => {
        let y = 0
        for (const el of lista.children) {
          if (el.querySelector('[data-fala="f300"]')) break
          y +=
            (el.classList.contains('q-vao-das-falas')
              ? parseFloat((el as HTMLElement).style.height)
              : el.querySelectorAll('.q-linha-da-fala').length * 94 - 10) + 10
        }
        return y
      }
      const leituraAntes = topoDaF300() - antes
      // uma fala chega fora de ordem no bloco 1 (entre f25 e f26): o vão de cima cresce uma fala (84 + 10)
      const comNova = [...lista0.slice(0, 26), { ...fala(9999), id: 'tarde' }, ...lista0.slice(26)]
      act(() => rerender(historico(comNova)))
      expect(lista.scrollTop).toBe(antes + 94)
      // o que a pessoa lê ficou no mesmo lugar da tela
      expect(topoDaF300() - lista.scrollTop).toBe(leituraAntes)
    })
  })

  it('o bloco da fala do "Como respondo?" fica montado; o foco que sai da lista solta o bloco dele', async () => {
    const lista0 = falas(600)
    const props = { falas: lista0, escala: 1, idiomaPadrao: 'en', aoTocar }
    const marcas = new Map()
    const { container, rerender } = render(
      <HistoricoDoPrototipo {...props} assistente={{ marcas, correcoes: new Map(), falaFixa: 'f7' }} />,
    )
    expect(ids(container)).toContain('f7')
    rerender(<HistoricoDoPrototipo {...props} assistente={{ marcas, correcoes: new Map(), falaFixa: null }} />)
    expect(ids(container)).not.toContain('f7')

    // o foco numa fala antiga segura o bloco; quando o foco sai da lista, o bloco pode sair
    await rolarPara(container, 0)
    const botao = container.querySelector('[data-fala="f5"] .q-fala') as HTMLElement
    act(() => botao.focus())
    fireEvent.click(container.querySelector('.q-ir-para-o-fim') as HTMLElement)
    await act(quadro)
    expect(ids(container)).toContain('f5')
    const fora = document.createElement('button')
    document.body.appendChild(fora)
    act(() => fora.focus())
    rerender(<HistoricoDoPrototipo {...props} assistente={{ marcas, correcoes: new Map(), falaFixa: null }} />)
    expect(ids(container)).not.toContain('f5')
    fora.remove()
  })
})
