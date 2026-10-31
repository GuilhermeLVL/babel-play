import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lerCorpus } from '../scripts/eval-voz/comum.mjs'

type Item = {
  id: string
  idioma: 'pt' | 'en' | 'es'
  texto: string
  categoria: string
  itens: { texto: string; aceita: string[]; tipo: string }[]
}

const RAIZ = path.resolve(__dirname, '..', 'scripts', 'eval-voz')
const CORPUS = path.join(RAIZ, 'corpus-voz.jsonl')
const FONTES = path.join(RAIZ, 'fontes')
const lerItens = (): Item[] => lerCorpus(CORPUS)

const CATEGORIAS_PT = [
  'dom-casmurro-cap1',
  'dom-casmurro-cap5',
  'dialogo',
  'eca',
  'soneto',
  'numeros',
  'romanos-ordinais',
  'siglas',
  'nomes-estrangeiros',
  'estrangeirismo',
  'homografos',
  'frase-longa',
  'entonacao',
  'reticencias',
]

describe('corpus de voz', () => {
  it('tem exatamente 14 itens pt, um por categoria da spec 7.1', () => {
    const pt = lerItens().filter((i) => i.idioma === 'pt')
    expect(pt).toHaveLength(14)
    expect(pt.map((i) => i.categoria).sort()).toEqual([...CATEGORIAS_PT].sort())
  })

  it('tem en e es nas categorias aplicáveis', () => {
    const itens = lerItens()
    for (const idioma of ['en', 'es']) {
      const cats = itens.filter((i) => i.idioma === idioma).map((i) => i.categoria)
      expect(cats.length).toBeGreaterThanOrEqual(4)
      for (const c of ['literario', 'numeros', 'siglas', 'nomes-estrangeiros']) expect(cats).toContain(c)
    }
  })

  it('ids únicos e textos não vazios', () => {
    const itens = lerItens()
    expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length)
    for (const i of itens) expect(i.texto.trim().length).toBeGreaterThan(10)
  })

  it('todo item difícil tem aceita não vazio (por extenso e em dígitos) e aparece no texto', () => {
    for (const i of lerItens()) {
      for (const d of i.itens) {
        expect(d.aceita.length, `${i.id}/${d.texto}`).toBeGreaterThan(0)
        expect(i.texto, `${i.id}: "${d.texto}" não está no texto`).toContain(d.texto)
        if (d.tipo === 'numero' || d.tipo === 'ano') {
          expect(
            d.aceita.some((a) => /\d/.test(a)) && d.aceita.some((a) => /[a-zà-ú]{3,}/i.test(a)),
            `${i.id}/${d.texto}: faltam forma em dígitos ou por extenso`,
          ).toBe(true)
        }
      }
    }
  })

  it('a frase longa tem mais de 600 caracteres', () => {
    const longa = lerItens().find((i) => i.categoria === 'frase-longa')
    expect(longa?.texto.length).toBeGreaterThan(600)
  })

  it('toda fonte tem cabeçalho, origem e licença dominio-publico', () => {
    const arquivos = readdirSync(FONTES).filter((f) => f.endsWith('.txt'))
    expect(arquivos.length).toBe(lerItens().length)
    for (const f of arquivos) {
      const linhas = readFileSync(path.join(FONTES, f), 'utf8').split('\n')
      const cab = linhas[0].split('|').map((s) => s.trim())
      expect(cab, f).toHaveLength(4)
      expect(cab[0].startsWith('# ')).toBe(true)
      expect(cab[3], f).toBe('dominio-publico')
      expect(
        linhas.slice(1).some((l) => /^# origem:/.test(l)),
        `${f} sem linha "# origem:"`,
      ).toBe(true)
    }
  })

  it('o JSONL gerado bate com as fontes (nenhum texto fora delas)', () => {
    const fontes = readdirSync(FONTES)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => readFileSync(path.join(FONTES, f), 'utf8'))
      .join('\n')
    for (const i of lerItens()) {
      for (const linha of i.texto.split('\n')) expect(fontes).toContain(linha)
    }
  })

  it('gabarito: pendente de revisão do dono e ids existentes nas fontes', () => {
    const g = JSON.parse(readFileSync(path.join(FONTES, 'gabarito.json'), 'utf8'))
    expect(g.revisao_do_dono).toBe('pendente')
    const ids = new Set(lerItens().map((i) => i.id))
    for (const id of Object.keys(g.itens)) expect(ids.has(id), `id ${id} do gabarito sem fonte`).toBe(true)
  })

  it('o gerador falha alto com fonte sem cabeçalho ou com licença que não é dominio-publico', () => {
    const gerar = (conteudo: string) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'eval-voz-'))
      writeFileSync(path.join(dir, 'x.txt'), conteudo)
      writeFileSync(path.join(dir, 'gabarito.json'), JSON.stringify({ revisao_do_dono: 'pendente', itens: {} }))
      return () =>
        execFileSync(
          process.execPath,
          [path.join(RAIZ, 'montar-frases.mjs'), '--fontes', dir, '--saida', path.join(dir, 'o.jsonl')],
          { stdio: 'pipe' },
        )
    }
    expect(gerar('sem cabeçalho\ntexto')).toThrow()
    expect(gerar('# a | pt | numeros | cc-by-nc\n# origem: x\ntexto')).toThrow()
    expect(gerar('# a | pt | numeros | dominio-publico\n# origem: x\ntexto aqui')).not.toThrow()
  })

  it('lerCorpus rejeita linha inválida com o número da linha', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eval-voz-'))
    const f = path.join(dir, 'c.jsonl')
    const ok = { id: 'a', idioma: 'pt', texto: 't', categoria: 'c', itens: [] }
    writeFileSync(f, `${JSON.stringify(ok)}\n${JSON.stringify({ ...ok, idioma: 'fr' })}\n`)
    expect(() => lerCorpus(f)).toThrow(/linha 2/)
    writeFileSync(f, `${JSON.stringify({ ...ok, itens: [{ texto: 'x', aceita: ['x'], tipo: 'cor' }] })}\n`)
    expect(() => lerCorpus(f)).toThrow(/linha 1/)
  })
})
