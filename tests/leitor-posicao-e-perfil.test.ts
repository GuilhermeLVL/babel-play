/**
 * "CONTINUAR DE ONDE PAREI" (o armazém de posições por CFI) e o PERFIL DE LEITURA (ACE04): o que se
 * grava, o que se recusa, os limites e o CSS que vai para dentro do livro. E o aviso do PDF.
 */
import { describe, expect, it } from 'vitest'

import { diagnosticarPdf } from '../src/core/leitura/diagnosticoDoPdf'
import {
  CORES_DOS_TEMAS,
  cssDoLivro,
  LIMITES,
  normalizarPerfil,
  PERFIL_PADRAO,
  TEMAS_DE_LEITURA,
} from '../src/core/leitura/perfilDeLeitura'
import { criarArmazemDePosicoes, lerPosicao, MAX_RECENTES } from '../src/core/leitura/posicao'

function memoria() {
  const m = new Map<string, string>()
  return {
    m,
    ler: (k: string) => m.get(k) ?? null,
    gravar: (k: string, v: string) => void m.set(k, v),
    apagar: (k: string) => void m.delete(k),
  }
}

const CFI = 'epubcfi(/6/8!/4/2/10,/1:0,/1:1)'

describe('armazém de posições (CFI)', () => {
  it('grava e lê a mesma posição; o mais recente vai para o topo', () => {
    const a = criarArmazemDePosicoes(memoria())
    expect(a.gravar({ livroId: 'l1', cfi: CFI, secao: 3, fracao: 0.4, capitulo: 'Cap. 3', atualizadaEm: 10 })).toBe(
      true,
    )
    a.gravar({ livroId: 'l2', cfi: CFI, secao: 1, fracao: 0.1, atualizadaEm: 11 })
    expect(a.ler('l1')).toEqual({
      livroId: 'l1',
      cfi: CFI,
      secao: 3,
      fracao: 0.4,
      capitulo: 'Cap. 3',
      atualizadaEm: 10,
    })
    expect(a.recentes()).toEqual(['l2', 'l1'])
    a.gravar({ livroId: 'l1', cfi: CFI, secao: 4, fracao: 0.5, atualizadaEm: 12 })
    expect(a.recentes()).toEqual(['l1', 'l2'])
  })

  it('não grava "lugar nenhum" por cima de uma posição boa', () => {
    const a = criarArmazemDePosicoes(memoria())
    a.gravar({ livroId: 'l1', cfi: CFI, secao: 3, fracao: 0.4, atualizadaEm: 10 })
    expect(a.gravar({ livroId: 'l1', cfi: 'lixo', secao: 0, fracao: 0, atualizadaEm: 11 })).toBe(false)
    expect(a.ler('l1')?.cfi).toBe(CFI)
  })

  it('PDF sem CFI guarda a página; fração fora de 0..1 é limitada', () => {
    const a = criarArmazemDePosicoes(memoria())
    a.gravar({ livroId: 'pdf', cfi: '', secao: 12, fracao: 7, atualizadaEm: 1 })
    expect(a.ler('pdf')).toMatchObject({ cfi: '', secao: 12, fracao: 1 })
  })

  it(`lembra no máximo ${MAX_RECENTES} livros e apaga a posição de quem sai da lista`, () => {
    const mem = memoria()
    const a = criarArmazemDePosicoes(mem)
    for (let i = 0; i <= MAX_RECENTES; i++)
      a.gravar({ livroId: `l${i}`, cfi: CFI, secao: 1, fracao: 0, atualizadaEm: i })
    expect(a.recentes()).toHaveLength(MAX_RECENTES)
    expect(a.ler('l0')).toBeNull()
    a.esquecer(`l${MAX_RECENTES}`)
    expect(a.recentes()).not.toContain(`l${MAX_RECENTES}`)
  })

  it('o disco pode ter qualquer coisa: lerPosicao só aceita forma de posição do livro pedido', () => {
    expect(lerPosicao('{quebrado', 'l1')).toBeNull()
    expect(lerPosicao(JSON.stringify({ livroId: 'outro', cfi: CFI }), 'l1')).toBeNull()
    expect(lerPosicao(JSON.stringify({ livroId: 'l1', cfi: 'x', secao: -2 }), 'l1')).toBeNull()
  })
})

