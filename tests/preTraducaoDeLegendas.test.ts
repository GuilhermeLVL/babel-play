/**
 * PRÉ-TRADUÇÃO DE LEGENDAS (openspec `pre-traducao-de-legendas`): lotes, progresso, cancelamento, repetidas, falhas,
 * motor carregando e legenda segura. Núcleo puro, sem motor.
 */
import { describe, expect, it, vi } from 'vitest'

import { politicaDaLegenda } from '../src/core/moderacao/legendaSegura'
import { MotorAindaCarregando } from '../src/core/robustness'
import {
  dividirEmLotes,
  FALHAS_SEGUIDAS_PARA_PARAR,
  preTraduzirLegenda,
  type ProgressoDaPreTraducao,
} from '../src/core/traducao/preTraducaoDeLegendas'

const falas = (n: number) => Array.from({ length: n }, (_, i) => `fala ${i}`)
const eco = async (t: string) => `T:${t}`

describe('dividirEmLotes', () => {
  it('45 falas curtas: 20, 20 e 5', () => {
    expect(dividirEmLotes(falas(45)).map((l) => l.length)).toEqual([20, 20, 5])
  })
  it('teto de caracteres fecha o lote antes das 20 falas', () => {
    const longas = Array.from({ length: 6 }, () => 'x'.repeat(900))
    expect(dividirEmLotes(longas).map((l) => l.length)).toEqual([2, 2, 2])
  })
  it('uma fala maior que o teto vai sozinha, sem laço infinito', () => {
    expect(dividirEmLotes(['x'.repeat(5000), 'a']).map((l) => l.length)).toEqual([1, 1])
  })
  it('legenda vazia: nenhum lote', () => expect(dividirEmLotes([])).toEqual([]))
})

