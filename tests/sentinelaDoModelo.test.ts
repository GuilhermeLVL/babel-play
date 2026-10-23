/**
 * Sentinela de queda: uma marca por instância de página no `localStorage`. Só a marca deixada por OUTRA
 * página (que não está viva) vale como queda; a própria, nunca (parar/iniciar na mesma aba).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const relatorio = vi.hoisted(() => ({ reportarErro: vi.fn() }))
vi.mock('../src/lib/relatorioDeErros', () => relatorio)
vi.mock('../src/lib/dispositivo/perfil', () => ({ perfilDoDispositivo: () => ({ tipo: 'desktop-com-gpu' }) }))

import {
  desmarcar,
  esquecerQuedas,
  INSTANCIA_DA_PAGINA,
  marcarCarregando,
  quedaSuspeita,
  vetarSeCaiuComOModelo,
} from '../src/lib/captura/sentinelaDoModelo'

const memoria = new Map<string, string>()
const MOTIVO = 'a aba caiu com o modelo carregado'

beforeEach(() => {
  memoria.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
    key: (i: number) => [...memoria.keys()][i] ?? null,
    get length() {
      return memoria.size
    },
  })
})
afterEach(() => {
  desmarcar('m')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  relatorio.reportarErro.mockClear()
})

describe('sentinelaDoModelo', () => {
  it('a marca é por instância: babel.sentinela.<id>.<instância>', () => {
    marcarCarregando('m', 1000)
    expect(memoria.get(`babel.sentinela.m.${INSTANCIA_DA_PAGINA}`)).toBe('1000')
  })

  it('(a) a PRÓPRIA instância marca e checa: sem queda e sem veto', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m')
    expect(quedaSuspeita('m')).toBe(false)
    expect(await vetarSeCaiuComOModelo('m', proibir)).toBe(false)
    expect(proibir).not.toHaveBeenCalled()
  })

  it('(b) marca de OUTRA instância com menos de 30 min: veto com o motivo, e a marca dela some', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m', 1000, 'outra')
    expect(quedaSuspeita('m', 2000)).toBe(true)
    expect(await vetarSeCaiuComOModelo('m', proibir, 2000)).toBe(true)
    expect(proibir).toHaveBeenCalledWith('m', MOTIVO)
    expect(quedaSuspeita('m', 3000)).toBe(false)
  })

  it('(c) o desmarcar da aba B não apaga a marca da aba A', () => {
    marcarCarregando('m', 1000, 'A')
    marcarCarregando('m', 1000, 'B')
    desmarcar('m', 'B')
    expect(memoria.has('babel.sentinela.m.A')).toBe(true)
    expect(memoria.has('babel.sentinela.m.B')).toBe(false)
  })

  it('outra aba VIVA (lock segurado) não é queda', async () => {
    const proibir = vi.fn(async () => undefined)
    marcarCarregando('m', 1000, 'viva')
    vi.stubGlobal('navigator', {
      locks: { query: async () => ({ held: [{ name: 'babel.sentinela.m.viva' }] }) },
    })
    expect(await vetarSeCaiuComOModelo('m', proibir, 2000)).toBe(false)
    expect(proibir).not.toHaveBeenCalled()
  })

  it('marca de outra instância com 31 min não vale e é removida', () => {
    marcarCarregando('m', 0, 'velha')
    expect(quedaSuspeita('m', 31 * 60_000)).toBe(false)
    expect(memoria.has('babel.sentinela.m.velha')).toBe(false)
  })

  it('desmarcar apaga a própria; ids não se misturam', () => {
    marcarCarregando('a', 1000, 'x')
    expect(quedaSuspeita('b', 2000)).toBe(false)
    marcarCarregando('m')
    desmarcar('m')
    expect(memoria.size).toBe(1)
  })

  it('sem localStorage nunca lança', async () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => marcarCarregando('m')).not.toThrow()
    expect(quedaSuspeita('m')).toBe(false)
    expect(await vetarSeCaiuComOModelo('m', async () => undefined)).toBe(false)
  })

  it('o veto emite UM evento pelo relatório de erros: só o nome e o tipo de aparelho', async () => {
    marcarCarregando('m', 1000, 'outra')
    await vetarSeCaiuComOModelo('m', async () => undefined, 2000)
    await vi.waitFor(() => expect(relatorio.reportarErro).toHaveBeenCalledTimes(1))
    expect(relatorio.reportarErro).toHaveBeenCalledWith('modelo-vetado', 'm · desktop-com-gpu')
    // sem marca de queda, nada é emitido
    await vetarSeCaiuComOModelo('m', async () => undefined, 3000)
    await new Promise((r) => setTimeout(r, 0))
    expect(relatorio.reportarErro).toHaveBeenCalledTimes(1)
  })

  it('esquecerQuedas apaga as marcas de outras instâncias (o "Tentar de novo"), não a própria', async () => {
    marcarCarregando('m', 1000, 'morta')
    marcarCarregando('m', 1000)
    await esquecerQuedas('m')
    expect(memoria.has('babel.sentinela.m.morta')).toBe(false)
    expect(memoria.has(`babel.sentinela.m.${INSTANCIA_DA_PAGINA}`)).toBe(true)
    expect(quedaSuspeita('m', 2000, new Set(), 'nova')).toBe(true) // a própria segue valendo para outra página
  })
})

/* BATIMENTO: enquanto o Parakeet segue carregado, a marca desta página é renovada a cada 5 min, e a regra
   dos 30 min conta do ÚLTIMO carimbo. Uma captura longa que derruba a aba aos 45 min ainda é vista. A
   "morte" da página é simulada parando os relógios (`clearAllTimers`) sem desmarcar. */
describe('sentinelaDoModelo — batimento da marca', () => {
  const T0 = 1_000_000_000_000

  it('marca em t0, renovada a cada 5 min: queda aos 45 min (último carimbo aos 45) é vista por outra página', () => {
    vi.useFakeTimers({ now: T0 })
    marcarCarregando('m')
    vi.advanceTimersByTime(5 * 60_000)
    expect(memoria.get(`babel.sentinela.m.${INSTANCIA_DA_PAGINA}`)).toBe(String(T0 + 5 * 60_000))
    vi.advanceTimersByTime(40 * 60_000)
    vi.clearAllTimers() // a aba morre aqui, com o modelo carregado
    expect(quedaSuspeita('m', T0 + 45 * 60_000 + 1000, new Set(), 'nova')).toBe(true)
  })

  it('último carimbo há menos de 30 min: veta; há mais de 30 min: não veta', () => {
    vi.useFakeTimers({ now: T0 })
    marcarCarregando('m')
    vi.advanceTimersByTime(10 * 60_000) // carimbos aos 5 e aos 10 min
    vi.clearAllTimers()
    expect(quedaSuspeita('m', T0 + 39 * 60_000, new Set(), 'nova')).toBe(true)
    expect(quedaSuspeita('m', T0 + 41 * 60_000, new Set(), 'nova')).toBe(false)
  })

  it('desmarcar para o batimento: a marca não volta', () => {
    vi.useFakeTimers({ now: T0 })
    marcarCarregando('m')
    desmarcar('m')
    vi.advanceTimersByTime(20 * 60_000)
    expect(memoria.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
