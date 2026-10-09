// @vitest-environment jsdom
/**
 * OS SENTIDOS DA CAMADA DE POLIMENTO (`src/lib/polimento/sentidos.ts`), porte de `sentidos.js`.
 *
 * Som não aparece no comparador de telas: o que trava a fidelidade é este arquivo. As tabelas abaixo
 * foram copiadas À MÃO do protótipo (`sentidos.js:66-90`, `jogos.js:46-55`, `agua.js:256-257`), e cada
 * teste confere, num `AudioContext` de mentira que anota tudo, que o app pede exatamente aquilo:
 * osciladores, frequências, ganhos e tempos. Ninguém ouviu som nenhum aqui.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ponteiro = vi.hoisted(() => ({ chamadas: [] as Array<[number, number]> }))
vi.mock('../src/lib/polimento/ponteiro', () => ({
  moverPonteiro: (x: number, y: number) => void ponteiro.chamadas.push([x, y]),
}))

import { EVENTO_DA_JOGADA } from '../src/lib/comemoracao/intensidade'
import {
  abaAVista,
  instalarSentidos,
  type Sentido,
  sentir,
  somSegurar,
  TATO,
  vibrar,
  zerarSentidosParaTeste,
} from '../src/lib/polimento/sentidos'
import { play, setSoundMuted } from '../src/lib/soundFx'

/* ---- O AudioContext de mentira: anota o que foi pedido -------------------------------------------- */

