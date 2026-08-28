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

describe('tradução comunicativa da fala', () => {
  beforeEach(() => vi.resetModules())

  it('server-llm-mt se desliga na sessão também em 402 (sem plano), não só em 501/5xx', async () => {
    const { apiFetch } = await import('../src/data/api')
    ;(apiFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 402 }))
    const { ServerLlmMt } = await import('../src/gateway/adapters/serverLlmMt')
    const a = new ServerLlmMt() as unknown as { translate: (t: string, s: string, d: string) => Promise<unknown>; unavailable?: boolean; supports: (s: string, t: string) => boolean }
    await expect(a.translate('valeu', 'pt', 'en')).rejects.toThrow(/indisponível/)
    expect(a.unavailable).toBe(true)
    expect(a.supports('pt', 'en')).toBe(false)
  })

  it('manda `falada` e o contexto (≤3 falas) ao servidor', async () => {
    const { apiFetch } = await import('../src/data/api')
    const mock = apiFetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(new Response(JSON.stringify({ text: 'We were chilling.' }), { status: 200 }))
    const { ServerLlmMt } = await import('../src/gateway/adapters/serverLlmMt')
    const a = new ServerLlmMt()
    const r = await a.translate('a gente tava de boa', 'pt', 'en', { falada: true, contexto: ['1', '2', '3', '4'] })
    expect(r.text).toBe('We were chilling.')
    const body = JSON.parse(mock.mock.calls.at(-1)![1].body as string)
    expect(body.falada).toBe(true)
    expect(body.contexto).toEqual(['2', '3', '4'])
  })
})
