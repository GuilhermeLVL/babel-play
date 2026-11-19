/**
 * O PIVÔ DOS PARES ENTRE pt/es/fr/it/de É O ÚLTIMO RECURSO (CEL-01): com a nuvem consentida, quem traduz es→pt é a
 * nuvem/o tradutor da web, como antes — nada de baixar duas pernas (até 226 MB) nem de passar o pivô à frente.
 * Sem consentimento (o visitante protegido no celular), o pivô atende.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function montar(consentiu: boolean) {
  const { buildGateway } = await import('../src/gateway/index')
  const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
  const { BergamotLocal } = await import('../src/gateway/adapters/bergamotLocal')
  const { MyMemoryMt } = await import('../src/gateway/adapters/mymemory')
  const preloadOpus = vi.spyOn(OpusMtLocal.prototype, 'preload').mockImplementation(() => {})
  const preloadBergamot = vi.spyOn(BergamotLocal.prototype, 'preload').mockImplementation(() => {})
  const traduzOpus = vi.spyOn(OpusMtLocal.prototype, 'translate')
  vi.spyOn(MyMemoryMt.prototype, 'translate').mockImplementation(async (t: string) => ({
    text: `[web] ${t}`,
    engine: 'mymemory',
  }))
  const gw = buildGateway({
    profile: {
      id: 't',
      name: 't',
      builtin: true,
      economyMode: true,
      budget: { maxCloudRequests: 0, maxTokens: 0 },
      bindings: { mt: [{ adapterId: 'opus-mt-local' }, { adapterId: 'mymemory' }] },
    } as never,
    cloudConsent: () => consentiu,
  })
  return { gw, preloadOpus, preloadBergamot, traduzOpus }
}

describe('pivô entre pt/es/fr/it/de e a nuvem consentida', () => {
  it('com consentimento: warmup e preload não baixam as pernas, e a fala vai à web', async () => {
    const m = await montar(true)
    m.gw.mt.warmup([['es', 'pt']])
    await m.gw.mt.preload('es', 'pt')
    expect(m.preloadOpus).not.toHaveBeenCalled()
    expect(m.preloadBergamot).not.toHaveBeenCalled()
    const r = await m.gw.mt.translate('Hola amigo, ¿cómo estás hoy?', 'es', 'pt')
    expect(r.engine).toBe('mymemory')
    expect(m.traduzOpus).not.toHaveBeenCalled()
  })

  it('com consentimento, en→pt (modelo direto) continua no aparelho', async () => {
    const m = await montar(true)
    m.gw.mt.warmup([['en', 'pt']])
    expect(m.preloadOpus).toHaveBeenCalledWith('en', 'pt')
  })

  it('sem consentimento: o pivô aquece (é a única rota)', async () => {
    const m = await montar(false)
    m.gw.mt.warmup([['es', 'pt']])
    expect(m.preloadOpus.mock.calls.length + m.preloadBergamot.mock.calls.length).toBeGreaterThan(0)
  })
})
