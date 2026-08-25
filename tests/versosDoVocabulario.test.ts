/**
 * SALVAR A SESSÃO NÃO PODE PRENDER O USUÁRIO.
 *
 * Bug relatado em uso real: ao salvar, a tela ficava em "Salvando sessão…" por muito tempo e a
 * pessoa não conseguia iniciar outra captura nem navegar. O log da sessão mostrou a causa e o
 * agravante juntos: o salvamento traduzia PALAVRA POR PALAVRA em série (~40 falas × ~10
 * palavras), e o tradutor estava inteiramente fora do ar — todos os disjuntores abertos,
 * `NoRouteError` em cada chamada.
 *
 * O agravante é o que torna o defeito perverso: quanto PIOR a situação do tradutor, MAIS a
 * pessoa esperava, porque cada uma das centenas de chamadas ainda pagava a tentativa antes de
 * estourar. O caso mais provável (sem tradutor configurado) era o mais lento.
 *
 * A correção que importa é a desistência: rota não aparece no meio de um laço. Uma falha por
 * ausência de rota prova que as outras vão falhar igual.
 */
import { describe, it, expect, vi } from 'vitest'
import { traduzirVersos, ehFaltaDeRota } from '../src/lib/versosDoVocabulario'

const pedidos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ word: `palavra${i}`, src: 'pt', tgt: 'en' }))

class NoRouteError extends Error {
  constructor() { super('sem rota disponível para a capacidade "mt"'); this.name = 'NoRouteError' }
}

describe('reconhecer a ausência de rota', () => {
  it('pelo nome do erro', () => {
    expect(ehFaltaDeRota(new NoRouteError())).toBe(true)
  })

  it('pela mensagem, mesmo sem o nome — o gateway pode reembrulhar', () => {
    expect(ehFaltaDeRota(new Error('sem rota disponivel para a capacidade "mt"'))).toBe(true)
  })

  it('NÃO confunde com falha comum de rede: essa merece continuar tentando as outras', () => {
    expect(ehFaltaDeRota(new Error('fetch failed'))).toBe(false)
    expect(ehFaltaDeRota(null)).toBe(false)
  })
})

describe('desistência — a correção que resolve o travamento', () => {
  it('para na PRIMEIRA falta de rota em vez de tentar as 600', async () => {
    const traduzir = vi.fn().mockRejectedValue(new NoRouteError())
    const r = await traduzirVersos(pedidos(600), traduzir, { paralelas: 6 })

    expect(r.motivo).toBe('sem-rota')
    // Com 6 trabalhadores, no máximo 6 chamadas chegam a sair antes de todos verem a desistência.
    expect(traduzir.mock.calls.length).toBeLessThanOrEqual(6)
    expect(r.versos.size).toBe(0)
  })

  it('declara quantas ficaram sem verso — o número vai para a tela', async () => {
    const r = await traduzirVersos(pedidos(600), vi.fn().mockRejectedValue(new NoRouteError()), { paralelas: 2 })
    expect(r.naoTentadas).toBeGreaterThan(500)
  })

  it('falha PONTUAL não desiste: só aquela palavra fica sem verso', async () => {
    const traduzir = vi.fn(async (w: string) => {
      if (w === 'palavra3') throw new Error('timeout')
      return { text: `${w}-en` }
    })
    const r = await traduzirVersos(pedidos(10), traduzir, { paralelas: 3 })

    expect(r.motivo).toBe('completo')
    expect(traduzir).toHaveBeenCalledTimes(10)
    expect(r.versos.size).toBe(9)
    expect(r.versos.has('palavra3')).toBe(false)
  })
})

describe('caminho feliz e limites', () => {
  it('traduz tudo quando o tradutor responde', async () => {
    const r = await traduzirVersos(pedidos(5), async (w) => ({ text: `${w}-en` }))
    expect(r.traduzidas).toBe(5)
    expect(r.versos.get('palavra0')).toBe('palavra0-en')
    expect(r.motivo).toBe('completo')
  })

  it('respeita o teto por sessão e DECLARA o corte', async () => {
    const traduzir = vi.fn(async (w: string) => ({ text: `${w}-en` }))
    const r = await traduzirVersos(pedidos(500), traduzir, { teto: 120 })
    expect(traduzir).toHaveBeenCalledTimes(120)
    expect(r.motivo).toBe('teto')
    expect(r.naoTentadas).toBe(380)
  })

  it('resposta vazia não vira verso vazio — o cartão fica sem tradução, honesto', async () => {
    const r = await traduzirVersos(pedidos(3), async () => ({ text: '' }))
    expect(r.versos.size).toBe(0)
    expect(r.motivo).toBe('completo')
  })

  it('lista vazia não chama nada', async () => {
    const traduzir = vi.fn()
    const r = await traduzirVersos([], traduzir)
    expect(traduzir).not.toHaveBeenCalled()
    expect(r.motivo).toBeNull()
  })

  it('roda em PARALELO, não em série', async () => {
    let simultaneas = 0
    let pico = 0
    const traduzir = async (w: string) => {
      simultaneas++; pico = Math.max(pico, simultaneas)
      await new Promise((r) => setTimeout(r, 5))
      simultaneas--
      return { text: w }
    }
    await traduzirVersos(pedidos(20), traduzir, { paralelas: 6 })
    expect(pico).toBeGreaterThan(1)
    expect(pico).toBeLessThanOrEqual(6)
  })
})
