// @vitest-environment jsdom
/**
 * O TEMA ÁGUA (`src/lib/polimento/agua.ts` e `aguaCena.ts`), porte de `agua.js` do protótipo.
 *
 * Três coisas ficam travadas aqui:
 *   1. os números da física e da superfície, copiados À MÃO de `agua.js` (a linha vai no comentário):
 *      se alguém "arredondar" uma mola, o teste acusa;
 *   2. a cena só existe com o tema ligado e a camada de polimento ativa, e sai inteira ao sair do tema;
 *      o código dela só é baixado nessa hora (`import()`), nunca no arranque;
 *   3. o `mergulho` toca ao EQUIPAR a Água, e só ao equipar (a prova do Personalizar não mergulha).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentir = vi.fn()
vi.mock('../src/lib/polimento/sentidos', () => ({ sentir: (...a: unknown[]) => sentir(...a) }))
vi.mock('../src/data/api', () => ({ patchUiSettings: vi.fn(async () => undefined) }))

import { instalarAgua } from '../src/lib/polimento/agua'
import {
  inclinacaoDoPonto,
  MAR_ALT,
  medirMolas,
  nivelEm,
  novaBolha,
  novoEstadoDaAgua,
  ondaEm,
  PASSO,
  passoDaBolha,
  passoDaFisica,
  passoDasMolas,
  respingo,
  semearBolhas,
  superficieEm,
} from '../src/lib/polimento/aguaCena'
import { applyTheme, persistTheme, THEME_KEY } from '../src/lib/theme'

const raiz = process.cwd()
const html = document.documentElement
const vez = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))
/** Espera a cena chegar (ela vem por `import()`) ou sair. */
const ate = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await vez(5)
}
const cena = () => document.querySelector('.ag-cena')

const comLargura = (w: number, h = 800) => {
  const ag = novoEstadoDaAgua()
  medirMolas(ag, w, h)
  return ag
}

describe('a superfície (`agua.js:23-65`)', () => {
  it('o canvas do mar tem 200 px e a superfície é amostrada a cada 8 px', () => {
    expect(MAR_ALT).toBe(200)
    expect(PASSO).toBe(8)
  })

  it('a fileira de molas tem um ponto a cada 8 px, mais dois de folga (`agua.js:36`)', () => {
    expect(comLargura(1172).n).toBe(Math.ceil(1172 / 8) + 2)
    expect(comLargura(390).p).toHaveLength(Math.ceil(390 / 8) + 2)
  })

  it('o nível fica em 48 px e a ponta sobe ou desce até 64 px com o ângulo no máximo (`agua.js:45`)', () => {
    const ag = comLargura(1000)
    expect(nivelEm(ag, 500)).toBe(48)
    ag.ang = 7
    expect(nivelEm(ag, 1000)).toBeCloseTo(48 + 64, 6)
    expect(nivelEm(ag, 0)).toBeCloseTo(48 - 64, 6)
    ag.niv = 16
    expect(nivelEm(ag, 500)).toBe(64)
  })

  it('em tela estreita a ponta anda 10% da largura, não 64 px (`agua.js:45`)', () => {
    const ag = comLargura(390)
    ag.ang = 7
    expect(nivelEm(ag, 390)).toBeCloseTo(48 + 39, 6)
  })

  it('três ondas somadas, e o agito aumenta a altura em até 170% (`agua.js:46`)', () => {
    const ag = comLargura(1000)
    const [x, t, k] = [137, 2.5, 1]
    const base =
      Math.sin(x * 0.0105 + t * 0.85 + k * 1.7) * 7 +
      Math.sin(x * 0.0236 - t * 1.35 + k * 0.6) * 3.6 +
      Math.sin(x * 0.049 + t * 2.2 + k * 2.9) * 1.5
    expect(ondaEm(ag, x, t, k)).toBeCloseTo(base, 10)
    ag.agito = 1
    expect(ondaEm(ag, x, t, k)).toBeCloseTo(base * 2.7, 10)
    /* a soma das três amplitudes: a onda nunca passa de 12,1 px parada */
    for (let i = 0; i < 400; i++)
      expect(Math.abs(ondaEm(comLargura(1000), i * 7, i * 0.31, i % 3))).toBeLessThanOrEqual(12.1)
  })

  it('o respingo empurra os 9 pontos vizinhos, mais forte no meio (`agua.js:47-53`)', () => {
    const ag = comLargura(800)
    respingo(ag, 400, 100)
    const c = 50
    expect(ag.v[c]).toBe(100)
    expect(ag.v[c - 1]).toBeCloseTo(80, 4)
    expect(ag.v[c + 4]).toBeCloseTo(20, 4)
    expect(ag.v[c - 5]).toBe(0)
    expect(ag.v[c + 5]).toBe(0)
    /* na borda, o que cai fora da fileira é ignorado */
    expect(() => respingo(ag, 0, 50)).not.toThrow()
    expect(() => respingo(ag, 99999, 50)).not.toThrow()
  })

  it('as molas: dois subpassos por quadro com −24, 95 e amortecimento 1,5 (`agua.js:55-65`)', () => {
    const ag = comLargura(80)
    ag.p[5] = 10
    const p = Array.from(ag.p)
    const v = Array.from(ag.v)
    const dt = 0.016
    for (let s = 0; s < 2; s++) {
      const h = dt / 2
      for (let i = 0; i < ag.n; i++) {
        const e = p[i > 0 ? i - 1 : i]
        const d = p[i < ag.n - 1 ? i + 1 : i]
        v[i] += (-24 * p[i] + 95 * (e + d - 2 * p[i])) * h
        v[i] *= 1 - 1.5 * h
      }
      for (let i = 0; i < ag.n; i++) p[i] += v[i] * h
    }
    passoDasMolas(ag, dt)
    for (let i = 0; i < ag.n; i++) expect(ag.p[i]).toBeCloseTo(p[i], 4)
    /* a ondulação corre para os lados e morre sozinha */
    for (let i = 0; i < 2000; i++) passoDasMolas(ag, 0.016)
    expect(Math.max(...Array.from(ag.p).map(Math.abs))).toBeLessThan(0.01)
  })
})

