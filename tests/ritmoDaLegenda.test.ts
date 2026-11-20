/**
 * O RITMO DA LEGENDA (ei/leg): a fila de exibição das Legendas flutuantes. Cada fala fica na tela
 * pelo menos o tempo de ler, a seguinte espera a vez em vez de empurrar a atual, e o parcial da
 * fala atual cresce no lugar, sem voltar para a fila.
 */
import { describe, expect, it } from 'vitest'

import {
  avancar,
  ESPERA_MAXIMA_MS,
  FILA_MAXIMA,
  iniciarRitmo,
  janelaDaLegenda,
  MAXIMO_MS,
  MINIMO_MS,
  pendentes,
  RITMO_VAZIO,
  saltarParaOFim,
  tempoDeLeitura,
} from '../src/lib/captura/ritmoDaLegenda'

const fala = (id: string, caracteres = 30) => ({ id, caracteres })

describe('tempoDeLeitura', () => {
  it('caracteres ÷ velocidade, entre o mínimo e o máximo', () => {
    expect(tempoDeLeitura(30, 'normal')).toBe(2000) // 30 / 15 por segundo
    expect(tempoDeLeitura(30, 'lenta')).toBe(3000) // 30 / 10
    expect(tempoDeLeitura(44, 'rapida')).toBe(2000) // 44 / 22
    expect(tempoDeLeitura(3, 'normal')).toBe(MINIMO_MS)
    expect(tempoDeLeitura(5000, 'lenta')).toBe(MAXIMO_MS)
  })

  it('mais devagar nunca é mais curto', () => {
    for (const n of [10, 40, 90, 200]) {
      expect(tempoDeLeitura(n, 'lenta')).toBeGreaterThanOrEqual(tempoDeLeitura(n, 'normal'))
      expect(tempoDeLeitura(n, 'normal')).toBeGreaterThanOrEqual(tempoDeLeitura(n, 'rapida'))
    }
  })
})

describe('avancar — a fila', () => {
  it('a primeira fala entra na hora', () => {
    const { estado, proximaEmMs } = avancar(RITMO_VAZIO, [fala('a')], 1000, 'normal')
    expect(estado.reveladas).toEqual(['a'])
    expect(estado.atual).toBe('a')
    expect(proximaEmMs).toBeNull()
  })

  it('a fala nova ESPERA a atual cumprir o tempo de leitura, e depois entra', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 30)], 0, 'normal').estado
    const r1 = avancar(e, [fala('a', 30), fala('b')], 500, 'normal')
    expect(r1.estado.atual).toBe('a')
    expect(r1.estado.reveladas).toEqual(['a'])
    expect(r1.proximaEmMs).toBe(1500) // 2000 de leitura − 500 já passados
    e = avancar(r1.estado, [fala('a', 30), fala('b')], 2000, 'normal').estado
    expect(e.atual).toBe('b')
    expect(e.reveladas).toEqual(['a', 'b'])
    expect(e.desdeMs).toBe(2000)
  })

  it('uma fala por vez: três na fila saem uma a cada tempo de leitura', () => {
    const falas = [fala('a', 30), fala('b', 30), fala('c', 30), fala('d', 30)]
    let e = iniciarRitmo([falas[0]], 0)
    e = avancar(e, falas, 10_000, 'normal').estado
    expect(e.atual).toBe('b')
    e = avancar(e, falas, 10_500, 'normal').estado
    expect(e.atual).toBe('b')
    e = avancar(e, falas, 12_000, 'normal').estado
    expect(e.atual).toBe('c')
    expect(pendentes(e, falas)).toBe(1)
  })

  it('o parcial da fala atual cresce NO LUGAR: não volta para a fila nem reinicia o relógio', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 10)], 0, 'normal').estado
    e = avancar(e, [fala('a', 20)], 800, 'normal').estado
    e = avancar(e, [fala('a', 45)], 1200, 'normal').estado
    expect(e.reveladas).toEqual(['a'])
    expect(e.atual).toBe('a')
    expect(e.desdeMs).toBe(0)
    // O tempo da atual acompanha o texto que cresceu: 45 / 15 = 3 s desde o instante 0.
    const r = avancar(e, [fala('a', 45), fala('b')], 1200, 'normal')
    expect(r.proximaEmMs).toBe(1800)
  })

  it('fila longa demais: as mais antigas vão direto ao histórico, e o atraso fica limitado', () => {
    const falas = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => fala(id))
    const e = avancar(iniciarRitmo([falas[0]], 0), falas, 100, 'normal').estado
    expect(pendentes(e, falas)).toBe(FILA_MAXIMA)
    expect(e.reveladas).toEqual(['a', 'b', 'c', 'd'])
    expect(e.atual).toBe('d')
  })

  it('a fala que saiu da lista sai também das reveladas', () => {
    const e = iniciarRitmo([fala('a'), fala('b')], 0)
    const r = avancar(e, [fala('b'), fala('c')], 100, 'normal')
    expect(r.estado.reveladas).toEqual(['b'])
  })
})

