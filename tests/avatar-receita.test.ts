import { describe, expect, it } from 'vitest'

import { LIMITES_DA_RECEITA, validarReceita } from '../src/core/avatar/receita'

const boa = () => ({
  versao: 1,
  base: { origem: 'familia', id: 'robo' },
  paleta: { pele: 'pele-3', cabelo: 'cabelo-1', olhos: 'olhos-2' },
  pecas: ['bone-azul', 'camiseta-1'],
  ajustes: { escala: 1, altura: 1.1 },
  meta: { nome: 'Ana', criadoEm: 1_790_000_000_000 },
})

const erros = (entrada: unknown) => {
  const r = validarReceita(entrada)
  expect(r.ok).toBe(false)
  return 'erros' in r ? r.erros : []
}

describe('validarReceita: casos felizes', () => {
  it('aceita uma receita completa e devolve uma cópia', () => {
    const entrada = boa()
    const r = validarReceita(entrada)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.receita).toEqual(entrada)
    expect(r.receita).not.toBe(entrada)
    expect(r.receita.pecas).not.toBe(entrada.pecas)
  })

  it('aceita ajustes vazios, peças vazias e as três origens', () => {
    for (const origem of ['familia', 'colecao', 'importado']) {
      const r = validarReceita({ ...boa(), base: { origem, id: 'x1' }, pecas: [], ajustes: {} })
      expect(r.ok).toBe(true)
    }
  })

  it('apara o nome e tira peças repetidas', () => {
    const r = validarReceita({ ...boa(), pecas: ['a', 'a', 'b'], meta: { nome: '  Bia  ', criadoEm: 0 } })
    expect(r.ok && r.receita.pecas).toEqual(['a', 'b'])
    expect(r.ok && r.receita.meta.nome).toBe('Bia')
  })

  it('sobrevive a ida e volta por JSON', () => {
    const r = validarReceita(JSON.parse(JSON.stringify(boa())))
    expect(r.ok).toBe(true)
  })
})

describe('validarReceita: bordas', () => {
  it('recusa campo desconhecido em cada nível', () => {
    expect(erros({ ...boa(), extra: 1 }).join()).toMatch(/desconhecido "extra"/)
    expect(erros({ ...boa(), base: { origem: 'familia', id: 'robo', url: 'https://x' } }).join()).toMatch(/base: .*url/)
    expect(erros({ ...boa(), paleta: { pele: 'a', cabelo: 'b', olhos: 'c', boca: 'd' } }).join()).toMatch(/boca/)
    expect(erros({ ...boa(), ajustes: { escala: 1, foto: 3 } }).join()).toMatch(/ajustes: .*foto/)
    expect(erros({ ...boa(), meta: { nome: 'a', criadoEm: 1, email: 'x' } }).join()).toMatch(/email/)
  })

  it('recusa tipo errado e campo faltando', () => {
    expect(erros(null)).toHaveLength(1)
    expect(erros([])).toHaveLength(1)
    expect(erros('texto')).toHaveLength(1)
    expect(erros({})).not.toHaveLength(0)
    expect(erros({ ...boa(), pecas: 'a' }).join()).toMatch(/pecas/)
    expect(erros({ ...boa(), pecas: [1] }).join()).toMatch(/pecas/)
    expect(erros({ ...boa(), base: { origem: 'outra', id: 'a' } }).join()).toMatch(/base.origem/)
    expect(erros({ ...boa(), meta: { nome: 5, criadoEm: 1 } }).join()).toMatch(/meta.nome/)
  })

  it('recusa versão errada e diz quando é futura', () => {
    expect(erros({ ...boa(), versao: 3 }).join()).toMatch(/mais nova/)
    expect(erros({ ...boa(), versao: '1' }).join()).toMatch(/precisa ser 1/)
    expect(erros({ ...boa(), versao: undefined }).join()).toMatch(/versao/)
  })

  it('recusa ajuste fora da faixa e os limites exatos passam', () => {
    expect(erros({ ...boa(), ajustes: { escala: 1.31 } }).join()).toMatch(/ajustes.escala/)
    expect(erros({ ...boa(), ajustes: { escala: 0.69 } }).join()).toMatch(/ajustes.escala/)
    expect(erros({ ...boa(), ajustes: { altura: -1 } }).join()).toMatch(/ajustes.altura/)
    expect(validarReceita({ ...boa(), ajustes: { escala: 0.7, altura: 1.2, largura: 0.8 } }).ok).toBe(true)
  })

  it('recusa id fora do padrão e passa o limite de tamanho', () => {
    expect(erros({ ...boa(), base: { origem: 'familia', id: 'Robo' } }).join()).toMatch(/base.id/)
    expect(erros({ ...boa(), base: { origem: 'familia', id: '../etc' } }).join()).toMatch(/base.id/)
    expect(erros({ ...boa(), base: { origem: 'familia', id: '' } }).join()).toMatch(/base.id/)
    const max = 'a'.repeat(LIMITES_DA_RECEITA.tamanhoDoId)
    expect(validarReceita({ ...boa(), base: { origem: 'familia', id: max } }).ok).toBe(true)
    expect(erros({ ...boa(), base: { origem: 'familia', id: max + 'a' } }).join()).toMatch(/base.id/)
  })

  it('limita a quantidade de peças e o nome', () => {
    const muitas = Array.from({ length: LIMITES_DA_RECEITA.maxPecas + 1 }, (_, i) => `p${i}`)
    expect(erros({ ...boa(), pecas: muitas }).join()).toMatch(/no máximo/)
    expect(erros({ ...boa(), meta: { nome: 'x'.repeat(41), criadoEm: 1 } }).join()).toMatch(/meta.nome/)
    expect(erros({ ...boa(), meta: { nome: 'a\u0000b', criadoEm: 1 } }).join()).toMatch(/meta.nome/)
    expect(validarReceita({ ...boa(), meta: { nome: 'x'.repeat(40), criadoEm: 1 } }).ok).toBe(true)
  })
})

