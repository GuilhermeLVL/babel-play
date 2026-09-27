// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { buscarPaletas, paletaPorId,todasAsPaletas } from '../src/lib/galeria/paletas'
import { apagarPerfil, perfisSalvos, PRESETS, renomearPerfil,salvarPerfil } from '../src/lib/galeria/perfis'
import { restaurarVisualPadrao } from '../src/lib/galeria/restaurar'
import { estiloDeRastro, idDeRastroGerado, rastroValido,readRastro, setRastro } from '../src/lib/rastroDoMouse'

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

/* Catálogo de emojis, pack personalizado e cursor de qualquer emoji saíram nas recompensas v2
   (27/09), com os testes deles. */
describe('rastro personalizado', () => {
  it('forma × paleta resolve para kind + sobrescrever; emojis e inválido caem em off', () => {
    const g = estiloDeRastro(idDeRastroGerado('estrelas', 'oceano-profundo'))!
    expect(g.kind).toBe('rastroEstrelas')
    expect(g.sobrescrever?.paleta?.[0]).toBe('#38BDF8')
    expect(estiloDeRastro('emojis:🦆,🐤')).toBeNull()
    expect(rastroValido('emoji')).toBe(false)
    expect(rastroValido('gen:estrelas:nao-existe')).toBe(false)
    expect(setRastro('gen:estrelas:nao-existe')).toBe('off')
    setRastro(idDeRastroGerado('pixel', 'arcade'))
    expect(readRastro()).toBe('gen:pixel:arcade')
    expect(estiloDeRastro('off')).toBeNull()
  })
})

describe('perfis', () => {
  it('presets referenciam paletas e rastros que existem', () => {
    for (const p of PRESETS) {
      if (p.paleta) expect(paletaPorId(p.paleta), `${p.id} → ${p.paleta}`).toBeTruthy()
      expect(rastroValido(p.rastro), `${p.id} → ${p.rastro}`).toBe(true)
    }
    expect(PRESETS.length).toBeGreaterThanOrEqual(12)
  })
  it('salvar, listar e apagar perfis próprios', () => {
    const p = salvarPerfil({ nome: 'Meu pato roxo', icone: 'passaro', desc: '', paleta: 'roxo-escuro', fonte: 'padrao', particulas: 'estrelas', rastro: 'off' })
    expect(perfisSalvos().map((x) => x.id)).toContain(p.id)
    expect(perfisSalvos()[0].proprio).toBe(true)
    apagarPerfil(p.id)
    expect(perfisSalvos()).toEqual([])
  })
  it('perfil salvo antes do ícone lucide (com `emoji`, sem `icone`) ganha o brilho', () => {
    localStorage.setItem('babel.perfis', JSON.stringify([{ id: 'meu-v1', nome: 'Antigo', emoji: 'x', desc: '', tema: 'babel', fonte: 'padrao', particulas: 'tema', rastro: 'off' }]))
    expect(perfisSalvos()[0].icone).toBe('brilho')
    localStorage.removeItem('babel.perfis')
  })
  it('renomear muda só o nome, no lugar, e rejeita vazio', () => {
    const a = salvarPerfil({ nome: 'A', icone: 'sol', desc: '', tema: 'babel', fonte: 'padrao', particulas: 'tema', rastro: 'off' })
    const b = salvarPerfil({ nome: 'B', icone: 'lua', desc: '', tema: 'babel', fonte: 'padrao', particulas: 'tema', rastro: 'off' })
    expect(renomearPerfil(a.id, '  ')).toBeNull()
    expect(renomearPerfil('nao-existe', 'X')).toBeNull()
    const novo = renomearPerfil(a.id, 'A renomeado')
    expect(novo?.nome).toBe('A renomeado')
    // Ordem preservada: renomear não é re-salvar (salvarPerfil põe no topo; renomear não).
    expect(perfisSalvos().map((x) => x.id)).toEqual([b.id, a.id])
    expect(perfisSalvos().find((x) => x.id === a.id)?.rastro).toBe('off')
    apagarPerfil(a.id); apagarPerfil(b.id)
  })
})

describe('restaurarVisualPadrao', () => {
  it('devolve os padrões e limpa a paleta ativa, sem tocar em posse', () => {
    localStorage.setItem('babel.paleta_ativa', 'arcade')
    localStorage.setItem('babel.perfis', JSON.stringify([{ id: 'meu-1', nome: 'Meu', emoji: '✨', desc: '', fonte: 'pixel', particulas: 'emoji', pack: ['🦆'], cursor: 'pato', rastro: 'emojis:🦆' }]))
    const r = restaurarVisualPadrao()
    expect(r).toEqual({ tema: 'babel', fonte: 'padrao' })
    expect(localStorage.getItem('babel.paleta_ativa')).toBeNull()
    // Posse e perfis salvos são intocados: reset é sobre o que está vestido.
    expect(JSON.parse(localStorage.getItem('babel.perfis')!)).toHaveLength(1)
    localStorage.removeItem('babel.perfis')
  })
})
