import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validarTraducao } from '../src/lib/validaTraducao'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

describe('tradução: cadeia confiável', () => {
  beforeEach(() => vi.resetModules())

  it('server-llm-mt se desliga para a sessão em 503 (Pages sem API_ORIGIN), não só em 501', async () => {
    const { apiFetch } = await import('../src/data/api')
    ;(apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 503 }))
    const { ServerLlmMt } = await import('../src/gateway/adapters/serverLlmMt')
    const a = new ServerLlmMt() as unknown as { translate: (t: string, s: string, d: string) => Promise<unknown>; unavailable?: boolean }
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow(/indisponível/)
    expect(a.unavailable).toBe(true)
  })

  it('rejeita "tradução" idêntica ao original quando o idioma-alvo é outro', () => {
    const v = validarTraducao('Hello there', 'pt', 'en', null, 'hello there')
    expect(v.ok).toBe(false)
    expect((v as { motivo?: string }).motivo).toBe('nao-traduziu')
  })

  it('aceita quando o texto realmente mudou', () => {
    const v = validarTraducao('Olá, tudo bem com você hoje?', 'pt', 'en', null, 'Hello, how are you today?')
    expect(v.ok).toBe(true)
  })
})

describe('gateway: a cascata de MT chama o motor de verdade', () => {
  it('uma tentativa por motor — com 0 o withRetry não executava nada', async () => {
    const { AiGateway } = await import('../src/core/gateway/gateway')
    const { BreakerRegistry } = await import('../src/core/robustness')
    const { BudgetLedger } = await import('../src/core/gateway/budget')
    const profile = { id: 'p', name: 'p', builtin: true, economyMode: true, budget: { maxCloudRequests: 0, maxTokens: 0 }, bindings: { mt: [{ adapterId: 'x' }] } } as never
    const core = new AiGateway(profile, new BreakerRegistry(), new BudgetLedger({ maxCloudRequests: 0, maxTokens: 0 }), () => true)
    await expect(core.run('mt', async () => 'traduzido')).resolves.toBe('traduzido')
  })
})
