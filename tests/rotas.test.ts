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

  it('a área de Personalizar entra no caminho, na língua do rótulo (ux-v2 §1.6)', () => {
    expect(estadoParaUrl({ view: 'loja', lojaTab: 'passe' })).toBe('/loja/passe')
    expect(estadoParaUrl({ view: 'loja', lojaTab: 'personalizar' })).toBe('/loja/meu-visual')
    expect(estadoParaUrl({ view: 'loja', lojaTab: 'loja' })).toBe('/loja/itens')
    expect(estadoParaUrl({ view: 'loja', lojaTab: 'conquistas' })).toBe('/loja/desafios')
    expect(estadoParaUrl({ view: 'loja' })).toBe('/loja')
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

  it('sub-aba de Personalizar desconhecida degrada para a tela, não para o Hub', () => {
    expect(urlParaEstado('/loja/meu-visual')).toEqual({ view: 'loja', lojaTab: 'personalizar' })
    expect(urlParaEstado('/loja/nao-existe')).toEqual({ view: 'loja' })
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
    { view: 'loja', lojaTab: 'passe' },
    { view: 'loja', lojaTab: 'personalizar' },
    { view: 'loja', lojaTab: 'loja' },
    { view: 'loja', lojaTab: 'conquistas' },
  ]
  for (const c of casos) {
    it(`preserva ${JSON.stringify(c)}`, () => {
      expect(ida(c)).toEqual(c)
    })
  }
})

/**
 * OS ENDEREÇOS DO QUE ESTÁ À VENDA (mudança vender-onde-se-ve).
 *
 * `ComprarCreditos` não tinha URL nenhuma: vivia dentro de uma aba que a DESMONTA quando inativa,
 * e não havia link que levasse a ela. E `/planos`, no plural — que é o que qualquer pessoa digita
 * — caía no Hub em silêncio, porque o mapa só conhecia o singular.
 */
describe('as rotas do que está à venda', () => {
  it('/creditos abre a compra de Créditos', () => {
    expect(urlParaEstado('/creditos')).toEqual({ view: 'loja', lojaTab: 'loja' })
  })

  it('/planos vale como /plano — o plural é o que se digita', () => {
    expect(urlParaEstado('/planos')).toEqual({ view: 'planos' })
    expect(urlParaEstado('/plano')).toEqual({ view: 'planos' })
  })

  it('mas a URL publicada continua sendo a canônica — uma tela, um endereço na barra', () => {
    expect(estadoParaUrl({ view: 'planos' })).toBe('/plano')
  })
})
