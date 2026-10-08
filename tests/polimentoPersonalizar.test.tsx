// @vitest-environment jsdom
/**
 * PERSONALIZAR DO PROTÓTIPO NO DESENHO NOVO (`fidelidade/casca-e-telas.md`, 4.6; itens D34 a D44).
 * O que se prende:
 *   - o cabeçalho com as Seeds e as cinco abas, na marcação do protótipo (`telas2.js:348-351`);
 *   - Coleção: os temas são os do catálogo; provar pinta o app sem equipar e sair devolve o equipado
 *     (`telas2.js:409-428`); equipar passa pelo caminho de sempre;
 *   - Temporada: a trilha de 30 degraus com os estados do protótipo, o resgate pelo servidor e os
 *     números de "ir para o nível" (`telas3.js:116-122`);
 *   - Loja: a prateleira do catálogo e o segurar para comprar (1100 ms, linear), que só compra se o
 *     dedo ficar até o fim (`telas2.js:435-477`).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const mocks = vi.hoisted(() => ({
  temporada: null as unknown,
  v2: true,
  carteira: { creditos: 500 as number | null, disponivel: false, recarregar: () => {} },
}))

vi.mock('../src/lib/carteira', () => ({ useCarteira: () => mocks.carteira }))
vi.mock('../src/components/views/loja/ComprarCreditos', () => ({
  default: () => <div data-testid="comprar-creditos" />,
}))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/recompensasV2', async (orig) => ({
  ...(await orig<typeof import('../src/lib/recompensasV2')>()),
  recompensasV2Ligadas: () => mocks.v2,
}))
vi.mock('../src/lib/identidade', async (orig) => ({
  ...(await orig<typeof import('../src/lib/identidade')>()),
  estaAnonimo: () => false,
}))
vi.mock('../src/lib/temporada', () => ({ useTemporada: () => mocks.temporada }))
vi.mock('../src/lib/maestria', async (orig) => ({
  ...(await orig<typeof import('../src/lib/maestria')>()),
  sincronizarMaestria: vi.fn(async () => null),
}))
vi.mock('../src/lib/galeria/comprarPeca', () => ({
  comprarPecaComSeeds: vi.fn(async () => ({ ok: true, faltam: 0 })),
}))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  creditarSeeds: vi.fn(async () => ({ jaExistia: false, seedsCreditadas: 60, xpCreditado: 0 })),
}))
/* O círculo é do navegador (View Transitions): aqui a mudança acontece na hora. */
vi.mock('../src/lib/movimento/revelar', () => ({
  revelarEmCirculo: vi.fn((muda: () => void) => muda()),
}))
vi.mock('../src/lib/comemoracao', async (orig) => ({
  ...(await orig<typeof import('../src/lib/comemoracao')>()),
  tocarPreviaDoEfeito: vi.fn(),
}))

import { toast } from '../src/components/Toast'
import Loja from '../src/components/views/Loja'
import { creditarSeeds } from '../src/data/api'
import { comprarPecaComSeeds } from '../src/lib/galeria/comprarPeca'
import { perfilEquipado } from '../src/lib/galeria/equipar'
import { CATALOGO_DA_LOJA, marcarPosse } from '../src/lib/loja'
import { revelarEmCirculo } from '../src/lib/movimento/revelar'
import { readParticulas } from '../src/lib/particulas'
import { MOLA } from '../src/lib/polimento/base'
import { EMPTY_PROGRESS } from '../src/lib/progress'

interface Gravada {
  quem: string
  quadros: Keyframe[]
  d: number
  atraso: number
  e: string
  fill: string
  /** Termina a animação (o dedo ficou até o fim). */
  acabar: () => void
  cancelada: boolean
}
let gravadas: Gravada[] = []

