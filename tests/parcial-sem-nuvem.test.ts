/**
 * PARCIAL NUNCA VAI À NUVEM PAGA (auditoria de eficiência da IA, 2026-09-28, achado 1).
 *
 * A cada ~1,1 s o parcial do Whisper chamava `gateway.mt.translate(..., {falada, parcial: true})`, e
 * o ramo `falada/nuvemPrimeiro` do gateway ignorava `parcial`: cada refinamento de uma frase ia ao
 * `server-llm-mt` (LLM pago, cota do usuário) para ser jogado fora segundos depois. O parcial agora
 * só usa tradutor LOCAL (Chrome Translator nativo, opus-mt já carregado); sem nenhum, fica sem
 * tradução — o final traduz, e só o final vai à nuvem.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

type Binding = { adapterId: string }

function perfil(mt: Binding[]) {
  return {
    id: 'teste',
    name: 'teste',
    builtin: true,
    economyMode: false,
    budget: { maxCloudRequests: 100, maxTokens: 100_000 },
    bindings: { mt },
  }
}

const CADEIA_COMPLETA: Binding[] = [
  { adapterId: 'chrome-translator' },
  { adapterId: 'opus-mt-local' },
  { adapterId: 'mymemory' },
  { adapterId: 'server-llm-mt' },
]

async function montar(mt: Binding[] = CADEIA_COMPLETA) {
  const { apiFetch } = await import('../src/data/api')
  const api = apiFetch as unknown as ReturnType<typeof vi.fn>
  api.mockReset()
  api.mockResolvedValue(new Response(JSON.stringify({ text: 'Olá, mundo, pelo servidor' }), { status: 200 }))
  const chamadasMyMemory: string[] = []
  vi.stubGlobal('fetch', async (url: unknown) => {
    chamadasMyMemory.push(String(url))
    return new Response(
      JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Olá mundo pela memória' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  const { buildGateway } = await import('../src/gateway/index')
  const gw = buildGateway({ profile: perfil(mt) as never, cloudConsent: () => true })
  return { gw, api, chamadasMyMemory }
}

/** Chrome Translator nativo presente e com o par pronto (o motor local "de graça" do desktop). */
function stubTradutorNativo() {
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', {
    availability: async () => 'available',
    create: async () => ({ translate: async (t: string) => `nativo: ${t.replace('Hello', 'Olá')}` }),
  })
}

const FRASE = 'Hello world, this is what I was saying'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('parcial: nunca vai a motor de nuvem', () => {
  it('parcial da SUA fala (`falada`) não chama o server-llm-mt nem o MyMemory', async () => {
    const { gw, api, chamadasMyMemory } = await montar()
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { falada: true, parcial: true })
    expect(api).not.toHaveBeenCalled()
    expect(chamadasMyMemory).toEqual([])
    expect(r.text).toBe('') // sem motor local pronto: sem tradução, e sem erro
  })

  it('parcial de quem paga (`nuvemPrimeiro`) também não vai à nuvem', async () => {
    const { gw, api, chamadasMyMemory } = await montar()
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { nuvemPrimeiro: true, parcial: true })
    expect(api).not.toHaveBeenCalled()
    expect(chamadasMyMemory).toEqual([])
    expect(r.text).toBe('')
  })

  it('parcial com o tradutor nativo disponível traduz localmente', async () => {
    stubTradutorNativo()
    const { gw, api } = await montar()
    // O parcial só usa o tradutor que JÁ EXISTE: quem cria é o clique em "Iniciar" (estágio 4).
    await gw.mt.prepararNativo([['en', 'pt']])
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { falada: true, nuvemPrimeiro: true, parcial: true })
    expect(r.engine).toBe('chrome-translator')
    expect(r.text).toContain('nativo')
    expect(api).not.toHaveBeenCalled()
  })

  it('parcial numa cadeia só de nuvem: resolve sem tradução em vez de lançar', async () => {
    const { gw, api } = await montar([{ adapterId: 'server-llm-mt' }])
    await expect(gw.mt.translate(FRASE, 'en', 'pt', { falada: true, parcial: true })).resolves.toMatchObject({
      text: '',
    })
    expect(api).not.toHaveBeenCalled()
  })
})

describe('final: continua indo à nuvem', () => {
  it('o final da SUA fala vai ao server-llm-mt primeiro', async () => {
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { falada: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('o final do sistema de quem paga vai ao server-llm-mt primeiro, mesmo com o nativo presente', async () => {
    stubTradutorNativo()
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FRASE, 'en', 'pt', { nuvemPrimeiro: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api).toHaveBeenCalledTimes(1)
  })
})

describe('opus-mt: parcial não dispara o download de 113 MB', () => {
  it('modelo ainda não carregado: o parcial falha sem criar o worker nem pedir o preload', async () => {
    const criado = vi.fn()
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          criado()
        }
        postMessage() {}
        terminate() {}
      },
    )
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const a = new OpusMtLocal()
    await expect(a.translate('Hello', 'en', 'pt', { parcial: true })).rejects.toThrow(/parcial/)
    expect(criado).not.toHaveBeenCalled()
  })
})
