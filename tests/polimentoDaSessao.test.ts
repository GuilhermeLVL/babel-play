/**
 * D5 (Fase D, 30/09/2026) — O EXECUTOR DO "POLIR A SESSÃO" NA ANÁLISE: progresso por bloco, cancelar
 * e retomar.
 *
 * O servidor polia um bloco por pedido (`POST /api/ai/mt/polir`). Quem percorre os blocos é o cliente,
 * e o que se prova aqui, sem tela nem rede:
 *
 *   - conta os blocos com a MESMA regra do servidor (`blocosDoPolimento`) e só pede os que ainda têm
 *     fala sem polida — retomar não pede de novo o que já está polido;
 *   - avisa o progresso a cada bloco e entrega as polidas assim que chegam;
 *   - cancelar para no bloco em curso (o que ele trouxer ainda é aplicado: já foi pago) e não pede o
 *     próximo; retomar depois continua de onde parou;
 *   - uma falha para a fila com o motivo, sem pedir os blocos seguintes.
 */
import { describe, expect, it, vi } from 'vitest'

import type { PolimentoDoBloco, ResultadoDaNuance } from '../src/data/apiDaNuance'
import { contarPolimento, type FalaParaPolir, polirSessao } from '../src/lib/analise/polimentoDaSessao'

const falas = (n: number, polidas = 0): FalaParaPolir[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    idx: i,
    sourceText: `line ${i}`,
    translatedText: `linha ${i}`,
    traducaoPolida: i < polidas ? `polida ${i}` : null,
  }))

/** Um servidor falso: polia o bloco pedido, com os mesmos blocos de 40. */
function servidor(lista: FalaParaPolir[]) {
  return vi.fn(async (bloco: number): Promise<ResultadoDaNuance<PolimentoDoBloco>> => {
    const doBloco = lista.slice(bloco * 40, bloco * 40 + 40)
    return {
      ok: true,
      valor: {
        bloco,
        blocos: Math.ceil(lista.length / 40),
        polidas: doBloco.map((u) => ({ id: u.id, traducaoPolida: `polida ${u.id}` })),
        pendentes: 0,
        jaPolido: false,
      },
    }
  })
}

describe('a contagem', () => {
  it('os blocos da sessão, os completos e os que ainda têm fala sem polida', () => {
    expect(contarPolimento(falas(95))).toMatchObject({ total: 3, completos: 0, pendentes: [0, 1, 2] })
    expect(contarPolimento(falas(95, 45))).toMatchObject({ total: 3, completos: 1, pendentes: [1, 2] })
    expect(contarPolimento(falas(95, 95))).toMatchObject({ total: 3, completos: 3, pendentes: [] })
  })

  it('fala sem texto ou sem tradução não conta (não há o que polir)', () => {
    const lista = [...falas(2), { id: 'x', idx: 9, sourceText: 'oi', translatedText: null }]
    expect(contarPolimento(lista)).toMatchObject({ total: 1, linhasPolidaveis: 2 })
  })
})

describe('polir a sessão', () => {
  it('pede só os blocos pendentes, avisa o progresso e entrega as polidas', async () => {
    const lista = falas(95, 40)
    const pedirBloco = servidor(lista)
    const aoPolir = vi.fn()
    const aoAvancar = vi.fn()
    const fim = await polirSessao({
      utterances: lista,
      pedirBloco,
      aoPolir,
      aoAvancar,
      sinal: new AbortController().signal,
    })
    expect(fim).toEqual({ fim: 'pronto' })
    expect(pedirBloco.mock.calls.map(([b]) => b)).toEqual([1, 2])
    expect(aoPolir).toHaveBeenCalledTimes(2)
    expect(aoPolir.mock.calls[0][0][0]).toEqual({ id: 'u40', traducaoPolida: 'polida u40' })
    expect(aoAvancar.mock.calls.map(([p]) => [p.bloco, p.feitos, p.total])).toEqual([
      [1, 1, 3],
      [2, 2, 3],
      [null, 3, 3],
    ])
  })

  it('cancelar aplica o bloco em curso (já foi pago) e não pede o próximo; retomar continua dele', async () => {
    const lista = falas(95)
    const controle = new AbortController()
    const base = servidor(lista)
    const pedirBloco = vi.fn(async (b: number) => {
      const r = await base(b)
      if (b === 0) controle.abort()
      return r
    })
    const aoPolir = vi.fn()
    const fim = await polirSessao({
      utterances: lista,
      pedirBloco,
      aoPolir,
      aoAvancar: vi.fn(),
      sinal: controle.signal,
    })
    expect(fim).toEqual({ fim: 'cancelado' })
    expect(pedirBloco).toHaveBeenCalledTimes(1)
    expect(aoPolir).toHaveBeenCalledTimes(1)

    // Retomar: a tela aplicou as polidas do bloco 0; a fila recomeça do 1.
    const polidas = new Map<string, string>(
      aoPolir.mock.calls[0][0].map((p: { id: string; traducaoPolida: string }) => [p.id, p.traducaoPolida]),
    )
    const depois = lista.map((u) => ({ ...u, traducaoPolida: polidas.get(u.id) ?? null }))
    const deNovo = servidor(depois)
    await polirSessao({
      utterances: depois,
      pedirBloco: deNovo,
      aoPolir: vi.fn(),
      aoAvancar: vi.fn(),
      sinal: new AbortController().signal,
    })
    expect(deNovo.mock.calls.map(([b]) => b)).toEqual([1, 2])
  })

  it('uma falha para a fila com o motivo', async () => {
    const lista = falas(95)
    const pedirBloco = vi.fn(
      async (): Promise<ResultadoDaNuance<PolimentoDoBloco>> => ({ ok: false, motivo: 'nuvem_ocupada', status: 429 }),
    )
    const fim = await polirSessao({
      utterances: lista,
      pedirBloco,
      aoPolir: vi.fn(),
      aoAvancar: vi.fn(),
      sinal: new AbortController().signal,
    })
    expect(fim).toEqual({ fim: 'erro', motivo: 'nuvem_ocupada' })
    expect(pedirBloco).toHaveBeenCalledTimes(1)
  })

  it('já cancelado antes de começar: nenhum pedido', async () => {
    const controle = new AbortController()
    controle.abort()
    const pedirBloco = servidor(falas(10))
    const fim = await polirSessao({
      utterances: falas(10),
      pedirBloco,
      aoPolir: vi.fn(),
      aoAvancar: vi.fn(),
      sinal: controle.signal,
    })
    expect(fim).toEqual({ fim: 'cancelado' })
    expect(pedirBloco).not.toHaveBeenCalled()
  })
})