beforeEach(() => {
  gravadas = []
  localStorage.clear()
  mocks.v2 = true
  mocks.temporada = null
  mocks.carteira = { creditos: 500, disponivel: false, recarregar: () => {} }
  document.documentElement.dataset.px = 'on'
  document.documentElement.dataset.theme = 'babel'
  document.body.className = 'animations-on'
  vi.mocked(comprarPecaComSeeds).mockClear()
  vi.mocked(creditarSeeds).mockClear()
  vi.mocked(revelarEmCirculo).mockClear()
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    let acabar = () => {}
    let recusar = () => {}
    const finished = new Promise<void>((ok, nao) => {
      acabar = ok
      recusar = () => nao(new Error('cancelada'))
    })
    finished.catch(() => undefined)
    const g: Gravada = {
      quem: this.className,
      quadros,
      d: Number(o.duration),
      atraso: Number(o.delay ?? 0),
      e: String(o.easing),
      fill: String(o.fill),
      acabar,
      cancelada: false,
    }
    gravadas.push(g)
    return {
      finished,
      cancel: () => {
        g.cancelada = true
        recusar()
      },
    } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
  Element.prototype.getAnimations = (() => []) as typeof Element.prototype.getAnimations
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.px
  delete document.documentElement.dataset.theme
  document.body.className = ''
})

function montar(abaInicial?: string, seeds = 420) {
  const acoes = {
    setTheme: vi.fn(),
    setFonte: vi.fn(),
    setMenuPosition: vi.fn(),
    setAgeProfile: vi.fn(),
    aoTrocarDeAba: vi.fn(),
  }
  const tela = render(
    <Loja
      progress={{ ...EMPTY_PROGRESS, available: true, seeds, level: 1 }}
      theme="babel"
      fonte="padrao"
      menuPosition="left"
      onOpenStudio={() => {}}
      ctxConquistas={null}
      ageProfile="pro"
      abaInicial={abaInicial}
      {...acoes}
    />,
  )
  const palco = tela.getByTestId('personalizar-no-quest')
  const um = <T extends HTMLElement = HTMLElement>(s: string) => palco.querySelector<T>(s) as T
  const todos = (s: string) => [...palco.querySelectorAll<HTMLElement>(s)]
  return { ...tela, ...acoes, palco, um, todos }
}

const temasDoCatalogo = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'tema')

