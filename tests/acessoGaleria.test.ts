// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { ITENS_REMOVIDOS } from '../src/core/reembolso'
import { acessoAFormaDeRastro, acessoAoEstilo, faltaParaOPerfil, ITEM_DA_FORMA_DE_RASTRO, ITEM_DO_ESTILO } from '../src/lib/galeria/acesso'
import { paletaPorId } from '../src/lib/galeria/paletas'
import { PRESETS } from '../src/lib/galeria/perfis'
import { CATALOGO_DA_LOJA, marcarPosse } from '../src/lib/loja'

beforeEach(() => { for (const k of ['babel.loja_possuidos', 'babel.liberado', 'babel.conquistas']) localStorage.removeItem(k) })

describe('mapa de acesso da galeria — a mesma régua da Loja', () => {
  it('todo gate aponta para um item real do catálogo', () => {
    const ids = new Set(CATALOGO_DA_LOJA.map((i) => i.id))
    for (const id of [...Object.values(ITEM_DO_ESTILO), ...Object.values(ITEM_DA_FORMA_DE_RASTRO)]) {
      if (id) expect(ids.has(id), id).toBe(true)
    }
  })

  it('progressão gradativa: claro/papel livres; pastel nv2; escuro nv3; néon nv5; meia-noite nv7', () => {
    expect(acessoAoEstilo('claro', 1, 0).liberado).toBe(true)
    expect(acessoAoEstilo('papel', 1, 0).liberado).toBe(true)
    expect(acessoAoEstilo('pastel', 1, 0)).toMatchObject({ liberado: false, motivo: 'Nível 2 ou 50 Seeds' })
    expect(acessoAoEstilo('pastel', 2, 0).liberado).toBe(true)
    expect(acessoAoEstilo('escuro', 3, 0).liberado).toBe(true)
    expect(acessoAoEstilo('neon', 4, 0).liberado).toBe(false)
    expect(acessoAoEstilo('neon', 5, 0).liberado).toBe(true)
    expect(acessoAoEstilo('meia-noite', 7, 0).liberado).toBe(true)
  })

  it('Seeds compram o atalho e a posse libera de vez', () => {
    const a = acessoAoEstilo('neon', 1, 999)
    expect(a).toMatchObject({ liberado: false, compravel: true })
    expect(a.item?.id).toBe('gal-estilo-neon')
    marcarPosse('gal-estilo-neon')
    expect(acessoAoEstilo('neon', 1, 0).liberado).toBe(true)
  })

  it('a forma arco-íris do rastro é de conquista e não se vende', () => {
    expect(acessoAFormaDeRastro('arcoiris', 99, 9999)).toMatchObject({ liberado: false, motivo: 'Conquista: Colecionador' })
    localStorage.setItem('babel.conquistas', JSON.stringify(['colecionador']))
    expect(acessoAFormaDeRastro('arcoiris', 1, 0).liberado).toBe(true)
  })

  it('presets: ao menos 3 livres no nível 1, e os trancados dizem o que falta', () => {
    const ctx = { nivel: 1, saldo: 0, estiloDaPaleta: (id: string) => paletaPorId(id)?.estilo }
    const livres = PRESETS.filter((p) => faltaParaOPerfil(p, ctx).length === 0)
    expect(livres.length).toBeGreaterThanOrEqual(3)
    const pato = PRESETS.find((p) => p.id === 'pato')!
    const falta = faltaParaOPerfil(pato, ctx)
    expect(falta.length).toBeGreaterThan(0)
    expect(falta.join(' ')).toMatch(/Nível \d/)
    // no nível 10, com tudo liberado por nível, o pato abre
    expect(faltaParaOPerfil(pato, { ...ctx, nivel: 10 })).toEqual([])
  })

  it('nenhum preset usa o que saiu (recompensas v2): sem emoji na partícula nem no rastro', () => {
    for (const p of PRESETS) {
      expect(p.particulas, p.id).not.toBe('emoji')
      expect(p.rastro.startsWith('emojis:'), p.id).toBe(false)
      expect(p).not.toHaveProperty('cursor')
      expect(p).not.toHaveProperty('pack')
    }
  })
})

/* ── Brechas fechadas (spec galeria-gating-fechado, 31/08; recompensas v2, 27/09) ── */
describe('o que saiu do catálogo não volta por ausência', () => {
  it('nenhum item removido existe no catálogo, e nenhum gate da galeria aponta para um', () => {
    const ids = new Set(CATALOGO_DA_LOJA.map((i) => i.id))
    for (const id of ITENS_REMOVIDOS) expect(ids.has(id), id).toBe(false)
    for (const id of [...Object.values(ITEM_DO_ESTILO), ...Object.values(ITEM_DA_FORMA_DE_RASTRO)]) {
      expect(ITENS_REMOVIDOS.has(id ?? ''), id).toBe(false)
    }
  })
})
