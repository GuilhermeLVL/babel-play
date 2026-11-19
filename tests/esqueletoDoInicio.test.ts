// @vitest-environment jsdom
/**
 * O ESQUELETO DO INÍCIO NO HTML DO `/app` (carga-rapida-no-celular, 2.4): só para o visitante da primeira visita no
 * Início, com a aparência padrão e numa janela de celular; os caminhos são links de verdade; e ele sai quando o
 * Início tem a forma final.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { comEsqueleto, htmlDoEsqueleto, mostrarEsqueleto, scriptDoEsqueleto } from '../scripts/vite/esqueletoDoInicio'
import { tirarEsqueleto, tirarEsqueletoQuandoOInicioEstiverPronto } from '../src/lib/esqueleto'

const visitante = (
  extra: Partial<Parameters<typeof mostrarEsqueleto>[0]> = {},
  guardado: Record<string, string> = {},
) =>
  mostrarEsqueleto({
    caminho: '/app',
    busca: '',
    chaves: Object.keys(guardado),
    ler: (k) => guardado[k] ?? null,
    larguraPx: 412,
    ...extra,
  })

describe('quem vê o esqueleto', () => {
  it('o visitante da primeira visita no Início, no celular', () => {
    expect(visitante()).toBe(true)
    expect(visitante({ caminho: '/app/' })).toBe(true)
    expect(visitante({}, { app_theme: 'babel', 'babel.age_profile': 'pro' })).toBe(true)
  })

  it('outra tela, outra janela, sessão guardada ou outra aparência: não', () => {
    expect(visitante({ caminho: '/app/jogar' })).toBe(false)
    expect(visitante({ caminho: '/' })).toBe(false)
    expect(visitante({ busca: '?ui=xx' })).toBe(false)
    expect(visitante({ larguraPx: 1280 })).toBe(false)
    expect(visitante({}, { 'sb-abc-auth-token': '{}' })).toBe(false)
    expect(visitante({}, { theme: 'dark' })).toBe(false)
    expect(visitante({}, { app_theme: 'agua' })).toBe(false)
    expect(visitante({}, { app_fonte: 'pixel' })).toBe(false)
    expect(visitante({}, { 'babel.age_profile': 'kids' })).toBe(false)
  })
})

describe('o HTML do esqueleto', () => {
  const html = htmlDoEsqueleto({ inter: '/assets/inter-X.woff2' })

  it('os caminhos são links de verdade e o texto é o do Início', () => {
    for (const href of ['/app/capturar', '/app/cartoes', '/app/interprete', '/app/jogar', '/app/plano'])
      expect(html).toContain(`href="${href}"`)
    expect(html).toContain('Legendar agora')
    expect(html).toContain('Vídeo, jogo, aula ou conversa, com tradução ao vivo.')
  })

  it('a Inter do esqueleto bloqueia (pinta já na fonte final) e o #root fica escondido atrás dele', () => {
    expect(html).toMatch(/font-family:'Inter Esq'[^}]*font-display:block[^}]*src:url\(\/assets\/inter-X\.woff2\)/)
    expect(html).toContain('html[data-esqueleto] #root{visibility:hidden}')
    expect(html).not.toMatch(/<script/)
  })
})

describe('no index.html', () => {
  it('o esqueleto vem logo depois do #root e a folha do app sai do <head> para depois dele', () => {
    const html =
      '<html><head><link rel="stylesheet" crossorigin href="/assets/index-AbC.css">\n<link rel="preload" as="font" href="/assets/inter-X.woff2"></head><body><div id="root"></div><script type="module" src="/assets/index-Y.js"></script></body></html>'
    const saida = comEsqueleto(html, '<div id="esqueleto"></div>')
    expect(saida).not.toMatch(/<head>[^]*index-AbC\.css[^]*<\/head>/)
    expect(saida).toContain(
      '<div id="root"></div><div id="esqueleto"></div><link rel="stylesheet" crossorigin href="/assets/index-AbC.css">',
    )
    expect(saida).toContain('rel="preload" as="font"')
  })

  it('o esqueleto só aparece depois que o script decide (visibility no CSS)', () => {
    const css = htmlDoEsqueleto({ inter: '/i' })
    expect(css).toContain('#esqueleto{visibility:hidden;')
    expect(css).toContain('html[data-esqueleto] #esqueleto{visibility:visible}')
  })
})

describe('no navegador', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-esqueleto')
    delete document.documentElement.dataset.pxEstilos
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  const montar = () => {
    document.body.innerHTML = `<div id="root"></div>${htmlDoEsqueleto({ inter: '/i.woff2' })}`

    new Function(scriptDoEsqueleto())()
  }

  it('o script mantém o esqueleto do visitante no /app e marca o <html>', () => {
    window.history.replaceState({}, '', '/app')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 412 })
    montar()
    expect(document.getElementById('esqueleto')).not.toBeNull()
    expect(document.documentElement.hasAttribute('data-esqueleto')).toBe(true)
    expect(document.querySelector('.esq-sobre')?.textContent).toMatch(/^(Bom dia|Boa tarde|Boa noite)$/)
  })

  it('o script tira o esqueleto de quem tem sessão', () => {
    window.history.replaceState({}, '', '/app')
    localStorage.setItem('sb-x-auth-token', '{}')
    montar()
    expect(document.getElementById('esqueleto')).toBeNull()
    expect(document.documentElement.hasAttribute('data-esqueleto')).toBe(false)
  })

  it('o Início tira o esqueleto quando a camada de polimento entra (ou no teto)', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0))
    try {
      window.history.replaceState({}, '', '/app')
      montar()
      tirarEsqueletoQuandoOInicioEstiverPronto()
      vi.advanceTimersByTime(100)
      expect(document.getElementById('esqueleto')).not.toBeNull()
      document.documentElement.dataset.pxEstilos = 'ok'
      document.dispatchEvent(new Event('px:estilos'))
      vi.advanceTimersByTime(10)
      expect(document.getElementById('esqueleto')).toBeNull()
      expect(document.documentElement.hasAttribute('data-esqueleto')).toBe(false)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('sem esqueleto, tirar não faz nada', () => {
    expect(() => tirarEsqueleto()).not.toThrow()
  })
})
