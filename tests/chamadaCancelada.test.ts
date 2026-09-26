/**
 * CANCELAMENTO NÃO É FALHA (auditoria de latência 2026-09-26, item 3).
 *
 * A tradução de um parcial velho é interrompida pelo tradutor local para o final passar na frente.
 * Isso não pode abrir o disjuntor do tradutor nem mandar o texto velho ao próximo motor da cascata.
 */
import {
  AiGateway,
  BreakerRegistry,
  BudgetLedger,
  ChamadaCancelada,
  CircuitBreaker,
  type Profile,
  withRetry,
} from '@core'
import { describe, expect, it, vi } from 'vitest'

const perfil: Profile = {
  id: 't',
  name: 't',
  builtin: true,
  economyMode: false,
  budget: { maxCloudRequests: 10, maxTokens: 10 },
  bindings: { mt: [{ adapterId: 'local' }, { adapterId: 'rede' }] },
}

describe('ChamadaCancelada', () => {
  it('a cascata PARA: o próximo motor não é chamado', async () => {
    const gw = new AiGateway(perfil, new BreakerRegistry(), new BudgetLedger(perfil.budget), () => true)
    const chamados: string[] = []
    await expect(
      gw.run('mt', async (b) => {
        chamados.push(b.adapterId)
        throw new ChamadaCancelada()
      }),
    ).rejects.toMatchObject({ name: 'ChamadaCancelada' })
    expect(chamados).toEqual(['local'])
  })

  it('não conta no disjuntor', async () => {
    const cb = new CircuitBreaker('local', 2, 60_000)
    for (let i = 0; i < 5; i++) await cb.run(() => Promise.reject(new ChamadaCancelada())).catch(() => {})
    expect(cb.isOpen).toBe(false)
  })

  it('não é re-tentada', async () => {
    const trabalho = vi.fn(() => Promise.reject(new ChamadaCancelada()))
    await expect(withRetry(3, 1, trabalho)).rejects.toMatchObject({ name: 'ChamadaCancelada' })
    expect(trabalho).toHaveBeenCalledTimes(1)
  })

  it('erro comum continua caindo para o próximo motor', async () => {
    const gw = new AiGateway(perfil, new BreakerRegistry(), new BudgetLedger(perfil.budget), () => true)
    const r = await gw.run('mt', async (b) => {
      if (b.adapterId === 'local') throw new Error('falhou')
      return 'ok'
    })
    expect(r).toBe('ok')
  })
})