type Passo = [string, ...number[]]
class Param {
  value = 0
  passos: Passo[] = []
  setValueAtTime(v: number, t: number) {
    this.passos.push(['fixa', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.passos.push(['rampa', v, t])
  }
  cancelScheduledValues(t: number) {
    this.passos.push(['cancela', t])
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.passos.push(['alvo', v, t, c])
  }
}
class No {
  saidas: unknown[] = []
  connect<T>(x: T): T {
    this.saidas.push(x)
    return x
  }
}
class Oscilador extends No {
  type = 'sine'
  frequency = new Param()
  inicio: number | undefined
  fim: number | undefined
  constructor(private ctx: Contexto) {
    super()
  }
  start(t?: number) {
    this.inicio = t ?? this.ctx.currentTime
  }
  stop(t?: number) {
    this.fim = t ?? this.ctx.currentTime
  }
}
class Ganho extends No {
  gain = new Param()
}
class Filtro extends No {
  type = ''
  Q = new Param()
  frequency = new Param()
}
class Fonte extends No {
  buffer: { length: number } | null = null
  inicio: number | undefined
  start(t: number) {
    this.inicio = t
  }
}
class Contexto {
  static todos: Contexto[] = []
  currentTime = 10
  sampleRate = 1000
  state = 'running'
  destination = { nome: 'destino' }
  osciladores: Oscilador[] = []
  ganhos: Ganho[] = []
  filtros: Filtro[] = []
  fontes: Fonte[] = []
  compressores: No[] = []
  constructor() {
    Contexto.todos.push(this)
  }
  createOscillator() {
    const o = new Oscilador(this)
    this.osciladores.push(o)
    return o
  }
  createGain() {
    const g = new Ganho()
    this.ganhos.push(g)
    return g
  }
  createBiquadFilter() {
    const f = new Filtro()
    this.filtros.push(f)
    return f
  }
  createBufferSource() {
    const s = new Fonte()
    this.fontes.push(s)
    return s
  }
  createDynamicsCompressor() {
    const c = new No()
    this.compressores.push(c)
    return c
  }
  createBuffer(_canais: number, n: number) {
    return { length: n, getChannelData: () => new Float32Array(n) }
  }
  resume() {
    return Promise.resolve()
  }
}

/** O contexto do protótipo é o único com compressor; o do kit de sempre liga direto no destino. */
const doProtótipo = () => Contexto.todos.filter((c) => c.compressores.length)
const meu = () => doProtótipo().at(-1)
const osciladoresDoKit = () =>
  Contexto.todos.filter((c) => !c.compressores.length).reduce((n, c) => n + c.osciladores.length, 0)
const osciladoresMeus = () => doProtótipo().reduce((n, c) => n + c.osciladores.length, 0)

const r = (v: number) => Math.round(v * 10000) / 10000

interface Nota {
  f: number
  t?: number
  d?: number
  tipo?: string
  g?: number
  f2?: number | null
}
interface Sopro {
  d: number
  g?: number
  de?: number
  ate?: number
  t?: number
}

/** O que o app pediu, lido de volta na forma de `nota(f, {t, d, tipo, g, f2})`. */
function notasTocadas(c: Contexto) {
  return c.osciladores.map((o) => {
    const v = o.saidas[0] as Ganho
    const [, f, t0] = o.frequency.passos[0]
    const rampa = o.frequency.passos.find((p) => p[0] === 'rampa')
    const [, , tAtaque] = v.gain.passos[1]
    const [, g] = v.gain.passos[1]
    const [, piso, tFim] = v.gain.passos[2]
    expect(v.gain.passos[0]).toEqual(['fixa', 0.0001, t0]) /* o ganho parte de 0,0001 */
    expect(r(tAtaque - t0)).toBe(0.006) /* ataque de 6 ms */
    expect(piso).toBe(0.0001)
    expect(r((o.fim ?? 0) - tFim)).toBe(0.02) /* para 20 ms depois do fim */
    expect(o.inicio).toBe(t0)
    expect(v.saidas[0]).toBe(c.ganhos[0]) /* tudo passa pelo ganho mestre */
    if (rampa) expect(r(rampa[2])).toBe(r(tFim)) /* a frequência desliza durante a nota inteira */
    return { f, t: r(t0 - c.currentTime), d: r(tFim - t0), tipo: o.type, g, f2: rampa ? rampa[1] : null }
  })
}
/** Idem para `sopro(d, {g, de, ate, t})`. */
function soprosTocados(c: Contexto) {
  return c.fontes.map((s) => {
    const filtro = s.saidas[0] as Filtro
    const v = filtro.saidas[0] as Ganho
    const t0 = s.inicio ?? 0
    const d = (s.buffer?.length ?? 0) / c.sampleRate
    expect(filtro.type).toBe('bandpass')
    expect(filtro.Q.value).toBe(1.2)
    expect(filtro.frequency.passos[0][2]).toBe(t0)
    expect(r(filtro.frequency.passos[1][2] - t0)).toBe(r(d))
    expect(v.gain.passos[0]).toEqual(['fixa', 0.0001, t0])
    expect(r(v.gain.passos[1][2] - t0)).toBe(r(d * 0.3)) /* o pico vem a 30% */
    expect(v.gain.passos[2][1]).toBe(0.0001)
    expect(r(v.gain.passos[2][2] - t0)).toBe(r(d))
    expect(v.saidas[0]).toBe(c.ganhos[0])
    return {
      d: r(d),
      g: v.gain.passos[1][1],
      de: filtro.frequency.passos[0][1],
      ate: filtro.frequency.passos[1][1],
      t: r(t0 - c.currentTime),
    }
  })
}
const nota = (n: Nota) => ({
  f: n.f,
  t: n.t ?? 0,
  d: n.d ?? 0.12,
  tipo: n.tipo ?? 'sine',
  g: n.g ?? 0.12,
  f2: n.f2 ?? null,
})
const sopro = (s: Sopro) => ({ d: s.d, g: s.g ?? 0.06, de: s.de ?? 400, ate: s.ate ?? 2400, t: s.t ?? 0 })
const arpejo = (fs: number[], passo: number, resto: Omit<Nota, 'f' | 't'>) =>
  fs.map((f, i) => ({ f, t: r(i * passo), ...resto }))

/* ---- A tabela do protótipo, copiada à mão ---------------------------------------------------------- */

const SONS: Record<string, { notas: Nota[]; sopros?: Sopro[] }> = {
  /* `sentidos.js:67-84` */
  toque: { notas: [{ f: 1700, d: 0.028, g: 0.035, tipo: 'triangle' }] },
  nav: { notas: [{ f: 520, d: 0.09, g: 0.1, f2: 780 }] },
  aba: { notas: [{ f: 700, d: 0.06, g: 0.08, f2: 940 }] },
  abre: { notas: [{ f: 330, d: 0.2, g: 0.07, f2: 660 }], sopros: [{ d: 0.22, de: 400, ate: 2600 }] },
  fecha: { notas: [{ f: 620, d: 0.13, g: 0.05, f2: 310 }], sopros: [{ d: 0.16, de: 2200, ate: 320, g: 0.05 }] },
  aviso: {
    notas: [
      { f: 880, d: 0.12, g: 0.08 },
      { f: 1320, t: 0.07, d: 0.18, g: 0.06 },
    ],
  },
  sucesso: { notas: arpejo([523, 659, 784, 1047], 0.075, { d: 0.24, g: 0.1, tipo: 'triangle' }) },
  erro: {
    notas: [
      { f: 196, d: 0.16, g: 0.12, tipo: 'square', f2: 150 },
      { f: 150, t: 0.12, d: 0.18, g: 0.1, tipo: 'square', f2: 120 },
    ],
  },
  vira: { notas: [{ f: 420, d: 0.05, g: 0.04, f2: 640 }], sopros: [{ d: 0.09, de: 1200, ate: 3400, g: 0.05 }] },
  acerto: { notas: arpejo([659, 988, 1319], 0.07, { d: 0.22, g: 0.1, tipo: 'triangle' }) },
  moeda: { notas: arpejo([1318, 1760, 2093], 0.055, { d: 0.16, g: 0.06, tipo: 'triangle' }) },
  liga: { notas: [{ f: 660, d: 0.07, g: 0.08, f2: 990 }] },
  desliga: { notas: [{ f: 660, d: 0.07, g: 0.07, f2: 440 }] },
  grava: {
    notas: [
      { f: 440, d: 0.09, g: 0.09 },
      { f: 660, t: 0.09, d: 0.12, g: 0.09 },
    ],
  },
  chega: {
    notas: [
      { f: 784, d: 0.1, g: 0.08 },
      { f: 1175, t: 0.08, d: 0.16, g: 0.07 },
    ],
  },
  fala: { notas: [{ f: 1250, d: 0.03, g: 0.025 }] },
  festa: {
    notas: arpejo([523, 659, 784, 1047, 1319, 1568], 0.06, { d: 0.3, g: 0.09, tipo: 'triangle' }),
    sopros: [{ d: 0.6, de: 3000, ate: 9000, g: 0.04, t: 0.2 }],
  },
  onda: { notas: [{ f: 220, d: 0.5, g: 0.04, f2: 440 }], sopros: [{ d: 0.55, de: 300, ate: 3200, g: 0.05 }] },
  /* `jogos.js:46-53` (o `tecla` tem sorteio e é conferido à parte) */
  tique: { notas: [{ f: 1040, d: 0.04, g: 0.05, tipo: 'square' }] },
  conta: { notas: [{ f: 520, d: 0.14, g: 0.1, tipo: 'triangle' }] },
  vai: {
    notas: [
      { f: 784, d: 0.3, g: 0.1, tipo: 'triangle' },
      { f: 1175, d: 0.3, g: 0.08, tipo: 'triangle' },
    ],
  },
  encaixa: { notas: [{ f: 560, d: 0.07, g: 0.08, f2: 840, tipo: 'triangle' }] },
  solta: { notas: [{ f: 700, d: 0.06, g: 0.06, f2: 460, tipo: 'triangle' }] },
  quique: { notas: [{ f: 240, d: 0.1, g: 0.11, f2: 520 }] },
  sobe: { notas: arpejo([392, 523, 659, 784], 0.06, { d: 0.18, g: 0.09, tipo: 'triangle' }) },
  /* `agua.js:256` */
  mergulho: {
    notas: [
      { f: 520, d: 0.5, g: 0.05, f2: 130 },
      { f: 1300, t: 0.25, d: 0.08, g: 0.03, f2: 780 },
      { f: 1700, t: 0.34, d: 0.08, g: 0.03, f2: 1020 },
      { f: 2100, t: 0.43, d: 0.08, g: 0.03, f2: 1260 },
    ],
    sopros: [{ d: 0.7, de: 2600, ate: 220, g: 0.07 }],
  },
}
const OS_18 = [
  'toque', 'nav', 'aba', 'abre', 'fecha', 'aviso', 'sucesso', 'erro', 'vira', 'acerto', 'moeda', 'liga', 'desliga',
  'grava', 'chega', 'fala', 'festa', 'onda',
] /* prettier-ignore */

/* `sentidos.js:87-90`, `jogos.js:55`, `agua.js:257` */
const VIBRA: Record<string, number | number[] | undefined> = {
  toque: 6,
  nav: 8,
  aba: 6,
  abre: 10,
  fecha: 6,
  aviso: [8, 40, 8],
  sucesso: [10, 50, 10, 50, 18],
  erro: [30, 40, 30],
  vira: 8,
  acerto: [10, 30, 16],
  moeda: [8, 30, 8],
  liga: 10,
  desliga: 8,
  grava: 14,
  chega: 10,
  fala: undefined,
  festa: [15, 40, 15, 40, 30],
  onda: 12,
  tique: 5,
  conta: 10,
  vai: 22,
  tecla: 5,
  encaixa: 8,
  solta: 6,
  quique: 12,
  sobe: [10, 30, 10, 30, 20],
  mergulho: [14, 50, 8, 30, 6],
}

/* ---- Bancada -------------------------------------------------------------------------------------- */

let agora = 0
let vibra: ReturnType<typeof vi.fn>
let quadros: Array<() => void> = []
let noCelular = false
let desligar: (() => void) | undefined
const vez = () => new Promise<void>((ok) => setTimeout(ok, 0))
const passar = (ms: number) => (agora += ms)
const rodarQuadros = () => {
  const fila = quadros
  quadros = []
  fila.forEach((f) => f())
}
const apertar = (el: Element, x = 0, y = 0) =>
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }))
const soltar = (el: Element, x = 0, y = 0) =>
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y }))
/** O nome do som que acabou de tocar, reconhecido pela tabela do protótipo. */
function tocou(): string[] {
  const c = meu()
  if (!c) return []
  const notas = JSON.stringify(notasTocadas(c))
  const sopros = JSON.stringify(soprosTocados(c))
  return Object.keys(SONS).filter(
    (n) =>
      JSON.stringify(SONS[n].notas.map(nota)) === notas && JSON.stringify((SONS[n].sopros ?? []).map(sopro)) === sopros,
  )
}
/** Esvazia o que foi anotado, para o próximo gesto ser lido sozinho. */
function limparAnotado() {
  for (const c of Contexto.todos) {
    c.osciladores = []
    c.fontes = []
    c.filtros = []
    c.ganhos = c.ganhos.slice(0, c.compressores.length ? 1 : 0)
  }
  vibra.mockClear()
}

