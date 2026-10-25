// @vitest-environment jsdom
/**
 * A PÁGINA DE ANÚNCIOS (`anuncios/espaco.html` + `espaco.js`, rulings R32 e R35) — a única que carrega o
 * GPT do Google, no Worker próprio `frasy-anuncios`.
 *
 *  - a rede e a origem do app vêm do BUILD (`window.FRASY_ANUNCIOS`, `config.js`), nunca da query;
 *  - fora de um quadro, ou na origem do app: não faz nada;
 *  - sem `consentimento=1` na query: o GPT NUNCA é carregado;
 *  - a query sai do endereço (`history.replaceState`) antes do GPT;
 *  - com consentimento: carrega o GPT uma vez, liga as travas de criança/idade/dados e o SafeFrame ANTES de
 *    qualquer slot, nos dois formatos, e nunca chama `setPublisherProvidedId`;
 *  - o premiado usa o formato premiado do GPT e avisa o app (`postMessage` só para a origem do build);
 *  - o TRATAMENTO DE IDADE (`tratamento=` → `tagForAgeTreatment`): criança/adolescente/nenhum; ausente ou
 *    inválido = criança; não personalizado para todos; o premiado só com `nenhum` (adulto).
 */
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CODIGO = readFileSync('anuncios/espaco.js', 'utf8')
const HTML = readFileSync('anuncios/espaco.html', 'utf8')
const GPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'
const APP = 'https://frasy.com.br'

type Ouvinte = (e: Record<string, unknown>) => void
type Janela = Record<string, unknown>

