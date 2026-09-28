/**
 * TRADUTOR NATIVO CRIADO NO CLIQUE (harness adaptativo §1.2, M3; integração de 2026-09-28).
 *
 * A Translator API só cria um tradutor cujo pacote vai baixar com ATIVAÇÃO DO USUÁRIO. Criado dentro
 * de uma tradução assíncrona, falhava e o par ficava "indisponível" a sessão inteira — e o opus-mt
 * (113 MB) baixava mesmo em Chrome que traduz de graça. Agora o clique em "Iniciar" prepara o
 * nativo (com `monitor` de progresso) e o aquecimento do opus-mt espera e pula o par pronto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

function stubTranslator(disp: string) {
  const create = vi.fn(
    async (o: {
      monitor?: (m: { addEventListener: (t: string, f: (e: { loaded: number }) => void) => void }) => void
    }) => {
      o.monitor?.({ addEventListener: (_t, f) => f({ loaded: 0.5 }) })
      return { translate: async (t: string) => `nativo: ${t}` }
    },
  )
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', { availability: vi.fn(async () => disp), create })
  return { create }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('ChromeTranslatorMt.preparar', () => {
  it("'available': cria já e o par fica pronto", async () => {
    const { create } = stubTranslator('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await expect(t.preparar('en', 'pt-BR')).resolves.toBe('available')
    expect(t.pronto('en', 'pt')).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    // A tradução reaproveita a instância criada no clique.
    await t.translate('hi', 'en', 'pt')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("'downloadable': cria com monitor (progresso) e devolve sem esperar o download", async () => {
    stubTranslator('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    const progresso: number[] = []
    await expect(t.preparar('en', 'pt', (p) => progresso.push(p))).resolves.toBe('downloadable')
    await Promise.resolve()
    await Promise.resolve()
    expect(progresso).toContain(0.5)
  })

  it("'unavailable' e sem a API: não cria nada, não lança", async () => {
    const { create } = stubTranslator('unavailable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    await expect(new ChromeTranslatorMt().preparar('en', 'pt')).resolves.toBe('unavailable')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('gateway: opus-mt não aquece o par que o nativo traduz', () => {
  async function montar() {
    const { buildGateway } = await import('../src/gateway/index')
    const gw = buildGateway({
      profile: {
        id: 't',
        name: 't',
        builtin: true,
        economyMode: true,
        budget: { maxCloudRequests: 0, maxTokens: 0 },
        bindings: { mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'opus-mt-local' }] },
      } as never,
      cloudConsent: () => false,
    })
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const preload = vi.spyOn(OpusMtLocal.prototype, 'preload').mockImplementation(() => {})
    return { gw, preload }
  }

  it('nativo available → warmup e preload pulam o opus-mt', async () => {
    stubTranslator('available')
    const { gw, preload } = await montar()
    void gw.mt.prepararNativo([['en', 'pt']])
    gw.mt.warmup([['en', 'pt']])
    await gw.mt.preload('en', 'pt')
    await new Promise((r) => setTimeout(r, 0))
    expect(preload).not.toHaveBeenCalled()
  })

  it('nativo indisponível → o opus-mt aquece como antes', async () => {
    stubTranslator('unavailable')
    const { gw, preload } = await montar()
    void gw.mt.prepararNativo([['en', 'pt']])
    gw.mt.warmup([['en', 'pt']])
    await new Promise((r) => setTimeout(r, 0))
    expect(preload).toHaveBeenCalledWith('en', 'pt')
  })
})
