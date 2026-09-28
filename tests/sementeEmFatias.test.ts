/**
 * A SEMENTE NÃO TRAVA A LEGENDA (Quest emulado, 2026-09-28).
 *
 * Medido: a primeira fala disparava o download do TSV (430 KB) e, na volta, o parse e o índice
 * aproximado inteiros rodavam de uma vez na thread principal — 1,3–1,6 s de tela parada no meio da
 * primeira legenda. Agora: (1) o download e a montagem só começam no OCIOSO, depois da primeira
 * legenda; (2) a montagem vai em FATIAS de ~8 ms, cedendo a thread entre elas; (3) até terminar, a
 * busca simplesmente não acha nada na semente (a cascata segue para o tradutor).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  criarSemente,
  linhasDaSemente,
  ORCAMENTO_DA_FATIA_MS,
  processarEmFatias,
} from '../src/lib/traducao/sementeDeTraducao'

const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('processarEmFatias', () => {
  it('cede a thread quando a fatia estoura o orçamento, e processa TUDO', async () => {
    expect(ORCAMENTO_DA_FATIA_MS).toBe(8)
    let relogio = 0
    const feitos: number[] = []
    const ceder = vi.fn(async () => {})
    const fatias = await processarEmFatias(
      Array.from({ length: 100 }, (_, i) => i),
      (i) => {
        feitos.push(i)
        relogio += 1 // cada item custa 1 ms
      },
      { agora: () => relogio, ceder, checarACada: 1 },
    )
    expect(feitos).toHaveLength(100)
    expect(feitos[99]).toBe(99)
    // 100 ms de trabalho em fatias de 8 ms: ~12 cessões, nenhuma fatia acima do orçamento.
    expect(ceder.mock.calls.length).toBeGreaterThanOrEqual(11)
    expect(fatias).toBe(ceder.mock.calls.length + 1)
  })

  it('trabalho que cabe numa fatia não cede nada', async () => {
    const ceder = vi.fn(async () => {})
    await processarEmFatias([1, 2, 3], () => {}, { agora: () => 0, ceder })
    expect(ceder).not.toHaveBeenCalled()
  })

  it('aceita um iterável preguiçoso (o TSV lido linha a linha, sem split do arquivo inteiro)', async () => {
    const pares: Array<[string, string]> = []
    await processarEmFatias(linhasDaSemente('# cab\nA\tB\nsem tab\n\nC\tD\n'), (p) => pares.push(p), {
      agora: () => 0,
    })
    expect(pares).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ])
  })
})

describe('criarSemente: adiada e em fatias', () => {
  const TSV = 'Good morning.\tBom dia.\nThank you.\tObrigado.\n'

  it('o download só começa quando o agendador (ocioso) libera', async () => {
    let liberar: (() => void) | null = null
    const carregar = vi.fn(async () => TSV)
    const s = criarSemente({ carregar, agendar: (f) => void (liberar = f) })
    expect(await s.exata('en|pt|good morning')).toBeUndefined()
    await esperar()
    expect(carregar).not.toHaveBeenCalled() // a primeira legenda passa sem a semente disputar a thread
    liberar!()
    await esperar()
    await esperar()
    expect(carregar).toHaveBeenCalledWith('en-pt')
    expect((await s.exata('en|pt|good morning'))?.texto).toBe('Bom dia.')
  })

  it('enquanto a montagem não termina, a busca erra (não devolve índice pela metade)', async () => {
    let liberarFatia: (() => void) | null = null
    let relogio = 0
    const s = criarSemente({
      carregar: async () => TSV,
      agendar: (f) => f(),
      agora: () => (relogio += 10), // cada item estoura a fatia
      ceder: () => new Promise<void>((r) => (liberarFatia = r)),
    })
    await s.exata('en|pt|thank you')
    await esperar()
    expect(await s.exata('en|pt|thank you')).toBeUndefined() // montando
    while (liberarFatia) {
      const f: () => void = liberarFatia
      liberarFatia = null
      f()
      await esperar()
    }
    expect((await s.exata('en|pt|thank you'))?.texto).toBe('Obrigado.')
  })
})