describe('a inclinação (`agua.js:147-166`)', () => {
  it('o ponteiro vira inclinação: o centro em x e 45% da altura em y são o ponto neutro (`agua.js:152-153`)', () => {
    expect(inclinacaoDoPonto(640, 432, 1280, 960)).toEqual([0, 0])
    expect(inclinacaoDoPonto(1280, 960, 1280, 960)).toEqual([1, 1])
    expect(inclinacaoDoPonto(0, 0, 1280, 960)).toEqual([-1, -1])
    const [tx, ty] = inclinacaoDoPonto(640 + 1280 * 0.225, 432 + 960 * 0.2, 1280, 960)
    expect(tx).toBeCloseTo(0.5, 6)
    expect(ty).toBeCloseTo(0.5, 6)
  })

  it('um quadro da mola: 46 / 4,4 no ângulo (alvo ±7) e 40 / 4,2 no nível (alvo ±16 px)', () => {
    const ag = comLargura(1000)
    const dt = 0.016
    passoDaFisica(ag, 1, 1, dt, false)
    expect(ag.vAng).toBeCloseTo(46 * -7 * dt, 8)
    expect(ag.ang).toBeCloseTo(46 * -7 * dt * dt, 8)
    expect(ag.vNiv).toBeCloseTo(40 * 16 * dt, 8)
    expect(ag.niv).toBeCloseTo(40 * 16 * dt * dt, 8)
  })

  it('a água passa do ponto, volta e assenta: no ângulo −7 e no nível 16 para o canto de baixo à direita', () => {
    const ag = comLargura(1000)
    let passou = false
    for (let i = 0; i < 600; i++) {
      passoDaFisica(ag, 1, 1, 0.016, false)
      if (ag.ang < -7.2) passou = true
    }
    expect(passou, 'mola pouco amortecida: tem de passar do alvo').toBe(true)
    expect(ag.ang).toBeCloseTo(-7, 2)
    expect(ag.niv).toBeCloseTo(16, 2)
  })

  it('a sacudida entra na velocidade (×60) e morre a 0,86 por quadro (`agua.js:158, 162`)', () => {
    const ag = comLargura(1000)
    ag.sacode = 6
    passoDaFisica(ag, 0, 0, 0.016, false)
    expect(ag.vAng).toBeCloseTo(6 * 0.016 * 60, 8)
    expect(ag.sacode).toBeCloseTo(6 * 0.86, 8)
  })

  it('o agito é |vAng| / 26 (até 1), acelera o tempo em até 120% e chega aos poucos (`agua.js:164-166`)', () => {
    const ag = comLargura(1000)
    ag.vAng = 52
    passoDaFisica(ag, 0, 0, 0, false)
    ag.vAng = 52
    passoDaFisica(ag, 0, 0, 0.05, true)
    expect(ag.tempo).toBeCloseTo(0.05 * 2.2, 8)
    expect(ag.agito).toBeCloseTo(0.25, 8)
  })

  it('com menos movimento a água não inclina nem muda de nível, e a superfície continua viva (`agua.js:154-156`)', () => {
    const ag = comLargura(1000)
    ag.ang = 3
    ag.niv = 9
    passoDaFisica(ag, 1, 1, 0.016, true)
    expect(ag.ang).toBe(0)
    expect(ag.niv).toBe(0)
    expect(ag.tempo).toBeGreaterThan(0)
  })
})

