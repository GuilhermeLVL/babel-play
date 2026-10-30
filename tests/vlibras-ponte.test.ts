// @vitest-environment jsdom
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lerMensagemParaAPonte, URL_DO_SCRIPT_DO_VLIBRAS } from '../src/core/libras/vlibras'

/**
 * A PÁGINA DA PONTE (`public/vlibras-ponte.js`), rodada com um `window` falso: o pai, a escuta de mensagens e o
 * `document` do jsdom. O que se trava: só o pai fala com ela, esquema estrito com teto, o script do governo só é pedido
 * depois de `iniciar`, e aberta sozinha ela não faz nada.
 */
const CODIGO = readFileSync('public/vlibras-ponte.js', 'utf8')

interface JanelaFalsa {
  parent: unknown
  addEventListener: (t: string, f: (e: unknown) => void) => void
  postMessage: ReturnType<typeof vi.fn>
  VLibras?: { Widget: ReturnType<typeof vi.fn> }
  VLibrasWidget?: { open: ReturnType<typeof vi.fn> }
}

let escuta: ((e: unknown) => void) | null
let pai: { postMessage: ReturnType<typeof vi.fn> }

function rodar(comPai = true) {
  escuta = null
  pai = { postMessage: vi.fn() }
  const w: JanelaFalsa = {
    parent: null,
    addEventListener: (_t, f) => {
      escuta = f
    },
    postMessage: vi.fn(),
  }
  w.parent = comPai ? pai : w
  new Function('window', 'document', CODIGO)(w, document)
  return w
}

const msg = (source: unknown, data: unknown) => escuta?.({ source, data })
const scripts = () => [...document.head.querySelectorAll('script')]

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<p id="texto">Envie</p><p id="estado"></p>'
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('a ponte do VLibras (página dentro do iframe de origem opaca)', () => {
  it('avisa o pai que está pronta e NÃO pede nada ao governo por conta própria', () => {
    rodar()
    expect(pai.postMessage).toHaveBeenCalledWith({ frasy: 'vlibras-ponte', tipo: 'pronta' }, '*')
    expect(scripts()).toHaveLength(0)
  })

  it('aberta sozinha (sem pai) não escuta nem carrega nada', () => {
    rodar(false)
    expect(escuta).toBeNull()
    expect(scripts()).toHaveLength(0)
  })

  it('só o pai manda: mensagem de outra janela é ignorada', () => {
    rodar()
    msg({}, { frasy: 'vlibras-ponte', tipo: 'iniciar' })
    msg(null, { frasy: 'vlibras-ponte', tipo: 'iniciar' })
    expect(scripts()).toHaveLength(0)
  })

  it('esquema estrito: formato errado, carga extra ou texto grande demais não fazem nada', () => {
    rodar()
    for (const ruim of [
      'iniciar',
      null,
      [],
      { tipo: 'iniciar' },
      { frasy: 'x', tipo: 'iniciar' },
      { frasy: 'vlibras-ponte', tipo: 'iniciar', extra: 1 },
      { frasy: 'vlibras-ponte', tipo: 'texto', texto: 42 },
      { frasy: 'vlibras-ponte', tipo: 'texto', texto: 'a'.repeat(2001) },
      { frasy: 'vlibras-ponte', tipo: 'abrir' },
    ])
      msg(pai, ruim)
    expect(scripts()).toHaveLength(0)
    expect(document.getElementById('texto')!.textContent).toBe('Envie')
  })

  it('o mesmo esquema que o app usa (core) vale para a ponte', () => {
    expect(lerMensagemParaAPonte({ frasy: 'vlibras-ponte', tipo: 'iniciar' })).not.toBeNull()
    expect(lerMensagemParaAPonte({ frasy: 'vlibras-ponte', tipo: 'texto', texto: 'a'.repeat(2001) })).toBeNull()
    expect(lerMensagemParaAPonte({ frasy: 'vlibras-ponte', tipo: 'iniciar', extra: 1 })).toBeNull()
  })

  it('"iniciar" do pai: pede SÓ o script oficial, abre o widget e avisa "iniciado"', () => {
    const w = rodar()
    msg(pai, { frasy: 'vlibras-ponte', tipo: 'iniciar' })
    msg(pai, { frasy: 'vlibras-ponte', tipo: 'iniciar' }) // idempotente
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0]!.src).toBe(URL_DO_SCRIPT_DO_VLIBRAS)
    w.VLibras = { Widget: vi.fn() }
    w.VLibrasWidget = { open: vi.fn() }
    scripts()[0]!.onload?.(new Event('load'))
    expect(w.VLibras.Widget).toHaveBeenCalledWith({ rootPath: 'https://vlibras.gov.br/app' })
    expect(w.VLibrasWidget.open).toHaveBeenCalledTimes(1)
    expect(pai.postMessage).toHaveBeenCalledWith({ frasy: 'vlibras-ponte', tipo: 'iniciado' }, '*')
  })

  it('falha ao carregar o script: avisa "erro" e deixa tentar de novo', () => {
    rodar()
    msg(pai, { frasy: 'vlibras-ponte', tipo: 'iniciar' })
    scripts()[0]!.onerror?.(new Event('error'))
    expect(pai.postMessage).toHaveBeenCalledWith({ frasy: 'vlibras-ponte', tipo: 'erro' }, '*')
    expect(scripts()).toHaveLength(0)
    msg(pai, { frasy: 'vlibras-ponte', tipo: 'iniciar' })
    expect(scripts()).toHaveLength(1)
  })

  it('"texto" do pai: mostra a frase como TEXTO (nunca HTML) e toca nela até o widget aceitar', () => {
    rodar()
    const campo = document.getElementById('texto')!
    const tocar = vi.spyOn(campo, 'click').mockImplementation(() => {
      if (tocar.mock.calls.length >= 2) campo.classList.add('vlibras--active')
    })
    msg(pai, { frasy: 'vlibras-ponte', tipo: 'texto', texto: '  <img src=x onerror=alert(1)>  Bom   dia ' })
    expect(campo.textContent).toBe('<img src=x onerror=alert(1)> Bom dia')
    expect(campo.querySelector('img')).toBeNull()
    vi.advanceTimersByTime(300) // 1º toque: o widget ainda não carregou
    expect(tocar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000) // 2º toque: valeu
    expect(tocar).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(30_000) // parou de insistir
    expect(tocar).toHaveBeenCalledTimes(2)
  })
})
