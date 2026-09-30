/**
 * A FILA DE FALA DO MODO INTÉRPRETE (E1 da Fase E): a tradução de cada fala é lida em voz alta, uma
 * de cada vez, pela voz do aparelho ou pela voz natural da nuvem — o motor é quem a tela escolher.
 *
 * As regras que a conversa frente a frente precisa, cada uma com o seu caso:
 *   - FIFO, no máximo 3 itens (o que fala + os que esperam): o 4º derruba o mais velho da espera;
 *   - item com mais de 20 s (desde o fim da fala original) não é lido — a conversa já andou;
 *   - BARGE-IN: a pessoa toca para falar por cima → a voz para na hora, a espera esvazia e a cauda do
 *     guarda de eco encurta (senão a fala dela seria descartada como eco);
 *   - REPETIR o último (mesmo velho: é pedido explícito) e PARAR;
 *   - motor que erra ou nunca começa não trava a fila;
 *   - a espera do fim da fala ao começo da voz sai em `aoIniciar` — a métrica `tts_inicio` (E6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tts = vi.hoisted(() => ({ cortarCaudaDoEco: vi.fn() }))
vi.mock('../src/lib/tts', () => tts)

import type { SpeakOptions, TtsEngine } from '../src/lib/tts'
import { criarFilaDeFala, type ItemDeFala } from '../src/lib/voz/filaDeFala'

interface Pedido {
  texto: string
  opts: SpeakOptions
}

function motorFalso() {
  const pedidos: Pedido[] = []
  const motor: TtsEngine & { pedidos: Pedido[] } = {
    pedidos,
    speak: vi.fn((texto: string, opts?: SpeakOptions) => {
      pedidos.push({ texto, opts: opts! })
    }),
    cancel: vi.fn(),
  }
  const ultimo = () => pedidos[pedidos.length - 1]
  return {
    motor,
    comecar: () => ultimo().opts.onStart?.(),
    terminar: () => ultimo().opts.onEnd?.(),
    errar: () => ultimo().opts.onError?.(),
    falados: () => pedidos.map((p) => p.texto),
  }
}

let agora = 0
const item = (id: string, extra: Partial<ItemDeFala> = {}): ItemDeFala => ({
  id,
  texto: `texto ${id}`,
  lang: 'en-US',
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
  agora = 100_000
  tts.cortarCaudaDoEco.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

function montar(extra: Partial<Parameters<typeof criarFilaDeFala>[0]> = {}) {
  const m = motorFalso()
  const descartes: Array<[string, string]> = []
  const inicios: Array<[string, number]> = []
  const fila = criarFilaDeFala({
    motor: () => m.motor,
    agora: () => agora,
    aoDescartar: (i, motivo) => descartes.push([i.id, motivo]),
    aoIniciar: (i, espera) => inicios.push([i.id, espera]),
    ...extra,
  })
  return { fila, m, descartes, inicios }
}

describe('FIFO', () => {
  it('fala um de cada vez, na ordem de chegada, e fica ociosa no fim', () => {
    const { fila, m } = montar()
    expect(fila.enfileirar(item('a'))).toBe(true)
    expect(fila.enfileirar(item('b'))).toBe(true)
    expect(m.falados()).toEqual(['texto a'])
    m.comecar()
    expect(fila.estado().falando?.id).toBe('a')
    expect(fila.estado().espera.map((i) => i.id)).toEqual(['b'])
    m.terminar()
    expect(m.falados()).toEqual(['texto a', 'texto b'])
    m.comecar()
    m.terminar()
    expect(fila.ocupada()).toBe(false)
    expect(fila.estado()).toMatchObject({ falando: null, espera: [], ultimo: { id: 'b' } })
  })

  it('manda o idioma do item e as opções de voz ao motor', () => {
    const { fila, m } = montar({ opcoesDeFala: { rate: 1.1 } })
    fila.enfileirar(item('a', { lang: 'pt-BR' }))
    expect(m.motor.pedidos[0].opts).toMatchObject({ lang: 'pt-BR', rate: 1.1 })
  })

  it('o motor é lido a cada item: trocar a voz vale para a próxima fala', () => {
    const a = motorFalso()
    const b = motorFalso()
    let atual = a.motor
    const fila = criarFilaDeFala({ motor: () => atual, agora: () => agora })
    fila.enfileirar(item('1'))
    fila.enfileirar(item('2'))
    atual = b.motor
    a.comecar()
    a.terminar()
    expect(a.falados()).toEqual(['texto 1'])
    expect(b.falados()).toEqual(['texto 2'])
  })
})

describe('no máximo 3 itens', () => {
  it('o 4º derruba o mais velho da espera, nunca o que está falando', () => {
    const { fila, m, descartes } = montar()
    for (const id of ['a', 'b', 'c', 'd']) fila.enfileirar(item(id))
    expect(descartes).toEqual([['b', 'cheia']])
    expect(fila.estado().falando?.id ?? fila.estado().espera[0]?.id).toBeDefined()
    m.comecar()
    m.terminar()
    m.comecar()
    m.terminar()
    expect(m.falados()).toEqual(['texto a', 'texto c', 'texto d'])
  })
})

describe('mais de 20 s não é lido', () => {
  it('item que já chega velho é recusado', () => {
    const { fila, m, descartes } = montar()
    expect(fila.enfileirar(item('a', { criadoEm: agora - 20_001 }))).toBe(false)
    expect(m.falados()).toEqual([])
    expect(descartes).toEqual([['a', 'velha']])
  })

  it('item que envelhece na espera sai sem ser lido', () => {
    const { fila, m, descartes } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.comecar()
    agora += 21_000
    m.terminar()
    expect(m.falados()).toEqual(['texto a'])
    expect(descartes).toEqual([['b', 'velha']])
    expect(fila.ocupada()).toBe(false)
  })

  it('o limite é configurável', () => {
    const { fila, descartes } = montar({ idadeMaximaMs: 5_000 })
    fila.enfileirar(item('a', { criadoEm: agora - 6_000 }))
    expect(descartes).toEqual([['a', 'velha']])
  })
})

describe('barge-in', () => {
  it('interromper corta a voz, esvazia a espera e encurta a cauda do eco', () => {
    const { fila, m, descartes } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.comecar()
    fila.interromper()
    expect(m.motor.cancel).toHaveBeenCalled()
    expect(tts.cortarCaudaDoEco).toHaveBeenCalled()
    expect(descartes).toEqual([['b', 'interrompida']])
    expect(fila.estado()).toMatchObject({ falando: null, espera: [], ultimo: { id: 'a' } })
  })

  it('o fim atrasado da fala interrompida não puxa o próximo item', () => {
    const { fila, m } = montar()
    fila.enfileirar(item('a'))
    m.comecar()
    const atrasado = m.motor.pedidos[0].opts
    fila.interromper()
    fila.enfileirar(item('c'))
    atrasado.onEnd?.() // o motor avisou o fim da fala cancelada depois
    expect(m.falados()).toEqual(['texto a', 'texto c'])
    expect(fila.estado().falando?.id).toBe('c')
  })
})

describe('repetir e parar', () => {
  it('repetir lê o último de novo, mesmo passado o limite de idade', () => {
    const { fila, m } = montar()
    fila.enfileirar(item('a'))
    m.comecar()
    m.terminar()
    agora += 60_000
    expect(fila.repetir()).toBe(true)
    expect(m.falados()).toEqual(['texto a', 'texto a'])
  })

  it('repetir sem nada falado ainda não faz nada', () => {
    const { fila, m } = montar()
    expect(fila.repetir()).toBe(false)
    expect(m.falados()).toEqual([])
  })

  it('repetir durante uma fala recomeça a mesma do início', () => {
    const { fila, m } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.comecar()
    fila.repetir()
    expect(m.motor.cancel).toHaveBeenCalled()
    expect(m.falados()).toEqual(['texto a', 'texto a'])
    m.comecar()
    m.terminar()
    expect(m.falados()).toEqual(['texto a', 'texto a', 'texto b'])
  })

  it('parar corta a voz e esvazia a espera, guardando o último para o Repetir', () => {
    const { fila, m, descartes } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.comecar()
    fila.parar()
    expect(m.motor.cancel).toHaveBeenCalled()
    expect(descartes).toEqual([['b', 'parada']])
    expect(fila.estado()).toMatchObject({ falando: null, espera: [], ultimo: { id: 'a' } })
    expect(fila.repetir()).toBe(true)
  })
})

describe('o motor não trava a fila', () => {
  it('erro do motor passa para o próximo item', () => {
    const { fila, m } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.errar()
    expect(m.falados()).toEqual(['texto a', 'texto b'])
  })

  it('motor que nunca começa: o prazo passa e o próximo item fala', () => {
    const { fila, m, descartes } = montar({ prazoParaComecarMs: 3_000 })
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    vi.advanceTimersByTime(3_001)
    expect(m.motor.cancel).toHaveBeenCalled()
    expect(descartes).toEqual([['a', 'falhou']])
    expect(m.falados()).toEqual(['texto a', 'texto b'])
  })

  it('fala que começou e nunca avisa o fim: o prazo da fala a encerra', () => {
    const { fila, m } = montar()
    fila.enfileirar(item('a'))
    fila.enfileirar(item('b'))
    m.comecar()
    vi.advanceTimersByTime(60_000)
    expect(m.falados()).toEqual(['texto a', 'texto b'])
  })
})

describe('tts_inicio', () => {
  it('aoIniciar recebe a espera do fim da fala original até a voz começar', () => {
    const { fila, m, inicios } = montar()
    fila.enfileirar(item('a', { criadoEm: agora - 1_200 }))
    agora += 300
    m.comecar()
    expect(inicios).toEqual([['a', 1_500]])
  })

  it('o Repetir não conta na métrica (não é a latência da conversa)', () => {
    const { fila, m, inicios } = montar()
    fila.enfileirar(item('a'))
    m.comecar()
    m.terminar()
    fila.repetir()
    m.comecar()
    expect(inicios).toHaveLength(1)
  })
})

describe('aoMudar', () => {
  it('avisa cada mudança de estado (a tela mostra "falando" e o botão Parar)', () => {
    const estados: Array<string | null> = []
    const { fila, m } = montar({ aoMudar: (e) => estados.push(e.falando?.id ?? null) })
    fila.enfileirar(item('a'))
    m.comecar()
    m.terminar()
    expect(estados[estados.length - 1]).toBeNull()
    expect(estados).toContain('a')
  })

  it('destruir para tudo e não avisa mais nada', () => {
    const aoMudar = vi.fn()
    const { fila, m } = montar({ aoMudar })
    fila.enfileirar(item('a'))
    fila.destruir()
    const chamadas = aoMudar.mock.calls.length
    m.comecar()
    m.terminar()
    expect(aoMudar.mock.calls.length).toBe(chamadas)
    expect(fila.enfileirar(item('b'))).toBe(false)
  })
})