function gptFalso() {
  const ouvintes: Record<string, Ouvinte> = {}
  const slot = { addService: vi.fn(() => slot) }
  const ordem: string[] = []
  const pubads = {
    setPrivacySettings: vi.fn(() => ordem.push('privacidade')),
    setPublisherProvidedId: vi.fn(),
    setForceSafeFrame: vi.fn(() => ordem.push('safeframe')),
    addEventListener: vi.fn((nome: string, f: Ouvinte) => {
      ouvintes[nome] = f
    }),
  }
  const googletag = {
    cmd: [] as Array<() => void>,
    enums: {
      OutOfPageFormat: { REWARDED: 'REWARDED' },
      TagForAgeTreatment: { CHILD: 'CHILD', TEEN: 'TEEN', UNSPECIFIED: 'UNSPECIFIED' },
    },
    setConfig: vi.fn(),
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

let topo: unknown

/** Roda o script como dentro de um quadro (`window.top !== window`), com a config do build. */
function rodar(query: string, config: Record<string, string> | null = { rede: '123', app: APP }, quadro = true) {
  window.history.replaceState({}, '', `/espaco.html?${query}`)
  if (config) (window as unknown as Janela).FRASY_ANUNCIOS = config
  else delete (window as unknown as Janela).FRASY_ANUNCIOS
  topo = quadro ? {} : window
  new Function(CODIGO)()
}

const scriptsDoGpt = () => [...document.querySelectorAll('script')].filter((s) => s.src === GPT)

let postar: ReturnType<typeof vi.fn>

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="espaco"></div>'
  delete (window as unknown as Janela).googletag
  delete (window as unknown as Janela).FRASY_ANUNCIOS
  postar = vi.fn()
  vi.spyOn(window.parent, 'postMessage').mockImplementation(postar as never)
  vi.spyOn(window, 'top', 'get').mockImplementation(() => topo as Window)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('a página de anúncios', () => {
  it('o HTML não carrega o GPT direto: só o config.js e o espaco.js do próprio Worker', () => {
    expect(HTML).not.toContain('doubleclick')
    expect(HTML).toContain('src="/config.js"')
    expect(HTML).toContain('src="/espaco.js"')
  })

  it.each([
    ['sem consentimento', 'espaco=inicio-nativo&formato=nativo'],
    ['consentimento=0', 'espaco=inicio-nativo&formato=nativo&consentimento=0'],
  ])('%s: o GPT nunca é carregado', (_n, query) => {
    rodar(query)
    expect(scriptsDoGpt()).toHaveLength(0)
    expect((window as unknown as Janela).googletag).toBeUndefined()
  })

  it('aberta direto (topo, fora de quadro): nada', () => {
    rodar('espaco=inicio-nativo&formato=nativo&consentimento=1', { rede: '123', app: APP }, false)
    expect(scriptsDoGpt()).toHaveLength(0)
    expect(postar).not.toHaveBeenCalled()
  })

  it('servida pela origem do app: nada', () => {
    rodar('espaco=inicio-nativo&formato=nativo&consentimento=1', { rede: '123', app: window.location.origin })
    expect(scriptsDoGpt()).toHaveLength(0)
  })

  it('sem config do build (rede/app) ou rede inválida: nada; a rede e o app da QUERY são ignorados', () => {
    rodar(`espaco=inicio-nativo&formato=nativo&consentimento=1&rede=999&app=${APP}`, null)
    rodar(`espaco=inicio-nativo&formato=nativo&consentimento=1&rede=999&app=${APP}`, {} as Record<string, string>)
    expect(scriptsDoGpt()).toHaveLength(0)
    rodar('espaco=inicio-nativo&formato=nativo&consentimento=1&rede=999', { rede: 'abc', app: APP })
    expect(scriptsDoGpt()).toHaveLength(0)
  })

  it('sem o código da rede no build (bancada do staging, Task 6): avisa no console, posta `vazio` e não carrega o GPT', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rodar('espaco=inicio-nativo&formato=nativo&consentimento=1', { rede: '', app: APP })
    expect(scriptsDoGpt()).toHaveLength(0)
    expect((window as unknown as Janela).googletag).toBeUndefined()
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('sem código da rede'))
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'vazio' }, APP)
  })

  it('com consentimento=1: a query sai do endereço, o GPT carrega uma vez, privacidade e SafeFrame antes do slot, sem PPID', () => {
    const g = gptFalso()
    ;(window as unknown as Janela).googletag = g.googletag
    rodar('espaco=inicio-nativo&formato=nativo&consentimento=1&rede=999')
    expect(window.location.search).toBe('')
    expect(scriptsDoGpt()).toHaveLength(1)
    for (const f of g.googletag.cmd) f()
    expect(g.pubads.setPrivacySettings).toHaveBeenCalledWith(
      expect.objectContaining({ childDirectedTreatment: true, underAgeOfConsent: true, restrictDataProcessing: true }),
    )
    expect(g.ordem.slice(0, 3)).toEqual(['privacidade', 'safeframe', 'slot'])
    expect(g.pubads.setPublisherProvidedId).not.toHaveBeenCalled()
    // a rede é a do build (123), não a da query (999)
    expect(g.googletag.defineSlot).toHaveBeenCalledWith('/123/frasy-inicio-nativo', expect.anything(), 'espaco')
    g.ouvintes.slotRenderEnded({ isEmpty: true, slot: g.slot })
    expect(postar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'frasy:anuncio', evento: 'vazio' }), APP)
  })

  it('premiado: formato premiado do GPT, SafeFrame também; recompensa e fechou vão ao app com a exibição', () => {
    const g = gptFalso()
    ;(window as unknown as Janela).googletag = g.googletag
    rodar(
      `espaco=fim-premiado&formato=premiado&consentimento=1&tratamento=nenhum&exibicao=exib-9&app=https://outro.example`,
    )
    for (const f of g.googletag.cmd) f()
    expect(g.googletag.defineOutOfPageSlot).toHaveBeenCalledWith('/123/frasy-fim-premiado', 'REWARDED')
    expect(g.ordem.slice(0, 3)).toEqual(['privacidade', 'safeframe', 'slot'])
    const visivel = vi.fn()
    g.ouvintes.rewardedSlotReady({ makeRewardedVisible: visivel, slot: g.slot })
    expect(visivel).toHaveBeenCalled()
    g.ouvintes.rewardedSlotGranted({ slot: g.slot })
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'recompensa', exibicaoId: 'exib-9' }, APP)
    g.ouvintes.rewardedSlotClosed({ slot: g.slot })
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'fechou', exibicaoId: 'exib-9' }, APP)
    expect(postar).not.toHaveBeenCalledWith(expect.anything(), 'https://outro.example')
    expect(g.pubads.setPublisherProvidedId).not.toHaveBeenCalled()
  })

  it('premiado sem exibição do servidor: não carrega nada', () => {
    rodar('espaco=fim-premiado&formato=premiado&consentimento=1&tratamento=nenhum')
    expect(scriptsDoGpt()).toHaveLength(0)
  })
})

