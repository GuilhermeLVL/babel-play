import { describe, expect, it } from 'vitest'

import { receitaNova } from '../src/core/avatar/edicao'
import { corDaPeca, desligarPeca, ligarPeca, limparPecas, moverPeca } from '../src/core/avatar/estudio'
import { type ReceitaDeAvatar, validarReceita } from '../src/core/avatar/receita'
import {
  bytesEmUtf8,
  exportarReceita,
  importarReceita,
  LIMITES_DO_ARQUIVO,
  migrarReceitaParaV2,
} from '../src/core/avatar/receitaArquivo'

const v1 = (extra: Record<string, unknown> = {}) => ({
  versao: 1,
  base: { origem: 'colecao', id: 'milk' },
  paleta: { pele: 'claro', cabelo: 'preto', olhos: 'mel' },
  pecas: ['bone-azul', 'bone', 'oculos-redondo', 'bone'],
  ajustes: { escala: 1.1 },
  meta: { nome: 'Ana', criadoEm: 1_790_000_000_000 },
  ...extra,
})
const v2 = (extra: Record<string, unknown> = {}) => ({
  versao: 2,
  base: { origem: 'colecao', id: 'milk' },
  paleta: { pele: 'claro', cabelo: 'preto', olhos: 'mel' },
  pecas: ['oculos-redondo', 'bone'],
  coresDasPecas: { bone: 'verde' },
  ajustes: {},
  meta: { nome: 'Ana', criadoEm: 1_790_000_000_000 },
  ...extra,
})
const texto = (o: unknown) => JSON.stringify(o)
const falha = (t: unknown) => {
  const r = importarReceita(t)
  expect(r.ok).toBe(false)
  return 'erros' in r ? r.erros.join(' | ') : ''
}
const valida = (t: unknown): ReceitaDeAvatar => {
  const r = validarReceita(t)
  if ('erros' in r) throw new Error(r.erros.join('; '))
  return r.receita
}

describe('receita v1 -> v2', () => {
  it('a v1 continua válida e não ganha campo novo', () => {
    const r = valida(v1())
    expect(r.versao).toBe(1)
    expect('coresDasPecas' in r).toBe(false)
  })
  it('a v1 não aceita coresDasPecas (campo da v2)', () => {
    expect(validarReceita(v1({ coresDasPecas: {} })).ok).toBe(false)
  })
  it('migra: tira id desconhecido e repetido, mantém o resto e cria coresDasPecas', () => {
    const lida = valida(v1())
    const { receita, removidas } = migrarReceitaParaV2(lida)
    expect(receita.versao).toBe(2)
    expect(receita.pecas).toEqual(['bone', 'oculos-redondo'])
    expect(removidas).toEqual(['bone-azul'])
    expect(receita.coresDasPecas).toEqual({})
    expect(receita.meta).toEqual(lida.meta)
    expect(receita.ajustes).toEqual(lida.ajustes)
    expect(validarReceita(receita).ok).toBe(true)
  })
  it('importar um arquivo v1 devolve v2 com avisos', () => {
    const r = importarReceita(texto(v1()))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.receita.versao).toBe(2)
    expect(r.avisos).toEqual([{ codigo: 'versao_antiga' }, { codigo: 'pecas_removidas', ids: ['bone-azul'] }])
  })
  it('a v3 é recusada como mais nova', () => {
    expect(falha(texto(v2({ versao: 3 })))).toMatch(/mais nova/)
  })
})

describe('v2 contra o catálogo', () => {
  it('rejeita peça desconhecida, mesmo lugar, e cor de peça que não está na receita', () => {
    expect(validarReceita(v2({ pecas: ['nada'] })).ok).toBe(false)
    expect(validarReceita(v2({ pecas: ['bone', 'cartola'], coresDasPecas: {} })).ok).toBe(false)
    expect(validarReceita(v2({ coresDasPecas: { lenco: 'verde' } })).ok).toBe(false)
    expect(validarReceita(v2({ coresDasPecas: { bone: 'cor-inventada' } })).ok).toBe(false)
  })
  it('rejeita estouro do limite de peças', () => {
    const muitas = [
      'oculos-redondo',
      'fone-de-ouvido',
      'bone',
      'lenco',
      'balao-de-fala',
      'aparelho-auditivo-esq',
      'aparelho-auditivo-dir',
      'implante-coclear-esq',
      'implante-coclear-dir',
    ]
    expect(validarReceita(v2({ pecas: muitas, coresDasPecas: {} })).ok).toBe(false)
  })
})