describe('as bolhas (`agua.js:141-205`)', () => {
  it('a quantidade segue a largura: 14 + largura / 60, no máximo 34 (`agua.js:143`)', () => {
    for (const [w, n] of [
      [390, 21],
      [1172, 34],
      [2400, 34],
      [60, 15],
    ]) {
      const ag = comLargura(w)
      semearBolhas(ag)
      expect(ag.bolhas, `largura ${w}`).toHaveLength(n)
    }
  })

  it('a bolha comum: raio 2–9, 18–52 px/s, nasce abaixo da tela e não morre de velha (`agua.js:141`)', () => {
    const ag = comLargura(800, 600)
    for (let i = 0; i < 200; i++) {
      const b = novaBolha(ag)
      expect(b.r).toBeGreaterThanOrEqual(2)
      expect(b.r).toBeLessThan(9)
      expect(b.v).toBeGreaterThanOrEqual(18)
      expect(b.v).toBeLessThan(52)
      expect(b.y).toBeGreaterThanOrEqual(620)
      expect(b.vx).toBe(0)
      expect(b.vida).toBe(Infinity)
    }
  })

  it('a bolhinha do toque: raio 1,5–4,5, espalha até ±45 px/s e dura 1 (`agua.js:141`)', () => {
    const ag = comLargura(800, 600)
    for (let i = 0; i < 200; i++) {
      const b = novaBolha(ag, 100, 200, true)
      expect([b.x, b.y]).toEqual([100, 200])
      expect(b.r).toBeGreaterThanOrEqual(1.5)
      expect(b.r).toBeLessThan(4.5)
      expect(Math.abs(b.vx)).toBeLessThanOrEqual(45)
      expect(b.vida).toBe(1)
    }
  })

  it('sobe mais depressa quanto maior, balança e escorrega para o lado mais alto (`agua.js:178-183`)', () => {
    const ag = comLargura(800, 600)
    ag.ang = 2
    const b = { x: 400, y: 500, r: 4.5, v: 30, f: 0, vx: 10, vida: Infinity }
    const dt = 0.02
    expect(passoDaBolha(ag, b, dt)).toBe(true)
    expect(b.f).toBeCloseTo(dt * 2.2, 10)
    expect(b.x).toBeCloseTo(400 + (Math.sin(dt * 2.2) * 9 + 2 * 9 + 10) * dt, 10)
    expect(b.y).toBeCloseTo(500 - 30 * 1.5 * dt, 10)
    expect(b.vx).toBeCloseTo(9.5, 10)
  })

  it('a que chega à superfície faz um respingo de −5 × o raio e renasce embaixo (`agua.js:184-190`)', () => {
    const ag = comLargura(800, 600)
    const b = { x: 400, y: superficieEm(ag, 400), r: 6, v: 30, f: 0, vx: 0, vida: Infinity }
    expect(passoDaBolha(ag, b, 0.016)).toBe(false)
    expect(Math.min(...Array.from(ag.v))).toBeCloseTo(-30, 4)
    expect(b.y).toBeGreaterThanOrEqual(620)
    expect(b.y).toBeLessThan(740)
    expect(b.vida).toBe(Infinity)
  })

  it('a bolhinha do toque perde 0,7 de vida por segundo e sai de cena no fim (`agua.js:183-189`)', () => {
    const ag = comLargura(800, 600)
    const b = novaBolha(ag, 400, 500, true)
    b.v = 0
    passoDaBolha(ag, b, 0.05)
    expect(b.vida).toBeCloseTo(1 - 0.05 * 0.7, 10)
    let viva = true
    for (let i = 0; i < 40 && viva; i++) viva = passoDaBolha(ag, b, 0.05)
    expect(viva).toBe(false)
    expect(b.morta).toBe(true)
    /* morreu de velha, longe da superfície: não respinga */
    expect(Array.from(ag.v).every((x) => x === 0)).toBe(true)
  })
})

