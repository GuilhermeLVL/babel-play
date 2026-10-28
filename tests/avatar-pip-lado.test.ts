import { describe, expect, it } from 'vitest'

import { ladoDoAvatarNoPip } from '../src/components/avatar/ComAvatarNoPip'

describe('ladoDoAvatarNoPip', () => {
  it('nunca fica abaixo de 96 px', () => {
    expect(ladoDoAvatarNoPip(300, 200, false)).toBe(96)
    expect(ladoDoAvatarNoPip(520, 300, true)).toBe(96)
  })
  it('cresce com a janela, até 160 px', () => {
    expect(ladoDoAvatarNoPip(400, 600, false)).toBe(104)
    expect(ladoDoAvatarNoPip(1200, 900, true)).toBe(160)
  })
  it('em janela baixa, não passa de metade da altura (mas respeita o mínimo)', () => {
    expect(ladoDoAvatarNoPip(600, 240, false)).toBe(120)
    expect(ladoDoAvatarNoPip(600, 150, false)).toBe(96)
  })
})
