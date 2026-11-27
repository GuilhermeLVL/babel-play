/**
 * O MODO TRADUÇÃO DO LEITOR, parte pura (openspec `leitura-assistida`, fatia B): posição do balão (nunca sobre o trecho),
 * pausa de 250 ms que cancela a seleção anterior, atalhos T/V/C/A fora de campo de texto, ditado e exportação com traduções.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type AnotacaoDeLeitura, novaAnotacao } from '../src/core/leitura/anotacao'
import {
  type Area,
  type Caixa,
  colunaDoTrecho,
  LARGURA_DO_BALAO,
  posicionarBalao,
  sobrepoe,
} from '../src/core/leitura/balaoDaTraducao'
import { conferirDitado } from '../src/core/leitura/ditado'
import { chaveDoTrecho, paraHtml, paraMarkdown } from '../src/core/leitura/exportar'
import { criarTraducaoAutomatica, type EstadoDaTraducao } from '../src/core/leitura/traducaoAutomatica'
import { acaoDoAtalho } from '../src/lib/leitor/atalhos'

const AREA: Area = { x0: 0, y0: 56, x1: 1280, y1: 700 }
const CAIXA = (rect: Caixa, b: { w: number; h: number }, area: Area, colunas: 1 | 2) => {
  const p = posicionarBalao(rect, b, area, colunaDoTrecho(rect, area, colunas))
  return { p, caixa: { x: p.x, y: p.y, w: p.largura, h: p.alturaMax } satisfies Caixa }
}

describe('posição do balão', () => {
  it('prefere embaixo e não toca o trecho', () => {
    const rect = { x: 300, y: 200, w: 200, h: 20 }
    const { p, caixa } = CAIXA(rect, { w: 360, h: 140 }, AREA, 1)
    expect(p.lado).toBe('abaixo')
    expect(sobrepoe(caixa, rect)).toBe(false)
  })

  it('sobe quando embaixo não cabe', () => {
    const rect = { x: 300, y: 640, w: 200, h: 20 }
    const { p, caixa } = CAIXA(rect, { w: 360, h: 140 }, AREA, 1)
    expect(p.lado).toBe('acima')
    expect(caixa.y + caixa.h).toBeLessThanOrEqual(rect.y)
  })

  it('fica na coluna do trecho em duas colunas', () => {
    const esquerda = { x: 40, y: 200, w: 300, h: 20 }
    const direita = { x: 900, y: 200, w: 300, h: 20 }
    const a = CAIXA(esquerda, { w: 360, h: 120 }, AREA, 2)
    const b = CAIXA(direita, { w: 360, h: 120 }, AREA, 2)
    expect(a.caixa.x + a.caixa.w).toBeLessThanOrEqual(640)
    expect(b.caixa.x).toBeGreaterThanOrEqual(640)
    expect(b.caixa.x + b.caixa.w).toBeLessThanOrEqual(1280)
  })

  it('celular: cabe na largura, dentro da área, sem tocar o trecho', () => {
    const cel: Area = { x0: 0, y0: 56, x1: 390, y1: 760 }
    const rect = { x: 20, y: 300, w: 340, h: 60 }
    const { p, caixa } = CAIXA(rect, { w: 360, h: 160 }, cel, 1)
    expect(p.x).toBeGreaterThanOrEqual(8)
    expect(p.x + p.largura).toBeLessThanOrEqual(382)
    expect(sobrepoe(caixa, rect)).toBe(false)
  })

  it('0 sobreposição em 2000 trechos sorteados (inclusive nas bordas)', () => {
    let semente = 7
    const r = () => (semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 2000; i++) {
      const rect = { x: r() * 1200, y: 56 + r() * 620, w: 20 + r() * 400, h: 16 + r() * 120 }
      const colunas = r() < 0.5 ? 1 : 2
      const { p, caixa } = CAIXA(rect, { w: 100 + r() * 400, h: 60 + r() * 300 }, AREA, colunas)
      expect(sobrepoe(caixa, rect)).toBe(false)
      expect(p.largura).toBeLessThanOrEqual(LARGURA_DO_BALAO)
      expect(p.y).toBeGreaterThanOrEqual(AREA.y0)
      expect(p.y + p.alturaMax).toBeLessThanOrEqual(AREA.y1)
    }
  })
})

describe('tradução automática (pausa de 250 ms)', () => {
  afterEach(() => vi.useRealTimers())

  it('traduz uma vez depois da pausa e cancela a seleção anterior', async () => {
    vi.useFakeTimers()
    const chamadas: string[] = []
    const estados: EstadoDaTraducao[] = []
    const ctl = criarTraducaoAutomatica({
      traduzir: async (x) => {
        chamadas.push(x)
        return `T(${x})`
      },
      aoMudar: (e) => estados.push(e),
    })
    ctl.agendar('um')
    await vi.advanceTimersByTimeAsync(200)
    ctl.agendar('dois') // a seleção mudou antes da pausa: o primeiro pedido nem sai
    await vi.advanceTimersByTimeAsync(249)
    expect(chamadas).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(chamadas).toEqual(['dois'])
    expect(estados.at(-1)).toEqual({ fase: 'pronta', texto: 'T(dois)' })
  })

  it('descarta a resposta que chega depois de a seleção mudar', async () => {
    vi.useFakeTimers()
    const resolvers: Record<string, (v: string) => void> = {}
    const estados: EstadoDaTraducao[] = []
    const ctl = criarTraducaoAutomatica({
      traduzir: (x) => new Promise<string>((res) => (resolvers[x] = res)),
      aoMudar: (e) => estados.push(e),
    })
    ctl.agendar('a')
    await vi.advanceTimersByTimeAsync(250)
    ctl.agendar('b')
    await vi.advanceTimersByTimeAsync(250)
    resolvers.b('B')
    resolvers.a('A') // chega por último, mas já não vale
    await vi.advanceTimersByTimeAsync(0)
    expect(estados.filter((e) => e.fase === 'pronta')).toEqual([{ fase: 'pronta', texto: 'B' }])
  })

  it('cancelar não deixa nada pendente chegar', async () => {
    vi.useFakeTimers()
    const traduzir = vi.fn(async () => 'x')
    const ctl = criarTraducaoAutomatica({ traduzir, aoMudar: () => {} })
    ctl.agendar('a')
    ctl.cancelar()
    await vi.advanceTimersByTimeAsync(1000)
    expect(traduzir).not.toHaveBeenCalled()
  })

  it('falha vira estado "falhou", sem lançar', async () => {
    vi.useFakeTimers()
    const estados: EstadoDaTraducao[] = []
    const ctl = criarTraducaoAutomatica({
      traduzir: async () => {
        throw new Error('x')
      },
      aoMudar: (e) => estados.push(e),
    })
    ctl.agendar('a', 0)
    await vi.advanceTimersByTimeAsync(10)
    expect(estados.at(-1)).toEqual({ fase: 'falhou' })
  })
})

describe('atalhos do trecho', () => {
  const ctx = { temTrecho: true, emCampo: false, ajustarDisponivel: true }
  it('T, V, C e A com um trecho', () => {
    expect(acaoDoAtalho({ key: 't' }, ctx)).toBe('traduzir')
    expect(acaoDoAtalho({ key: 'V' }, ctx)).toBe('ler')
    expect(acaoDoAtalho({ key: 'c' }, ctx)).toBe('copiar')
    expect(acaoDoAtalho({ key: 'a' }, ctx)).toBe('ajustar')
  })
  it('nunca num campo de texto, sem trecho, ou com modificador', () => {
    expect(acaoDoAtalho({ key: 't' }, { ...ctx, emCampo: true })).toBeNull()
    expect(acaoDoAtalho({ key: 't' }, { ...ctx, temTrecho: false })).toBeNull()
    expect(acaoDoAtalho({ key: 'c', metaKey: true }, ctx)).toBeNull() // Cmd+C é o copiar do sistema
    expect(acaoDoAtalho({ key: 'c', ctrlKey: true }, ctx)).toBeNull()
    expect(acaoDoAtalho({ key: 't', repeat: true }, ctx)).toBeNull()
  })
  it('A só existe com o ajuste de nível disponível', () => {
    expect(acaoDoAtalho({ key: 'a' }, { ...ctx, ajustarDisponivel: false })).toBeNull()
  })
})

describe('ditado', () => {
  it('perfeito ignora maiúsculas e pontuação', () => {
    const r = conferirDitado('Hello, world!', 'hello world', 'en')
    expect(r.perfeito).toBe(true)
    expect(r.acerto).toBe(1)
  })
  it('mostra troca, falta e sobra', () => {
    const r = conferirDitado('the cat sat on the mat', 'the dog sat the mat now', 'en')
    expect(r.passos).toContainEqual({ tipo: 'trocou', esperada: 'cat', escrita: 'dog' })
    expect(r.passos).toContainEqual({ tipo: 'faltou', esperada: 'on' })
    expect(r.passos).toContainEqual({ tipo: 'sobrou', escrita: 'now' })
    expect(r.perfeito).toBe(false)
    expect(r.acerto).toBeCloseTo(4 / 6)
  })
  it('acento conta: "esta" não é "está"', () => {
    expect(conferirDitado('ela está aqui', 'ela esta aqui', 'pt').perfeito).toBe(false)
  })
  it('escrita vazia erra tudo', () => {
    expect(conferirDitado('um dois', '', 'pt').acerto).toBe(0)
  })
})

describe('exportar grifos com traduções', () => {
  const livro = { id: 'livro-1', titulo: 'Um livro', autor: 'Fulana' }
  const g = (id: string, exact: string): AnotacaoDeLeitura =>
    novaAnotacao({
      id,
      livroId: 'livro-1',
      tipo: 'grifo',
      cfi: 'epubcfi(/6/2)',
      citacao: { exact, prefix: '', suffix: '' },
      capitulo: 'Cap 1',
      agora: 1,
    })
  const anotacoes = [g('anotacao-aaaa1', 'The cat   sat.'), g('anotacao-bbbb2', 'No translation here.')]
  const traducoes = { [chaveDoTrecho('The cat sat.')]: 'O gato sentou.' }
  const opcoes = { agora: Date.UTC(2026, 10, 27) }

  it('só os traduzidos ganham a tradução (a chave ignora quebras e espaços)', () => {
    const md = paraMarkdown(livro, anotacoes, { ...opcoes, traducoes })
    expect(md).toContain('> The cat   sat.\n\n**Tradução:** O gato sentou.')
    expect(md.match(/\*\*Tradução:\*\*/g)).toHaveLength(1)
    expect(md).toContain('> No translation here.')
  })
  it('sem a opção, a exportação é a de sempre', () => {
    expect(paraMarkdown(livro, anotacoes, opcoes)).not.toContain('Tradução')
  })
  it('HTML escapa a tradução', () => {
    const html = paraHtml(livro, anotacoes, {
      ...opcoes,
      traducoes: { [chaveDoTrecho('The cat sat.')]: '<script>x</script>' },
    })
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).not.toContain('<script>x')
  })
  it('chave "__proto__" não vaza do protótipo', () => {
    const md = paraMarkdown(livro, [g('anotacao-cccc3', '__proto__')], { ...opcoes, traducoes: {} })
    expect(md).not.toContain('Tradução')
  })
})
