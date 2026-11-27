/**
 * O orquestrador do "Ajustar nível" no leitor (openspec `leitura-assistida`, fatia D, tarefas D7 e D8): cache no aparelho
 * (repetir não chama a rede) e capítulo cancelável, com custo só do que foi pedido de verdade.
 */
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AjusteDeNivel, PedidoDeAjusteNaRede, ResultadoDoAjusteNaRede } from '../src/data/rotas/ajustarNivel'
import { ajustarCapitulo, ajustarComCache, type DependenciasDoAjuste } from '../src/lib/leitor/ajustarNivelDoLeitor'
import {
  ajusteGuardado,
  guardarAjuste,
  limparAjustesDoAparelho,
  MAX_AJUSTES_GUARDADOS,
} from '../src/lib/leitor/ajustesNoAparelho'

const ajuste = (texto: string, usd = 0.001): AjusteDeNivel => ({
  ajustado: `ajustado: ${texto}`,
  nivelMedido: 'B1',
  confianciaDaMedida: 'alta',
  conhecidasTrocadas: [],
  foraDoNivel: false,
  reescrito: false,
  custo: { tokensEntrada: 100, tokensSaida: 50, usd, chamadas: 1 },
})

function memoria(pedidos: PedidoDeAjusteNaRede[], falhaNaChamada?: number): DependenciasDoAjuste {
  const guardado = new Map<string, AjusteDeNivel>()
  return {
    pedir: async (p): Promise<ResultadoDoAjusteNaRede> => {
      pedidos.push(p)
      if (falhaNaChamada === pedidos.length) return { ok: false, motivo: 'cota', status: 429, capitulo: true }
      return { ok: true, valor: ajuste(p.texto) }
    },
    lerCache: async (c) => guardado.get(c) ?? null,
    guardarCache: async (c, v) => void guardado.set(c, v),
  }
}

const PARAGRAFOS = Array.from({ length: 10 }, (_, i) => `Paragraph number ${i} has a market.`)

afterEach(async () => {
  await limparAjustesDoAparelho()
})

describe('ajustarComCache', () => {
  it('o segundo pedido igual vem do aparelho: nenhuma chamada de rede', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const dep = memoria(pedidos)
    const p: PedidoDeAjusteNaRede = {
      texto: 'The market is big.',
      idioma: 'en',
      escopo: 'trecho',
      nivelAlvo: 'A2',
      conhecidas: ['market'],
    }
    const a = await ajustarComCache(p, undefined, dep)
    const b = await ajustarComCache(p, undefined, dep)
    expect(a).toMatchObject({ ok: true, doCache: false })
    expect(b).toMatchObject({ ok: true, doCache: true })
    expect(pedidos).toHaveLength(1)
  })

  it('outro nível ou outras conhecidas é outro pedido', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const dep = memoria(pedidos)
    const p: PedidoDeAjusteNaRede = { texto: 'The market is big.', idioma: 'en', escopo: 'trecho', nivelAlvo: 'A2' }
    await ajustarComCache(p, undefined, dep)
    await ajustarComCache({ ...p, nivelAlvo: 'B1' }, undefined, dep)
    await ajustarComCache({ ...p, conhecidas: ['market'] }, undefined, dep)
    await ajustarComCache({ ...p, acao: 'exemplo' }, undefined, dep)
    expect(pedidos).toHaveLength(4)
  })

  it('falha não vai ao cache', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const dep = memoria(pedidos, 1)
    const p: PedidoDeAjusteNaRede = { texto: 'x y z', idioma: 'en', escopo: 'trecho', nivelAlvo: 'A2' }
    expect((await ajustarComCache(p, undefined, dep)).ok).toBe(false)
    expect((await ajustarComCache(p, undefined, dep)).ok).toBe(true)
    expect(pedidos).toHaveLength(2)
  })
})

