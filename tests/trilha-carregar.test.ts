import { describe, it, expect, vi } from 'vitest'
import { carregarTrilha, indiceDaTrilha } from '../src/data/trilha/carregar'

describe('trilhaEmCache antes de carregar', () => {
  it('devolve null antes de qualquer carregarTrilha', async () => {
    vi.resetModules()
    const mod = await import('../src/data/trilha/carregar')
    expect(mod.trilhaEmCache('es')).toBeNull()
    await mod.carregarTrilha('es')
    expect(mod.trilhaEmCache('es')).not.toBeNull()
  })
})

describe('carregarTrilha', () => {
  it('es devolve escala frequencia e versão 2', async () => {
    const dado = await carregarTrilha('es')
    expect(dado?.escala).toBe('frequencia')
    expect(dado?.versao).toBe('2')
  })

  it('o join injeta a glosa de uma palavra que existe no par es-pt', async () => {
    const dado = await carregarTrilha('es')
    const par = dado?.niveis.A1?.find(([palavra]) => palavra === 'qué')
    expect(par?.[1]).not.toBe('')
  })

  it('palavra sem glosa entra com tradução vazia e não some da trilha', async () => {
    const dado = await carregarTrilha('es')
    const par = dado?.niveis.A1?.find(([palavra]) => palavra === 'poder')
    expect(par?.[1]).toBe('')
    expect(dado?.niveis.A1?.length).toBe(indiceDaTrilha().es.porNivel.A1)
  })

  it('en (v1) devolve os pares com tradução embutida, sem passar pelo join', async () => {
    const dado = await carregarTrilha('en')
    const par = dado?.niveis.A1?.find(([palavra]) => palavra === 'about')
    expect(par?.[1]).toBe('cerca de')
  })

  it('es-MX normaliza para es', async () => {
    const dado = await carregarTrilha('es-MX')
    expect(dado?.escala).toBe('frequencia')
    expect(dado?.versao).toBe('2')
  })

  it('idioma sem trilha devolve null', async () => {
    const dado = await carregarTrilha('xx')
    expect(dado).toBeNull()
  })
})
