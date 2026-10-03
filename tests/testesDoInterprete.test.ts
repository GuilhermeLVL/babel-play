// @vitest-environment jsdom
/**
 * AS CHAVES DE TESTE DO INTÉRPRETE (v3): recursos novos que nascem LIGADOS (liberados para o dono
 * testar) e podem ser desligados no /diagnostico. Valem só neste aparelho; sem armazenamento, ficam ligados.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { CHAVES_DE_TESTE, chaveLigada, gravarChave } from '../src/lib/captura/testesDoInterprete'

beforeEach(() => localStorage.clear())

describe('testesDoInterprete', () => {
  it('toda chave nasce ligada e tem título e descrição', () => {
    for (const c of CHAVES_DE_TESTE) {
      expect(chaveLigada(c.id)).toBe(true)
      expect(c.titulo.length).toBeGreaterThan(3)
      expect(c.descricao.length).toBeGreaterThan(10)
    }
  })

  it('ligar e desligar vale na hora e sobrevive a uma nova leitura', () => {
    const id = CHAVES_DE_TESTE[0].id
    gravarChave(id, true)
    expect(chaveLigada(id)).toBe(true)
    expect(localStorage.getItem(`babel.interprete.${id}`)).toBe('sim')
    gravarChave(id, false)
    expect(chaveLigada(id)).toBe(false)
  })

  it('só o valor "nao" desliga', () => {
    const id = CHAVES_DE_TESTE[0].id
    localStorage.setItem(`babel.interprete.${id}`, 'nao')
    expect(chaveLigada(id)).toBe(false)
    localStorage.setItem(`babel.interprete.${id}`, 'true')
    expect(chaveLigada(id)).toBe(true)
  })

  it('armazenamento quebrado não derruba: ligada', () => {
    const id = CHAVES_DE_TESTE[0].id
    const lerOriginal = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado')
    }
    try {
      expect(chaveLigada(id)).toBe(true)
    } finally {
      Storage.prototype.getItem = lerOriginal
    }
  })

  it('avisa quem escuta quando uma chave muda', () => {
    const id = CHAVES_DE_TESTE[0].id
    const vistos: string[] = []
    window.addEventListener('babel-chave-interprete', ((e: CustomEvent<{ id: string; ligada: boolean }>) =>
      vistos.push(`${e.detail.id}:${e.detail.ligada}`)) as EventListener)
    gravarChave(id, true)
    expect(vistos).toContain(`${id}:true`)
  })
})
