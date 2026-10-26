/**
 * AS EXPORTAÇÕES DO LEITOR (critério 10): Markdown por capítulo, texto do Anki (tab) com contexto, CSV de planilha
 * sem injeção de fórmula, nome de
 * arquivo — todas com TODAS as anotações vivas do livro, e nenhuma de outro livro.
 */
import { describe, expect, it } from 'vitest'

import { type AnotacaoDeLeitura, citacaoDe, novaAnotacao } from '../src/core/leitura/anotacao'
import {
  campoCsv,
  lerTextoDoAnki,
  linkDaAnotacao,
  nomeDeArquivo,
  paraCsvDePlanilha,
  paraMarkdown,
  paraTextoDoAnki,
} from '../src/core/leitura/exportar'

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

describe('arquivo de texto do Anki (tab, formato nativo)', () => {
  const txt = paraTextoDoAnki(LIVRO, anotacoes, { whale: 'baleia' })
  const dados = lerTextoDoAnki(txt)

  it('traz as diretivas que o Anki lê e uma linha por viva', () => {
    expect(txt.split('\n').slice(0, 4)).toEqual([
      '#separator:tab',
      '#html:false',
      '#columns:Frente\tVerso\tContexto\tFonte\tTags',
      '#tags column:5',
    ])
    expect(dados).toHaveLength(3)
    expect(dados.every((l) => l.length === 5)).toBe(true)
  })

  it('a palavra vai com a tradução, a frase de contexto e a fonte', () => {
    const palavra = dados.find((l) => l[0] === 'whale')!
    expect(palavra).toEqual(['whale', 'baleia', TEXTO, 'Moby Dick — Capítulo 2', 'frasy_livro::palavra'])
  })

  it('o texto faz ida e volta: aspas, tab, quebra de linha e "=" chegam intactos (sem apóstrofo no cartão)', () => {
    const traicoeira = nova('anotacao-a006', {
      citacao: { exact: '=HYPERLINK("http://x.test","oi")\tcom tab', prefix: '', suffix: '' },
      nota: 'linha 1\nlinha "2"',
      capitulo: 'Capítulo 3',
    })
    const [linha] = lerTextoDoAnki(paraTextoDoAnki(LIVRO, [traicoeira]))
    expect(linha[0]).toBe('=HYPERLINK("http://x.test","oi")\tcom tab')
    expect(linha[1]).toBe('linha 1\nlinha "2"')
    expect(lerTextoDoAnki(txt).find((l) => l[1].startsWith('linha 1'))![1]).toBe('linha 1\nlinha 2')
  })
})

describe('CSV de planilha (mitigação de fórmula da OWASP)', () => {
  it('um grifo que começa com "=HYPERLINK(...)" é neutralizado', () => {
    const perigo = nova('anotacao-a007', {
      citacao: { exact: '=HYPERLINK("http://mal.test","clique")', prefix: '', suffix: '' },
    })
    const csv = paraCsvDePlanilha(LIVRO, [perigo])
    const linha = csv.trim().split('\n')[1]
    expect(linha).toContain(`"'=HYPERLINK(""http://mal.test"",""clique"")"`)
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
  })

  it('= + - @ tab e CR no começo ganham o apóstrofo; o resto fica igual', () => {
    for (const ch of ['=', '+', '-', '@', '\t', '\r']) expect(campoCsv(`${ch}1`).replace(/^"/, '')[0]).toBe("'")
    expect(campoCsv('1-2')).toBe('1-2')
    expect(campoCsv('a,b')).toBe('"a,b"')
    expect(campoCsv('diz "oi"')).toBe('"diz ""oi"""')
    expect(campoCsv('l1\r\nl2')).toBe('"l1\nl2"')
  })

  it('traz cabeçalho e uma linha por viva, com o link frasy://', () => {
    const csv = paraCsvDePlanilha(LIVRO, anotacoes)
    expect(csv.startsWith('tipo,capitulo,trecho,nota,palavra,cor,criado_em,link\n')).toBe(true)
    expect(csv.match(/frasy:\/\/livro\//g)).toHaveLength(3)
  })
})

describe('nomeDeArquivo', () => {
  it('sem acento, minúsculo, com hífen', () => {
    expect(nomeDeArquivo('Dom Casmurro: edição de 1899', 'md')).toBe('dom-casmurro-edicao-de-1899.md')
    expect(nomeDeArquivo('???', 'json')).toBe('livro.json')
  })
})