describe('o tratamento de idade', () => {
  const nativo = (extra: string) => {
    const g = gptFalso()
    ;(window as unknown as Janela).googletag = g.googletag
    rodar(`espaco=inicio-nativo&formato=nativo&consentimento=1${extra}`)
    for (const f of g.googletag.cmd) f()
    return g
  }

  const CRIANCA = { childDirectedTreatment: true, underAgeOfConsent: true }
  it.each([
    ['criança (abaixo de 13)', '&tratamento=crianca', 'CHILD', CRIANCA],
    ['adolescente (13–17)', '&tratamento=adolescente', 'TEEN', {}],
    ['adulto', '&tratamento=nenhum', 'UNSPECIFIED', {}],
    ['idade desconhecida (sem o parâmetro)', '', 'CHILD', CRIANCA],
    ['valor fora da lista', '&tratamento=adulto', 'CHILD', CRIANCA],
  ])('%s → tagForAgeTreatment %s, sempre não personalizado e sem PPID', (_n, extra, esperado, crianca) => {
    const g = nativo(extra)
    expect(g.pubads.setPrivacySettings).toHaveBeenCalledTimes(1)
    /* Igualdade exata: adolescente e adulto NÃO levam childDirectedTreatment/underAgeOfConsent. */
    expect(g.pubads.setPrivacySettings).toHaveBeenCalledWith({
      restrictDataProcessing: true,
      nonPersonalizedAds: true,
      tagForAgeTreatment: esperado,
      ...crianca,
    })
    expect(g.googletag.setConfig).toHaveBeenCalledWith({
      privacyTreatments: { treatments: ['disablePersonalization'] },
    })
    expect(g.ordem.slice(0, 3)).toEqual(['privacidade', 'safeframe', 'slot'])
    expect(g.pubads.setPublisherProvidedId).not.toHaveBeenCalled()
  })

  it('GPT sem o enum de idade: a criança fica com o TFCD/TFUA, todos com o não personalizado, e o slot sai', () => {
    for (const [tratamento, crianca] of [
      ['crianca', true],
      ['adolescente', false],
    ] as const) {
      const g = gptFalso()
      delete (g.googletag.enums as Record<string, unknown>).TagForAgeTreatment
      ;(window as unknown as Janela).googletag = g.googletag
      rodar(`espaco=inicio-nativo&formato=nativo&consentimento=1&tratamento=${tratamento}`)
      for (const f of g.googletag.cmd) f()
      const [config] = g.pubads.setPrivacySettings.mock.calls[0] as unknown as [Record<string, unknown>]
      expect(config).toMatchObject({ restrictDataProcessing: true, nonPersonalizedAds: true })
      expect(config).not.toHaveProperty('tagForAgeTreatment')
      if (crianca) expect(config).toMatchObject({ childDirectedTreatment: true, underAgeOfConsent: true })
      else expect(config).not.toHaveProperty('childDirectedTreatment')
      expect(g.googletag.defineSlot).toHaveBeenCalled()
    }
  })

  it.each([
    ['criança', '&tratamento=crianca'],
    ['adolescente', '&tratamento=adolescente'],
    ['idade desconhecida', ''],
  ])('premiado com tratamento de %s: o GPT nunca carrega e o app ouve `vazio`', (_n, extra) => {
    rodar(`espaco=fim-premiado&formato=premiado&consentimento=1&exibicao=exib-9${extra}`)
    expect(scriptsDoGpt()).toHaveLength(0)
    expect((window as unknown as Janela).googletag).toBeUndefined()
    expect(postar).toHaveBeenCalledWith({ tipo: 'frasy:anuncio', evento: 'vazio', exibicaoId: 'exib-9' }, APP)
  })
})