describe('o cabeçalho e as abas (D34)', () => {
  it('a marcação do protótipo: sobrancelha, título, as Seeds e as cinco abas com os números do app', () => {
    const { palco, um, todos } = montar()
    expect(palco.className).toBe('q-palco qp px-personalizar')
    expect([...palco.children].slice(0, 2).map((f) => f.className)).toEqual(['q-cab', 'q-abas qp-abas'])
    expect(um('.q-cab .q-sobre').textContent).toBe('Seu visual')
    expect(um('.q-cab h1').textContent).toBe('Personalizar')
    expect(um('.q-chip.px-seeds').textContent).toBe('420 Seeds')
    expect(um('.q-chip.px-seeds > span').textContent).toBe('420')
    const abas = todos('.qp-abas > .q-aba')
    expect(abas.map((a) => a.textContent?.replace(/\s+\S+$/, '') ?? '')).toEqual([
      'Coleção',
      'Maestria',
      'Temporada',
      'Conquistas',
      'Loja',
    ])
    expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(abas[1].querySelector('.n')?.textContent).toBe('0/18')
    expect(abas[2].querySelector('.n')).toBeNull()
  })

  it('trocar de aba avisa o App; Maestria e Conquistas ficam no miolo de produção', () => {
    const { palco, aoTrocarDeAba, um } = montar()
    fireEvent.click(screen.getByRole('tab', { name: /Maestria/ }))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('maestria')
    expect(palco.className).toBe('q-palco qp')
    expect(um('.tela.qp-miolo [data-testid="painel-de-maestria"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Loja/ }))
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('loja')
    expect(palco.className).toBe('q-palco qp px-personalizar')
    expect(um('.px-carteira')).toBeTruthy()
  })
})

describe('Coleção, o ateliê (D36 e D37)', () => {
  it('a vitrine, os temas do catálogo com as quatro faixas, e as quatro linhas do resumo', () => {
    const { um, todos } = montar()
    expect([...um('.px-atelie').children].map((f) => f.className)).toEqual(['q-cartao px-vitrine', 'q-secao px-temas'])
    expect(um('.px-vitrine > .q-rotulo').textContent).toBe('Como está agora')
    expect(um('.px-vitrine-pe b').textContent).toBe('Babel Atelier')
    expect(um('.px-vitrine-pe .q-tag').textContent?.trim()).toBe('Equipado')
    const temas = todos('.px-temas-grade > .px-tema')
    expect(temas.map((b) => b.dataset.pxTema)).toEqual(temasDoCatalogo.map((i) => i.alvo))
    expect(temas.every((b) => b.querySelectorAll('.px-amostra > i').length === 4)).toBe(true)
    expect(temas[0].getAttribute('aria-pressed')).toBe('true')
    expect(temas[0].querySelector('.q-d')?.textContent).toBe('Equipado')
    /* O que não é seu diz o caminho e leva o cadeado. */
    const linear = temas.find((b) => b.dataset.pxTema === 'linear')!
    expect(linear.querySelector('.q-d')?.textContent?.trim()).toBe('Chega no nível 2')
    expect(linear.querySelector('.q-d svg')).toBeTruthy()
    expect(todos('.q-grade.g4 > .q-linha .q-rotulo').map((x) => x.textContent)).toEqual([
      'Tema',
      'Partículas',
      'Fonte',
      'Menu',
    ])
    expect(todos('.q-grade.g4 > .q-linha b')[3].textContent).toBe('Trilho de ícones')
  })

  it('provar um tema pinta o app em círculo (800 ms) e não equipa; sair devolve o equipado', () => {
    marcarPosse('tema-radio')
    const { um, setTheme, unmount } = montar()
    fireEvent.click(um('.px-tema[data-px-tema="radio"]'))
    expect(vi.mocked(revelarEmCirculo).mock.calls[0][1]).toBe(800)
    expect(document.documentElement.dataset.theme).toBe('radio')
    expect(setTheme).not.toHaveBeenCalled()
    expect(um('.px-vitrine > .q-rotulo').textContent).toBe('Como está agora · em prévia')
    expect(um('.px-vitrine-pe b').textContent).toBe('Rádio')
    expect(um('.px-tema[data-px-tema="radio"]').getAttribute('aria-pressed')).toBe('true')
    expect(um('.px-vitrine-pe .q-acoes > .q-ctl').textContent).toBe('Voltar ao Babel Atelier')
    expect(um('.px-vitrine-pe [data-px="equipar"]').textContent).toBe('Equipar')
    unmount()
    expect(document.documentElement.dataset.theme).toBe('babel')
  })

  it('"Voltar ao equipado" desfaz a prova; "Equipar" passa pelo caminho de sempre', () => {
    marcarPosse('tema-radio')
    const { um, setTheme } = montar()
    fireEvent.click(um('.px-tema[data-px-tema="radio"]'))
    fireEvent.click(um('.px-vitrine-pe .q-acoes > .q-ctl'))
    expect(document.documentElement.dataset.theme).toBe('babel')
    expect(um('.px-vitrine > .q-rotulo').textContent).toBe('Como está agora')
    fireEvent.click(um('.px-tema[data-px-tema="radio"]'))
    fireEvent.click(um('.px-vitrine-pe [data-px="equipar"]'))
    expect(setTheme).toHaveBeenCalledWith('radio', { semCirculo: true })
  })

  it('o tema que ainda não é seu oferece o caminho no lugar de equipar', () => {
    const { um, aoTrocarDeAba, setTheme } = montar()
    fireEvent.click(um('.px-tema[data-px-tema="radio"]'))
    expect(um('.px-vitrine-pe [data-px="equipar"]')).toBeNull()
    const caminho = um('.px-vitrine-pe [data-px="ver-na-loja"]')
    expect(caminho.textContent).toBe('Na Loja')
    fireEvent.click(caminho)
    expect(aoTrocarDeAba).toHaveBeenLastCalledWith('loja')
    expect(setTheme).not.toHaveBeenCalled()
  })
})

describe('Temporada (D38 a D41)', () => {
  const T1 = { id: 't1', numero: 1, nome: 'Observatório', inicio: '2026-10-01', fim: '2026-11-25', niveis: 30 }
  beforeEach(() => {
    mocks.temporada = { temporada: T1, proxima: null, xp: 510, nivel: 3, assinante: false, creditados: [] }
  })

  it('o cabeçalho com o céu e o anel, o cartão do fim e a trilha de 30 degraus', () => {
    const { palco, um, todos } = montar('temporada')
    expect([...palco.children].slice(2).map((f) => f.className)).toEqual([
      'q-cartao px-temporada',
      'q-linha px-final',
      'q-secao',
    ])
    expect(um('.px-temp-texto .q-rotulo').textContent).toBe('Temporada 1 · Observatório')
    expect(um('.px-temp-texto h2').textContent).toBe('Nível 3 de 30')
    expect(um('.px-temporada .q-barra').getAttribute('aria-valuenow')).toBe('60')
    expect(um('.px-temporada .q-barra > span').style.width).toBe('40%')
    expect(um('.px-temporada .px-nota').textContent).toBe(
      '60 / 150 XP · faltam 90 XP · a seguir: +70 Seeds, no nível 4. Sobe com o XP de estudo ganho na temporada.',
    )
    expect(um('.px-anel').style.getPropertyValue('--pct')).toBe('40')
    expect(um('.px-anel b').textContent).toBe('3')
    expect(um('.px-final').dataset.pxNivel).toBe('30')
    expect(um('.q-secao > header p').textContent).toBe(
      '15 recompensas estudando · mais 30 com a assinatura. Dá para ver todas, até a última.',
    )
    expect(todos('.px-faixas .q-aba').map((b) => b.textContent)).toEqual(['1–10', '11–20', '21–30'])
    const degraus = todos('.px-trilha > .px-degrau')
    expect(degraus).toHaveLength(30)
    expect(degraus.slice(0, 4).map((d) => d.className)).toEqual([
      'px-degrau feito',
      'px-degrau feito',
      'px-degrau feito',
      'px-degrau proximo',
    ])
    expect(degraus[29].className).toBe('px-degrau ultimo')
    /* Os estados do prêmio (`telas3.js:127-133`). */
    const g2 = um('[data-px-premio="g2"]')
    expect(g2.className).toBe('px-premio r-comum feito')
    expect(g2.dataset.rotulo).toBe('+60 Seeds')
    expect(g2.querySelector('small')?.textContent).toBe('resgatar')
    const a1 = um('[data-px-premio="a1"]')
    expect(a1.className).toBe('px-premio r-comum feito trancado')
    expect(a1.querySelector('small')?.textContent).toBe('com a assinatura')
    expect(um('[data-px-premio="g14"]').className).toBe('px-premio r-raro')
    expect(um('[data-px-premio="g14"] small').textContent).toBe('Raro')
    expect(um('[data-px-premio="a30"]').className).toBe('px-premio r-lendario trancado')
    expect(degraus[0].querySelector('.px-premio.vazio')?.textContent).toBe('·')
    expect(um('.q-aviso .q-ctl').textContent).toBe('Conhecer o Premium')
  })

  it('resgatar pede o crédito ao servidor e o prêmio fica "resgatado"; o trancado e o não alcançado não pedem', async () => {
    const { um } = montar('temporada')
    fireEvent.click(um('[data-px-premio="a1"]'))
    fireEvent.click(um('[data-px-premio="g4"]'))
    expect(creditarSeeds).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(um('[data-px-premio="g2"]'))
    })
    expect(creditarSeeds).toHaveBeenCalledTimes(1)
    expect(creditarSeeds).toHaveBeenCalledWith({ creditoId: 'temporada:t1:2:gratis' })
    expect(um('[data-px-premio="g2"]').className).toBe('px-premio r-comum feito pego')
    expect(um('[data-px-premio="g2"] small').textContent).toBe('resgatado')
    /* Já resgatado: o segundo toque não pede de novo (`telas2.js:596`). */
    await act(async () => {
      fireEvent.click(um('[data-px-premio="g2"]'))
    })
    expect(creditarSeeds).toHaveBeenCalledTimes(1)
  })

  it('com a chave das recompensas desligada, resgatar não pede crédito', async () => {
    mocks.v2 = false
    const { um } = montar('temporada')
    await act(async () => {
      fireEvent.click(um('[data-px-premio="g2"]'))
    })
    expect(creditarSeeds).not.toHaveBeenCalled()
  })

  it('"ir para o nível": os prêmios do degrau pulam com os números do protótipo', () => {
    const { um, todos } = montar('temporada')
    gravadas = []
    fireEvent.click(um('.px-final'))
    const pulos = gravadas.filter((g) => g.quem.startsWith('px-premio'))
    expect(pulos.map((g) => [g.d, g.atraso, g.e])).toEqual([
      [620, 420, MOLA],
      [620, 510, MOLA],
    ])
    expect(pulos[0].quadros).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(1.12)' },
      { transform: 'scale(1)' },
    ])
    /* As faixas marcam a escolhida. */
    fireEvent.click(todos('.px-faixas .q-aba')[1])
    expect(todos('.px-faixas .q-aba').map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
  })
})

