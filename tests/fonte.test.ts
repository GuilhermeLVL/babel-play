// @vitest-environment jsdom
import { describe, expect,it } from 'vitest'

import { applyFonte, coerceFonte, FONTE_KEY,readFonte } from '../src/lib/theme'

describe('fonte da interface (padrao | pixel)', () => {
  it('coerceFonte normaliza qualquer lixo para padrao', () => {
    expect(coerceFonte('pixel')).toBe('pixel')
    expect(coerceFonte('padrao')).toBe('padrao')
    expect(coerceFonte('comic-sans')).toBe('padrao')
    expect(coerceFonte(null)).toBe('padrao')
  })
  it('applyFonte marca o <html> e readFonte le o localStorage', () => {
    applyFonte('pixel')
    expect(document.documentElement.getAttribute('data-fonte')).toBe('pixel')
    localStorage.setItem(FONTE_KEY, 'pixel')
    expect(readFonte()).toBe('pixel')
    localStorage.removeItem(FONTE_KEY)
    expect(readFonte()).toBe('padrao')
  })
})