describe('avancar — seguindo ao vivo (fala rápida não deixa a legenda para trás)', () => {
  const aoVivo = { aoVivo: true }

  it('mais de UMA fala esperando: alcança a mais recente na hora, mesmo com a atual longa', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 150)], 0, 'normal', aoVivo).estado // 10 s de leitura
    const falas = [fala('a', 150), fala('b'), fala('c')]
    const r = avancar(e, falas, 300, 'normal', aoVivo)
    e = r.estado
    expect(e.reveladas).toEqual(['a', 'b', 'c'])
    expect(e.atual).toBe('c')
    expect(e.desdeMs).toBe(300)
    expect(pendentes(e, falas)).toBe(0)
    expect(r.proximaEmMs).toBeNull()
  })

  it('uma fala só esperando: entra no tempo de leitura OU em ESPERA_MAXIMA_MS, o que vier antes', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 150)], 0, 'normal', aoVivo).estado
    const falas = [fala('a', 150), fala('b')]
    const r1 = avancar(e, falas, 500, 'normal', aoVivo)
    expect(r1.estado.atual).toBe('a')
    expect(r1.proximaEmMs).toBe(ESPERA_MAXIMA_MS) // e não os 9,5 s que faltam da leitura
    e = avancar(r1.estado, falas, 500 + ESPERA_MAXIMA_MS - 1, 'normal', aoVivo).estado
    expect(e.atual).toBe('a')
    e = avancar(e, falas, 500 + ESPERA_MAXIMA_MS, 'normal', aoVivo).estado
    expect(e.atual).toBe('b')
    expect(e.chegadas).toBeUndefined()
  })

  it('fala lenta: o ritmo de leitura continua valendo quando a atual é curta', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 15)], 0, 'normal', aoVivo).estado // 1,5 s (o mínimo)
    const falas = [fala('a', 15), fala('b')]
    const r = avancar(e, falas, 200, 'normal', aoVivo)
    expect(r.estado.atual).toBe('a')
    expect(r.proximaEmMs).toBe(1300) // a leitura (1,5 s) vence a espera máxima (2 s)
    e = avancar(r.estado, falas, 1500, 'normal', aoVivo).estado
    expect(e.atual).toBe('b')
  })

  it('a chegada guardada é a da PRIMEIRA vez que a fala apareceu (o parcial que cresce não reinicia a conta)', () => {
    let e = avancar(RITMO_VAZIO, [fala('a', 150)], 0, 'normal', aoVivo).estado
    e = avancar(e, [fala('a', 150), fala('b', 5)], 100, 'normal', aoVivo).estado
    e = avancar(e, [fala('a', 150), fala('b', 20)], 1500, 'normal', aoVivo).estado
    expect(e.chegadas).toEqual({ b: 100 })
    e = avancar(e, [fala('a', 150), fala('b', 30)], 2100, 'normal', aoVivo).estado
    expect(e.atual).toBe('b')
  })

  it('nada mudou: devolve o MESMO estado (o chamador compara por identidade)', () => {
    const falas = [fala('a', 150), fala('b')]
    const e = avancar(avancar(RITMO_VAZIO, [falas[0]], 0, 'normal', aoVivo).estado, falas, 100, 'normal', aoVivo).estado
    expect(avancar(e, falas, 200, 'normal', aoVivo).estado).toBe(e)
  })

  it('sem `aoVivo` (voltando no histórico) a fila segue o ritmo de leitura de antes', () => {
    const e = avancar(RITMO_VAZIO, [fala('a', 150)], 0, 'normal').estado
    const r = avancar(e, [fala('a', 150), fala('b'), fala('c')], 300, 'normal')
    expect(r.estado.atual).toBe('a')
    expect(r.estado.chegadas).toBeUndefined()
  })
})

describe('abrir, pausar e retomar', () => {
  it('abrir no meio da captura mostra o que já existe, sem enfileirar o passado', () => {
    const e = iniciarRitmo([fala('a'), fala('b'), fala('c')], 5000)
    expect(e.reveladas).toEqual(['a', 'b', 'c'])
    expect(e.atual).toBe('c')
    expect(e.desdeMs).toBe(5000)
  })

  it('retomar depois de pausar pula para a mais recente', () => {
    const falas = [fala('a'), fala('b'), fala('c')]
    const e = saltarParaOFim(iniciarRitmo([falas[0]], 0), falas, 9000)
    expect(e.reveladas).toEqual(['a', 'b', 'c'])
    expect(e.atual).toBe('c')
    expect(e.desdeMs).toBe(9000)
    expect(pendentes(e, falas)).toBe(0)
  })
})

describe('janelaDaLegenda — quantas aparecem e o histórico', () => {
  const reveladas = ['a', 'b', 'c', 'd', 'e', 'f']

  it('seguindo o fim: as N últimas, com a atual em foco', () => {
    expect(janelaDaLegenda(reveladas, 3, null, 'f')).toEqual({ ids: ['d', 'e', 'f'], foco: 'f', novasDepois: 0 })
    expect(janelaDaLegenda(reveladas, 1, null, 'f').ids).toEqual(['f'])
    expect(janelaDaLegenda(reveladas.slice(0, 2), 5, null, 'b').ids).toEqual(['a', 'b'])
  })

  it('voltando no histórico: a janela termina no cursor e conta as que vieram depois', () => {
    expect(janelaDaLegenda(reveladas, 3, 'c', 'f')).toEqual({ ids: ['a', 'b', 'c'], foco: 'c', novasDepois: 3 })
    expect(janelaDaLegenda(reveladas, 2, 'a', 'f')).toEqual({ ids: ['a'], foco: 'a', novasDepois: 5 })
  })

  it('cursor que sumiu da lista volta a seguir o fim', () => {
    expect(janelaDaLegenda(reveladas, 2, 'zz', 'f')).toEqual({ ids: ['e', 'f'], foco: 'f', novasDepois: 0 })
  })
})
