// @vitest-environment jsdom
/**
 * A PÁGINA DE ANÚNCIOS (`public/anuncios/espaco.html` + `espaco.js`, ruling R32) — a única que carrega o
 * GPT do Google, na origem própria de anúncios.
 *
 *  - sem `consentimento=1` na query: o GPT NUNCA é carregado;
 *  - com ele: carrega o GPT uma vez, liga as travas de criança/idade/dados ANTES de qualquer slot e nunca
 *    chama `setPublisherProvidedId`;
 *  - o premiado usa o formato premiado do GPT e avisa o app (`postMessage` só para a origem `app=`):
 *    `recompensa` com a exibição, `fechou` e `vazio`.
 */
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CODIGO = readFileSync('public/anuncios/espaco.js', 'utf8')
const HTML = readFileSync('public/anuncios/espaco.html', 'utf8')
const GPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'
const APP = 'https://frasy.com.br'

type Ouvinte = (e: Record<string, unknown>) => void

function gptFalso() {
  const ouvintes: Record<string, Ouvinte> = {}
  const slot = { addService: vi.fn(() => slot) }
  const pubads = {
    setPrivacySettings: vi.fn(),
    setPublisherProvidedId: vi.fn(),
    setForceSafeFrame: vi.fn(),
    enableSingleRequest: vi.fn(),
    addEventListener: vi.fn((nome: string, f: Ouvinte) => {
      ouvintes[nome] = f
    }),
  }
  const ordem: string[] = []
  pubads.setPrivacySettings.mockImplementation(() => ordem.push('privacidade'))
  const googletag = {
    cmd: [] as Array<() => void>,
    enums: { OutOfPageFormat: { REWARDED: 'REWARDED' } },
    pubads: () => pubads,
    defineSlot: vi.fn(() => {
      ordem.push('slot')
      return slot
    }),
    defineOutOfPageSlot: vi.fn(() => {
      ordem.push('slot')
      return slot
    }),
    enableServices: vi.fn(),
    display: vi.fn(),
    destroySlots: vi.fn(),
  }
  return { googletag, pubads, ouvintes, slot, ordem }
}

function rodar(query: string) {
  window.history.replaceState({}, '', `/anuncios/espaco.html?${query}`)
  new Function(CODIGO)()
}

const scriptsDoGpt = () => [...document.querySelectorAll('script')].filter((s) => s.src === GPT)

let postar: ReturnType<typeof vi.fn>

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="espaco"></div>'
  delete (window as unknown as Record<string, unknown>).googletag
  postar = vi.fn()
  vi.spyOn(window.parent, 'postMessage').mockImplementation(postar as never)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('a página de anúncios', () => {
  it('o HTML não carrega o GPT direto: só o espaco.js do próprio domínio', () => {
    expect(HTML).not.toContain('doubleclick')
    expect(HTML).toContain('src="/anuncios/espaco.js"')
  })

  it.each([
    ['sem consentimento', 'espaco=inicio-nativo&formato=nativo&app=https://frasy.com.br&rede=123'],
    ['consentimento=0', 'espaco=inicio-nativo&formato=nativo&app=https://frasy.com.br&rede=123&consentimento=0'],
  ])('%s: o GPT nunca é carregado', (_n, query) => {
    rodar(query)
    expect(scriptsDoGpt()).toHaveLength(0)
    expect((window as unknown as Record<string, unknown>).googletag).toBeUndefined()
  })

  it('query inválida (rede não numérica, app que não é origem): nada carrega', () => {
    rodar('espaco=inicio-nativo&formato=nativo&app=javascript:alert(1)&rede=123&consentimento=1')
    expect(scriptsDoGpt()).toHaveLength(0)
    rodar(`espaco=inicio-nativo&formato=nativo&app=${APP}&rede=abc&consentimento=1`)
    expect(scriptsDoGpt()).toHaveLength(0)
  })

  it('com consentimento=1: carrega o GPT uma vez, trava a privacidade antes do slot, sem PPID', () => {
    const g = gptFalso()
    ;(window as unknown as Record<string, unknown>).googletag = g.googletag
    rodar(`espaco=inicio-nativo&formato=nativo&app=${APP}&rede=123&consentimento=1`)
    expect(scriptsDoGpt()).toHaveLength(1)
    for (const f of g.googletag.cmd) f()
    expect(g.pubads.setPrivacySettings).toHaveBeenCalledWith(
      expect.objectContaining({ childDirectedTreatment: true, underAgeOfConsent: true, restrictDataProcessing: true }),
    )
    expect(g.ordem[0]).toBe('privacidade')
    expect(g.pubads.setPublisherProvidedId).not.toHaveBeenCalled()
    expect(g.googletag.defineSlot).toHaveBeenCalledWith('/123/frasy-inicio-nativo', expect.anything(), 'espaco')
    expect(g.googletag.display).toHaveBeenCalled()
    // vazio avisa o app, só para a origem dele
    g.ouvintes.slotRenderEnded({ isEmpty: true, slot: g.slot })
    expect(postar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'frasy:anuncio', evento: 'vazio' }), APP)
  })

  it('premiado: formato premiado do GPT; recompensa, fechou e vazio vão ao app com a exibição', () => {
    const g = gptFalso()
    ;(window as unknown as Record<string, unknown>).googletag = g.googletag
    rodar(`espaco=fim-premiado&formato=premiado&app=${APP}&rede=123&consentimento=1&exibicao=exib-9`)
    for (const f of g.googletag.cmd) f()
    expect(g.googletag.defineOutOfPageSlot).toHaveBeenCalledWith('/123/frasy-fim-premiado', 'REWARDED')
    expect(g.ordem[0]).toBe('privacidade')
    const visivel = vi.fn()
    g.ouvintes.rewardedSlotReady({ makeRewardedVisible: visivel, slot: g.slot })
    expect(visivel).toHaveBeenCalled()
    g.ouvintes.rewardedSlotGranted({ slot: g.slot })
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-9' }, APP)
    g.ouvintes.rewardedSlotClosed({ slot: g.slot })
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'fechou', exibicaoId: 'exib-9' }, APP)
    expect(g.pubads.setPublisherProvidedId).not.toHaveBeenCalled()
  })

  it('premiado sem exibição do servidor: não carrega nada', () => {
    rodar(`espaco=fim-premiado&formato=premiado&app=${APP}&rede=123&consentimento=1`)
    expect(scriptsDoGpt()).toHaveLength(0)
  })
})
