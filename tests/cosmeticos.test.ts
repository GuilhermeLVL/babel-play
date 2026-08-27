// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CURSORES, applyCursor, setCursor, readCursor } from '../src/lib/cursores'
import { RASTROS, setRastro, readRastro } from '../src/lib/rastroDoMouse'
import { PACKS_DE_EMOJI, setPack, readPack, emojisDoPack } from '../src/lib/particulas'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

describe('cosméticos (cursor, rastro, packs)', () => {
  it('cursor aplica e remove o atributo data-cursor; id inválido cai no padrão', () => {
    setCursor('pato')
    expect(document.documentElement.getAttribute('data-cursor')).toBe('pato')
    expect(readCursor()).toBe('pato')
    setCursor('nao-existe')
    expect(readCursor()).toBe('padrao')
    applyCursor('padrao')
    expect(document.documentElement.getAttribute('data-cursor')).toBeNull()
  })

  it('rastro persiste e valida; packs trocam os emojis da chuva', () => {
    expect(readRastro()).toBe('off') // padrão: conquista da loja, não ruído de fábrica
    setRastro('faisca')
    expect(readRastro()).toBe('faisca')
    setPack('animais')
    expect(readPack()).toBe('animais')
    expect(emojisDoPack()).toContain('🦆')
    setPack('lixo')
    expect(readPack()).toBe('classico')
  })

  it('todo item da loja de pack/cursor/rastro aponta para um alvo que existe', () => {
    for (const item of CATALOGO_DA_LOJA) {
      if (item.tipo === 'pack') expect(PACKS_DE_EMOJI.some((p) => p.id === item.alvo), item.id).toBe(true)
      if (item.tipo === 'cursor') expect(CURSORES.some((c) => c.id === item.alvo), item.id).toBe(true)
      if (item.tipo === 'rastro') expect(RASTROS.some((r) => r.id === item.alvo), item.id).toBe(true)
    }
  })

  it('as posições topo/esquerda são livres (nível 1, sem preço): nunca há beco sem saída', () => {
    const topo = CATALOGO_DA_LOJA.find((i) => i.id === 'pos-topo')!
    const esquerda = CATALOGO_DA_LOJA.find((i) => i.id === 'pos-esquerda')!
    for (const item of [topo, esquerda]) {
      expect(item.nivel).toBe(1)
      expect(item.precoSeeds).toBeUndefined()
    }
  })
})
