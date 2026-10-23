// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { zoomDoCorpo } from '../src/lib/zoomDoCorpo'

describe('zoomDoCorpo', () => {
  afterEach(() => {
    document.body.style.removeProperty('zoom')
  })

  it('vale 1 sem zoom', async () => {
    await Promise.resolve()
    expect(zoomDoCorpo()).toBe(1)
  })

  it('acompanha o zoom do body e refaz o cache quando o estilo muda', async () => {
    document.body.style.setProperty('zoom', '1.3')
    // O cache de antes é invalidado pelo observador de mutações (microtarefa).
    await Promise.resolve()
    await Promise.resolve()
    expect(zoomDoCorpo()).toBe(1.3)
    document.body.style.setProperty('zoom', '0.94')
    await Promise.resolve()
    await Promise.resolve()
    expect(zoomDoCorpo()).toBe(0.94)
  })

  it('entende porcentagem', async () => {
    document.body.style.setProperty('zoom', '115%')
    await Promise.resolve()
    await Promise.resolve()
    expect(zoomDoCorpo()).toBeCloseTo(1.15)
  })
})
