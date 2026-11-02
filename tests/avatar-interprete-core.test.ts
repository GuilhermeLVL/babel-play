import { describe, expect, it } from 'vitest'

import {
  type EntradaDoEstadoDaConversa,
  estadoDoLadoNaConversa,
  INTERPRETE_PADRAO,
  INTERPRETE_RESERVA,
  ladoDoAvatarEmPx,
  modeloDoInterprete,
  modeloPadraoDaPessoa,
  OPCOES_DE_QUEM,
  politicaDosAvatares,
  PREFERENCIAS_PADRAO,
  validarPreferencias,
} from '../src/core/avatar/interprete'

const e = (p: Partial<EntradaDoEstadoDaConversa>): EntradaDoEstadoDaConversa => ({
  fase: 'parado',
  lado: null,
  automatico: false,
  falando: null,
  ...p,
})

describe('estado do avatar por lado na conversa', () => {
  it('parado: os dois parados', () => {
    expect(estadoDoLadoNaConversa('meu', e({}), false)).toBe('parado')
    expect(estadoDoLadoNaConversa('outro', e({}), false)).toBe('parado')
  })
  it('por toque: ouve só o lado ativo; traduzindo, esse lado pensa', () => {
    const ouvindo = e({ fase: 'ouvindo', lado: 'meu' })
    expect(estadoDoLadoNaConversa('meu', ouvindo, false)).toBe('ouvindo')
    expect(estadoDoLadoNaConversa('outro', ouvindo, false)).toBe('parado')
    const traduzindo = e({ fase: 'traduzindo', lado: 'outro' })
    expect(estadoDoLadoNaConversa('outro', traduzindo, false)).toBe('pensando')
    expect(estadoDoLadoNaConversa('meu', traduzindo, false)).toBe('parado')
  })
  it('automático: os dois ouvem e os dois pensam', () => {
    expect(estadoDoLadoNaConversa('meu', e({ fase: 'ouvindo', automatico: true }), false)).toBe('ouvindo')
    expect(estadoDoLadoNaConversa('outro', e({ fase: 'traduzindo', automatico: true }), false)).toBe('pensando')
  })
  it('voz lendo a tradução: fala quem disse a frase, o outro ouve; sem som ainda, quem disse ainda pensa', () => {
    const lendo = e({ fase: 'falando', falando: { lado: 'meu' } })
    expect(estadoDoLadoNaConversa('meu', lendo, true)).toBe('falando')
    expect(estadoDoLadoNaConversa('outro', lendo, true)).toBe('ouvindo')
    expect(estadoDoLadoNaConversa('meu', lendo, false)).toBe('pensando')
  })
})

describe('preferências', () => {
  it('padrão: os dois, médio, rosto, sem economia, sem anúncio por voz', () => {
    expect(validarPreferencias(undefined)).toEqual(PREFERENCIAS_PADRAO)
    expect(PREFERENCIAS_PADRAO).toMatchObject({
      quem: 'ambos',
      tamanho: 'm',
      foco: 'rosto',
      economia: false,
      anunciar: false,
    })
  })
  it('lixo, valor futuro e tipo errado voltam ao padrão, campo a campo', () => {
    expect(validarPreferencias({ quem: 'todos', tamanho: 'xl', foco: 3, economia: 'sim', anunciar: 1 })).toEqual(
      PREFERENCIAS_PADRAO,
    )
    expect(validarPreferencias({ quem: 'meu', tamanho: 'g', economia: true })).toMatchObject({
      quem: 'meu',
      tamanho: 'g',
      economia: true,
    })
    expect(OPCOES_DE_QUEM).toContain('nenhum')
  })
  it('tamanhos: o celular é menor que o computador, e P < M < G', () => {
    for (const l of ['celular', 'computador'] as const) {
      expect(ladoDoAvatarEmPx('p', l)).toBeLessThan(ladoDoAvatarEmPx('m', l))
      expect(ladoDoAvatarEmPx('m', l)).toBeLessThan(ladoDoAvatarEmPx('g', l))
    }
    expect(ladoDoAvatarEmPx('g', 'celular')).toBeLessThan(ladoDoAvatarEmPx('g', 'computador'))
  })
})

describe('política dos avatares', () => {
  const base = { flag: true, prefs: PREFERENCIAS_PADRAO, webgl2: true, tier: 'forte' as const }
  it('sem a flag nada aparece', () => {
    expect(politicaDosAvatares({ ...base, flag: false })).toMatchObject({ mostrar: false, motivo: 'sem_flag' })
  })
  it('com a flag: dois avatares, tier limitado a médio', () => {
    const p = politicaDosAvatares(base)
    expect(p).toMatchObject({ mostrar: true, donos: ['meu', 'outro'], tier: 'medio', fallback2d: false })
  })
  it('um avatar só mantém o tier do aparelho; fraco continua fraco', () => {
    expect(politicaDosAvatares({ ...base, prefs: { ...PREFERENCIAS_PADRAO, quem: 'meu' } }).tier).toBe('forte')
    expect(politicaDosAvatares({ ...base, tier: 'fraco' }).tier).toBe('fraco')
    expect(politicaDosAvatares({ ...base, prefs: { ...PREFERENCIAS_PADRAO, quem: 'interprete' } }).donos).toEqual([
      'outro',
    ])
  })
  it('modo economia e "nenhum" voltam ao layout de antes', () => {
    expect(politicaDosAvatares({ ...base, prefs: { ...PREFERENCIAS_PADRAO, economia: true } })).toMatchObject({
      mostrar: false,
      motivo: 'economia',
    })
    expect(politicaDosAvatares({ ...base, prefs: { ...PREFERENCIAS_PADRAO, quem: 'nenhum' } })).toMatchObject({
      mostrar: false,
      motivo: 'nenhum',
    })
  })
  it('sem WebGL2: fallback 2D, e o avatar continua à vista', () => {
    expect(politicaDosAvatares({ ...base, webgl2: false })).toMatchObject({ mostrar: true, fallback2d: true })
  })
  it('só mãos exige a flag dos sinais', () => {
    const prefs = { ...PREFERENCIAS_PADRAO, foco: 'maos' as const }
    expect(politicaDosAvatares({ ...base, prefs }).foco).toBe('rosto')
    expect(politicaDosAvatares({ ...base, prefs, sinais: true }).foco).toBe('maos')
  })
})

describe('avatar-intérprete', () => {
  const ids = ['milk', 'bullidan']
  it('padrão; se a pessoa usa o mesmo, o reserva; sem coleção, nada', () => {
    expect(modeloDoInterprete(null, ids)).toBe(INTERPRETE_PADRAO)
    expect(modeloDoInterprete('bullidan', ids)).toBe(INTERPRETE_RESERVA)
    expect(modeloDoInterprete('milk', ['milk'])).toBe('milk')
    expect(modeloDoInterprete(null, [])).toBeNull()
    expect(modeloPadraoDaPessoa(ids)).toBe('milk')
    expect(modeloDoInterprete(modeloPadraoDaPessoa(ids), ids)).toBe(INTERPRETE_PADRAO)
  })
})