beforeEach(() => {
  agora = 100_000
  quadros = []
  noCelular = false
  ponteiro.chamadas = []
  vi.spyOn(performance, 'now').mockImplementation(() => agora)
  vi.stubGlobal('AudioContext', Contexto)
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => quadros.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.matchMedia = ((q: string) => ({
    matches: noCelular && q.includes('max-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as never
  vibra = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', { value: vibra, configurable: true, writable: true })
  localStorage.clear()
  setSoundMuted(false)
  zerarSentidosParaTeste()
  for (const c of Contexto.todos) {
    c.osciladores = []
    c.fontes = []
  }
  document.documentElement.dataset.px = 'on'
  delete document.documentElement.dataset.theme
  document.body.className = 'animations-on'
  document.body.innerHTML = ''
})

afterEach(() => {
  desligar?.()
  desligar = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/* ---- O motor -------------------------------------------------------------------------------------- */

describe('o motor de som (`sentidos.js:14-64`)', () => {
  it('um contexto só: ganho mestre 0,55 → compressor → destino', () => {
    sentir('nav')
    passar(1000)
    sentir('erro')
    expect(doProtótipo()).toHaveLength(1)
    const c = meu()!
    expect(c.ganhos[0].gain.value).toBe(0.55)
    expect(c.ganhos[0].saidas).toEqual([c.compressores[0]])
    expect(c.compressores[0].saidas).toEqual([c.destination])
  })

  it('retoma o contexto que o navegador suspendeu', () => {
    sentir('nav')
    const c = meu()!
    c.state = 'suspended'
    const retomar = vi.spyOn(c, 'resume')
    passar(1000)
    sentir('nav')
    expect(retomar).toHaveBeenCalledTimes(1)
  })
})

/* ---- Os sons, um por um --------------------------------------------------------------------------- */

describe('os 18 sons do protótipo, com os parâmetros de lá (`sentidos.js:66-85`)', () => {
  it('são dezoito', () => expect(OS_18).toHaveLength(18))

  it.each(OS_18)('%s', (nome) => {
    sentir(nome as Sentido)
    const c = meu()!
    expect(notasTocadas(c)).toEqual(SONS[nome].notas.map(nota))
    expect(soprosTocados(c)).toEqual((SONS[nome].sopros ?? []).map(sopro))
  })
})

describe('os sons de jogo e o do tema Água (`jogos.js:46-53`, `agua.js:254-256`)', () => {
  it.each(['tique', 'conta', 'vai', 'encaixa', 'solta', 'quique', 'sobe', 'mergulho'])('%s', (nome) => {
    sentir(nome as Sentido)
    const c = meu()!
    expect(notasTocadas(c)).toEqual(SONS[nome].notas.map(nota))
    expect(soprosTocados(c)).toEqual((SONS[nome].sopros ?? []).map(sopro))
  })

  it('tecla: 820 + sorteio·260 Hz, triangle, d 0,03, g 0,04', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    sentir('tecla')
    expect(notasTocadas(meu()!)).toEqual([nota({ f: 950, d: 0.03, g: 0.04, tipo: 'triangle' })])
  })

  it('no tema Água o toque vira gota: 1500 + sorteio·300 → 620 Hz e um brilho em 2400 Hz', () => {
    document.documentElement.dataset.theme = 'agua'
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    sentir('toque')
    expect(notasTocadas(meu()!)).toEqual([
      nota({ f: 1650, d: 0.07, g: 0.045, f2: 620 }),
      nota({ f: 2400, t: 0.03, d: 0.04, g: 0.018 }),
    ])
  })
})

/* ---- As vibrações --------------------------------------------------------------------------------- */

describe('a vibração de cada nome (`sentidos.js:87-90`, `jogos.js:55`, `agua.js:257`)', () => {
  it('a tabela do app é a do protótipo, nome por nome', () => {
    const doApp = Object.fromEntries(Object.entries(TATO).map(([k, v]) => [k, typeof v === 'number' ? v : [...v!]]))
    const doProto = Object.fromEntries(Object.entries(VIBRA).filter(([, v]) => v !== undefined))
    expect(doApp).toEqual(doProto)
  })

  it.each(Object.keys(VIBRA))('%s', (nome) => {
    sentir(nome as Sentido)
    if (VIBRA[nome] === undefined) expect(vibra).not.toHaveBeenCalled()
    else {
      expect(vibra).toHaveBeenCalledTimes(1)
      expect(vibra).toHaveBeenCalledWith(VIBRA[nome])
    }
  })

  it('sem `navigator.vibrate` (iPhone) o interruptor escondido leva o toque, menos em `toque` e `fala`', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true })
    desligar = instalarSentidos()
    const rotulo = document.querySelector<HTMLElement>('label.px-tato-ios')!
    expect(rotulo.getAttribute('aria-hidden')).toBe('true')
    const caixa = rotulo.querySelector('input')!
    expect([caixa.type, caixa.hasAttribute('switch'), caixa.tabIndex]).toEqual(['checkbox', true, -1])
    const clique = vi.spyOn(rotulo, 'click')
    sentir('toque')
    passar(1000)
    sentir('fala')
    expect(clique).not.toHaveBeenCalled()
    passar(1000)
    sentir('nav')
    passar(1000)
    sentir('acerto')
    expect(clique).toHaveBeenCalledTimes(2)
  })
})

/* ---- As regras de `sentir` ------------------------------------------------------------------------ */

describe('as regras de `sentir` (`sentidos.js:94-111`)', () => {
  it.each(['toque', 'aviso', 'fala'])(
    'o som fraco `%s` some (som e vibração) até 160 ms depois de um som forte',
    (fraco) => {
      sentir('nav')
      limparAnotado()
      passar(159)
      sentir(fraco as Sentido)
      expect(osciladoresMeus()).toBe(0)
      expect(vibra).not.toHaveBeenCalled()
      passar(1)
      sentir(fraco as Sentido)
      expect(tocou()).toEqual([fraco])
    },
  )

  it('um som fraco não cala o fraco seguinte, e o forte nunca é calado', () => {
    sentir('toque')
    limparAnotado()
    passar(50)
    sentir('aviso')
    expect(tocou()).toEqual(['aviso'])
    limparAnotado()
    passar(1)
    sentir('erro')
    expect(tocou()).toEqual(['erro'])
  })

  it('só com a camada ligada: sem `data-px="on"` não sai som nem vibração', () => {
    document.documentElement.dataset.px = 'off'
    sentir('sucesso')
    expect(Contexto.todos.filter((c) => c.osciladores.length)).toHaveLength(0)
    expect(vibra).not.toHaveBeenCalled()
  })

  it('com a camada desligada o ponto volta ao som de sempre do app', () => {
    document.documentElement.dataset.px = 'off'
    sentir('tecla', 'click')
    expect(osciladoresDoKit()).toBe(1)
    expect(osciladoresMeus()).toBe(0)
  })

  it('"Som dos toques" desligado cala o som e deixa a vibração', () => {
    setSoundMuted(true)
    sentir('acerto')
    expect(osciladoresMeus()).toBe(0)
    expect(vibra).toHaveBeenCalledWith([10, 30, 16])
  })

  it('a chave guardada `babel.sound_enabled` também cala', () => {
    localStorage.setItem('babel.sound_enabled', 'false')
    sentir('acerto')
    expect(osciladoresMeus()).toBe(0)
  })

  it('"Vibração" desligada (`babel.vibracao`) tira a vibração e deixa o som', () => {
    localStorage.setItem('babel.vibracao', 'nao')
    sentir('acerto')
    vibrar([10, 40, 16])
    expect(vibra).not.toHaveBeenCalled()
    expect(tocou()).toEqual(['acerto'])
  })

  it('quem pediu menos movimento ouve o som e não sente a vibração', () => {
    document.body.className = ''
    window.matchMedia = (() => ({ matches: true })) as never
    sentir('acerto')
    expect(vibra).not.toHaveBeenCalled()
    expect(tocou()).toEqual(['acerto'])
  })

  it('as vibrações diretas do protótipo passam pelo interruptor e chegam iguais', () => {
    vibrar([12, 60, 12])
    expect(vibra).toHaveBeenCalledWith([12, 60, 12])
  })

  it('o mesmo som pedido duas vezes no mesmo instante toca uma vez', () => {
    sentir('erro')
    sentir('erro')
    expect(tocou()).toEqual(['erro'])
  })
})

/* ---- Segurar para comprar ------------------------------------------------------------------------- */

describe('o tom de segurar (`sentidos.js:113-130`)', () => {
  it('triangle, 280 → 980 Hz em 1,1 s; ganho até 0,06 em 50 ms; ao soltar some em 0,1 s', () => {
    const calar = somSegurar()
    const c = meu()!
    const o = c.osciladores[0]
    const v = o.saidas[0] as Ganho
    expect(o.type).toBe('triangle')
    expect(o.frequency.passos).toEqual([
      ['fixa', 280, 10],
      ['rampa', 980, 11.1],
    ])
    expect(v.gain.passos).toEqual([
      ['fixa', 0.0001, 10],
      ['rampa', 0.06, 10.05],
    ])
    expect(v.saidas[0]).toBe(c.ganhos[0])
    expect(o.inicio).toBe(10)
    expect(o.fim).toBeUndefined()
    c.currentTime = 10.4
    calar()
    expect(v.gain.passos.slice(2)).toEqual([
      ['cancela', 10.4],
      ['alvo', 0.0001, 10.4, 0.02],
    ])
    expect(o.fim).toBe(10.5)
    calar() /* soltar duas vezes não para o oscilador de novo */
    expect(v.gain.passos).toHaveLength(4)
  })

  it('fica mudo com o som desligado ou a camada desligada', () => {
    setSoundMuted(true)
    somSegurar()()
    setSoundMuted(false)
    document.documentElement.dataset.px = 'off'
    somSegurar()()
    expect(osciladoresMeus()).toBe(0)
  })
})

/* ---- Quem dispara o quê --------------------------------------------------------------------------- */

const CASCA = `<div class="q-casca">
  <nav class="q-trilho"><button class="q-item" data-px-rota="inicio" aria-current="page">Início</button><button class="q-item" data-px-rota="jogar">Jogar</button></nav>
  <main><div class="px-tela"><div class="q-palco">
    <div class="q-abas qe-abas"><button class="q-aba" role="tab" aria-selected="true">Resumo</button><button class="q-aba" role="tab" aria-selected="false">Semana</button><button class="q-aba" role="tab" aria-selected="false">Palavras</button></div>
    <div class="q-abas q-seg"><button class="q-aba" aria-checked="true">A</button><button class="q-aba" aria-checked="false">B</button></div>
    <button class="q-ctl" id="comum"><svg id="icone"></svg>Abrir</button>
    <button class="q-ctl" id="parado" disabled>Parado</button>
    <button class="q-interruptor" id="desligado" role="switch" aria-checked="false"></button>
    <button class="q-interruptor" id="ligado" aria-checked="true"></button>
    <button class="carta" id="carta"></button>
    <button id="comprar" data-px-comprar="x"></button>
    <details><summary id="resumo">Pergunta</summary></details>
    <a id="elo" href="#x">elo</a>
    <div id="nada">texto</div>
  </div></div></main>
  <div class="toast" role="status"></div>
</div>`
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!

describe('quem dispara o quê (`sentidos.js:138-174`)', () => {
  beforeEach(() => {
    document.body.innerHTML = CASCA
    desligar = instalarSentidos()
    limparAnotado()
  })

  it.each([
    ['#comum', 'toque'],
    ['#icone', 'toque'] /* o alvo é o ícone de dentro do botão */,
    ['.qe-abas .q-aba', 'toque'],
    ['#resumo', 'toque'],
    ['#elo', 'toque'],
    ['#desligado', 'liga'],
    ['#ligado', 'desliga'],
  ])('apertar %s → %s', (seletor, som) => {
    apertar($(seletor))
    expect(tocou()).toEqual([som])
    expect(vibra).toHaveBeenCalledWith(VIBRA[som])
  })

  it.each(['#parado', '#carta', '#comprar', '.q-item', '#nada'])('apertar %s não toca nada', (seletor) => {
    apertar($(seletor))
    expect(osciladoresMeus()).toBe(0)
    expect(vibra).not.toHaveBeenCalled()
  })

  it('com a camada desligada apertar não toca nada daqui', () => {
    document.documentElement.dataset.px = 'off'
    apertar($('#comum'))
    expect(Contexto.todos.filter((c) => c.osciladores.length)).toHaveLength(0)
  })

  it('escolher outra aba primária → aba; a que já está escolhida e a aba local não', () => {
    passar(1000)
    $('.qe-abas .q-aba[aria-selected="true"]').click()
    $('.q-seg .q-aba[aria-checked="false"]').click()
    expect(osciladoresMeus()).toBe(0)
    $('.qe-abas .q-aba[aria-selected="false"]').click()
    expect(tocou()).toEqual(['aba'])
    expect(vibra).toHaveBeenCalledWith(6)
  })

  it('o painel "Mais" que entra → abre; que sai → fecha; o fantasma da saída não conta', async () => {
    passar(1000)
    const painel = document.createElement('div')
    painel.className = 'q-mais-fundo'
    document.body.append(painel)
    await vez()
    expect(tocou()).toEqual(['abre'])
    limparAnotado()
    passar(1000)
    painel.remove()
    /* `folha.ts` devolve o painel ao documento só para a animação de saída. */
    painel.classList.add('px-saindo')
    document.body.append(painel)
    await vez()
    expect(tocou()).toEqual(['fecha'])
    limparAnotado()
    passar(1000)
    painel.remove()
    await vez()
    expect(osciladoresMeus()).toBe(0)
  })

  it('o diálogo que abre → abre; que fecha → fecha; reaberto só para sair não conta', async () => {
    passar(1000)
    const d = document.createElement('dialog')
    document.body.append(d)
    await vez()
    expect(osciladoresMeus()).toBe(0)
    d.setAttribute('open', '')
    await vez()
    expect(tocou()).toEqual(['abre'])
    limparAnotado()
    passar(1000)
    /* O app fecha; `dialogos.ts` reabre no mesmo passo, escondido, só para a saída. */
    d.removeAttribute('open')
    d.setAttribute('open', '')
    d.setAttribute('aria-hidden', 'true')
    await vez()
    expect(tocou()).toEqual(['fecha'])
    limparAnotado()
    passar(1000)
    d.removeAttribute('aria-hidden')
    d.removeAttribute('open')
    await vez()
    expect(osciladoresMeus()).toBe(0)
  })

  it('o diálogo que já chega aberto → abre; tirado do documento ainda aberto → fecha', async () => {
    passar(1000)
    const caixa = document.createElement('div')
    caixa.innerHTML = '<dialog class="paleta-cmd" open></dialog>'
    document.body.append(caixa)
    await vez()
    expect(tocou()).toEqual(['abre'])
    limparAnotado()
    passar(1000)
    caixa.remove()
    await vez()
    expect(tocou()).toEqual(['fecha'])
  })

  it('o aviso (toast) que aparece → aviso', async () => {
    passar(1000)
    $('.toast').innerHTML = '<span>Palavra guardada</span>'
    await vez()
    expect(tocou()).toEqual(['aviso'])
    expect(vibra).toHaveBeenCalledWith([8, 40, 8])
  })

  it('a tela nova que chega por clique → nav; pelo teclado, não', async () => {
    passar(1000)
    apertar($('.q-item[data-px-rota="jogar"]'))
    passar(150) /* a saída da tela de antes */
    $('.px-tela').innerHTML = '<div class="q-palco"><h1>Jogar</h1></div>'
    await vez()
    expect(tocou()).toEqual(['nav'])
    expect(vibra).toHaveBeenCalledWith(8)
    limparAnotado()
    passar(1000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    $('.px-tela').innerHTML = '<div class="q-palco"><h1>Início</h1></div>'
    await vez()
    expect(osciladoresMeus()).toBe(0)
  })

  it('o "carregando" e o conteúdo de um diálogo não são tela nova', async () => {
    passar(1000)
    apertar($('#nada'))
    $('.px-tela').insertAdjacentHTML('beforeend', '<div class="carregando-da-tela"></div><i class="px-luz"></i>')
    await vez()
    expect(osciladoresMeus()).toBe(0)
  })

  it('a troca de aba primária que monta um palco novo soa como aba, não como navegação', async () => {
    passar(1000)
    apertar($('.qe-abas .q-aba[aria-selected="false"]'))
    $('.qe-abas .q-aba[aria-selected="false"]').click()
    limparAnotado()
    passar(30)
    $('.px-tela .q-palco').insertAdjacentHTML('beforeend', '<div class="q-palco">semana</div>')
    await vez()
    expect(osciladoresMeus()).toBe(0)
  })

  it('a jogada certa → acerto, a errada → erro, e o kit de sempre não toca por cima', () => {
    passar(1000)
    window.dispatchEvent(new CustomEvent(EVENTO_DA_JOGADA, { detail: { tipo: 'acerto', el: null } }))
    play('success', { transpose: 3 }) /* o que o motor de comemoração pede logo depois */
    expect(tocou()).toEqual(['acerto'])
    expect(osciladoresDoKit()).toBe(0)
    limparAnotado()
    passar(1000)
    window.dispatchEvent(new CustomEvent(EVENTO_DA_JOGADA, { detail: { tipo: 'erro', el: null } }))
    play('error')
    expect(tocou()).toEqual(['erro'])
    expect(osciladoresDoKit()).toBe(0)
  })

  it('do kit de sempre: começar a gravar → grava; guardar → sucesso; o resto toca como antes', () => {
    passar(1000)
    play('recordStart')
    expect(tocou()).toEqual(['grava'])
    limparAnotado()
    passar(1000)
    play('add')
    expect(tocou()).toEqual(['sucesso'])
    limparAnotado()
    passar(1000)
    play('recordStop')
    play('success')
    play('error')
    expect(osciladoresMeus()).toBe(0)
    expect(osciladoresDoKit()).toBe(0)
    play('levelUp')
    expect(osciladoresDoKit()).toBeGreaterThan(0)
  })

  it('com a camada desligada o kit de sempre volta a tocar tudo', () => {
    document.documentElement.dataset.px = 'off'
    passar(1000)
    window.dispatchEvent(new CustomEvent(EVENTO_DA_JOGADA, { detail: { tipo: 'acerto', el: null } }))
    play('success')
    play('recordStart')
    expect(osciladoresMeus()).toBe(0)
    expect(osciladoresDoKit()).toBe(6) /* três notas de cada */
  })

  it('desligar tira tudo: nada mais toca e o kit volta ao normal', async () => {
    desligar?.()
    desligar = undefined
    passar(5000) /* longe do último som igual do kit (ele não repete a mesma nota em 45 ms) */
    apertar($('#comum'))
    play('success')
    expect(osciladoresMeus()).toBe(0)
    expect(osciladoresDoKit()).toBe(3)
    expect(document.querySelector('.px-tato-ios')).toBeNull()
  })
})

/* ---- O giroscópio --------------------------------------------------------------------------------- */

const girar = (beta: number | null, gamma: number | null) =>
  window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }))

