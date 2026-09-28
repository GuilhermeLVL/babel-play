// @vitest-environment jsdom
/**
 * O REEMBOLSO NÃO DEPENDE DA FLAG (revisão de 27/09 das recompensas v2, P1).
 *
 * O corte do catálogo é regra do servidor; a flag `recompensas_v2` só liga telas. Com a flag atrás
 * do pedido, quem tinha direito às Seeds de volta dependia do operador ligar a flag — e a leitura
 * corria contra o cache das flags (`useMetricas`). Agora o cliente pede sempre, uma vez por sessão.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ reembolsarSeeds: vi.fn() }))
vi.mock('../src/data/api', () => api)
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: () => false }))

const { _reiniciarReembolsoDaSessao, recompensasV2Ligadas, reembolsarUmaVez } = await import('../src/lib/recompensasV2')

beforeEach(() => {
  localStorage.clear()
  _reiniciarReembolsoDaSessao()
  api.reembolsarSeeds.mockReset()
})

describe('reembolso com a flag desligada', () => {
  it('o pedido sai mesmo assim, e o aviso segue o servidor', async () => {
    api.reembolsarSeeds.mockResolvedValue({ creditado: 30, reembolsado: 30, avisoPendente: true })
    expect(recompensasV2Ligadas()).toBe(false)
    expect(await reembolsarUmaVez()).toBe(30)
    expect(api.reembolsarSeeds).toHaveBeenCalledTimes(1)
  })

  it('uma vez por sessão: duas chamadas dividem o mesmo pedido', async () => {
    api.reembolsarSeeds.mockResolvedValue({ creditado: 0, reembolsado: 0, avisoPendente: false })
    await Promise.all([reembolsarUmaVez(), reembolsarUmaVez()])
    expect(api.reembolsarSeeds).toHaveBeenCalledTimes(1)
  })
})
