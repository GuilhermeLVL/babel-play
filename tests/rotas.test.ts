/**
 * F10 — A URL PASSA A ESPELHAR O ESTADO.
 *
 * O app inteiro vivia em `/`: a navegação era `useState<ViewType>` (App.tsx:44) e mais nada.
 * Consequências medidas na auditoria: recarregar devolvia ao Hub e perdia a sessão aberta e a
 * aba; o botão "voltar" do navegador SAÍA do app; nenhuma tela era compartilhável; e a revisão
 * espaçada (`Study`) não tinha porta nenhuma na navegação.
 *
 * A abordagem é ADITIVA e reversível: a máquina de estados continua sendo a implementação, e a
 * URL vira o espelho dela. Por isso o contrato é um par de funções PURAS — dá para travar o
 * comportamento inteiro sem montar o app, e a ida-e-volta é verificável.
 */
import { describe, it, expect } from 'vitest'
import { estadoParaUrl, urlParaEstado, type EstadoDeRota } from '../src/lib/rotas'

const ida = (e: EstadoDeRota) => urlParaEstado(estadoParaUrl(e))

describe('estadoParaUrl', () => {
  it('o Hub é a raiz', () => {
    expect(estadoParaUrl({ view: 'hub' })).toBe('/')
  })

  it('as views de topo viram caminhos legíveis', () => {
    expect(estadoParaUrl({ view: 'capture' })).toBe('/capturar')
    expect(estadoParaUrl({ view: 'play' })).toBe('/jogar')
    expect(estadoParaUrl({ view: 'library' })).toBe('/biblioteca')
    expect(estadoParaUrl({ view: 'metrics' })).toBe('/vocabulario')
    expect(estadoParaUrl({ view: 'settings' })).toBe('/ajustes')
  })

  it('a sessão carrega o id — é o que torna a tela compartilhável', () => {
    expect(estadoParaUrl({ view: 'analysis', sessionId: 'abc' })).toBe('/sessao/abc')
  })

  it('a aba da sessão entra no caminho — o escopo fica visível na barra de endereço', () => {
    expect(estadoParaUrl({ view: 'analysis', sessionId: 'abc', subTab: 'overview' })).toBe('/sessao/abc/metricas')
    expect(estadoParaUrl({ view: 'analysis', sessionId: 'abc', subTab: 'transcript' })).toBe('/sessao/abc/transcricao')
  })

  it('`study` ganha porta própria — era a funcionalidade órfã do menu', () => {
    expect(estadoParaUrl({ view: 'analysis', subTab: 'study' })).toBe('/revisar')
    expect(estadoParaUrl({ view: 'analysis', sessionId: 'abc', subTab: 'study' })).toBe('/revisar/abc')
  })

  it('sessão sem id não inventa caminho de sessão', () => {
    expect(estadoParaUrl({ view: 'analysis' })).toBe('/sessao')
  })
})

describe('urlParaEstado', () => {
  it('lê a raiz como Hub', () => {
    expect(urlParaEstado('/')).toEqual({ view: 'hub' })
  })

  it('lê a sessão com aba', () => {
    expect(urlParaEstado('/sessao/abc/metricas')).toEqual({ view: 'analysis', sessionId: 'abc', subTab: 'overview' })
  })

  it('lê /revisar como a aba de estudo', () => {
    expect(urlParaEstado('/revisar')).toEqual({ view: 'analysis', subTab: 'study' })
    expect(urlParaEstado('/revisar/abc')).toEqual({ view: 'analysis', sessionId: 'abc', subTab: 'study' })
  })

  it('tolera barra final e caixa alta — URL digitada à mão não pode quebrar a tela', () => {
    expect(urlParaEstado('/JOGAR/')).toEqual({ view: 'play' })
  })

  it('caminho desconhecido cai no Hub em vez de tela em branco', () => {
    expect(urlParaEstado('/nao-existe')).toEqual({ view: 'hub' })
    expect(urlParaEstado('')).toEqual({ view: 'hub' })
  })

  it('ignora o callback de auth — ele tem dono e não é rota de tela', () => {
    expect(urlParaEstado('/auth/callback')).toEqual({ view: 'hub' })
  })
})

describe('ida e volta — o estado sobrevive ao recarregamento', () => {
  const casos: EstadoDeRota[] = [
    { view: 'hub' },
    { view: 'play' },
    { view: 'library' },
    { view: 'metrics' },
    { view: 'analysis', sessionId: 's1' },
    { view: 'analysis', sessionId: 's1', subTab: 'overview' },
    { view: 'analysis', sessionId: 's1', subTab: 'reading' },
    { view: 'analysis', sessionId: 's1', subTab: 'practice' },
    { view: 'analysis', sessionId: 's1', subTab: 'study' },
    { view: 'analysis', subTab: 'study' },
  ]
  for (const c of casos) {
    it(`preserva ${JSON.stringify(c)}`, () => {
      expect(ida(c)).toEqual(c)
    })
  }
})
