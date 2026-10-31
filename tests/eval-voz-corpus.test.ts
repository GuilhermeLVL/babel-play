import { execFileSync, spawnSync } from 'node:child_process'
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

  it('regerar o corpus a partir das fontes dá exatamente o JSONL commitado', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eval-voz-'))
    const saida = path.join(dir, 'corpus-voz.jsonl')
    execFileSync(process.execPath, [path.join(RAIZ, 'montar-frases.mjs'), '--saida', saida], { stdio: 'pipe' })
    expect(readFileSync(saida)).toEqual(readFileSync(CORPUS))
  })

  it('o texto lido em voz alta não tem marcas de itálico do Gutenberg (_..._)', () => {
    for (const i of lerItens()) expect(i.texto, i.id).not.toMatch(/_/)
  })

  it('gabarito: revisão do dono pendente ou aprovada, e ids existentes nas fontes', () => {
    const g = JSON.parse(readFileSync(path.join(FONTES, 'gabarito.json'), 'utf8'))
    expect(['pendente', 'aprovado']).toContain(g.revisao_do_dono)
    const ids = new Set(lerItens().map((i) => i.id))
    for (const id of Object.keys(g.itens)) expect(ids.has(id), `id ${id} do gabarito sem fonte`).toBe(true)
  })

  describe('gerador', () => {
    const OK = '# x | pt | numeros | dominio-publico\n# origem: teste\ntexto aqui\n'
    /** Roda o gerador numa pasta temporária; devolve status e stderr. */
    const gerar = (arquivos: Record<string, string>, gabarito: string = '{"itens":{}}', extra: string[] = []) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'eval-voz-'))
      for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(path.join(dir, nome), conteudo)
      writeFileSync(path.join(dir, 'gabarito.json'), gabarito)
      const saida = path.join(dir, 'o.jsonl')
      const r = spawnSync(
        process.execPath,
        [path.join(RAIZ, 'montar-frases.mjs'), '--fontes', dir, '--saida', saida, ...extra],
        { encoding: 'utf8' },
      )
      return { status: r.status, erro: r.stderr, saida }
    }

    it('aceita uma fonte válida', () => {
      expect(gerar({ 'x.txt': OK }).status).toBe(0)
    })

    it('falha sem cabeçalho', () => {
      const r = gerar({ 'x.txt': 'sem cabeçalho\ntexto' })
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/primeira linha deve ser "# id \| idioma \| categoria \| licenca"/)
    })

    it('falha com licença que não é dominio-publico', () => {
      const r = gerar({ 'x.txt': OK.replace('dominio-publico', 'cc-by-nc') })
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/licenca "cc-by-nc" não é dominio-publico/)
    })

    it('falha sem a linha "# origem:"', () => {
      const r = gerar({ 'x.txt': '# x | pt | numeros | dominio-publico\ntexto aqui\n' })
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/falta a linha "# origem: \.\.\."/)
    })

    it('falha com id repetido', () => {
      const r = gerar({ 'x.txt': OK, 'y.txt': OK.replace('# x |', '# x |') })
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/id repetido: x/)
    })

    it('falha quando o id do cabeçalho não é o nome do arquivo', () => {
      const r = gerar({ 'outro.txt': OK })
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/id "x" difere do nome do arquivo/)
    })

    it('falha com gabarito malformado, com mensagem clara', () => {
      const r = gerar({ 'x.txt': OK }, '{ não é json')
      expect(r.status).not.toBe(0)
      expect(r.erro).toMatch(/gabarito\.json inválido/)
      expect(r.erro).not.toMatch(/at .*\.mjs:\d+/)
    })

    it('falha com --saida ou --fontes sem valor, sem sobrescrever o corpus', () => {
      const antes = readFileSync(CORPUS)
      for (const flag of ['--saida', '--fontes']) {
        const r = spawnSync(process.execPath, [path.join(RAIZ, 'montar-frases.mjs'), flag], { encoding: 'utf8' })
        expect(r.status, flag).not.toBe(0)
        expect(r.stderr, flag).toMatch(new RegExp(`${flag} exige um valor`))
      }
      expect(readFileSync(CORPUS)).toEqual(antes)
    })

    it('tira o itálico _..._ do Gutenberg do texto', () => {
      const r = gerar({ 'x.txt': OK.replace('texto aqui', 'chamam-me _Dom Casmurro._ sim') })
      expect(r.status).toBe(0)
      expect(readFileSync(r.saida, 'utf8')).toContain('chamam-me Dom Casmurro. sim')
    })
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