describe('exportar e importar', () => {
  it('JSON canônico: chaves ordenadas, sem campo extra, termina em quebra de linha', () => {
    const out = exportarReceita(valida(v2()))
    const obj = JSON.parse(out)
    expect(Object.keys(obj)).toEqual(['ajustes', 'base', 'coresDasPecas', 'meta', 'paleta', 'pecas', 'versao'])
    expect(obj.pecas).toEqual(['oculos-redondo', 'bone'])
    expect(out.endsWith('\n')).toBe(true)
  })
  it('ida e volta é idempotente (v2)', () => {
    const original = valida(v2())
    const a = exportarReceita(original)
    const volta = importarReceita(a)
    expect(volta.ok).toBe(true)
    if (!volta.ok) return
    expect(volta.receita).toEqual(original)
    expect(volta.avisos).toEqual([])
    expect(exportarReceita(volta.receita)).toBe(a)
  })
  it('exportar uma v1 grava v2', () => {
    expect(JSON.parse(exportarReceita(valida(v1()))).versao).toBe(2)
  })
  it('a receita editada pelo Estúdio faz a viagem inteira', () => {
    let r: ReceitaDeAvatar = receitaNova({ origem: 'familia', id: 'robo' }, 'Teo', 1_790_000_000_000)
    r = ligarPeca(r, 'oculos-quadrado').receita
    r = ligarPeca(r, 'implante-coclear-dir').receita
    r = ligarPeca(r, 'bone').receita
    r = corDaPeca(r, 'oculos-quadrado', 'roxo')
    r = moverPeca(r, 'bone', -1)
    const volta = importarReceita(exportarReceita(r))
    expect(volta.ok && volta.receita).toEqual(r)
  })
})

describe('importação hostil', () => {
  it('só aceita texto', () => {
    expect(falha(42)).toMatch(/texto/)
    expect(falha(null)).toMatch(/texto/)
    expect(falha({ versao: 2 })).toMatch(/texto/)
  })
  it('recusa arquivo maior que 16 KB (em bytes, não em caracteres)', () => {
    expect(falha(' '.repeat(LIMITES_DO_ARQUIVO.bytes + 1))).toMatch(/grande demais/)
    const t = texto(v2({ extra: '€'.repeat(6000) }))
    expect(t.length).toBeLessThan(LIMITES_DO_ARQUIVO.bytes)
    expect(bytesEmUtf8(t)).toBeGreaterThan(LIMITES_DO_ARQUIVO.bytes)
    expect(falha(t)).toMatch(/grande demais/)
  })
  it('recusa aninhamento profundo sem estourar a pilha', () => {
    expect(falha('['.repeat(8000) + ']'.repeat(8000))).toMatch(/aninhamento/)
    expect(falha(`{"a":${'['.repeat(20)}${']'.repeat(20)}}`)).toMatch(/aninhamento/)
  })
  it('recusa JSON inválido, NaN, Infinity e número que vira Infinity', () => {
    expect(falha('{nao json')).toMatch(/JSON/)
    expect(falha('{"versao": NaN}')).toMatch(/JSON/)
    expect(falha('{"versao": Infinity}')).toMatch(/JSON/)
    expect(falha(texto(v2()).replace('"ajustes":{}', '"ajustes":{"escala":1e999}'))).toMatch(/escala/)
  })
  it('recusa __proto__, constructor, campo desconhecido e prototype pollution', () => {
    expect(falha('{"__proto__":{"admin":true},"versao":2}')).toMatch(/desconhecido/)
    expect(falha(texto(v2()).replace('"versao":2', '"versao":2,"constructor":{"prototype":{"x":1}}'))).toMatch(
      /desconhecido/,
    )
    expect(falha(texto(v2({ base: { origem: 'colecao', id: 'milk', extra: 1 } })))).toMatch(/desconhecido/)
    expect(falha(texto(v2({ extra: 1 })))).toMatch(/desconhecido/)
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })
  it('nunca aceita URL externa nem base de outra origem', () => {
    expect(falha(texto(v2({ base: { origem: 'colecao', id: 'https://evil.example/m.vrm' } })))).toMatch(/endere|id/)
    expect(falha(texto(v2({ meta: { nome: 'veja http://evil.example', criadoEm: 1 } })))).toMatch(/endere/)
    expect(falha(texto(v2({ meta: { nome: 'javascript:alert(1)', criadoEm: 1 } })))).toMatch(/endere/)
    expect(falha(texto(v2({ base: { origem: 'url', id: 'x' } })))).toMatch(/origem/)
    expect(falha(texto(v2({ base: { origem: 'colecao', id: '//cdn.example/x' } })))).toMatch(/endere|id/)
  })
  it('recusa string longa e controle no nome', () => {
    expect(falha(texto(v2({ meta: { nome: 'a'.repeat(500), criadoEm: 1 } })))).toMatch(/nome/)
    expect(falha(texto(v2({ meta: { nome: 'a\u0000b', criadoEm: 1 } })))).toMatch(/nome/)
  })
  it('um texto que parece código é só texto recusado: nada é avaliado', () => {
    const g = globalThis as Record<string, unknown>
    g.__marca = { executou: false }
    expect(importarReceita('{"versao":2,"x":"globalThis.__marca.executou=true"}').ok).toBe(false)
    expect(importarReceita('globalThis.__marca.executou=true').ok).toBe(false)
    expect((g.__marca as { executou: boolean }).executou).toBe(false)
    delete g.__marca
  })
  it('a base `importado` passa pelo core (a lib confere o arquivo local)', () => {
    expect(importarReceita(texto(v2({ base: { origem: 'importado', id: 'meu-modelo' } }))).ok).toBe(true)
  })
})

