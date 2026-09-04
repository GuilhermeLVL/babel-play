import { describe, expect, it } from 'vitest'
import {
  estadoDoItem, janelaDeRetorno, prontoParaVoltar, ordenarPorMemoria, embaralharComSemente, LEECH_APOS,
  type HistoricoDoItem,
} from '../src/core/learning/memoriaDeItens'

const dia = (ts: number) => Math.floor(ts / 86_400_000)
const h = (p: Partial<HistoricoDoItem>): HistoricoDoItem => ({ vezes: 0, erros: 0, ultimoAcerto: false, ...p })

describe('estado do item — a memória única dos 9 jogos', () => {
  it('nova / aprendendo / firme / errando / leech', () => {
    expect(estadoDoItem(undefined).tag).toBe('nova')
    expect(estadoDoItem(h({ vezes: 1, erros: 0, ultimoAcerto: true })).tag).toBe('aprendendo')
    expect(estadoDoItem(h({ vezes: 3, erros: 0, ultimoAcerto: true })).tag).toBe('firme')
    expect(estadoDoItem(h({ vezes: 2, erros: 1, ultimoAcerto: false, errosSeguidos: 1 })).tag).toBe('errando')
    expect(estadoDoItem(h({ vezes: 5, erros: 4, ultimoAcerto: false, errosSeguidos: LEECH_APOS })).tag).toBe('leech')
  })

  it('janelas: 2 rodadas, depois 4, depois amanhã; um acerto zera', () => {
    expect(janelaDeRetorno(1)).toBe(2)
    expect(janelaDeRetorno(2)).toBe(4)
    expect(janelaDeRetorno(3)).toBe('amanha')
    // errou 3 e acertou: errosSeguidos volta a 0 → aprendendo, sem janela
    const e = estadoDoItem(h({ vezes: 4, erros: 3, ultimoAcerto: true, errosSeguidos: 0 }))
    expect(e.tag).toBe('aprendendo')
    expect(e.janela).toBe(0)
  })

  it('prontoParaVoltar respeita rodadas e o dia local', () => {
    const agora = 10 * 86_400_000 + 1000
    expect(prontoParaVoltar(h({ vezes: 1, erros: 1, errosSeguidos: 1, rodadasDesdeUltimoErro: 1 }), agora, dia)).toBe(false)
    expect(prontoParaVoltar(h({ vezes: 1, erros: 1, errosSeguidos: 1, rodadasDesdeUltimoErro: 2 }), agora, dia)).toBe(true)
    const ontem = agora - 86_400_000
    expect(prontoParaVoltar(h({ vezes: 3, erros: 3, errosSeguidos: 3, ultimaEm: agora - 1000 }), agora, dia)).toBe(false)
    expect(prontoParaVoltar(h({ vezes: 3, erros: 3, errosSeguidos: 3, ultimaEm: ontem }), agora, dia)).toBe(true)
    expect(prontoParaVoltar(h({ vezes: 4, erros: 4, errosSeguidos: 4, ultimaEm: ontem }), agora, dia)).toBe(false) // leech nunca volta sozinha
  })
})

describe('ordenarPorMemoria — camadas, leeches fora, semente por jogo', () => {
  const itens = ['errando-pronta', 'errando-adiada', 'nova1', 'nova2', 'aprendendo', 'firme', 'leech', 'vencida']
  const memoria = new Map<string, HistoricoDoItem>([
    ['errando-pronta', h({ vezes: 1, erros: 1, errosSeguidos: 1, rodadasDesdeUltimoErro: 5 })],
    ['errando-adiada', h({ vezes: 1, erros: 1, errosSeguidos: 1, rodadasDesdeUltimoErro: 0 })],
    ['aprendendo', h({ vezes: 1, ultimoAcerto: true })],
    ['firme', h({ vezes: 4, ultimoAcerto: true })],
    ['leech', h({ vezes: 4, erros: 4, errosSeguidos: 4 })],
    ['vencida', h({ vezes: 2, ultimoAcerto: true })],
  ])
  const agora = 20 * 86_400_000
  const opts = { memoria, agora, diaDe: dia, urgente: (x: string) => x === 'vencida' }

  it('errando (janela vencida) → vencidas → novas → aprendendo → firmes; leech fora; adiada no fim', () => {
    const { ordenados, excluidos } = ordenarPorMemoria(itens, (x) => x, { ...opts, semente: 'memory:1' })
    expect(ordenados[0]).toBe('errando-pronta')
    expect(ordenados[1]).toBe('vencida')
    expect(new Set(ordenados.slice(2, 4))).toEqual(new Set(['nova1', 'nova2']))
    expect(ordenados[4]).toBe('aprendendo')
    expect(ordenados[5]).toBe('firme')
    expect(ordenados[ordenados.length - 1]).toBe('errando-adiada')
    expect(excluidos).toEqual(['leech'])
  })

  it('a mesma semente dá a mesma ordem; jogos diferentes dão ordens diferentes', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `n${i}`)
    const a = ordenarPorMemoria(muitas, (x) => x, { ...opts, semente: 'memory:20' }).ordenados
    const b = ordenarPorMemoria(muitas, (x) => x, { ...opts, semente: 'memory:20' }).ordenados
    const c = ordenarPorMemoria(muitas, (x) => x, { ...opts, semente: 'termo:20' }).ordenados
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(new Set(a)).toEqual(new Set(c))
  })

  it('cota de novas: numa rodada de 4 com muitas firmes, ao menos 30% novas', () => {
    const firmes = Array.from({ length: 10 }, (_, i) => `f${i}`)
    const mem = new Map(firmes.map((f) => [f, h({ vezes: 5, ultimoAcerto: true })]))
    const lista = [...firmes, 'novaA', 'novaB']
    const { ordenados } = ordenarPorMemoria(lista, (x) => x, { memoria: mem, agora, diaDe: dia, semente: 's', cotaDeNovas: 0.3, limite: 4 })
    expect(ordenados.slice(0, 4).filter((x) => x.startsWith('nova')).length).toBeGreaterThanOrEqual(2)
  })

  it('embaralharComSemente é determinístico e é uma permutação', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(embaralharComSemente(xs, 'a')).toEqual(embaralharComSemente(xs, 'a'))
    expect([...embaralharComSemente(xs, 'a')].sort((p, q) => p - q)).toEqual(xs)
  })
})
