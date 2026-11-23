// @vitest-environment jsdom
/**
 * AS DUAS PEÇAS QUE DEIXAM A TELA DE CAPTURA LEVE COM A SESSÃO LONGA (ei/f2):
 *
 *  - `useFuncaoEstavel`: a tela recria `examineWord`/`speakWord`/`revelarTraducao` a cada render
 *    (fábricas por render). Passados crus, derrubavam o memo da conversa a cada segundo. A função
 *    estável tem identidade fixa e chama sempre a versão mais recente.
 *  - `useTextoDaConversa`: o texto da conversa ia ao App (`onTranscriptChange`) a CADA parcial do
 *    streaming, com um `join` de todas as falas — O(n) por atualização e um render do App inteiro.
 *    Agora sai no máximo a cada 500 ms, só quando mudou, e o último estado nunca se perde.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { textoDaConversa, useFuncaoEstavel, useTextoDaConversa } from '../src/lib/captura/conversaEstavel'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const segs = (...textos: string[]) => textos.map((originalText) => ({ originalText }))

describe('useFuncaoEstavel', () => {
  it('identidade fixa entre renders, chamando a versão mais recente', () => {
    const a = vi.fn(() => 'a')
    const b = vi.fn(() => 'b')
    const { result, rerender } = renderHook(({ fn }) => useFuncaoEstavel(fn), { initialProps: { fn: a } })
    const primeira = result.current
    rerender({ fn: b })
    expect(result.current).toBe(primeira)
    expect(result.current()).toBe('b')
    expect(a).not.toHaveBeenCalled()
  })
})

describe('textoDaConversa', () => {
  it('junta as falas com espaço, como antes', () => {
    expect(textoDaConversa(segs('olá', 'mundo'))).toBe('olá mundo')
  })

  it('semParcial (parciais vivos): o parcial em curso fica fora do texto que sobe ao App', () => {
    const falas = [...segs('olá', 'mundo'), { originalText: 'ainda falan', isPartial: true }]
    expect(textoDaConversa(falas)).toBe('olá mundo ainda falan')
    expect(textoDaConversa(falas, { semParcial: true })).toBe('olá mundo')
  })

  it('semParcial por fala: só o parcial vivo (o que mora no armazém) fica de fora; o de outra rota segue no texto', () => {
    const falas = [
      { id: 'a', originalText: 'olá' },
      { id: 'b', originalText: 'em portugu', isPartial: true }, // vivo (Parakeet)
      { id: 'c', originalText: 'in english', isPartial: true }, // outra rota: texto de sempre
    ]
    expect(textoDaConversa(falas, { semParcial: (s) => s.id === 'b' })).toBe('olá in english')
    expect(textoDaConversa(falas, { semParcial: () => false })).toBe(textoDaConversa(falas)) // nenhum vivo = idêntico a sem a flag
  })
})

describe('useTextoDaConversa', () => {
  it('atualizações seguidas viram UMA saída a cada 500 ms, com o texto mais recente', () => {
    const aoMudar = vi.fn()
    const { rerender } = renderHook(({ s }) => useTextoDaConversa(s, aoMudar), { initialProps: { s: segs('a') } })
    rerender({ s: segs('a', 'b') })
    rerender({ s: segs('a', 'b', 'c') })
    expect(aoMudar).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(aoMudar).toHaveBeenCalledOnce()
    expect(aoMudar).toHaveBeenLastCalledWith('a b c')
  })

  it('semParcial: texto novo só de parcial não chama o App (cada chamada era um render do App inteiro)', () => {
    const aoMudar = vi.fn()
    const final: Array<{ originalText: string; isPartial?: boolean }> = segs('olá')
    const { rerender } = renderHook(({ s }) => useTextoDaConversa(s, aoMudar, 500, true), {
      initialProps: { s: final },
    })
    act(() => vi.advanceTimersByTime(500))
    expect(aoMudar).toHaveBeenCalledTimes(1)
    for (const t of ['mun', 'mundo', 'mundo bom']) rerender({ s: [...final, { originalText: t, isPartial: true }] })
    act(() => vi.advanceTimersByTime(1000))
    expect(aoMudar).toHaveBeenCalledTimes(1) // o parcial não saiu
    rerender({ s: [...final, { originalText: 'mundo bom', isPartial: false }] })
    act(() => vi.advanceTimersByTime(500))
    expect(aoMudar).toHaveBeenLastCalledWith('olá mundo bom') // o final sai
  })

  it('streaming contínuo não adia para sempre: sai a cada intervalo, não só na pausa', () => {
    const aoMudar = vi.fn()
    const { rerender } = renderHook(({ s }) => useTextoDaConversa(s, aoMudar), { initialProps: { s: segs('x') } })
    for (let i = 0; i < 10; i++) {
      rerender({ s: segs('x', `p${i}`) })
      act(() => vi.advanceTimersByTime(100))
    }
    expect(aoMudar.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('texto igual ao último enviado não sai de novo', () => {
    const aoMudar = vi.fn()
    const { rerender } = renderHook(({ s }) => useTextoDaConversa(s, aoMudar), { initialProps: { s: segs('a') } })
    act(() => vi.advanceTimersByTime(500))
    rerender({ s: segs('a') })
    act(() => vi.advanceTimersByTime(500))
    expect(aoMudar).toHaveBeenCalledOnce()
  })

  it('ao desmontar (sair da captura), o pendente sai na hora', () => {
    const aoMudar = vi.fn()
    const { rerender, unmount } = renderHook(({ s }) => useTextoDaConversa(s, aoMudar), {
      initialProps: { s: segs('a') },
    })
    act(() => vi.advanceTimersByTime(500))
    rerender({ s: segs('a', 'fim') })
    unmount()
    expect(aoMudar).toHaveBeenLastCalledWith('a fim')
  })

  it('sem callback, nada acontece', () => {
    const { rerender } = renderHook(({ s }) => useTextoDaConversa(s, undefined), { initialProps: { s: segs('a') } })
    rerender({ s: segs('b') })
    act(() => vi.advanceTimersByTime(1000))
  })
})
