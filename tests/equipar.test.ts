// @vitest-environment jsdom
import { beforeEach,describe, expect, it, vi } from 'vitest'

import { readCursor } from '../src/lib/cursores'
import { equiparItem, equipavel } from '../src/lib/galeria/equipar'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'
import { readPack,readParticulas } from '../src/lib/particulas'
import { readRastro } from '../src/lib/rastroDoMouse'

const item = (id: string) => CATALOGO_DA_LOJA.find((i) => i.id === id)!

describe('equiparItem — o único caminho que equipa', () => {
  beforeEach(() => localStorage.clear())
  const ctx = () => ({ setTheme: vi.fn(), setFonte: vi.fn(), setMenuPosition: vi.fn(), onOpenStudio: vi.fn(), nivel: 10, saldo: 0 })

  it('cada tipo chama o setter certo', () => {
    const c = ctx()
    expect(equiparItem(item('tema-linear'), c)).toBe(true)
    expect(c.setTheme).toHaveBeenCalledWith('linear')
    expect(equiparItem(item('pos-direita'), c)).toBe(true)
    expect(c.setMenuPosition).toHaveBeenCalledWith('right')
    expect(equiparItem(item('estudio'), c)).toBe(true)
    expect(c.onOpenStudio).toHaveBeenCalled()
    expect(equiparItem(item('part-pixel'), c)).toBe(true)
    expect(readParticulas()).toBe('pixel')
    expect(equiparItem(item('pack-animais'), c)).toBe(true)
    expect(readPack()).toBe('animais')
    expect(equiparItem(item('cur-mira'), c)).toBe(true)
    expect(readCursor()).toBe('mira')
    expect(equiparItem(item('ras-faisca'), c)).toBe(true)
    expect(readRastro()).toBe('faisca')
  })

  it('trancado não equipa; exclusivo sem conquista não equipa', () => {
    const c = { ...ctx(), nivel: 1, saldo: 0 }
    expect(equiparItem(item('tema-premium'), c)).toBe(false)
    expect(c.setTheme).not.toHaveBeenCalled()
    expect(equiparItem(item('tema-aurora'), { ...ctx(), nivel: 99 })).toBe(false)
  })

  it('capacidades da galeria e aprimoramentos não são peças', () => {
    expect(equipavel(item('gal-estilo-pastel'))).toBe(false)
    expect(equipavel(item('apr-sorte'))).toBe(false)
    expect(equiparItem(item('gal-estilo-pastel'), ctx())).toBe(false)
  })
})
