/**
 * O STT DE NUVEM NO GATEWAY DO NAVEGADOR — o que a captura precisa saber dele.
 *
 * `finalNaNuvem()` decide o teto do corte forçado da fala contínua (12 s na nuvem, 6 s no local).
 * Ele só pode dizer "sim" quando o decode final de fato iria à nuvem: rota nuvem-primeiro, um
 * binding `groq-whisper` no perfil e o consentimento de Ajustes → Privacidade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

function perfil(stt: Array<{ adapterId: string }>) {
  return {
    id: 'teste',
    name: 'teste',
    builtin: true,
    economyMode: false,
    budget: { maxCloudRequests: 100, maxTokens: 100_000 },
    bindings: { stt },
  }
}

async function montar(stt: Array<{ adapterId: string }>, consentiu: boolean) {
  const { apiFetch } = await import('../src/data/api')
  const api = apiFetch as unknown as ReturnType<typeof vi.fn>
  api.mockReset()
  const { buildGateway } = await import('../src/gateway/index')
  return { gw: buildGateway({ profile: perfil(stt) as never, cloudConsent: () => consentiu }), api }
}

beforeEach(() => {
  vi.resetModules()
})

describe('transcribePcm', () => {
  it('repassa o prompt de contexto ao adaptador de nuvem', async () => {
    const { gw, api } = await montar([{ adapterId: 'groq-whisper' }], true)
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'segunda parte' }), { status: 200 }))
    const r = await gw.stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt', prompt: 'primeira parte' })
    expect(r.engine).toBe('groq-whisper')
    expect((api.mock.calls[0][1].headers as Record<string, string>)['x-stt-prompt']).toBe('primeira%20parte')
  })
})

describe('telemetria do STT no gateway', () => {
  it('motor que cai conta como fallback `stt:<adapter>`', async () => {
    const { gw, api } = await montar([{ adapterId: 'groq-whisper' }], true)
    const { capMetrics } = await import('../src/gateway/capture/captureMetrics')
    capMetrics.reset()
    api.mockResolvedValue(new Response('sem orçamento', { status: 503 }))
    await expect(gw.stt.transcribePcm(new Float32Array(16000), 16000, { languageHint: 'pt' })).rejects.toThrow(/503/)
    expect(capMetrics.drenarTelemetria().fallbacks).toEqual({ 'stt:groq-whisper': 1 })
  })

  it('crédito de legenda vindo da nuvem é filtrado e marcado como descarte por alucinação', async () => {
    const { gw, api } = await montar([{ adapterId: 'groq-whisper' }], true)
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'Legendas pela comunidade Amara.org' }), { status: 200 }))
    const r = await gw.stt.transcribePcm(new Float32Array(16000 * 4), 16000, { languageHint: 'pt' })
    expect(r.text).toBe('')
    expect(r.alucinacaoDescartada).toBe(true)
  })
})

describe('finalNaNuvem', () => {
  it('rota nuvem-primeiro + groq no perfil + consentimento → sim', async () => {
    const { gw } = await montar([{ adapterId: 'groq-whisper' }, { adapterId: 'whisper-local' }], true)
    expect(gw.stt.finalNaNuvem()).toBe(false) // antes de a rota ser decidida
    gw.stt.setRoute({ preferCloud: true })
    expect(gw.stt.finalNaNuvem()).toBe(true)
  })

  it('sem consentimento, o final é local: o corte volta a 6 s', async () => {
    const { gw } = await montar([{ adapterId: 'groq-whisper' }, { adapterId: 'whisper-local' }], false)
    gw.stt.setRoute({ preferCloud: true })
    expect(gw.stt.finalNaNuvem()).toBe(false)
  })

  it('perfil sem groq (Privado/Local) nunca diz nuvem', async () => {
    const { gw } = await montar([{ adapterId: 'whisper-local' }], true)
    gw.stt.setRoute({ preferCloud: true })
    expect(gw.stt.finalNaNuvem()).toBe(false)
  })
})
