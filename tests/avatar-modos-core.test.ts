import { describe, expect, it } from 'vitest'

import { PREFERENCIAS_PADRAO } from '../src/core/avatar/interprete'
import {
  decidirContexto,
  estadoDaLegenda,
  estadoDoNarrador,
  ladoDoAvatarDoModo,
  LIMITE_DE_CONTEXTOS,
  modeloDoPersonagem,
  politicaDoAvatarDoModo,
  PREFERENCIAS_DO_MODO_PADRAO,
  validarPreferenciasDoModo,
} from '../src/core/avatar/modos'

const base = {
  flag: true,
  modo: { ...PREFERENCIAS_DO_MODO_PADRAO, ligado: true },
  gerais: PREFERENCIAS_PADRAO,
  webgl2: true,
  tier: 'forte' as const,
}

describe('avatar nos modos: estados', () => {
  it('narrador: tocando fala, virando pensa, o resto fica parado', () => {
    expect(estadoDoNarrador('tocando')).toBe('falando')
    expect(estadoDoNarrador('virando')).toBe('pensando')
    expect(estadoDoNarrador('pausada')).toBe('parado')
    expect(estadoDoNarrador('parada')).toBe('parado')
  })
  it('legenda: falando > pensando > ouvindo > parado; pausa e parada ficam parados', () => {
    const e = { gravando: true, pausado: false, pensando: false, falando: false }
    expect(estadoDaLegenda(e)).toBe('ouvindo')
    expect(estadoDaLegenda({ ...e, pensando: true })).toBe('pensando')
    expect(estadoDaLegenda({ ...e, pensando: true, falando: true })).toBe('falando')
    expect(estadoDaLegenda({ ...e, pausado: true })).toBe('parado')
    expect(estadoDaLegenda({ ...e, gravando: false })).toBe('parado')
    expect(estadoDaLegenda({ ...e, gravando: false, falando: true })).toBe('falando')
  })
})

describe('avatar nos modos: política', () => {
  it('sem a flag, desligado ou em economia: nada aparece', () => {
    expect(politicaDoAvatarDoModo({ ...base, flag: false }).mostrar).toBe(false)
    expect(politicaDoAvatarDoModo({ ...base, modo: { ...base.modo, ligado: false } }).mostrar).toBe(false)
    const eco = politicaDoAvatarDoModo({ ...base, gerais: { ...PREFERENCIAS_PADRAO, economia: true } })
    expect(eco).toMatchObject({ mostrar: false, motivo: 'economia' })
  })
  it('liga com a flag e o tier vem do aparelho; sem WebGL2 cai no 2D (continua à vista)', () => {
    expect(politicaDoAvatarDoModo(base)).toMatchObject({
      mostrar: true,
      tier: 'forte',
      fallback2d: false,
      motivo: 'ok',
    })
    expect(politicaDoAvatarDoModo({ ...base, webgl2: false })).toMatchObject({ mostrar: true, fallback2d: true })
  })
  it('o tier nunca passa de médio com outro avatar 3D na tela', () => {
    expect(politicaDoAvatarDoModo({ ...base, outrosContextos: 1 }).tier).toBe('medio')
  })
})

describe('avatar nos modos: tamanho, contextos e personagens', () => {
  it('p < m < g e o teto de altura protege o texto', () => {
    const l = (t: 'p' | 'm' | 'g', alturaDaJanela = 900) => ladoDoAvatarDoModo(t, alturaDaJanela)
    expect(l('p')).toBeLessThan(l('m'))
    expect(l('m')).toBeLessThan(l('g'))
    expect(l('g', 500)).toBeLessThanOrEqual(Math.floor(500 * 0.2))
    expect(l('p', 300)).toBeGreaterThanOrEqual(40)
  })
  it('no máximo N contextos WebGL de página', () => {
    expect(LIMITE_DE_CONTEXTOS).toBe(2)
    expect(decidirContexto(0)).toBe(true)
    expect(decidirContexto(LIMITE_DE_CONTEXTOS - 1)).toBe(true)
    expect(decidirContexto(LIMITE_DE_CONTEXTOS)).toBe(false)
  })
  it('cada personagem ganha um modelo estável, diferente do avatar da pessoa quando dá', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(modeloDoPersonagem('Ana', ids, 'a')).toBe(modeloDoPersonagem('Ana', ids, 'a'))
    expect(modeloDoPersonagem('Ana', ids, 'a')).not.toBe('a')
    expect(modeloDoPersonagem('Ana', [], null)).toBeNull()
    expect(modeloDoPersonagem('Ana', ['x'], 'x')).toBe('x')
  })
})

describe('avatar nos modos: validação', () => {
  it('aceita lixo e devolve valores válidos', () => {
    expect(validarPreferenciasDoModo(null)).toEqual(PREFERENCIAS_DO_MODO_PADRAO)
    expect(validarPreferenciasDoModo({ ligado: 'sim', dono: 'xx', recolhido: 1, noPip: 0 })).toEqual(
      PREFERENCIAS_DO_MODO_PADRAO,
    )
    expect(validarPreferenciasDoModo({ ligado: true, dono: 'outro', recolhido: true, noPip: false })).toEqual({
      ligado: true,
      dono: 'outro',
      recolhido: true,
      noPip: false,
    })
  })
})
