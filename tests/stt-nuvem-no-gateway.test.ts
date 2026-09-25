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