describe('edição de peças (estudio.ts)', () => {
  const base = () => receitaNova({ origem: 'colecao', id: 'milk' }, 'Ana', 1)
  it('ligar sobe a v1 para v2 e a troca no mesmo lugar tira a anterior', () => {
    let r = ligarPeca(base(), 'bone').receita
    expect(r.versao).toBe(2)
    r = ligarPeca(r, 'cartola').receita
    expect(r.pecas).toEqual(['cartola'])
  })
  it('peça bloqueada pela loja e desconhecida são negadas sem mudar a receita', () => {
    const r = base()
    expect(ligarPeca(r, 'capa', () => false)).toEqual({ receita: r, negado: { motivo: 'bloqueada' } })
    expect(ligarPeca(r, 'nada').negado?.motivo).toBe('desconhecida')
  })
  it('cabem oito peças sem conflito; o fone tira os implantes do mesmo lado da cabeça', () => {
    let r = base()
    for (const id of [
      'oculos-redondo',
      'bone',
      'lenco',
      'balao-de-fala',
      'aparelho-auditivo-esq',
      'aparelho-auditivo-dir',
      'implante-coclear-esq',
      'implante-coclear-dir',
    ])
      r = ligarPeca(r, id).receita
    expect(r.pecas.length).toBe(8)
    expect(validarReceita(r).ok).toBe(true)
    const com = ligarPeca(r, 'fone-de-ouvido').receita
    expect(com.pecas).not.toContain('implante-coclear-esq')
    expect(com.pecas).toContain('fone-de-ouvido')
    expect(com.pecas).toContain('aparelho-auditivo-esq')
  })
  it('desligar, cor, mover e limpar mantêm a receita válida', () => {
    let r = ligarPeca(ligarPeca(base(), 'oculos-redondo').receita, 'bone').receita
    r = corDaPeca(r, 'bone', 'rosa')
    expect(r.coresDasPecas).toEqual({ bone: 'rosa' })
    r = corDaPeca(r, 'bone', 'padrao')
    expect(r.coresDasPecas).toEqual({})
    r = moverPeca(r, 'bone', -1)
    expect(r.pecas).toEqual(['bone', 'oculos-redondo'])
    expect(moverPeca(r, 'bone', -1)).toBe(r)
    r = desligarPeca(corDaPeca(r, 'bone', 'azul'), 'bone')
    expect(r.pecas).toEqual(['oculos-redondo'])
    expect(r.coresDasPecas).toEqual({})
    expect(limparPecas(r).pecas).toEqual([])
    expect(validarReceita(limparPecas(r)).ok).toBe(true)
  })
})