describe('o giroscópio (`sentidos.js:196-265`)', () => {
  beforeEach(() => {
    /* O jsdom não calcula caixa: tudo o que está no documento conta como visível. */
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentNode
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 })
    const tiles = Array.from({ length: 18 }, (_, i) => `<button class="q-tile" id="t${i}">t</button>`).join('')
    document.body.innerHTML = `<main><div class="px-tela"><div class="q-palco">
      <button class="carta" id="carta"></button><div class="px-premium" id="premium"></div>
      <button class="q-tile apagado" id="apagado"></button><button class="q-tile em-linha" id="em-linha"></button>
      <button class="carta virada" id="virada"></button>${tiles}</div></div></main>`
  })
  afterEach(() => {
    for (const p of ['offsetParent', 'offsetWidth', 'offsetHeight'])
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[p]
  })

  it('pede a permissão do sensor no primeiro toque, uma vez só', () => {
    const pedir = vi.fn(() => Promise.reject(new Error('negado')))
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: pedir })
    desligar = instalarSentidos()
    expect(pedir).not.toHaveBeenCalled()
    apertar($('#premium'))
    apertar($('#premium'))
    expect(pedir).toHaveBeenCalledTimes(1)
  })

  it('a primeira leitura é o zero; o zero anda 0,004 por leitura; 22° levam a 1', () => {
    desligar = instalarSentidos()
    rodarQuadros()
    expect(document.documentElement.dataset.pxGiro).toBeUndefined()
    girar(null, 3) /* leitura vazia não liga nada */
    expect(document.documentElement.dataset.pxGiro).toBeUndefined()
    girar(40, 5)
    expect(document.documentElement.dataset.pxGiro).toBe('on')
    rodarQuadros()
    expect($('#premium').style.transform).toBe('perspective(800px) rotateY(0deg) rotateX(0deg)')
    /* gama 5 → 16: zero = 5 + 11·0,004 = 5,044; ax = 10,956 / 22. beta 40 → 29: ay = −10,956 / 22. */
    girar(29, 16)
    const ax = (16 - 5.044) / 22
    const ay = (29 - 39.956) / 22
    rodarQuadros()
    const x = ax * 0.12 /* a suavização: 12% do caminho por quadro */
    const y = ay * 0.12
    expect($('#premium').style.transform).toBe(`perspective(800px) rotateY(${x * 9}deg) rotateX(${-y * 8}deg)`)
    /* a carta inclina 60% */
    expect($('#carta').style.transform).toBe(
      `perspective(800px) rotateY(${x * 9 * 0.6}deg) rotateX(${-y * 8 * 0.6}deg)`,
    )
    /* o giroscópio vira o ponteiro: a aura segue este ponto */
    const [px, py] = ponteiro.chamadas.at(-1)!
    expect(px).toBeCloseTo(innerWidth * (0.5 + x * 0.45), 6)
    expect(py).toBeCloseTo(innerHeight * (0.45 + y * 0.4), 6)
    /* a luz: (0,5 − x·0,6)·largura e (0,4 − y·0,6)·altura */
    const luz = $('#premium > .px-luz.giro.on')
    expect(luz.getAttribute('aria-hidden')).toBe('true')
    expect(parseFloat(luz.style.getPropertyValue('--mx'))).toBeCloseTo((0.5 - x * 0.6) * 200, 6)
    expect(parseFloat(luz.style.getPropertyValue('--my'))).toBeCloseTo((0.4 - y * 0.6) * 100, 6)
  })

  it('a inclinação para em −1 e 1', () => {
    desligar = instalarSentidos()
    girar(0, 0)
    girar(90, -90)
    for (let i = 0; i < 200; i++) rodarQuadros()
    expect($('#premium').style.transform).toMatch(/rotateY\(-8\.99\d*deg\) rotateX\(-7\.99\d*deg\)/)
  })

  it('inclina até 16 alvos visíveis e põe a luz nos 4 primeiros que não são carta', () => {
    desligar = instalarSentidos()
    girar(0, 0)
    rodarQuadros()
    const inclinados = [...document.querySelectorAll<HTMLElement>('.q-palco > *')].filter((el) => el.style.transform)
    expect(inclinados).toHaveLength(16)
    expect(inclinados.map((el) => el.id)).not.toEqual(expect.arrayContaining(['apagado', 'em-linha', 'virada']))
    /* os 4 primeiros alvos, na ordem do documento: a carta (sem luz), o Premium e dois botões */
    expect([...document.querySelectorAll('.px-luz.giro')].map((l) => l.parentElement!.id)).toEqual([
      'premium',
      't0',
      't1',
    ])
  })

  it('refaz os alvos 60 ms depois de uma tela nova', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      desligar = instalarSentidos()
      girar(0, 0)
      rodarQuadros()
      $('.px-tela').innerHTML = '<div class="q-palco"><div class="px-premium" id="novo"></div></div>'
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(59)
      expect(document.querySelector('#novo > .px-luz.giro')).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(document.querySelector('#novo > .px-luz.giro')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('quem pediu menos movimento não é inclinado; desligar limpa tudo', () => {
    desligar = instalarSentidos()
    document.body.className = 'performance-mode'
    girar(0, 0)
    expect(document.documentElement.dataset.pxGiro).toBeUndefined()
    document.body.className = 'animations-on'
    girar(0, 0)
    rodarQuadros()
    expect($('#premium').style.transform).not.toBe('')
    desligar()
    desligar = undefined
    expect($('#premium').style.transform).toBe('')
    expect(document.querySelector('.px-luz.giro')).toBeNull()
    expect(document.documentElement.dataset.pxGiro).toBeUndefined()
  })
})

