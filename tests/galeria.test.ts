// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { todasAsPaletas, buscarPaletas, paletaPorId } from '../src/lib/galeria/paletas'
import { CATEGORIAS_DE_EMOJI, todosOsEmojis, sanearListaDeEmojis } from '../src/lib/galeria/emojis'
import { PRESETS, perfisSalvos, salvarPerfil, apagarPerfil } from '../src/lib/galeria/perfis'
import { estiloDeRastro, setRastro, readRastro, idDeRastroGerado, idDeRastroDeEmojis, rastroValido } from '../src/lib/rastroDoMouse'
import { setCursor, readCursor, idDeCursorDeEmoji, emojiDoCursor, cursorValido } from '../src/lib/cursores'
import { setPackCustom, lerPackCustom, readPack, emojisDoPack, PACK_CUSTOM, PACKS_DE_EMOJI, setPack } from '../src/lib/particulas'

/** Luminância relativa aproximada (0..1) de um #RRGGBB. */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

beforeEach(() => { for (const k of ['babel.rastro', 'babel.cursor', 'app_particulas_pack', 'babel.pack_custom', 'babel.perfis']) localStorage.removeItem(k) })

describe('galeria de paletas — centenas sem CSS', () => {
  it('tem ao menos 200 paletas, ids únicos, e escura/clara coerente', () => {
    const p = todasAsPaletas()
    expect(p.length).toBeGreaterThanOrEqual(200)
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length)
    for (const x of p) expect(x.escura, x.id).toBe(lum(x.canvas) < 0.3)
  })
  it('toda paleta é legível: ink × canvas ≥ 7:1 e ink × surface ≥ 7:1', () => {
    for (const x of todasAsPaletas()) {
      expect(contraste(x.ink, x.canvas), x.id).toBeGreaterThanOrEqual(7)
      expect(contraste(x.ink, x.surface), x.id).toBeGreaterThanOrEqual(7)
    }
  })
  it('busca por nome/família e por estilo', () => {
    expect(buscarPaletas('oceano').length).toBeGreaterThan(0)
    expect(buscarPaletas('', 'neon').every((x) => x.estilo === 'neon')).toBe(true)
    expect(paletaPorId('pato-de-borracha')?.nome).toBe('Pato de borracha')
  })
})

describe('catálogo de emojis', () => {
  it('centenas de emojis, sem repetição (nem dentro de uma categoria), com patos variados', () => {
    const t = todosOsEmojis()
    expect(t.length).toBeGreaterThanOrEqual(350)
    expect(new Set(t).size).toBe(t.length)
    // Chave de React duplicada no editor: cada categoria também não pode repetir emoji.
    for (const c of CATEGORIAS_DE_EMOJI) expect(new Set(c.emojis).size, c.id).toBe(c.emojis.length)
    expect(CATEGORIAS_DE_EMOJI.find((c) => c.id === 'patos')!.emojis).toEqual(expect.arrayContaining(['🦆', '🐤', '🐔', '🦢']))
  })
  it('sanear só aceita o catálogo e tira repetidos', () => {
    expect(sanearListaDeEmojis(['🦆', 'x', '🦆', 42, '🍕'])).toEqual(['🦆', '🍕'])
  })
})

describe('pack personalizado', () => {
  it('lista escolhida vira o pack equipado; vazia volta ao clássico', () => {
    setPackCustom(['🦆', '🐤'])
    expect(readPack()).toBe(PACK_CUSTOM)
    expect(emojisDoPack()).toEqual(['🦆', '🐤'])
    setPackCustom([])
    expect(readPack()).toBe('classico')
    expect(lerPackCustom()).toEqual([])
    setPack('animais')
    expect(emojisDoPack()).toEqual(PACKS_DE_EMOJI.find((p) => p.id === 'animais')!.emojis)
  })
})

describe('rastro personalizado', () => {
  it('forma × paleta e lista de emojis resolvem para kind + sobrescrever; inválido cai em off', () => {
    const g = estiloDeRastro(idDeRastroGerado('estrelas', 'oceano-profundo'))!
    expect(g.kind).toBe('rastroEstrelas')
    expect(g.sobrescrever?.paleta?.[0]).toBe('#38BDF8')
    const e = estiloDeRastro(idDeRastroDeEmojis(['🦆', '🐤']))!
    expect(e.kind).toBe('rastroEmoji')
    expect(e.sobrescrever?.emojis).toEqual(['🦆', '🐤'])
    expect(rastroValido('gen:estrelas:nao-existe')).toBe(false)
    expect(setRastro('gen:estrelas:nao-existe')).toBe('off')
    setRastro(idDeRastroGerado('pixel', 'arcade'))
    expect(readRastro()).toBe('gen:pixel:arcade')
    expect(estiloDeRastro('off')).toBeNull()
  })
})

describe('cursor de qualquer emoji', () => {
  it('aplica data-cursor e injeta a regra viva só para o equipado', () => {
    const id = idDeCursorDeEmoji('🐔')
    expect(cursorValido(id)).toBe(true)
    expect(emojiDoCursor(id)).toBe('🐔')
    setCursor(id)
    expect(readCursor()).toBe(id)
    expect(document.documentElement.getAttribute('data-cursor')).toBe(id)
    expect(document.getElementById('babel-cursor-vivo-css')?.textContent).toContain('%F0%9F%90%94')
    expect(setCursor('emoji:x')).toBe('padrao')
    expect(document.documentElement.hasAttribute('data-cursor')).toBe(false)
  })
})

describe('perfis', () => {
  it('presets referenciam paletas, packs e rastros que existem', () => {
    for (const p of PRESETS) {
      if (p.paleta) expect(paletaPorId(p.paleta), `${p.id} → ${p.paleta}`).toBeTruthy()
      if (typeof p.pack === 'string') expect(PACKS_DE_EMOJI.some((k) => k.id === p.pack), `${p.id} → ${p.pack}`).toBe(true)
      else expect(sanearListaDeEmojis(p.pack).length, p.id).toBe(p.pack.length)
      expect(rastroValido(p.rastro), `${p.id} → ${p.rastro}`).toBe(true)
      expect(cursorValido(p.cursor), `${p.id} → ${p.cursor}`).toBe(true)
    }
    expect(PRESETS.length).toBeGreaterThanOrEqual(12)
  })
  it('salvar, listar e apagar perfis próprios', () => {
    const p = salvarPerfil({ nome: 'Meu pato roxo', emoji: '🦆', desc: '', paleta: 'roxo-escuro', fonte: 'padrao', particulas: 'emoji', pack: ['🦆'], cursor: 'pato', rastro: 'off' })
    expect(perfisSalvos().map((x) => x.id)).toContain(p.id)
    expect(perfisSalvos()[0].proprio).toBe(true)
    apagarPerfil(p.id)
    expect(perfisSalvos()).toEqual([])
  })
})
