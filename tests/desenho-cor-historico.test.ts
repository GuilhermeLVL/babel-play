import { describe, expect, it } from 'vitest'

import { hexParaRgb, limitarCanal, normalizarHex, rgbParaHex, trocarCanal } from '../src/lib/desenho/cor'
import {
  acrescentar,
  desfazer,
  historicoVazio,
  limpar,
  podeDesfazer,
  podeRefazer,
  refazer,
} from '../src/lib/desenho/historico'
import { lerPreferencias, preferenciasPadrao, pushRecente } from '../src/lib/desenho/preferencias'
import { fatorDoPonto, reescalar, type Traco } from '../src/lib/desenho/tracos'

describe('cor RGB e HEX', () => {
  it('converte nos dois sentidos', () => {
    expect(rgbParaHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080')
    expect(hexParaRgb('#ff0080')).toEqual({ r: 255, g: 0, b: 128 })
    expect(hexParaRgb('0A0')).toEqual({ r: 0, g: 170, b: 0 })
  })
  it('limita os canais a 0-255', () => {
    expect(limitarCanal(300)).toBe(255)
    expect(limitarCanal(-4)).toBe(0)
    expect(limitarCanal('12abc')).toBe(12)
    expect(limitarCanal('')).toBe(0)
    expect(rgbParaHex({ r: 999, g: -1, b: 16 })).toBe('#ff0010')
  })
  it('hex incompleto ou inválido não é cor', () => {
    expect(normalizarHex('#ff00')).toBeNull()
    expect(normalizarHex('gg0000')).toBeNull()
    expect(normalizarHex(' #ABCDEF ')).toBe('#abcdef')
  })
  it('trocarCanal mexe só no canal pedido', () => {
    expect(trocarCanal('#102030', 'g', 255)).toBe('#10ff30')
  })
})

describe('histórico de desfazer', () => {
  it('desfaz, refaz e um traço novo descarta o refazer', () => {
    let h = historicoVazio<string>()
    h = acrescentar(h, 'a')
    h = acrescentar(h, 'b')
    h = desfazer(h)
    expect(h.itens).toEqual(['a'])
    expect(podeRefazer(h)).toBe(true)
    h = refazer(h)
    expect(h.itens).toEqual(['a', 'b'])
    h = desfazer(desfazer(h))
    expect(podeDesfazer(h)).toBe(false)
    expect(desfazer(h)).toBe(h)
    h = acrescentar(h, 'c')
    expect(podeRefazer(h)).toBe(false)
  })
  it('respeita o teto e limpa tudo', () => {
    let h = historicoVazio<number>()
    for (let i = 0; i < 5; i++) h = acrescentar(h, i, 3)
    expect(h.itens).toEqual([2, 3, 4])
    expect(limpar<number>().itens).toEqual([])
  })
})

describe('preferências e traço', () => {
  it('últimas cores: sem repetir, a mais nova na frente, até 6', () => {
    let r: string[] = []
    for (const c of ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666']) r = pushRecente(r, c)
    expect(r).toHaveLength(6)
    expect(r[0]).toBe('#666666')
    expect(pushRecente(r, '#333333')[0]).toBe('#333333')
    expect(pushRecente(r, '#333333')).toHaveLength(6)
  })
  it('lê preferências estragadas sem quebrar', () => {
    expect(lerPreferencias('{lixo')).toEqual(preferenciasPadrao())
    const p = lerPreferencias(
      JSON.stringify({ ferramenta: 'pincel', cor: '#ABC', larguras: { pincel: 99 }, recentes: ['x', '#fff'] }),
    )
    expect(p.ferramenta).toBe('pincel')
    expect(p.cor).toBe('#aabbcc')
    expect(p.larguras.pincel).toBe(40)
    expect(p.recentes).toEqual(['#ffffff'])
  })
  it('tinteiro: mais rápido é mais fino; caneta de tablet segue a pressão', () => {
    const lento = fatorDoPonto('tinteiro', { pointerType: 'mouse', pressure: 0.5 }, 0.1, undefined)
    const rapido = fatorDoPonto('tinteiro', { pointerType: 'mouse', pressure: 0.5 }, 2, undefined)
    expect(rapido).toBeLessThan(lento)
    expect(fatorDoPonto('tinteiro', { pointerType: 'pen', pressure: 1 }, 0, undefined)).toBeGreaterThan(1.2)
    expect(fatorDoPonto('caneta', { pressure: 1 }, 3, undefined)).toBe(1)
  })
  it('reescalar muda posição e grossura na mesma proporção', () => {
    const t: Traco = {
      f: 'caneta',
      cor: '#000000',
      w: 4,
      a: 1,
      pts: [
        [10, 20, 1],
        [30, 40, 1],
      ],
    }
    const [r] = reescalar([t], 2)
    expect(r!.w).toBe(8)
    expect(r!.pts[1]).toEqual([60, 80, 1])
  })
})