describe('ajustarCapitulo', () => {
  const base = { paragrafos: PARAGRAFOS, idioma: 'en', alvo: 'B1' as const, conhecidasDaPessoa: ['market'] }

  it('completo: 10 pedidos, só o 1o com inicioDeCapitulo, custo somado, progresso a cada parágrafo', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const progresso: number[] = []
    const r = await ajustarCapitulo({ ...base, aoProgresso: (pr) => progresso.push(pr.feitos) }, memoria(pedidos))
    expect(r.situacao).toBe('completo')
    expect(pedidos).toHaveLength(10)
    expect(pedidos.filter((p) => p.inicioDeCapitulo)).toHaveLength(1)
    expect(pedidos[0].inicioDeCapitulo).toBe(true)
    expect(pedidos.every((p) => p.escopo === 'capitulo')).toBe(true)
    expect(r.custo.chamadas).toBe(10)
    expect(r.custo.usd).toBeCloseTo(0.01)
    expect(progresso).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('cancelar após 3 de 10: para, os 3 ficam e só os 3 contam no custo', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const ctrl = new AbortController()
    const r = await ajustarCapitulo(
      { ...base, sinal: ctrl.signal, aoProgresso: (pr) => pr.feitos === 3 && ctrl.abort() },
      memoria(pedidos),
    )
    expect(r.situacao).toBe('cancelado')
    expect(pedidos).toHaveLength(3)
    expect(r.ajustados.filter(Boolean)).toHaveLength(3)
    expect(r.ajustados.slice(3).every((a) => a === null)).toBe(true)
    expect(r.custo.chamadas).toBe(3)
    expect(r.custo.usd).toBeCloseTo(0.003)
  })

  it('cota do capítulo esgotada no 1o: erro `cota`, nada pronto, custo zero', async () => {
    const r = await ajustarCapitulo(base, memoria([], 1))
    expect(r).toMatchObject({ situacao: 'erro', motivo: 'cota' })
    expect(r.ajustados.filter(Boolean)).toHaveLength(0)
    expect(r.custo.usd).toBe(0)
  })

  it('para no primeiro erro e mantém o que já ficou pronto', async () => {
    const r = await ajustarCapitulo(base, memoria([], 4))
    expect(r.situacao).toBe('erro')
    expect(r.ajustados.filter(Boolean)).toHaveLength(3)
  })

  it('refazer o capítulo: os parágrafos já ajustados vêm do cache e a rede só é chamada para o resto', async () => {
    const pedidos: PedidoDeAjusteNaRede[] = []
    const dep = memoria(pedidos)
    const ctrl = new AbortController()
    await ajustarCapitulo({ ...base, sinal: ctrl.signal, aoProgresso: (pr) => pr.feitos === 4 && ctrl.abort() }, dep)
    expect(pedidos).toHaveLength(4)
    const r = await ajustarCapitulo(base, dep)
    expect(r.situacao).toBe('completo')
    expect(r.doCache).toBe(4)
    expect(pedidos).toHaveLength(10)
    /* O 1o pedido de rede da 2a rodada abre o capítulo de novo. */
    expect(pedidos[4].inicioDeCapitulo).toBe(true)
  })

  it('aborta o pedido em voo: cancelado, sem erro', async () => {
    const ctrl = new AbortController()
    const dep: DependenciasDoAjuste = {
      lerCache: async () => null,
      guardarCache: async () => {},
      pedir: async () => {
        ctrl.abort()
        return { ok: false, motivo: 'indisponivel', status: 0 }
      },
    }
    const r = await ajustarCapitulo({ ...base, sinal: ctrl.signal }, dep)
    expect(r.situacao).toBe('cancelado')
  })
})

describe('o cache do aparelho (IndexedDB)', () => {
  it('guarda, lê e poda os mais antigos acima do teto', async () => {
    let relogio = 1_000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => relogio++)
    for (let i = 0; i < MAX_AJUSTES_GUARDADOS + 5; i++) await guardarAjuste(`k${i}`, ajuste(String(i)))
    spy.mockRestore()
    expect(await ajusteGuardado('k0')).toBeNull()
    expect(await ajusteGuardado('k4')).toBeNull()
    expect((await ajusteGuardado(`k${MAX_AJUSTES_GUARDADOS + 4}`))?.ajustado).toContain('ajustado')
  })
})