describe('Loja (D42 a D44)', () => {
  const pixel = CATALOGO_DA_LOJA.find((i) => i.id === 'part-pixel')!

  it('a carteira, as seis categorias e a prateleira do catálogo, a mais barata primeiro', () => {
    const { um, todos } = montar('loja')
    expect(um('.px-carteira .px-saldo').textContent).toBe('420')
    expect(um('.px-carteira > .q-ctl').textContent?.trim()).toBe('Ganhar jogando')
    expect(todos('.px-cats > .q-aba').map((b) => b.textContent)).toEqual([
      'Tudo',
      'Temas',
      'Legendas',
      'Cartões',
      'Efeitos de jogo',
      'Partículas e rastros',
    ])
    const itens = todos('.px-loja > .px-item')
    expect(itens.length).toBeGreaterThan(0)
    const precos = itens.map((i) => Number(i.querySelector('.px-preco-seeds')?.textContent?.replace(/\D/g, '')))
    expect(precos).toEqual([...precos].sort((a, b) => a - b))
    const cartao = um(`.px-item[data-item-id="${pixel.id}"]`)
    expect(cartao.dataset.item).toBe(pixel.nome)
    expect(cartao.querySelector('.px-arte')?.getAttribute('data-arte')).toBe('pixel')
    expect(cartao.querySelectorAll('.px-arte-pixel > i')).toHaveLength(9)
    expect(cartao.querySelector('.q-rotulo')?.textContent).toBe('Comum Partículas e rastros')
    expect(cartao.querySelector('.px-segurar')?.textContent).toBe('Segure para comprar')
    /* O que o saldo não paga mostra a barra e quanto falta, sem botão de comprar. */
    const caro = itens.find((i) => Number(i.querySelector('.px-preco-seeds')?.textContent?.replace(/\D/g, '')) > 420)!
    expect(caro.querySelector('.px-segurar')).toBeNull()
    expect(caro.querySelector('.px-falta small')?.textContent).toMatch(/^Faltam [\d.]+ Seeds$/)
    expect(itens.every((i) => i.querySelector('.px-item-pe > .q-ctl:not(.pri)')?.textContent === 'Ver prévia')).toBe(
      true,
    )
  })

  it('a categoria filtra a prateleira e ela entra pelo lado (56 px, 520 ms)', () => {
    const { todos } = montar('loja')
    gravadas = []
    fireEvent.click(todos('.px-cats > .q-aba')[2])
    expect(todos('.px-cats > .q-aba')[2].getAttribute('aria-checked')).toBe('true')
    expect(todos('.px-loja > .px-item .q-rotulo').every((r) => /Legendas$/.test(r.textContent ?? ''))).toBe(true)
    const entrada = gravadas.find((g) => g.quem === 'px-loja')!
    expect([entrada.d, entrada.atraso]).toEqual([520, 0])
    expect(entrada.quadros[0]).toEqual({ opacity: 0, transform: 'translateX(56px)', filter: 'blur(6px)' })
  })

  it('segurar enche o botão em 1100 ms, linear; soltar antes recolhe em 200 ms e não compra', async () => {
    const { um } = montar('loja')
    const botao = um(`.px-item[data-item-id="${pixel.id}"] .px-segurar`)
    gravadas = []
    fireEvent.pointerDown(botao)
    expect(gravadas).toHaveLength(1)
    expect(gravadas[0].quem).toBe('px-segurar-fundo')
    expect([gravadas[0].d, gravadas[0].e, gravadas[0].fill]).toEqual([1100, 'linear', 'forwards'])
    expect(gravadas[0].quadros).toEqual([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }])
    await act(async () => {
      fireEvent.pointerUp(botao)
    })
    expect(gravadas[0].cancelada).toBe(true)
    expect(gravadas[1].d).toBe(200)
    expect(gravadas[1].quadros).toEqual([
      { clipPath: 'inset(0 0 0 0)', opacity: 0.6 },
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
    ])
    expect(comprarPecaComSeeds).not.toHaveBeenCalled()
  })

  it('o dedo até o fim compra pela porta de sempre; a peça fica "Na sua coleção" e as Seeds contam', async () => {
    const { um } = montar('loja')
    const botao = um(`.px-item[data-item-id="${pixel.id}"] .px-segurar`)
    fireEvent.pointerDown(botao)
    await act(async () => {
      gravadas[0].acabar()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(comprarPecaComSeeds).toHaveBeenCalledTimes(1)
    expect(vi.mocked(comprarPecaComSeeds).mock.calls[0][0].id).toBe(pixel.id)
    /* A festa: o cartão novo gira para dentro (`telas2.js:470`). */
    const giro = gravadas.find((g) => g.d === 760)!
    expect(giro.quadros).toEqual([{ transform: 'scale(0.94) rotateY(60deg)' }, { transform: 'scale(1) rotateY(0deg)' }])
  })

  it('a compra recusada pelo servidor não dá a peça', async () => {
    vi.mocked(comprarPecaComSeeds).mockResolvedValueOnce({ ok: false, faltam: 12 })
    const { um } = montar('loja')
    const botao = um(`.px-item[data-item-id="${pixel.id}"] .px-segurar`)
    fireEvent.pointerDown(botao)
    await act(async () => {
      gravadas[0].acabar()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(comprarPecaComSeeds).toHaveBeenCalledTimes(1)
    expect(um(`.px-item[data-item-id="${pixel.id}"]`).className).toBe('q-cartao px-item')
    expect(um(`.px-item[data-item-id="${pixel.id}"] .px-segurar`)).toBeTruthy()
  })
})

describe('o que o protótipo não desenha continua alcançável', () => {
  const folha = () => document.body.querySelector<HTMLElement>('[data-testid="folha-do-visual"]')
  const secaoAtiva = () =>
    folha()
      ?.querySelector('[role="group"][aria-label="Seções da coleção"] [aria-pressed="true"]')
      ?.textContent?.trim() ?? ''

  it('as quatro linhas-resumo abrem a folha "Meu visual" na seção de cada uma', () => {
    const { todos } = montar()
    expect(folha()).toBeNull()
    const linhas = todos('.q-grade.g4 > .q-linha')
    fireEvent.click(linhas[1])
    expect(folha()?.closest('dialog')).toBeTruthy()
    expect(secaoAtiva()).toMatch(/^Efeitos/)
    /* As outras categorias estão no mesmo seletor: primeiro só as que têm peça sua… */
    const secoes = () =>
      [...folha()!.querySelectorAll('[aria-label="Seções da coleção"] .q-aba')].map((b) =>
        (b.textContent ?? '').trim().replace(/\s*\d+$/, ''),
      )
    expect(secoes()).toEqual(['Temas', 'Efeitos', 'Legendas', 'Cartões', 'Perfis', 'Acessibilidade'])
    /* …e, com "Ver tudo que existe", todas. */
    fireEvent.click(folha()!.querySelector('.q-secao > header .q-chip')!)
    expect(secoes()).toEqual(expect.arrayContaining(['Efeitos de jogo', 'Moldura e título', 'Capacidades']))
    act(() => folha()!.closest('dialog')!.close())
    act(() => folha()?.closest('dialog')?.dispatchEvent(new Event('close')))
    expect(folha()).toBeNull()
    fireEvent.click(linhas[2])
    expect(secaoAtiva()).toMatch(/^Acessibilidade/)
  })

  it('na folha se equipa pelo caminho de sempre (a letra, que é livre)', () => {
    const { todos, setFonte } = montar()
    fireEvent.click(todos('.q-grade.g4 > .q-linha')[2])
    const letras = [...folha()!.querySelectorAll<HTMLElement>('[data-bloco="acessibilidade-e-layout"] .q-linha')]
    fireEvent.click(letras[1])
    expect(setFonte).toHaveBeenCalledTimes(1)
  })

  it('equipar o tema em prova não repete o círculo', () => {
    marcarPosse('tema-radio')
    const { um, setTheme } = montar()
    fireEvent.click(um('.px-tema[data-px-tema="radio"]'))
    fireEvent.click(um('.px-vitrine-pe [data-px="equipar"]'))
    expect(setTheme).toHaveBeenCalledWith('radio', { semCirculo: true })
  })

  it('Loja: depois da compra, "Equipar agora" no aviso e o toque em "Na sua coleção" equipam', async () => {
    vi.mocked(comprarPecaComSeeds).mockImplementationOnce(async (item) => {
      marcarPosse(item.id)
      return { ok: true, faltam: 0 }
    })
    const aviso = vi.spyOn(toast, 'ok')
    const { um } = montar('loja')
    fireEvent.pointerDown(um('.px-item[data-item-id="part-pixel"] .px-segurar'))
    await act(async () => {
      gravadas[0].acabar()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const chamada = aviso.mock.calls.find((c) => /agora é seu/.test(String(c[0])))!
    expect(chamada[1]?.action?.label).toBe('Equipar agora')
    expect(readParticulas()).not.toBe('pixel')
    act(() => chamada[1]!.action!.onClick())
    expect(readParticulas()).toBe('pixel')
    expect(um('.px-item[data-item-id="part-pixel"] [data-px="usar"]').textContent?.trim()).toBe('Na sua coleção')
    aviso.mockRestore()
  })

  it('Temporada: o toque no prêmio já resgatado equipa a peça', () => {
    mocks.temporada = {
      temporada: { id: 't1', numero: 1, nome: 'Observatório', inicio: '2026-10-01', fim: '2026-11-25', niveis: 30 },
      proxima: null,
      xp: 1200,
      nivel: 8,
      assinante: false,
      creditados: ['temporada:t1:8:gratis'],
    }
    localStorage.setItem('babel.temporada_creditada', JSON.stringify(['temporada:t1:8:gratis']))
    const { um } = montar('temporada')
    expect(um('[data-px-premio="g8"]').className).toBe('px-premio r-comum feito pego')
    fireEvent.click(um('[data-px-premio="g8"]'))
    expect(creditarSeeds).not.toHaveBeenCalled()
    expect(perfilEquipado().titulo).toBeTruthy()
  })

  it('Créditos: com carteira, o chip de Seeds abre a carteira, a prateleira paga e a compra; sem carteira, não é botão', () => {
    const semCarteira = montar()
    expect(semCarteira.um('.px-seeds').getAttribute('role')).toBeNull()
    semCarteira.unmount()
    mocks.carteira = { creditos: 500, disponivel: true, recarregar: () => {} }
    const { um } = montar()
    expect(um('.px-seeds').getAttribute('role')).toBe('button')
    expect(um('.px-seeds').tagName).toBe('SPAN')
    fireEvent.click(um('.px-seeds'))
    const creditos = document.body.querySelector<HTMLElement>('[data-testid="folha-de-creditos"]')!
    expect(creditos.querySelector('[data-testid="carteira-de-creditos"]')).toBeTruthy()
    expect(creditos.querySelector('[data-testid="comprar-creditos"]')).toBeTruthy()
    expect(creditos.querySelector('[data-preco-seeds]')).toBeNull()
  })
})
