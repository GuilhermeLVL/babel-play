import { describe, expect, it, vi } from 'vitest'

import type { TrechoDoLeitor } from '../src/core/leitura/leituraAssistida'
import { criarBarramento, type SelecaoViva } from '../src/lib/leitor/barramentoDaSelecao'

const trecho = (texto: string): TrechoDoLeitor => ({
  texto,
  frase: `${texto}.`,
  paragrafo: `Um parágrafo com ${texto}.`,
  idioma: 'en',
  cfi: 'epubcfi(/6/2)',
  citacao: { exact: texto, prefix: '', suffix: '' },
  rect: { x: 10, y: 20, w: 30, h: 16, coluna: 0 },
})
const viva = (texto: string): SelecaoViva => ({
  trecho: trecho(texto),
  doc: {} as Document,
  range: {} as Range,
  indice: 0,
})

describe('BarramentoDaSelecao (contrato da leitura assistida)', () => {
  it('publica o trecho e a origem a quem assinou; cancelar para de receber', () => {
    const b = criarBarramento()
    const a = vi.fn()
    const fora = b.aoSelecionar(a)
    b.publicar(viva('was'), 'toque')
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ texto: 'was', idioma: 'en' }), 'toque')
    fora()
    b.publicar(viva('wonderful'), 'duplo')
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('guarda a seleção viva e a limpa; `aoLimpar` avisa uma vez só', () => {
    const b = criarBarramento()
    const l = vi.fn()
    b.aoLimpar(l)
    b.limpar() // nada selecionado: não avisa
    expect(l).not.toHaveBeenCalled()
    b.publicar(viva('was'), 'alca')
    expect(b.selecaoAtual()?.trecho.texto).toBe('was')
    b.limpar()
    b.limpar()
    expect(l).toHaveBeenCalledTimes(1)
    expect(b.selecaoAtual()).toBeNull()
  })

  it('um assinante que falha não derruba os outros', () => {
    const b = criarBarramento()
    const bom = vi.fn()
    b.aoSelecionar(() => {
      throw new Error('quebrou')
    })
    b.aoSelecionar(bom)
    expect(() => b.publicar(viva('was'), 'longo')).not.toThrow()
    expect(bom).toHaveBeenCalledTimes(1)
  })

  it('o trecho carrega o contrato inteiro (texto, frase, parágrafo, citação e retângulo com coluna)', () => {
    const b = criarBarramento()
    let recebido: TrechoDoLeitor | null = null
    b.aoSelecionar((t) => (recebido = t))
    b.publicar(viva('was'), 'arrasto')
    expect(Object.keys(recebido!).sort()).toEqual(
      ['cfi', 'citacao', 'frase', 'idioma', 'paragrafo', 'rect', 'texto'].sort(),
    )
    expect(Object.keys(recebido!.rect).sort()).toEqual(['coluna', 'h', 'w', 'x', 'y'])
  })
})
