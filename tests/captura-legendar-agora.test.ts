// @vitest-environment jsdom
/**
 * "Legendar agora": as dicas que pré-arrumam o seletor do navegador, a memória da última superfície
 * e quando o botão aparece. O seletor em si é obrigatório e não se testa aqui (e2e usa um falso).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dicasDoSeletor,
  jaLegendouOSistema,
  lembrarSuperficie,
  podeLegendarAgora,
  superficieLembrada,
} from '../src/lib/captura/dicasDoSeletor'

beforeEach(() => localStorage.clear())

describe('dicasDoSeletor', () => {
  it('com suporte, a aba vem pré-selecionada na primeira vez', () => {
    const d = dicasDoSeletor({ suportadas: { displaySurface: true }, ultima: null })
    expect(d.video.displaySurface).toBe('browser')
    expect(d.topo.systemAudio).toBe('include')
    expect(d.topo.selfBrowserSurface).toBe('exclude')
    expect(d.topo.surfaceSwitching).toBe('include')
  })

  it('segue a superfície da última sessão', () => {
    expect(dicasDoSeletor({ suportadas: { displaySurface: true }, ultima: 'monitor' }).video.displaySurface).toBe(
      'monitor',
    )
  })

  it('sem suporte detectado, não manda a dica de superfície', () => {
    expect(dicasDoSeletor({ suportadas: {}, ultima: 'window' }).video).toEqual({})
    expect(dicasDoSeletor({ suportadas: null, ultima: null }).video).toEqual({})
  })

  it('nunca pede preferCurrentTab (legendaria a aba do próprio Frasy)', () => {
    const d = dicasDoSeletor({ suportadas: { displaySurface: true }, ultima: null })
    expect(JSON.stringify(d)).not.toMatch(/preferCurrentTab/)
  })
})

describe('memória da superfície', () => {
  it('grava só valores válidos e a primeira vez é "ainda não usou"', () => {
    expect(jaLegendouOSistema()).toBe(false)
    lembrarSuperficie('lixo')
    lembrarSuperficie(undefined)
    expect(superficieLembrada()).toBeNull()
    lembrarSuperficie('browser')
    expect(superficieLembrada()).toBe('browser')
    expect(jaLegendouOSistema()).toBe(true)
  })

  it('armazenamento bloqueado = sem memória, sem lançar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(() => lembrarSuperficie('browser')).not.toThrow()
    expect(superficieLembrada()).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('podeLegendarAgora', () => {
  const base = { capturaDoSistema: true, gravando: false, abrindo: false, jaLegendou: true }
  it('aparece para quem já usou, onde há som do computador', () => {
    expect(podeLegendarAgora(base)).toBe(true)
  })
  it.each([
    ['primeira vez', { jaLegendou: false }],
    ['celular sem som do sistema', { capturaDoSistema: false }],
    ['gravando', { gravando: true }],
    ['abrindo', { abrindo: true }],
  ])('some: %s', (_n, mudanca) => {
    expect(podeLegendarAgora({ ...base, ...mudanca })).toBe(false)
  })
})