describe('validarReceita: entradas hostis', () => {
  it('recusa __proto__ vindo de JSON.parse e não polui o protótipo', () => {
    const hostil = JSON.parse(
      '{"versao":1,"__proto__":{"admin":true},"base":{"origem":"familia","id":"robo","__proto__":{"x":1}},' +
        '"paleta":{"pele":"a","cabelo":"b","olhos":"c"},"pecas":[],"ajustes":{"__proto__":{"escala":9}},' +
        '"meta":{"nome":"a","criadoEm":1}}',
    )
    const e = erros(hostil)
    expect(e.join()).toMatch(/__proto__/)
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('recusa constructor e prototype como campo', () => {
    expect(erros({ ...boa(), constructor: {} }).join()).toMatch(/constructor/)
    expect(erros(JSON.parse('{"prototype":1}')).join()).toMatch(/prototype/)
  })

  it('recusa objeto com protótipo estranho (classe, Map, Date)', () => {
    expect(erros(new Map())).toHaveLength(1)
    expect(erros(new Date())).toHaveLength(1)
    class Falsa {}
    expect(erros(new Falsa())).toHaveLength(1)
  })

  it('um nome de 1 MB é recusado depressa, sem estourar', () => {
    const t0 = performance.now()
    const e = erros({ ...boa(), meta: { nome: 'a'.repeat(1_048_576), criadoEm: 1 } })
    expect(e.join()).toMatch(/meta.nome/)
    expect(performance.now() - t0).toBeLessThan(200)
  })

  it('um id de 1 MB e uma lista de 1 milhão de peças são recusados', () => {
    expect(erros({ ...boa(), base: { origem: 'familia', id: 'a'.repeat(1_048_576) } }).join()).toMatch(/base.id/)
    expect(erros({ ...boa(), pecas: new Array(1_000_000).fill('a') }).join()).toMatch(/no máximo/)
  })

  it('NaN, Infinity e números como texto são recusados', () => {
    for (const v of [NaN, Infinity, -Infinity, '1', null, {}, [1]])
      expect(erros({ ...boa(), ajustes: { escala: v } }).join()).toMatch(/ajustes.escala/)
    for (const v of [NaN, Infinity, -1, 1.5, '1', 1e15])
      expect(erros({ ...boa(), meta: { nome: 'a', criadoEm: v } }).join()).toMatch(/criadoEm/)
  })

  it('um getter que lança vira erro, não exceção', () => {
    const o = boa() as Record<string, unknown>
    Object.defineProperty(o, 'versao', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    expect(erros(o).join()).toMatch(/ilegível/)
  })

  it('limita a lista de erros', () => {
    const lixo = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, i]))
    const e = erros(lixo)
    expect(e.length).toBeLessThanOrEqual(LIMITES_DA_RECEITA.maxErros)
  })
})