describe('perfil de leitura', () => {
  it('padrão alinhado à esquerda (ACE01) e paginado', () => {
    expect(PERFIL_PADRAO).toMatchObject({ alinhamento: 'esquerda', modo: 'paginado' })
    expect(normalizarPerfil(undefined)).toEqual(PERFIL_PADRAO)
  })

  it('limita cada valor e troca o desconhecido pelo padrão', () => {
    const p = normalizarPerfil({
      tamanho: 99,
      entrelinha: 0.2,
      tema: 'neon',
      fonte: 'atkinson',
      largura: 'x',
      modo: 'rolagem',
    })
    expect(p.tamanho).toBe(LIMITES.tamanho.max)
    expect(p.entrelinha).toBe(LIMITES.entrelinha.min)
    expect(p.tema).toBe('claro')
    expect(p.fonte).toBe('atkinson')
    expect(p.largura).toBe(PERFIL_PADRAO.largura)
    expect(p.modo).toBe('rolagem')
  })

  it('ida e volta por JSON é estável (o perfil vale para todo livro)', () => {
    const p = normalizarPerfil({ ...PERFIL_PADRAO, tema: 'sepia', espacoLetra: 0.05 })
    expect(normalizarPerfil(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('nenhum tema usa preto ou branco puros, e o texto passa o AA com folga', () => {
    const lum = (h: string) => {
      const c = [1, 3, 5]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    const contraste = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
      return (x + 0.05) / (y + 0.05)
    }
    for (const t of TEMAS_DE_LEITURA) {
      const c = CORES_DOS_TEMAS[t]
      for (const cor of [c.fundo, c.texto]) expect(['#000000', '#ffffff']).not.toContain(cor.toLowerCase())
      expect(contraste(c.fundo, c.texto), t).toBeGreaterThan(7)
      expect(contraste(c.fundo, c.suave), t).toBeGreaterThan(4.5)
      expect(contraste(c.fundo, c.link), t).toBeGreaterThan(4.5)
    }
  })

  it('o CSS do livro leva tema, fonte, tamanho, entrelinha e alinhamento', () => {
    const css = cssDoLivro(
      normalizarPerfil({ tema: 'escuro', fonte: 'atkinson', tamanho: 22, entrelinha: 2, alinhamento: 'justificado' }),
      '@font-face{}',
    )
    expect(css.startsWith('@font-face{}')).toBe(true)
    expect(css).toContain(CORES_DOS_TEMAS.escuro.fundo)
    expect(css).toContain("'Atkinson Hyperlegible'")
    expect(css).toContain('font-size: 22px')
    expect(css).toContain('line-height: 2 !important')
    expect(css).toContain('text-align: justify')
    expect(cssDoLivro(normalizarPerfil({ fonte: 'original' }))).not.toContain('font-family')
  })
})

describe('aviso do PDF', () => {
  const linha = (x: number, largura: number, texto = 'texto de uma linha') => ({ x, largura, texto })
  it('sem texto = escaneado', () => {
    expect(
      diagnosticarPdf([
        { largura: 600, itens: [] },
        { largura: 600, itens: [linha(10, 50, 'p. 2')] },
      ]),
    ).toEqual({
      escaneado: true,
      duasColunas: false,
    })
  })
  it('linhas que não cruzam o meio, nas duas metades = duas colunas', () => {
    const itens = Array.from({ length: 30 }, (_, i) => (i % 2 ? linha(320, 250) : linha(40, 250)))
    expect(diagnosticarPdf([{ largura: 600, itens }]).duasColunas).toBe(true)
  })
  it('linhas de lado a lado = uma coluna', () => {
    const itens = Array.from({ length: 30 }, () => linha(40, 520))
    expect(diagnosticarPdf([{ largura: 600, itens }])).toEqual({ escaneado: false, duasColunas: false })
  })
})
