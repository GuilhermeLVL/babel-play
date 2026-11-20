/**
 * O MOTOR DA VOZ NO APARELHO (`lib/voz/motorNoAparelho.ts`): fila com prioridade, pré-busca, duração real, queda para a
 * voz do aparelho sem silêncio (aviso uma vez) e `liberar()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SpeakOptions, TtsEngine } from '../src/lib/tts'
import {
  type ClipeDaVoz,
  criarMotorNoAparelho,
  type SintetizadorDaVoz,
  type TocadorDaVoz,
} from '../src/lib/voz/motorNoAparelho'

const tique = () => new Promise((r) => setTimeout(r, 0))

function sintetizadorFalso(falhar = new Set<string>()) {
  const pedidos: string[] = []
  const pendentes: Array<{ texto: string; ok: (c: ClipeDaVoz) => void; erro: (e: Error) => void }> = []
  const s: SintetizadorDaVoz & { pedidos: string[]; terminar: () => Promise<void>; liberado: number } = {
    pedidos,
    liberado: 0,
    sintetizar(texto, _i, voz) {
      pedidos.push(`${voz}:${texto}`)
      return new Promise((ok, erro) => pendentes.push({ texto, ok, erro }))
    },
    liberar() {
      s.liberado++
    },
    async terminar() {
      const p = pendentes.shift()
      if (!p) return
      if (falhar.has(p.texto)) p.erro(new Error('falhou'))
      else p.ok({ pcm: new Float32Array(24_000), taxa: 24_000, ms: 50, backend: 'wasm' })
      await tique()
    },
  }
  return s
}

function tocadorFalso() {
  const tocando: Array<{ segundos: number; fim: () => void }> = []
  const t: TocadorDaVoz & { tocando: typeof tocando } = {
    tocando,
    tocar(pcm, taxa, _v, aoFim) {
      tocando.push({ segundos: pcm.length / taxa, fim: aoFim })
      return () => undefined
    },
  }
  return t
}

const reservaFalsa = () => {
  const r: TtsEngine & { falas: string[] } = {
    falas: [],
    speak(texto) {
      r.falas.push(texto)
    },
    cancel() {},
  }
  return r
}

const pt = (o: Partial<SpeakOptions> = {}): SpeakOptions => ({ lang: 'pt-BR', ...o })

afterEach(() => vi.useRealTimers())

describe('motor da voz no aparelho', () => {
  it('toca o áudio sintetizado e o fim da frase é o fim REAL do áudio', async () => {
    const s = sintetizadorFalso()
    const tocador = tocadorFalso()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador, reserva: reservaFalsa() })
    const fim = vi.fn()
    m.speak('Olá.', pt({ onEnd: fim }))
    await s.terminar()
    expect(tocador.tocando).toHaveLength(1)
    expect(tocador.tocando[0].segundos).toBe(1)
    expect(m.isSpeaking?.()).toBe(true)
    expect(fim).not.toHaveBeenCalled()
    tocador.tocando[0].fim()
    expect(fim).toHaveBeenCalledTimes(1)
    expect(m.isSpeaking?.()).toBe(false)
  })

  it('a voz do narrador é a escolhida (padrão F1); a do elenco vem por voiceName', async () => {
    const s = sintetizadorFalso()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador: tocadorFalso(), reserva: reservaFalsa() })
    m.speak('a', pt())
    await s.terminar()
    m.speak('b', pt({ voiceName: 'M3' }))
    await s.terminar()
    m.speak('c', pt({ voiceName: 'Luciana' })) // voz do sistema não vale aqui: F1
    expect(s.pedidos).toEqual(['F1:a', 'M3:b', 'F1:c'])
  })

  it('pré-busca até 2 à frente; a frase pedida por speak passa à frente da fila', async () => {
    const s = sintetizadorFalso()
    const tocador = tocadorFalso()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador, reserva: reservaFalsa() })
    m.speak('um', pt())
    m.preparar([
      { texto: 'dois', opts: pt() },
      { texto: 'três', opts: pt() },
      { texto: 'quatro', opts: pt() },
    ])
    await s.terminar() // "um"
    await s.terminar() // "dois", adiantada enquanto "um" toca
    expect(s.pedidos).toEqual(['F1:um', 'F1:dois', 'F1:três'])
    m.speak('dois', pt()) // já pronta: toca sem novo pedido
    await tique()
    expect(tocador.tocando).toHaveLength(2)
    expect(s.pedidos).toHaveLength(3)
  })

  it('frase que falha: a voz do aparelho lê a MESMA frase na hora; o aviso sai uma vez', async () => {
    const s = sintetizadorFalso(new Set(['ruim', 'pior']))
    const reserva = reservaFalsa()
    const aoRecuar = vi.fn()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador: tocadorFalso(), reserva, aoRecuar })
    m.speak('ruim', pt())
    await s.terminar()
    m.speak('pior', pt())
    await s.terminar()
    expect(reserva.falas).toEqual(['ruim', 'pior'])
    expect(aoRecuar).toHaveBeenCalledTimes(1)
  })

  it('idioma fora do motor vai direto para a voz do aparelho', () => {
    const s = sintetizadorFalso()
    const reserva = reservaFalsa()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador: tocadorFalso(), reserva })
    m.speak('Bonjour', { lang: 'fr-FR' })
    expect(reserva.falas).toEqual(['Bonjour'])
    expect(s.pedidos).toEqual([])
  })

  it('cancel: o áudio que chega depois não toca', async () => {
    const s = sintetizadorFalso()
    const tocador = tocadorFalso()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador, reserva: reservaFalsa() })
    m.speak('x', pt())
    m.cancel()
    await s.terminar()
    expect(tocador.tocando).toHaveLength(0)
  })

  it('liberar: solta o worker depois do prazo; falar antes do prazo cancela a soltura', async () => {
    vi.useFakeTimers()
    const s = sintetizadorFalso()
    const m = criarMotorNoAparelho({
      sintetizador: s,
      tocador: tocadorFalso(),
      reserva: reservaFalsa(),
      soltarAposMs: 20_000,
    })
    m.liberar()
    vi.advanceTimersByTime(10_000)
    m.speak('volta', pt())
    vi.advanceTimersByTime(20_000)
    expect(s.liberado).toBe(0)
    m.liberar()
    vi.advanceTimersByTime(20_000)
    expect(s.liberado).toBe(1)
  })

  it('liberar sem prazo (pouca memória): na hora', () => {
    const s = sintetizadorFalso()
    const m = criarMotorNoAparelho({ sintetizador: s, tocador: tocadorFalso(), reserva: reservaFalsa() })
    m.liberar()
    expect(s.liberado).toBe(1)
  })
})
