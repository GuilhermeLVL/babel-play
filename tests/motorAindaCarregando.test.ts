/**
 * MOTOR AINDA CARREGANDO NÃO É FALHA (Quest emulado, 2026-09-28).
 *
 * O opus-mt respondia "ainda carregando" a cada final E a cada parcial enquanto o modelo baixava, e
 * cada resposta contava como falha: três delas abriam o disjuntor por 30 s. O modelo ficava pronto
 * aos 29,3 s e os finais seguiam pulando o tradutor até ~57 s (primeira tradução real aos 54,6 s).
 * "Carregando" é um PULO: a cascata passa ao próximo motor sem registrar falha nem re-tentar.
 */
import {
  AiGateway,
  BreakerRegistry,
  BudgetLedger,
  CircuitBreaker,
  ehMotorCarregando,
  MotorAindaCarregando,
  NoRouteError,
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

const novoGateway = (breakers = new BreakerRegistry()) =>
  new AiGateway(perfil, breakers, new BudgetLedger(perfil.budget), () => true)

describe('MotorAindaCarregando', () => {
  it('é reconhecido pelo nome (atravessa worker e bundles)', () => {
    expect(ehMotorCarregando(new MotorAindaCarregando('opus-mt'))).toBe(true)
    expect(ehMotorCarregando({ name: 'MotorAindaCarregando' })).toBe(true)
    expect(ehMotorCarregando(new Error('ainda carregando'))).toBe(false)
    expect(ehMotorCarregando(null)).toBe(false)
  })

  it('não conta no disjuntor: dez pulos seguidos não o abrem', async () => {
    const cb = new CircuitBreaker('local', 3, 60_000)
    for (let i = 0; i < 10; i++) await cb.run(() => Promise.reject(new MotorAindaCarregando('x'))).catch(() => {})
    expect(cb.isOpen).toBe(false)
  })

  it('não zera a contagem de falhas de verdade (pulo não é sucesso)', async () => {
    const cb = new CircuitBreaker('local', 3, 60_000)
    await cb.run(() => Promise.reject(new Error('falha 1'))).catch(() => {})
    await cb.run(() => Promise.reject(new Error('falha 2'))).catch(() => {})
    await cb.run(() => Promise.reject(new MotorAindaCarregando('x'))).catch(() => {})
    await cb.run(() => Promise.reject(new Error('falha 3'))).catch(() => {})
    expect(cb.isOpen).toBe(true)
  })

  it('falha comum continua abrindo o disjuntor', async () => {
    const cb = new CircuitBreaker('local', 3, 60_000)
    for (let i = 0; i < 3; i++) await cb.run(() => Promise.reject(new Error('quebrou'))).catch(() => {})
    expect(cb.isOpen).toBe(true)
  })

  it('não é re-tentado', async () => {
    const trabalho = vi.fn(() => Promise.reject(new MotorAindaCarregando('x')))
    await expect(withRetry(3, 1, trabalho)).rejects.toMatchObject({ name: 'MotorAindaCarregando' })
    expect(trabalho).toHaveBeenCalledTimes(1)
  })

  it('a cascata PASSA ao próximo motor', async () => {
    const chamados: string[] = []
    const r = await novoGateway().run('mt', async (b) => {
      chamados.push(b.adapterId)
      if (b.adapterId === 'local') throw new MotorAindaCarregando('local')
      return 'da rede'
    })
    expect(r).toBe('da rede')
    expect(chamados).toEqual(['local', 'rede'])
  })

  it('o disjuntor do motor carregando segue FECHADO depois de muitas falas (o cenário do Quest)', async () => {
    const breakers = new BreakerRegistry()
    const gw = novoGateway(breakers)
    for (let i = 0; i < 8; i++) {
      await gw
        .run('mt', async (b) => {
          if (b.adapterId === 'local') throw new MotorAindaCarregando('local')
          throw new Error('rede fora')
        })
        .catch((e) => expect(e).toBeInstanceOf(NoRouteError))
    }
    expect(breakers.get('local').isOpen).toBe(false)
    // O modelo ficou pronto: a fala seguinte já é atendida por ele, sem esperar cooldown nenhum.
    const r = await gw.run('mt', async (b) => (b.adapterId === 'local' ? 'local pronto' : 'rede'))
    expect(r).toBe('local pronto')
  })

  it('reiniciar() fecha um disjuntor aberto (o modelo local ficou pronto)', async () => {
    const breakers = new BreakerRegistry()
    const cb = breakers.get('local')
    for (let i = 0; i < 3; i++) await cb.run(() => Promise.reject(new Error('x'))).catch(() => {})
    expect(cb.isOpen).toBe(true)
    breakers.reiniciar('local')
    expect(breakers.get('local').isOpen).toBe(false)
  })
})