describe('a cena no documento (`agua.js:11-15, 208-246`)', () => {
  let desligar: (() => void) | undefined
  let quadros: number

  beforeEach(() => {
    quadros = 0
    document.body.className = 'animations-on'
    document.body.innerHTML =
      '<main><div class="px-tela"><button class="q-tile">Jogar</button></div></main><aside></aside>'
    html.dataset.px = 'on'
    html.dataset.theme = 'babel'
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
    /* O canvas do jsdom não desenha: a cena tem de aguentar sem contexto. */
    HTMLCanvasElement.prototype.getContext = (() => null) as never
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => {
      quadros++
      return setTimeout(() => f(performance.now()), 4) as unknown as number
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => clearTimeout(id))
  })
  afterEach(() => {
    desligar?.()
    desligar = undefined
    vi.restoreAllMocks()
    delete html.dataset.px
    delete html.dataset.theme
  })

  it('fora do tema não monta nada nem pede quadro', async () => {
    desligar = instalarAgua()
    await vez(40)
    expect(cena()).toBeNull()
    expect(quadros).toBe(0)
  })

  it('no tema, a cena entra atrás do conteúdo e a frente por cima, com a marcação do protótipo', async () => {
    desligar = instalarAgua()
    html.dataset.theme = 'agua'
    await ate(() => !!cena())
    const main = document.querySelector('main')!
    expect(main.firstElementChild).toBe(cena())
    expect(main.lastElementChild?.className).toBe('ag-frente')
    /* a medida escreve `width` e `height` nos dois canvas; a marcação é a de antes dela */
    const semMedida = cena()!.outerHTML.replace(/ (width|height)="\d+"/g, '')
    expect(semMedida).toBe(
      '<div class="ag-cena" aria-hidden="true"><div class="ag-raios"><i></i><i></i></div><div class="ag-caustica a"><i></i></div><div class="ag-caustica b"><i></i></div><canvas class="ag-bolhas"></canvas><canvas class="ag-mar"></canvas></div>',
    )
    expect(main.lastElementChild!.outerHTML).toBe(
      '<div class="ag-frente" aria-hidden="true"><div class="ag-brilho"></div></div>',
    )
    /* a marcação é a que está no protótipo aprovado */
    const proto = readFileSync(path.join(raiz, 'docs/prototipos/polimento-movimento.html'), 'utf8')
    expect(proto).toContain(semMedida)
    expect(proto).toContain(main.lastElementChild!.outerHTML)
    await vez(30)
    expect(quadros).toBeGreaterThan(1)
  })

  it('já no tema ao instalar (equipado desde o arranque), a cena monta sozinha', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    expect(cena()).not.toBeNull()
  })

  it('sair do tema tira a cena inteira e para o laço', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    html.dataset.theme = 'babel'
    await ate(() => !cena())
    expect(document.querySelector('.ag-cena, .ag-frente, .ag-onda')).toBeNull()
    await vez(20)
    const parado = quadros
    await vez(40)
    expect(quadros).toBe(parado)
  })

  it('com a camada desligada (animações desligadas, Modo desempenho) fica só a paleta', async () => {
    html.dataset.theme = 'agua'
    html.dataset.px = 'off'
    desligar = instalarAgua()
    await vez(40)
    expect(cena()).toBeNull()
    html.dataset.px = 'on'
    await ate(() => !!cena())
    expect(cena()).not.toBeNull()
    html.dataset.px = 'off'
    await ate(() => !cena())
    expect(cena()).toBeNull()
    expect(html.dataset.theme).toBe('agua')
  })

  it('trocar de tema e voltar depressa deixa uma cena só', async () => {
    desligar = instalarAgua()
    html.dataset.theme = 'agua'
    await vez(0)
    html.dataset.theme = 'babel'
    await vez(0)
    html.dataset.theme = 'agua'
    await ate(() => !!cena())
    await vez(30)
    expect(document.querySelectorAll('.ag-cena')).toHaveLength(1)
    expect(document.querySelectorAll('.ag-frente')).toHaveLength(1)
  })

  it('desligar a instalação tira a cena e deixa de observar o tema', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    desligar()
    desligar = undefined
    expect(cena()).toBeNull()
    html.dataset.theme = 'babel'
    html.dataset.theme = 'agua'
    await vez(40)
    expect(cena()).toBeNull()
  })

  it('o toque dentro do conteúdo faz uma onda de três anéis no ponto tocado, que sai em 2,4 s', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const toque = new MouseEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 80 })
    document.querySelector('.q-tile')!.dispatchEvent(toque)
    const onda = document.querySelector<HTMLElement>('.ag-frente > i.ag-onda')
    expect(onda).not.toBeNull()
    expect([onda!.style.left, onda!.style.top]).toEqual(['120px', '80px'])
    /* o terceiro anel é o `<b>`; os outros dois são `::before` e `::after` (`agua.css:80-87`) */
    expect(onda!.innerHTML).toBe('<b></b>')
    vi.advanceTimersByTime(2399)
    expect(document.querySelector('.ag-onda')).not.toBeNull()
    vi.advanceTimersByTime(2)
    expect(document.querySelector('.ag-onda')).toBeNull()
    vi.useRealTimers()
  })

  it('fora do `<main>` o toque não faz onda (`agua.js:226`)', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    document.querySelector('aside')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(document.querySelector('.ag-onda')).toBeNull()
  })

  it('com menos movimento o toque não faz onda (`agua.js:226`)', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    /* `reduz()` de `base.ts`: o sistema pediu menos movimento, ou o Modo desempenho está ligado */
    document.body.className = 'performance-mode'
    document.querySelector('.q-tile')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(document.querySelector('.ag-onda')).toBeNull()
  })

  it('com a aba escondida o laço para, e retoma quando ela volta', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    await vez(20)
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await vez(20)
    const parado = quadros
    await vez(40)
    expect(quadros).toBe(parado)
    oculto.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vez(30)
    expect(quadros).toBeGreaterThan(parado)
  })

  it('se o React trocar o `<main>`, a cena volta para o que está no documento', async () => {
    html.dataset.theme = 'agua'
    desligar = instalarAgua()
    await ate(() => !!cena())
    document.querySelector('main')!.remove()
    document.body.insertAdjacentHTML('afterbegin', '<main id="novo"><div class="px-tela"></div></main>')
    await ate(() => !!document.querySelector('#novo > .ag-cena'))
    expect(document.querySelectorAll('.ag-cena')).toHaveLength(1)
    expect(document.querySelector('#novo > .ag-frente')).not.toBeNull()
  })
})

