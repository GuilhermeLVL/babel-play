// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  acessoAoEstilo, acessoACategoria, acessoAFormaDeRastro, acessoAoEditorDePack, acessoAoCursorDeEmoji, faltaParaOPerfil,
  ITEM_DO_ESTILO, ITEM_DA_CATEGORIA, ITEM_DA_FORMA_DE_RASTRO, ITEM_EDITOR_DE_PACK, ITEM_CURSOR_DE_EMOJI,
} from '../src/lib/galeria/acesso'
import { CATALOGO_DA_LOJA, marcarPosse } from '../src/lib/loja'
import { PRESETS } from '../src/lib/galeria/perfis'
import { paletaPorId } from '../src/lib/galeria/paletas'
import { CATEGORIAS_DE_EMOJI } from '../src/lib/galeria/emojis'

beforeEach(() => { for (const k of ['babel.loja_possuidos', 'babel.liberado', 'babel.conquistas']) localStorage.removeItem(k) })

describe('mapa de acesso da galeria — a mesma régua da Loja', () => {
  it('todo gate aponta para um item real do catálogo', () => {
    const ids = new Set(CATALOGO_DA_LOJA.map((i) => i.id))
    for (const id of [...Object.values(ITEM_DO_ESTILO), ...Object.values(ITEM_DA_CATEGORIA), ...Object.values(ITEM_DA_FORMA_DE_RASTRO), ITEM_EDITOR_DE_PACK, ITEM_CURSOR_DE_EMOJI]) {
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

  it('categorias de emoji: 5 livres no nível 1; corações abre com o pack da Loja; conquista não vende', () => {
    for (const livre of ['animais', 'comidas', 'natureza', 'rostos', 'simbolos']) expect(acessoACategoria(livre, 1, 0).liberado, livre).toBe(true)
    expect(acessoACategoria('patos', 1, 0).liberado).toBe(false)
    expect(acessoACategoria('patos', 2, 0).liberado).toBe(true)
    expect(acessoACategoria('coracoes', 1, 0).item?.id).toBe('part-coracoes')
    expect(acessoAFormaDeRastro('arcoiris', 99, 9999)).toMatchObject({ liberado: false, motivo: 'Conquista: Colecionador' })
    localStorage.setItem('babel.conquistas', JSON.stringify(['colecionador']))
    expect(acessoAFormaDeRastro('arcoiris', 1, 0).liberado).toBe(true)
  })

  it('editor de pack e cursor de emoji têm nível E preço', () => {
    expect(acessoAoEditorDePack(1, 0).motivo).toBe('Nível 2 ou 50 Seeds')
    expect(acessoAoCursorDeEmoji(2, 0).motivo).toBe('Nível 3 ou 100 Seeds')
    expect(acessoAoCursorDeEmoji(3, 0).liberado).toBe(true)
  })

  it('presets: ao menos 3 livres no nível 1, e os trancados dizem o que falta', () => {
    const ctx = { nivel: 1, saldo: 0, estiloDaPaleta: (id: string) => paletaPorId(id)?.estilo, categorias: CATEGORIAS_DE_EMOJI }
    const livres = PRESETS.filter((p) => faltaParaOPerfil(p, ctx).length === 0)
    expect(livres.length).toBeGreaterThanOrEqual(3)
    const pato = PRESETS.find((p) => p.id === 'pato')!
    const falta = faltaParaOPerfil(pato, ctx)
    expect(falta.length).toBeGreaterThan(0)
    expect(falta.join(' ')).toMatch(/Nível \d/)
    // no nível 10 com tudo liberado por nível, o pato abre (rastro de emojis exige ras-emoji nv8)
    expect(faltaParaOPerfil(pato, { ...ctx, nivel: 10 })).toEqual([])
  })
})
