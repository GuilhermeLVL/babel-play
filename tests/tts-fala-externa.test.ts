// @vitest-environment jsdom
/**
 * O GUARDA DE ECO CONHECE A FALA QUE NÃO PASSA PELO `speechSynthesis` (E1 da Fase E, modo intérprete).
 *
 * `isTtsActive()` só via o motor nativo: a voz natural da nuvem (E5) toca um arquivo de áudio, e o
 * microfone transcreveria a própria voz do app. Agora quem toca fala de fora marca o começo e o fim
 * (`marcarFalaExterna`), e o `cancel()` do motor nativo não apaga essa marca.
 *
 * E O BARGE-IN: quem interrompe a voz para falar (tocar o botão do seu lado) não pode ter a fala
 * descartada pela cauda de 800 ms do eco. `cortarCaudaDoEco` encurta a cauda do fim ATUAL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let relogio = 1_000
beforeEach(() => {
  vi.resetModules()
  relogio = 1_000
  vi.spyOn(performance, 'now').mockImplementation(() => relogio)
})

const carregar = () => import('../src/lib/tts')

describe('marcadores de fala externa', () => {
  it('ativa o guarda enquanto a fala externa toca e pela cauda depois do fim', async () => {
    const tts = await carregar()
    expect(tts.isTtsActive()).toBe(false)
    const terminar = tts.marcarFalaExterna()
    expect(tts.isTtsActive()).toBe(true)
    relogio += 5_000
    expect(tts.isTtsActive()).toBe(true)
    terminar()
    expect(tts.isTtsActive()).toBe(true) // a cauda: o eco chega com atraso
    relogio += 799
    expect(tts.isTtsActive()).toBe(true)
    relogio += 2
    expect(tts.isTtsActive()).toBe(false)
  })

  it('o fim é idempotente: terminar duas vezes não desconta outra fala em curso', async () => {
    const tts = await carregar()
    const a = tts.marcarFalaExterna()
    const b = tts.marcarFalaExterna()
    a()
    a()
    relogio += 10_000
    expect(tts.isTtsActive()).toBe(true) // `b` ainda toca
    b()
    relogio += 1_000
    expect(tts.isTtsActive()).toBe(false)
  })

  it('o cancel() do motor nativo não apaga a fala externa em curso', async () => {
    const tts = await carregar()
    const terminar = tts.marcarFalaExterna()
    tts.nativeTts.cancel()
    relogio += 10_000
    expect(tts.isTtsActive()).toBe(true)
    terminar()
  })
})

describe('cortarCaudaDoEco (barge-in)', () => {
  it('encurta a cauda do fim atual para o resto pedido', async () => {
    const tts = await carregar()
    const terminar = tts.marcarFalaExterna()
    terminar()
    tts.cortarCaudaDoEco(150)
    relogio += 149
    expect(tts.isTtsActive()).toBe(true)
    relogio += 2
    expect(tts.isTtsActive()).toBe(false)
  })

  it('não encurta a cauda de uma fala que termina DEPOIS do corte', async () => {
    const tts = await carregar()
    tts.cortarCaudaDoEco(150)
    relogio += 1_000
    const terminar = tts.marcarFalaExterna()
    terminar()
    relogio += 500
    expect(tts.isTtsActive()).toBe(true) // a cauda inteira de 800 ms vale para a fala nova
  })

  it('não desliga o guarda de uma fala que ainda toca', async () => {
    const tts = await carregar()
    const terminar = tts.marcarFalaExterna()
    tts.cortarCaudaDoEco(0)
    expect(tts.isTtsActive()).toBe(true)
    terminar()
  })
})
