/**
 * AS EXPORTAÇÕES DO LEITOR (critério 10): Markdown por capítulo, CSV do Anki com contexto, nome de
 * arquivo — todas com TODAS as anotações vivas do livro, e nenhuma de outro livro.
 */
import { describe, expect, it } from 'vitest'

import { type AnotacaoDeLeitura, citacaoDe, novaAnotacao } from '../src/core/leitura/anotacao'
import { campoCsv, linkDaAnotacao, nomeDeArquivo, paraCsvDoAnki, paraMarkdown } from '../src/core/leitura/exportar'

const TEXTO = 'Ishmael looked at the "whale", and the sea, and the sky.'
const LIVRO = { id: 'se:moby-dick', titulo: 'Moby Dick', autor: 'Herman Melville', fonte: 'Standard Ebooks' }

const nova = (id: string, extra: Partial<Parameters<typeof novaAnotacao>[0]>): AnotacaoDeLeitura =>
  novaAnotacao({
    id,
    livroId: LIVRO.id,
    tipo: 'grifo',
    cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:7)',
    citacao: citacaoDe(TEXTO, 0, 7),
    agora: 1_000,
    ...extra,
  })

const anotacoes = [
  nova('anotacao-a001', { capitulo: 'Capítulo 1' }),
  nova('anotacao-a002', {
    tipo: 'nota',
    capitulo: 'Capítulo 1',
    cfi: 'epubcfi(/6/4!/4/4/1:0)',
    citacao: citacaoDe(TEXTO, 22, 29),
    nota: 'linha 1\nlinha 2',
  }),
  nova('anotacao-a003', {
    tipo: 'palavra',
    palavra: 'whale',
    capitulo: 'Capítulo 2',
    cfi: 'epubcfi(/6/6!/4/2/1:0)',
    citacao: citacaoDe(TEXTO, 23, 28),
  }),
  { ...nova('anotacao-a004', { capitulo: 'Capítulo 2' }), apagadoEm: 2_000 },
  { ...nova('anotacao-a005', {}), livroId: 'outro' },
]

describe('Markdown', () => {
  const md = paraMarkdown(LIVRO, anotacoes, { agora: Date.UTC(2026, 9, 26) })

  it('título, autor e fonte, data e um ## por capítulo, na ordem de leitura', () => {
    expect(md.startsWith('# Moby Dick\n\n_Herman Melville · Standard Ebooks_')).toBe(true)
    expect(md).toContain('Exportado em 2026-10-26')
    expect(md.indexOf('## Capítulo 1')).toBeLessThan(md.indexOf('## Capítulo 2'))
    expect(md.match(/^## /gm)).toHaveLength(2)
  })

  it('cada viva com citação em bloco e link frasy://; a apagada e a de outro livro ficam fora', () => {
    expect(md).toContain('> Ishmael')
    expect(md).toContain('**Nota:** linha 1  \nlinha 2')
    expect(md).toContain('**Palavra:** whale')
    expect(md.match(/\[abrir no Frasy\]\(frasy:\/\/livro\/se%3Amoby-dick#/g)).toHaveLength(3)
    expect(md).not.toContain('anotacao-a004')
  })

  it('rótulos vêm de quem chama (a tela traduz)', () => {
    const en = paraMarkdown(LIVRO, anotacoes, {
      agora: 0,
      rotulos: { nota: 'Note', abrirNoFrasy: 'open in Frasy', exportadoEm: (d) => `Exported ${d}` },
    })
    expect(en).toContain('**Note:**')
    expect(en).toContain('[open in Frasy]')
  })

  it('o link leva o CFI codificado', () => {
    expect(linkDaAnotacao(anotacoes[0])).toBe(
      `frasy://livro/se%3Amoby-dick#${encodeURIComponent('epubcfi(/6/4!/4/2,/1:0,/1:7)')}`,
    )
  })
})

describe('CSV do Anki', () => {
  const csv = paraCsvDoAnki(LIVRO, anotacoes, { whale: 'baleia' })
  const linhas = csv.trim().split('\n')

  it('traz as diretivas que o Anki lê e uma linha por viva', () => {
    expect(linhas.slice(0, 4)).toEqual([
      '#separator:Comma',
      '#html:false',
      '#columns:Frente,Verso,Contexto,Fonte',
      '#tags column:5',
    ])
    // Uma linha por viva (a nota com quebra de linha ocupa duas linhas físicas, dentro das aspas).
    expect(csv.match(/,frasy livro::/g)).toHaveLength(3)
  })

  it('a palavra vai com a tradução, a frase de contexto e a fonte', () => {
    const palavra = linhas.find((l) => l.startsWith('whale,'))!
    expect(palavra).toContain('baleia')
    expect(palavra).toContain('"Ishmael looked at the ""whale"", and the sea, and the sky."')
    expect(palavra).toContain('Moby Dick — Capítulo 2')
  })

  it('campos com vírgula, aspas e quebra de linha são escapados (RFC 4180)', () => {
    expect(campoCsv('a,b')).toBe('"a,b"')
    expect(campoCsv('diz "oi"')).toBe('"diz ""oi"""')
    expect(campoCsv('l1\r\nl2')).toBe('"l1\nl2"')
    expect(csv).toContain('"linha 1\nlinha 2"')
  })
})

describe('nomeDeArquivo', () => {
  it('sem acento, minúsculo, com hífen', () => {
    expect(nomeDeArquivo('Dom Casmurro: edição de 1899', 'md')).toBe('dom-casmurro-edicao-de-1899.md')
    expect(nomeDeArquivo('???', 'json')).toBe('livro.json')
  })
})