/* ---- Jeito de celular ----------------------------------------------------------------------------- */

describe('a aba à vista e o deslizar de lado (`sentidos.js:292-329`)', () => {
  const largura = (el: Element, rola: number, cabe: number) => {
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: rola })
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: cabe })
  }
  const lugar = (el: Element, esquerda: number, larg: number) => {
    Object.defineProperty(el, 'offsetLeft', { configurable: true, value: esquerda })
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: larg })
  }

  beforeEach(() => {
    document.body.innerHTML = CASCA
  })

  it('a aba escolhida vai para o meio da barra que rola: esquerda − (largura da barra − da aba) / 2', () => {
    const g = $('.qe-abas')
    largura(g, 900, 300)
    lugar($('.qe-abas .q-aba[aria-selected="true"]'), 400, 100)
    abaAVista(g)
    expect(g.scrollLeft).toBe(300)
  })

  it('a barra que cabe inteira não rola; sem a camada, nada', () => {
    const g = $('.qe-abas')
    largura(g, 302, 300)
    lugar($('.qe-abas .q-aba[aria-selected="true"]'), 400, 100)
    abaAVista(g)
    expect(g.scrollLeft).toBe(0)
    largura(g, 900, 300)
    document.documentElement.dataset.px = 'off'
    abaAVista(g)
    expect(g.scrollLeft).toBe(0)
  })

  it('instalado, vale para toda `.q-abas`: no quadro seguinte a uma aba mudar', async () => {
    desligar = instalarSentidos()
    rodarQuadros()
    const g = $('.q-seg')
    largura(g, 900, 300)
    const [a, b] = [...g.querySelectorAll<HTMLElement>('.q-aba')]
    lugar(b, 500, 100)
    a.setAttribute('aria-checked', 'false')
    b.setAttribute('aria-checked', 'true')
    await vez()
    expect(g.scrollLeft).toBe(0)
    rodarQuadros()
    expect(g.scrollLeft).toBe(400)
  })

  describe('deslizar', () => {
    let animou: Array<{ quadros: Keyframe[]; o: KeyframeAnimationOptions }> = []
    beforeEach(() => {
      noCelular = true
      animou = []
      Element.prototype.animate = function (quadros: Keyframe[], o: KeyframeAnimationOptions) {
        animou.push({ quadros, o })
        return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
      } as never
      desligar = instalarSentidos()
      limparAnotado()
      passar(1000)
    })
    const abas = () => [...document.querySelectorAll<HTMLElement>('.qe-abas .q-aba')]
    const escolher = (i: number) => abas().forEach((a, k) => a.setAttribute('aria-selected', String(k === i)))
    const deslizar = (dx: number, dy = 0, ms = 200, de: Element = $('#nada')) => {
      apertar(de, 200, 300)
      passar(ms)
      soltar(de, 200 + dx, 300 + dy)
    }

    it('para a esquerda vai à aba seguinte; para a direita, à anterior', () => {
      const cliques = abas().map((a) => vi.spyOn(a, 'click'))
      deslizar(-70)
      expect(cliques.map((c) => c.mock.calls.length)).toEqual([0, 1, 0])
      escolher(1)
      deslizar(70)
      expect(cliques.map((c) => c.mock.calls.length)).toEqual([1, 1, 0])
    })

    it.each([
      ['curto demais (69 px)', -69, 0, 200],
      ['torto demais (51 px para baixo)', -120, 51, 200],
      ['lento demais (600 ms)', -120, 0, 600],
    ])('%s não troca', (_nome, dx, dy, ms) => {
      const cliques = abas().map((a) => vi.spyOn(a, 'click'))
      deslizar(dx, dy, ms)
      expect(cliques.every((c) => c.mock.calls.length === 0)).toBe(true)
      expect(animou).toHaveLength(0)
    })

    it('não começa em cima do que já rola de lado, nem fora do celular', () => {
      const cliques = abas().map((a) => vi.spyOn(a, 'click'))
      deslizar(-120, 0, 200, $('.q-seg .q-aba'))
      noCelular = false
      deslizar(-120)
      expect(cliques.every((c) => c.mock.calls.length === 0)).toBe(true)
    })

    it('sem mais abas para o lado: a tela estica 22 px e volta em 420 ms, com o som do toque', () => {
      deslizar(120) /* já está na primeira */
      expect(tocou()).toEqual(['toque'])
      expect(animou).toHaveLength(1)
      expect(animou[0].quadros).toEqual([
        { transform: 'translateX(0)' },
        { transform: 'translateX(22px)' },
        { transform: 'translateX(0)' },
      ])
      expect(animou[0].o.duration).toBe(420)
      escolher(2)
      passar(1000)
      deslizar(-120)
      expect(animou[1].quadros[1]).toEqual({ transform: 'translateX(-22px)' })
    })
  })
})
