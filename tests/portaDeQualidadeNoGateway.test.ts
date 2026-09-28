/**
 * PORTA DE QUALIDADE DA TRADUÇÃO FINAL no gateway (harness §5; integração de 2026-09-28).
 *
 * A tradução LOCAL do final (Chrome Translator / opus-mt) passa por `avaliarTraducaoLocal`; se
 * parecer ruim (cópia do original, tamanho fora de [0,5; 2], vazia) e o chamador disser que a pessoa
 * tem direito à nuvem (`escalarSeRuim`), SÓ esse trecho sobe ao Tradutor IA — com consentimento. Sem
 * o direito ou sem consentimento, fica o local. A nuvem que já falhou no mesmo pedido não é repetida.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

const FRASE = 'Hello world, this is what I was saying today'
/** Passa na validação de idioma, mas divaga: mais que o dobro do tamanho da origem. */
const DIVAGOU =
  'Olá mundo, era isso que eu dizia hoje, e depois continuei falando de outras coisas sem parar por muito tempo na conversa'

async function montar(opts: { consentiu: boolean; traducaoNativa: string }) {
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', {
    availability: async () => 'available',
    create: async () => ({ translate: async () => opts.traducaoNativa }),
  })
  const { apiFetch } = await import('../src/data/api')
  const api = apiFetch as unknown as ReturnType<typeof vi.fn>
  api.mockReset()
  api.mockResolvedValue(
    new Response(JSON.stringify({ text: 'Olá mundo, era isso que eu dizia hoje' }), { status: 200 }),
  )
  const { buildGateway } = await import('../src/gateway/index')
  const { capMetrics } = await import('../src/gateway/capture/captureMetrics')
  capMetrics.reset()
  const gw = buildGateway({
    profile: {
      id: 't',
      name: 't',
      builtin: true,
      economyMode: false,
      budget: { maxCloudRequests: 100, maxTokens: 100_000 },
      bindings: { mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'server-llm-mt' }] },
    } as never,
    cloudConsent: () => opts.consentiu,
  })
  return { gw, api, capMetrics }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('porta de qualidade da MT final', () => {
  it('local ruim (divagou: tamanho fora da faixa) + direito + consentimento → sobe à nuvem e conta a escalada', async () => {
    const { gw, api, capMetrics } = await montar({ consentiu: true, traducaoNativa: DIVAGOU })
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { escalarSeRuim: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api).toHaveBeenCalledTimes(1)
    expect(capMetrics.summary().escaladas.mt).toBe(1)
  })

  it('local bom → fica o local, sem chamada à nuvem', async () => {
    const { gw, api } = await montar({ consentiu: true, traducaoNativa: 'Olá mundo, era isso que eu dizia hoje' })
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { escalarSeRuim: true })
    expect(r.engine).toBe('chrome-translator')
    expect(api).not.toHaveBeenCalled()
  })

  it('sem o direito (grátis) → fica o local, mesmo ruim', async () => {
    const { gw, api } = await montar({ consentiu: true, traducaoNativa: DIVAGOU })
    const r = await gw.mt.translate(FRASE, 'en', 'pt')
    expect(r.engine).toBe('chrome-translator')
    expect(api).not.toHaveBeenCalled()
  })

  it('sem consentimento → fica o local', async () => {
    const { gw, api } = await montar({ consentiu: false, traducaoNativa: DIVAGOU })
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { escalarSeRuim: true })
    expect(r.engine).toBe('chrome-translator')
    expect(api).not.toHaveBeenCalled()
  })

  it('a nuvem-primeiro que falhou no MESMO pedido não é repetida pela porta', async () => {
    const { gw, api } = await montar({ consentiu: true, traducaoNativa: DIVAGOU })
    api.mockResolvedValue(new Response(JSON.stringify({ code: 'orcamento_esgotado' }), { status: 503 }))
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { escalarSeRuim: true, nuvemPrimeiro: true })
    expect(r.engine).toBe('chrome-translator')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('parcial nunca escala', async () => {
    const { gw, api } = await montar({ consentiu: true, traducaoNativa: DIVAGOU })
    await gw.mt.translate(FRASE, 'en', 'pt', { escalarSeRuim: true, parcial: true })
    expect(api).not.toHaveBeenCalled()
  })
})
