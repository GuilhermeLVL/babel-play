/**
 * CARACTERIZAÇÃO — A-01 (Alto): o run-loop do gateway não tem timeout.
 *
 * Achado da auditoria 2026-08 (audit-code.md A-01). `src/core/gateway/gateway.ts:74` compõe
 * `breaker` + `withRetry` mas NÃO `withTimeout` (que existe em `robustness.ts:15` e não tem call
 * site). Sem teto de tempo, um binding que pendura congela a cascata: o retry nunca dispara, o
 * breaker nunca abre, e o próximo binding (que funcionaria) nunca é tentado.
 *
 * Estratégia p/ não-determinismo: em vez de "esperar para sempre", corremos `run()` contra um
 * timer de teste. Se o timer vence, o gateway travou — o bug está confirmado de forma determinística.
 *
 * Quando A-01 for corrigido (withTimeout no run-loop):
 *   - 'BUG ATUAL: binding pendurado trava'  passará a falhar → inverta.
 *   - 'DESEJADO: cai para o próximo binding' (it.fails) passará → remova o .fails.
 */
import { describe, it, expect } from 'vitest'
import { AiGateway, BreakerRegistry, BudgetLedger } from '@core'
import type { Profile, CapabilityBinding } from '@core'

const NUNCA_RESOLVE = new Promise<never>(() => { /* pendura de propósito */ })

function gatewayComBindingQuePendura() {
  const profile: Profile = {
    id: 'test', name: 'test', builtin: false, economyMode: false,
    budget: { maxCloudRequests: -1, maxTokens: -1 },
    bindings: { llm: [{ adapterId: 'pendura' }, { adapterId: 'funciona' }] },
  }
  const gw = new AiGateway(profile, new BreakerRegistry(), new BudgetLedger(profile.budget), () => true)
  // primeiro binding pendura; o segundo resolveria na hora
  const attempt = (b: CapabilityBinding): Promise<string> =>
    b.adapterId === 'pendura' ? NUNCA_RESOLVE : Promise.resolve('ok-do-fallback')
  return { gw, attempt }
}

/** Resolve 'travou' se `p` não assentar dentro de `ms`. */
function corridaContraTimer<T>(p: Promise<T>, ms: number): Promise<T | 'travou'> {
  return Promise.race([p, new Promise<'travou'>((r) => setTimeout(() => r('travou'), ms))])
}

describe('A-01 — timeout no gateway', () => {
  // Config de teste para OBSERVAR o timeout num unit test: o default de 'llm' é 45s (produção), que
  // um teste curto não veria. timeoutMs:100 + retries:1 exercitam o caminho do A-01 de forma
  // determinística — a ASSERÇÃO (cai para o fallback) é o que importa, não o valor do teto.
  const OPTS = { timeoutMs: 100, retries: 1 } as const

  it('CORRIGIDO (A-01): um binding pendurado NÃO trava mais o run-loop', async () => {
    const { gw, attempt } = gatewayComBindingQuePendura()
    const resultado = await corridaContraTimer(gw.run('llm', attempt, OPTS), 1000)
    expect(resultado).not.toBe('travou')
  })

  it('DESEJADO (A-01): binding pendurado expira e cai para o fallback', async () => {
    const { gw, attempt } = gatewayComBindingQuePendura()
    const resultado = await corridaContraTimer(gw.run('llm', attempt, OPTS), 1000)
    // Asserção INTACTA (só o wrapper .fails foi removido): o primário expira, o gateway usa o 2º binding.
    expect(resultado).toBe('ok-do-fallback')
  })

  it('CONTROLE: sem binding pendurado, o gateway resolve normalmente (não é o timer que engana)', async () => {
    const profile: Profile = {
      id: 't', name: 't', builtin: false, economyMode: false,
      budget: { maxCloudRequests: -1, maxTokens: -1 },
      bindings: { llm: [{ adapterId: 'funciona' }] },
    }
    const gw = new AiGateway(profile, new BreakerRegistry(), new BudgetLedger(profile.budget), () => true)
    const resultado = await corridaContraTimer(gw.run('llm', () => Promise.resolve('ok')), 300)
    expect(resultado).toBe('ok')
  })
})
