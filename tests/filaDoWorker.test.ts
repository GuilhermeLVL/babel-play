/**
 * O FINAL NUNCA ESPERA O PARCIAL (auditoria de latência 2026-09-26, item 2).
 *
 * `onmessage = async` intercalava o decode final com o parcial da mesma fala (0,92 s p50 de espera
 * no small). A fila serial dá prioridade ao final, descarta os parciais que esperam e pede ao
 * parcial em voo que pare.
 */
import { describe, expect, it } from 'vitest'

import { FilaSerial, processadorDeCancelamento, type SinalDeCancelamento } from '../src/gateway/adapters/filaDoWorker'

/** Uma tarefa controlável: só termina quando `liberar()` é chamado (ou quando é cancelada e vê o sinal). */
function tarefaControlada(id: string, prioridade: 'final' | 'parcial', log: string[]) {
  let liberar!: () => void
  const liberada = new Promise<void>((r) => (liberar = r))
  let sinalVisto: SinalDeCancelamento | null = null
  return {
    tarefa: {
      id,
      prioridade,
      executar: async (sinal: SinalDeCancelamento) => {
        sinalVisto = sinal
        log.push(`inicio:${id}`)
        await liberada
        log.push(`${sinal.cancelado ? 'cancelada' : 'fim'}:${id}`)
      },
      aoDescartar: () => log.push(`descartada:${id}`),
    },
    liberar: () => liberar(),
    sinal: () => sinalVisto,
  }
}

const tique = () => new Promise((r) => setTimeout(r, 0))

describe('FilaSerial', () => {
  it('executa UMA tarefa por vez, na ordem de chegada', async () => {
    const log: string[] = []
    const fila = new FilaSerial()
    const a = tarefaControlada('a', 'final', log)
    const b = tarefaControlada('b', 'final', log)
    const pa = fila.enfileirar(a.tarefa)
    const pb = fila.enfileirar(b.tarefa)
    await tique()
    expect(log).toEqual(['inicio:a']) // b NÃO começa enquanto a roda (era o bug: intercalava)
    a.liberar()
    await pa
    await tique()
    expect(log).toEqual(['inicio:a', 'fim:a', 'inicio:b'])
    b.liberar()
    await pb
    expect(fila.tamanho).toBe(0)
  })

  it('final que chega cancela o parcial EM VOO e passa na frente', async () => {
    const log: string[] = []
    const fila = new FilaSerial()
    const parcial = tarefaControlada('p', 'parcial', log)
    const final = tarefaControlada('f', 'final', log)
    const pp = fila.enfileirar(parcial.tarefa)
    await tique()
    expect(fila.idEmVoo).toBe('p')
    const pf = fila.enfileirar(final.tarefa)
    expect(parcial.sinal()?.cancelado).toBe(true) // o parcial vê o sinal e para
    parcial.liberar()
    await pp
    await tique()
    expect(fila.idEmVoo).toBe('f')
    final.liberar()
    await pf
    expect(log).toEqual(['inicio:p', 'cancelada:p', 'inicio:f', 'fim:f'])
  })

  it('final descarta os parciais que ESPERAM, sem executá-los', async () => {
    const log: string[] = []
    const fila = new FilaSerial()
    const f1 = tarefaControlada('f1', 'final', log)
    const p = tarefaControlada('p', 'parcial', log)
    const f2 = tarefaControlada('f2', 'final', log)
    void fila.enfileirar(f1.tarefa)
    const pp = fila.enfileirar(p.tarefa)
    void fila.enfileirar(f2.tarefa)
    await pp // o parcial terminou — descartado, não executado
    expect(log).toContain('descartada:p')
    f1.liberar()
    await tique()
    await tique()
    expect(fila.idEmVoo).toBe('f2')
    f2.liberar()
    await tique()
    expect(log.filter((l) => l !== 'descartada:p')).toEqual(['inicio:f1', 'fim:f1', 'inicio:f2', 'fim:f2'])
  })

  it('cancelar(id): tarefa que espera sai descartada; a em voo recebe o sinal', async () => {
    const log: string[] = []
    const fila = new FilaSerial()
    const a = tarefaControlada('a', 'final', log)
    const b = tarefaControlada('b', 'final', log)
    void fila.enfileirar(a.tarefa)
    const pb = fila.enfileirar(b.tarefa)
    expect(fila.cancelar('b')).toBe(true)
    await pb
    expect(log).toContain('descartada:b')
    expect(fila.cancelar('a')).toBe(true)
    expect(a.sinal()?.cancelado).toBe(true)
    expect(fila.cancelar('nenhuma')).toBe(false)
    a.liberar()
  })

  it('tarefa que lança não trava a fila', async () => {
    const fila = new FilaSerial()
    const log: string[] = []
    void fila.enfileirar({
      id: 'x',
      prioridade: 'final',
      executar: async () => {
        throw new Error('falhou')
      },
    })
    await fila.enfileirar({ id: 'y', prioridade: 'final', executar: async () => void log.push('y') })
    expect(log).toEqual(['y'])
  })
})

describe('processadorDeCancelamento', () => {
  it('sem cancelamento não toca nos logits; cancelado, só o EOS sobra', () => {
    const sinal = { cancelado: false }
    const proc = processadorDeCancelamento(sinal, [2])!
    const logits = { data: new Float32Array([1, 5, 0.3, 2, 9, 0, 0.1, 4]), dims: [2, 4] }
    proc(null, logits)
    expect(Array.from(logits.data)).toEqual([1, 5, 0.3, 2, 9, 0, 0.1, 4].map((x) => Math.fround(x)))
    sinal.cancelado = true
    proc(null, logits)
    expect(Array.from(logits.data)).toEqual([-Infinity, -Infinity, 0, -Infinity, -Infinity, -Infinity, 0, -Infinity])
  })

  it('sem id de EOS: não há processador (o chamador só descarta o resultado)', () => {
    expect(processadorDeCancelamento({ cancelado: true }, undefined)).toBeNull()
  })
})