describe('preTraduzirLegenda', () => {
  it('traduz tudo, cede a vez entre lotes e chega a 100%', async () => {
    const ceder = vi.fn(async () => {})
    const r = await preTraduzirLegenda({ falas: falas(45), traduzir: eco, ceder })
    expect(r.estado).toBe('concluida')
    expect(ceder).toHaveBeenCalledTimes(2)
    expect(r.falas).toHaveLength(45)
    expect(r.falas[44]).toMatchObject({ indice: 44, original: 'fala 44', traducao: 'T:fala 44' })
    expect(r.progresso).toMatchObject({ total: 45, feitas: 45, traduzidas: 45, fracao: 1 })
  })

  it('legenda vazia: concluída, fração 1', async () => {
    const r = await preTraduzirLegenda({ falas: [], traduzir: eco })
    expect(r.estado).toBe('concluida')
    expect(r.progresso.fracao).toBe(1)
  })

  it('cancelar depois de 12: devolve 12 e não toca a 13ª', async () => {
    const c = new AbortController()
    const traduzir = vi.fn(async (t: string) => {
      if (traduzir.mock.calls.length === 12) c.abort()
      return `T:${t}`
    })
    const r = await preTraduzirLegenda({ falas: falas(45), traduzir, signal: c.signal })
    expect(r.estado).toBe('cancelada')
    expect(traduzir).toHaveBeenCalledTimes(12)
    expect(r.falas).toHaveLength(12)
    expect(r.progresso).toMatchObject({ feitas: 12, total: 45 })
    expect(r.progresso.fracao).toBeLessThan(1)
  })

  it('já cancelado antes de começar: nada é traduzido', async () => {
    const traduzir = vi.fn(eco)
    const r = await preTraduzirLegenda({ falas: falas(3), traduzir, signal: AbortSignal.abort() })
    expect(r.estado).toBe('cancelada')
    expect(traduzir).not.toHaveBeenCalled()
  })

  it('repetidas traduzem uma vez (caixa e espaços ignorados) e contam à parte', async () => {
    const traduzir = vi.fn(eco)
    const r = await preTraduzirLegenda({ falas: ['Okay.', 'okay.', ' Okay. ', 'OKAY.', 'Go.'], traduzir })
    expect(traduzir).toHaveBeenCalledTimes(2)
    expect(r.progresso).toMatchObject({ traduzidas: 2, repetidas: 3, feitas: 5 })
    expect(r.falas[3]?.traducao).toBe('T:Okay.')
  })

  it('falas vazias são puladas sem chamar o motor', async () => {
    const traduzir = vi.fn(eco)
    const r = await preTraduzirLegenda({ falas: ['a', '   ', 'b'], traduzir })
    expect(traduzir).toHaveBeenCalledTimes(2)
    expect(r.progresso).toMatchObject({ vazias: 1, traduzidas: 2 })
    expect(r.falas[1]?.traducao).toBeNull()
  })

  it('erro numa fala: fica sem tradução, conta falha e o lote segue', async () => {
    const traduzir = async (t: string) => {
      if (t === 'fala 1') throw new Error('boom')
      return `T:${t}`
    }
    const r = await preTraduzirLegenda({ falas: falas(3), traduzir })
    expect(r.estado).toBe('concluida')
    expect(r.progresso).toMatchObject({ falhas: 1, traduzidas: 2, feitas: 3 })
    expect(r.falas[1]?.traducao).toBeNull()
  })

  it('falhas seguidas: para com "falhou" e devolve o que tem', async () => {
    const traduzir = vi.fn(async (t: string) => {
      if (t === 'fala 0') return 'T:0'
      throw new Error('motor quebrado')
    })
    const r = await preTraduzirLegenda({ falas: falas(30), traduzir })
    expect(r.estado).toBe('falhou')
    expect(r.progresso.falhas).toBe(FALHAS_SEGUIDAS_PARA_PARAR)
    expect(traduzir).toHaveBeenCalledTimes(1 + FALHAS_SEGUIDAS_PARA_PARAR)
  })

  it('motor ainda carregando: aguardando-motor, sem falha e sem nuvem', async () => {
    const traduzir = vi.fn(async () => {
      throw new MotorAindaCarregando('opus-mt-local')
    })
    const r = await preTraduzirLegenda({ falas: falas(10), traduzir })
    expect(r.estado).toBe('aguardando-motor')
    expect(r.progresso).toMatchObject({ falhas: 0, feitas: 0 })
    expect(traduzir).toHaveBeenCalledTimes(1)
  })

  it('estimativa só depois de 5 traduções; é a média vezes o que falta', async () => {
    let t = 0
    const agora = () => t
    const traduzir = async (x: string) => {
      t += 100
      return x
    }
    const vistos: ProgressoDaPreTraducao[] = []
    await preTraduzirLegenda({ falas: falas(10), traduzir, agora, aoProgredir: (p) => vistos.push(p) })
    expect(vistos[3]?.restanteEstimadoMs).toBeNull() // 4 traduzidas
    expect(vistos[4]?.restanteEstimadoMs).toBe(500) // 5 traduzidas, 100 ms cada, faltam 5
    expect(vistos[9]?.restanteEstimadoMs).toBe(0)
  })

  it('o progresso nunca passa de 1 e só cresce', async () => {
    const vistos: number[] = []
    await preTraduzirLegenda({
      falas: ['a', 'a', '', 'b', 'c'],
      traduzir: eco,
      aoProgredir: (p) => vistos.push(p.fracao),
    })
    expect(vistos.at(-1)).toBe(1)
    expect([...vistos].sort((a, b) => a - b)).toEqual(vistos)
  })

  describe('legenda segura', () => {
    const protegido = politicaDaLegenda({ protegido: true, opcaoDoAdulto: false })

    it('perfil protegido: termo sensível na tradução vira marcador e entra em ocultadas', async () => {
      const r = await preTraduzirLegenda({
        falas: ['reveal the quest'],
        traduzir: async () => 'revelar a busca pornô juntos',
        politica: protegido,
      })
      expect(r.falas[0]?.traducao).toContain('•••')
      expect(r.falas[0]?.traducao).not.toMatch(/porn/i)
      expect(r.falas[0]?.ocultadas).toBeGreaterThan(0)
    })

    it('o termo no original também é ocultado; o motor local recebeu o texto cru', async () => {
      const traduzir = vi.fn(async () => 'ok')
      const r = await preTraduzirLegenda({ falas: ['watch porn now'], traduzir, politica: protegido })
      expect(traduzir).toHaveBeenCalledWith('watch porn now')
      expect(r.falas[0]?.original).toContain('•••')
    })

    it('sem política (adulto sem a opção): texto intacto', async () => {
      const r = await preTraduzirLegenda({ falas: ['x'], traduzir: async () => 'busca pornô' })
      expect(r.falas[0]).toMatchObject({ traducao: 'busca pornô', ocultadas: 0 })
    })
  })
})
