/**
 * AS FICHAS DOS LIVROS (L4 de Livros & Leitura; `src/core/livros/ficha.ts`, `scripts/livros/gerar-fichas.mjs`).
 *
 *   - toda ficha publicada passa no validador, aponta para um livro do catálogo, tem o aviso "gerado por IA, revisado
 *     automaticamente", não tem citação entre aspas e só recomenda livros do catálogo;
 *   - o índice lista exatamente as fichas publicadas, e o arquivo do servidor tem as mesmas, SEM spoiler;
 *   - `fichaParaLeitor`: menor não vê a ficha do livro que não pode ver; spoiler só a pedido; o sensível e o aviso de
 *     conteúdo só a partir de 16; "leia também" só com livros visíveis;
 *   - `fichaParaOPrompt`: nada de spoiler, e o sensível só para quem o alcança.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AVISO_DA_FICHA,
  AVISO_NEUTRO,
  AVISO_SEM_SPOILER,
  type FichaDoLivro,
  fichaParaLeitor,
  fichaParaOPrompt,
  SECOES_DE_ITENS,
  temCitacaoLonga,
  tetoPelaFaixa,
  validarFicha,
} from '../src/core/livros/ficha'

const RAIZ = join(__dirname, '..')
const PASTA = join(RAIZ, 'public/catalogo/fichas')
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'public/catalogo/livros.json'), 'utf8')) as {
  livros: { id: string }[]
}
const ids = new Set(catalogo.livros.map((l) => l.id))
const arquivos = readdirSync(PASTA).filter((n) => n.endsWith('.json') && n !== 'indice.json')
const publicadas = arquivos.map((n) => ({ n, f: JSON.parse(readFileSync(join(PASTA, n), 'utf8')) as FichaDoLivro }))

describe('as fichas publicadas', () => {
  it('existe pelo menos uma ficha publicada', () => {
    expect(publicadas.length).toBeGreaterThan(0)
  })

  for (const { n, f } of publicadas)
    it(`${n}: válida, do catálogo, com o aviso e sem citação`, () => {
      const v = validarFicha(f, ids)
      expect('erros' in v ? v.erros : []).toEqual([])
      expect(n).toBe(`${f.livroId}.json`)
      expect(ids.has(f.livroId)).toBe(true)
      expect(f.procedencia.aviso).toBe(AVISO_DA_FICHA)
      for (const secao of SECOES_DE_ITENS)
        for (const i of f[secao]) expect(temCitacaoLonga(i.texto), i.texto).toBe(false)
    })

  it('o índice lista exatamente as fichas publicadas, e o servidor as mesmas, SEM spoiler', () => {
    const indice = JSON.parse(readFileSync(join(PASTA, 'indice.json'), 'utf8')) as { fichas: string[] }
    expect([...indice.fichas].sort()).toEqual(publicadas.map((p) => p.f.livroId).sort())
    const servidor = JSON.parse(readFileSync(join(RAIZ, 'src/data/livros/fichasDoParceiro.json'), 'utf8')) as {
      fichas: Record<string, FichaDoLivro>
    }
    expect(Object.keys(servidor.fichas).sort()).toEqual([...indice.fichas].sort())
    for (const f of Object.values(servidor.fichas))
      for (const secao of SECOES_DE_ITENS)
        for (const i of f[secao]) expect(i.spoiler, `${f.livroId} ${secao}`).toBe(false)
  })
})

const item = (texto: string, extra: Partial<{ spoiler: boolean; sensivel: boolean }> = {}) => ({
  texto,
  spoiler: false,
  sensivel: false,
  ...extra,
})
const FICHA: FichaDoLivro = {
  versao: 1,
  livroId: 'pg-x',
  titulo: 'X',
  idioma: 'en',
  geradaEm: '2026-10-26',
  procedencia: { geradoPor: 'g', revisadoPor: 'r', aviso: AVISO_DA_FICHA, removidosNaRevisao: 0 },
  autorEContexto: [item('a1'), item('a2'), item('a3')],
  porQueImporta: [item('p1')],
  temas: [
    { nome: 't1', ...item('t1') },
    { nome: 't2', ...item('t2', { sensivel: true }) },
  ],
  personagens: [{ nome: 'n', ...item('morre no fim', { spoiler: true }) }],
  curiosidades: [item('c1'), item('c2'), item('c3', { spoiler: true }), item('c4', { sensivel: true })],
  vocabulario: [],
  notasDeEpoca: [],
  perguntas: [1, 2, 3, 4].map((i) => ({ ...item(`q${i}`), noIdiomaDoLivro: `q${i}` })),
  leiaTambem: [
    { id: 'pg-visivel', motivo: 'm' },
    { id: 'pg-escondido', motivo: 'm' },
  ],
  avisoDeConteudo: { classificacaoSugerida: '12', nota: 'o suicídio do fim', sensivel: 'violência' },
}

describe('validarFicha', () => {
  it('a ficha de exemplo passa', () => {
    expect(validarFicha(FICHA).ok).toBe(true)
  })
  it('sem o aviso, com citação, abaixo do mínimo ou recomendando fora do catálogo: reprova', () => {
    expect(validarFicha({ ...FICHA, procedencia: { ...FICHA.procedencia, aviso: 'outro' } }).ok).toBe(false)
    expect(
      validarFicha({
        ...FICHA,
        curiosidades: [...FICHA.curiosidades, item('ele disse "to be or not to be that is it"')],
      }).ok,
    ).toBe(false)
    expect(validarFicha({ ...FICHA, perguntas: FICHA.perguntas.slice(0, 2) }).ok).toBe(false)
    expect(validarFicha(FICHA, new Set(['pg-visivel'])).ok).toBe(false)
    expect(validarFicha({ ...FICHA, leiaTambem: [{ id: 'pg-x', motivo: 'eu mesmo' }] }).ok).toBe(false)
  })
  it('título entre aspas (poucas palavras) não é citação', () => {
    expect(temCitacaoLonga('o musical "West Side Story" de 1957')).toBe(false)
    expect(temCitacaoLonga('“Two households, both alike in dignity, in fair Verona”')).toBe(true)
  })
})

describe('fichaParaLeitor', () => {
  const livroVisivel = (id: string) => id === 'pg-visivel'
  const textos = (f: FichaDoLivro | null) => (f ? SECOES_DE_ITENS.flatMap((s) => f[s].map((i) => i.texto)) : [])

  it('menor não vê a ficha do livro que não pode ver (a revisar, ou acima da faixa)', () => {
    expect(fichaParaLeitor(FICHA, { classificacao: null }, { teto: '12', mostrarSpoilers: false })).toBeNull()
    expect(fichaParaLeitor(FICHA, { classificacao: '14' }, { teto: '12', mostrarSpoilers: false })).toBeNull()
    expect(fichaParaLeitor(FICHA, { classificacao: null }, { teto: '18', mostrarSpoilers: false })).not.toBeNull()
  })

  it('12 anos: sem spoiler, sem o sensível e com o aviso neutro', () => {
    const f = fichaParaLeitor(FICHA, { classificacao: 'livre' }, { teto: '12', mostrarSpoilers: false, livroVisivel })
    expect(textos(f)).not.toContain('c3')
    expect(textos(f)).not.toContain('c4')
    expect(textos(f)).not.toContain('t2')
    expect(textos(f)).not.toContain('morre no fim')
    expect(f?.avisoDeConteudo).toEqual({ classificacaoSugerida: '12', nota: AVISO_NEUTRO, sensivel: '' })
    expect(f?.leiaTambem.map((l) => l.id)).toEqual(['pg-visivel'])
  })

  it('12 anos pedindo spoiler: vê o spoiler que não é sensível, nunca o sensível', () => {
    const f = fichaParaLeitor(FICHA, { classificacao: 'livre' }, { teto: '12', mostrarSpoilers: true })
    expect(textos(f)).toContain('c3')
    expect(textos(f)).not.toContain('c4')
  })

  it('16 e adulto: o sensível aparece; o aviso inteiro só com spoiler (ele conta o desfecho)', () => {
    const sem = fichaParaLeitor(FICHA, { classificacao: '16' }, { teto: '16', mostrarSpoilers: false })
    expect(textos(sem)).toContain('c4')
    expect(sem?.avisoDeConteudo?.nota).toBe(AVISO_SEM_SPOILER)
    const com = fichaParaLeitor(FICHA, { classificacao: '16' }, { teto: '18', mostrarSpoilers: true })
    expect(com?.avisoDeConteudo).toEqual(FICHA.avisoDeConteudo)
  })

  it('sem quem diga quais livros são visíveis, o "leia também" sai vazio (falha fechada)', () => {
    expect(
      fichaParaLeitor(FICHA, { classificacao: 'livre' }, { teto: '18', mostrarSpoilers: false })?.leiaTambem,
    ).toEqual([])
  })
})

describe('o que vai ao prompt do parceiro', () => {
  it('nunca o spoiler; o sensível só a partir de 16; com teto de caracteres', () => {
    const menor = fichaParaOPrompt(FICHA, '12', 10_000)
    expect(menor).toContain('curiosidade: c1')
    expect(menor).not.toContain('c3')
    expect(menor).not.toContain('c4')
    expect(fichaParaOPrompt(FICHA, '18', 10_000)).toContain('c4')
    expect(fichaParaOPrompt(FICHA, '18', 10_000)).not.toContain('morre no fim')
    expect(fichaParaOPrompt(FICHA, '18', 30).length).toBeLessThanOrEqual(30)
  })

  it('a faixa do servidor vira o mesmo teto do cliente (idade desconhecida = 12)', () => {
    expect(tetoPelaFaixa('adulto')).toBe('18')
    expect(tetoPelaFaixa('16-17')).toBe('16')
    expect(tetoPelaFaixa('12-15')).toBe('12')
    expect(tetoPelaFaixa('menor-12')).toBe('livre')
    expect(tetoPelaFaixa(null)).toBe('12')
  })
})
