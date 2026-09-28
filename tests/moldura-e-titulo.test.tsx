// @vitest-environment jsdom
/**
 * MOLDURA E TÍTULO NO PERFIL (recompensas v2, Task 5.4 — spec 5.2.5): o que está vestido aparece;
 * o que sumiu do catálogo ou não é mais seu some sem erro, e o perfil volta ao padrão.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import MolduraETitulo, { molduraETituloEquipados } from '../src/components/perfil/MolduraETitulo'
import { equiparItem } from '../src/lib/galeria/equipar'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

afterEach(cleanup)

const noop = () => {}
const ctx = { setTheme: noop, setFonte: noop, setMenuPosition: noop, onOpenStudio: noop, nivel: 1, saldo: 0 }
const item = (id: string) => CATALOGO_DA_LOJA.find((i) => i.id === id)!

describe('MolduraETitulo', () => {
  beforeEach(() => localStorage.clear())

  it('sem nada vestido, não desenha nada', () => {
    const { container } = render(<MolduraETitulo />)
    expect(container.innerHTML).toBe('')
  })

  it('mostra a moldura e o título equipados pela Coleção', () => {
    // As peças do ouro das conquistas: ficam suas com a conquista feita.
    localStorage.setItem('babel.conquistas', JSON.stringify(['caderno-1000', 'revisor-2000']))
    expect(equiparItem(item('moldura-conquista-biblioteca'), ctx)).toBe(true)
    expect(equiparItem(item('titulo-conquista-memoria'), ctx)).toBe(true)
    render(<MolduraETitulo />)
    expect(screen.getByText('Memória de ferro')).toBeTruthy()
    expect(document.querySelector('[data-moldura-equipada="moldura-conquista-biblioteca"]')).toBeTruthy()
  })

  it('no ranking (compacto) vai só o título', () => {
    localStorage.setItem('babel.conquistas', JSON.stringify(['caderno-1000', 'revisor-2000']))
    equiparItem(item('moldura-conquista-biblioteca'), ctx)
    equiparItem(item('titulo-conquista-memoria'), ctx)
    render(<MolduraETitulo compacto />)
    expect(screen.getByText('Memória de ferro')).toBeTruthy()
    expect(document.querySelector('[data-moldura-equipada]')).toBeNull()
  })

  it('id que sumiu do catálogo ou posse perdida voltam ao padrão, sem erro', () => {
    localStorage.setItem('babel.perfil_equipado', JSON.stringify({ moldura: 'moldura-que-saiu', titulo: 'titulo-conquista-memoria' }))
    // O título existe, mas a conquista que o libera não foi feita.
    expect(molduraETituloEquipados()).toEqual({ moldura: null, titulo: null })
    const { container } = render(<MolduraETitulo />)
    expect(container.innerHTML).toBe('')
  })
})
