/**
 * A MEMÓRIA DOS MODELOS LOCAIS (plano "Grátis sem travar", A7).
 *
 * 1. UM DE CADA VEZ: STT e tradutor carregavam JUNTOS em todo aparelho que não fosse "pouca memória"
 *    (só móvel/Quest). No desktop SEM GPU os dois abrem sessão no mesmo CPU, e num de 4 GB o pico
 *    soma os dois modelos — a aba travava na preparação. Agora juntos só no desktop COM GPU e ≥ 8 GB.
 * 2. LIBERAR AO SAIR: só o aparelho de pouca memória soltava os workers ao sair da captura; no
 *    desktop o modelo ficava na aba para sempre. Agora todo aparelho solta — 90 s depois (quem volta
 *    antes não paga a recarga); o de pouca memória continua soltando na hora.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cancelarLiberacaoDosModelos,
  LIBERAR_MODELOS_APOS_MS,
  liberarModelosDepois,
  umModeloDeCadaVez,
} from '../src/lib/captura/memoriaDosModelos'

const perfil = (tipo: string, memoriaGb: number | null, poucaMemoria = false) =>
  ({ tipo, poucaMemoria, sinais: { memoriaGb } }) as never

describe('umModeloDeCadaVez', () => {
  it.each([
    ['desktop com GPU e 8 GB: juntos', perfil('desktop-com-gpu', 8), false],
    ['desktop com GPU sem deviceMemory (Firefox/Safari): juntos', perfil('desktop-com-gpu', null), false],
    ['desktop com GPU e 4 GB: um de cada vez', perfil('desktop-com-gpu', 4), true],
    ['desktop SEM GPU, mesmo com 8 GB: um de cada vez (os dois no mesmo CPU)', perfil('desktop-sem-gpu', 8), true],
    ['celular bom: um de cada vez', perfil('celular-bom', 8), true],
    ['Quest: um de cada vez', perfil('quest', null, true), true],
    ['pouca memória manda, seja qual for o tipo', perfil('desktop-com-gpu', 8, true), true],
  ])('%s', (_n, p, esperado) => {
    expect(umModeloDeCadaVez(p)).toBe(esperado)
  })
})

describe('liberarModelosDepois', () => {
  afterEach(() => {
    cancelarLiberacaoDosModelos()
    vi.useRealTimers()
  })

  it('libera 90 s depois de sair', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarModelosDepois(liberar)
    expect(LIBERAR_MODELOS_APOS_MS).toBe(90_000)
    vi.advanceTimersByTime(89_999)
    expect(liberar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(liberar).toHaveBeenCalledTimes(1)
  })

  it('voltar antes do prazo cancela: os modelos continuam quentes', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarModelosDepois(liberar)
    vi.advanceTimersByTime(30_000)
    expect(cancelarLiberacaoDosModelos()).toBe(true)
    vi.advanceTimersByTime(120_000)
    expect(liberar).not.toHaveBeenCalled()
    expect(cancelarLiberacaoDosModelos()).toBe(false)
  })

  it('sair de novo troca o agendamento (uma liberação só, contada da última saída)', () => {
    vi.useFakeTimers()
    const primeira = vi.fn()
    const segunda = vi.fn()
    liberarModelosDepois(primeira)
    vi.advanceTimersByTime(60_000)
    liberarModelosDepois(segunda)
    vi.advanceTimersByTime(60_000)
    expect(primeira).not.toHaveBeenCalled()
    expect(segunda).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(segunda).toHaveBeenCalledTimes(1)
  })
})