describe('o código da cena só vem com o tema', () => {
  const arquivos = (pasta: string): string[] =>
    readdirSync(pasta).flatMap((n) => {
      const f = path.join(pasta, n)
      return statSync(f).isDirectory() ? arquivos(f) : /\.tsx?$/.test(n) ? [f] : []
    })

  it('ninguém importa `aguaCena` de forma estática: só `agua.ts`, por `import()`', () => {
    const quem = arquivos(path.join(raiz, 'src')).filter((f) => /aguaCena['"]/.test(readFileSync(f, 'utf8')))
    expect(quem.map((f) => path.relative(raiz, f).replace(/\\/g, '/'))).toEqual(['src/lib/polimento/agua.ts'])
    const porteiro = readFileSync(path.join(raiz, 'src/lib/polimento/agua.ts'), 'utf8')
    expect(porteiro).toMatch(/import\('\.\/aguaCena'\)/)
    expect(porteiro).not.toMatch(/from '\.\/aguaCena'/)
  })

  it('o porteiro não tem laço: nada de `requestAnimationFrame` nem de temporizador fora do tema', () => {
    const porteiro = readFileSync(path.join(raiz, 'src/lib/polimento/agua.ts'), 'utf8')
    expect(porteiro).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/)
  })
})

describe('o mergulho: som e vibração de EQUIPAR a Água (`agua.js:276`)', () => {
  beforeEach(() => {
    sentir.mockClear()
    localStorage.clear()
    html.dataset.theme = 'babel'
  })
  afterEach(() => {
    delete html.dataset.theme
  })

  it('equipar a Água mergulha uma vez', async () => {
    persistTheme({ theme: 'agua' })
    await vez(20)
    expect(html.dataset.theme).toBe('agua')
    expect(sentir.mock.calls).toEqual([['mergulho']])
  })

  it('a prova do Personalizar (`applyTheme`) pinta o tema e não mergulha', async () => {
    applyTheme('agua')
    await vez(20)
    expect(html.dataset.theme).toBe('agua')
    expect(sentir).not.toHaveBeenCalled()
  })

  it('equipar depois de provar mergulha (o tema guardado ainda era outro)', async () => {
    applyTheme('agua')
    persistTheme({ theme: 'agua' })
    await vez(20)
    expect(sentir.mock.calls).toEqual([['mergulho']])
  })

  it('gravar de novo a Água que já está equipada não repete', async () => {
    localStorage.setItem(THEME_KEY, 'agua')
    persistTheme({ theme: 'agua' })
    await vez(20)
    expect(sentir).not.toHaveBeenCalled()
  })

  it('equipar outro tema, ou mexer só no claro e escuro, não mergulha', async () => {
    persistTheme({ theme: 'jardim' })
    localStorage.setItem(THEME_KEY, 'agua')
    persistTheme({ darkMode: true })
    await vez(20)
    expect(sentir).not.toHaveBeenCalled()
  })
})
