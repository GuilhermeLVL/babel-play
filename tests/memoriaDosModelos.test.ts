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
  liberarAoSairDaCaptura,
  liberarModelosDepois,
  umModeloDeCadaVez,
} from '../src/lib/captura/memoriaDosModelos'
import { classificarDispositivo, type SinaisDoDispositivo } from '../src/lib/dispositivo/perfil'

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

  // Parakeet (~2x a memória do Whisper): o tradutor espera mesmo no desktop com GPU e 8 GB.
  it('STT pesado (Parakeet): um de cada vez até no desktop com GPU e 8 GB', () => {
    expect(umModeloDeCadaVez(perfil('desktop-com-gpu', 8), true)).toBe(true)
    expect(umModeloDeCadaVez(perfil('desktop-com-gpu', 8), false)).toBe(false)
  })
})

describe('liberarModelosDepois', () => {
  afterEach(() => {
    cancelarLiberacaoDosModelos()
    vi.useRealTimers()
  })

  it('libera 20 s depois de sair (eram 90; 22/10/2026)', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarModelosDepois(liberar)
    expect(LIBERAR_MODELOS_APOS_MS).toBe(20_000)
    vi.advanceTimersByTime(LIBERAR_MODELOS_APOS_MS - 1)
    expect(liberar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(liberar).toHaveBeenCalledTimes(1)
  })

  it('voltar antes do prazo cancela: os modelos continuam quentes', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarModelosDepois(liberar)
    vi.advanceTimersByTime(10_000)
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
    vi.advanceTimersByTime(15_000)
    liberarModelosDepois(segunda)
    vi.advanceTimersByTime(15_000)
    expect(primeira).not.toHaveBeenCalled()
    expect(segunda).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(segunda).toHaveBeenCalledTimes(1)
  })
})

/* Correção F do diagnóstico do Safari (22/10/2026): no Safari do Mac (sem `crossOriginIsolated`, WASM em
   1 thread) a aba caía ao sair da Capturar com os workers vivos. Sem isolamento conta como pouca
   memória, e os workers do STT e do tradutor são encerrados NA HORA ao sair. */
describe('liberarAoSairDaCaptura', () => {
  const macComSafari: SinaisDoDispositivo = {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    nucleos: 8,
    memoriaGb: null,
    isolado: false,
    capturaDeTela: true,
    ponteiroGrosso: false,
    toques: 0,
    temXr: false,
    economiaDeDados: false,
    tipoDeRede: null,
    movimentoReduzido: false,
    memoriaDaAbaMb: null,
    webGpu: true,
  }

  afterEach(() => {
    cancelarLiberacaoDosModelos()
    vi.useRealTimers()
  })

  it('Safari no Mac (sem isolamento): solta os modelos na hora, sem agendar', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarAoSairDaCaptura(classificarDispositivo(macComSafari), liberar)
    expect(liberar).toHaveBeenCalledTimes(1)
    expect(cancelarLiberacaoDosModelos()).toBe(false)
  })

  it('desktop isolado (Chrome): agenda para 20 s depois', () => {
    vi.useFakeTimers()
    const liberar = vi.fn()
    liberarAoSairDaCaptura(classificarDispositivo({ ...macComSafari, isolado: true, memoriaGb: 8 }), liberar)
    expect(liberar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LIBERAR_MODELOS_APOS_MS)
    expect(liberar).toHaveBeenCalledTimes(1)
  })
})
