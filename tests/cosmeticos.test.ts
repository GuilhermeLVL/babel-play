// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { CATALOGO_DA_LOJA, estadoPorAlvo } from '../src/lib/loja'
import { readParticulas } from '../src/lib/particulas'
import { estiloDeRastro, RASTROS, readRastro, setRastro } from '../src/lib/rastroDoMouse'

describe('cosméticos (rastro, partículas) — recompensas v2', () => {
  it('rastro persiste e valida', () => {
    expect(readRastro()).toBe('off') // padrão: conquista da loja, não ruído de fábrica
    setRastro('faisca')
    expect(readRastro()).toBe('faisca')
  })

  it('rastro de emojis que estava equipado cai em "desligado", sem lançar', () => {
    for (const alvo of ['emoji', 'emojis:🦆,🐤']) {
      localStorage.setItem('babel.rastro', alvo)
      expect(readRastro(), alvo).toBe('off')
    }
  })

  it('partícula "Chuva de Emojis" equipada cai em "Do tema"', () => {
    localStorage.setItem('app_particulas', 'emoji')
    expect(readParticulas()).toBe('tema')
  })

  it('o catálogo não tem mais cursor, pack nem aprimoramento, e rastro é um por forma à venda', () => {
    const tipos = new Set(CATALOGO_DA_LOJA.map((i) => i.tipo as string))
    for (const t of ['cursor', 'pack', 'aprimoramento', 'fonte', 'posicao']) expect(tipos.has(t), t).toBe(false)
    const rastrosComSeeds = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'rastro' && i.precoSeeds !== undefined)
    const formas = rastrosComSeeds.map((i) => estiloDeRastro(i.alvo)?.kind)
    expect(new Set(formas).size).toBe(formas.length)
  })

  it('todo rastro da loja aponta para um alvo que existe', () => {
    for (const item of CATALOGO_DA_LOJA) {
      if (item.tipo !== 'rastro') continue
      const valido = RASTROS.some((r) => r.id === item.alvo) || estiloDeRastro(item.alvo) !== null
      expect(valido, item.id).toBe(true)
    }
  })

  it('letra e posição do menu são livres no nível 1: fora do catálogo = livre', () => {
    for (const alvo of ['padrao', 'pixel', 'serif', 'display']) expect(estadoPorAlvo('fonte', alvo, 1, 0).estado).toBe('equipavel')
    for (const alvo of ['top', 'left', 'right', 'bottom']) expect(estadoPorAlvo('posicao', alvo, 1, 0).estado).toBe('equipavel')
  })
})
