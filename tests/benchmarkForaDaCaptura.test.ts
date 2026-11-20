/**
 * O MICROBENCHMARK FORA DA CAPTURA (22/10/2026): a captura agenda a sonda sem ele; a tela, ao sair,
 * chama `agendarBenchmarkDoAparelho`. Uma vez por página, só se o guardado venceu, cancelável, nunca rejeita.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

function armazemFalso() {
  const dados = new Map<string, string>()
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  }
}
const bench = { pontuacaoWasm: 10, pontuacaoWebgpu: 20, medidoEm: Date.now(), versaoDoApp: 'x' } as never

async function carregar() {
  vi.useFakeTimers()
  const m = await import('../src/lib/dispositivo/sonda')
  const medir = vi.fn(async () => bench)
  const dep = { armazem: armazemFalso(), medirBenchmark: medir, escopo: {} as never }
  return { m, medir, dep }
}

describe('agendarBenchmarkDoAparelho', () => {
  it('mede uma vez no ocioso; a segunda chamada reaproveita a primeira', async () => {
    const { m, medir, dep } = await carregar()
    const a = m.agendarBenchmarkDoAparelho(dep)
    const b = m.agendarBenchmarkDoAparelho(dep)
    expect(b).toBe(a)
    await vi.advanceTimersByTimeAsync(3500)
    await a
    expect(medir).toHaveBeenCalledTimes(1)
  })

  it('cancelado antes do ocioso (captura nova): não mede, e a próxima saída agenda de novo', async () => {
    const { m, medir, dep } = await carregar()
    const ctl = new AbortController()
    const p = m.agendarBenchmarkDoAparelho(dep, ctl.signal)
    ctl.abort()
    await vi.advanceTimersByTimeAsync(3500)
    await p
    expect(medir).not.toHaveBeenCalled()
    const q = m.agendarBenchmarkDoAparelho(dep)
    expect(q).not.toBe(p)
    await vi.advanceTimersByTimeAsync(3500)
    await q
    expect(medir).toHaveBeenCalledTimes(1)
  })

  it('nunca rejeita, mesmo com o benchmark falhando', async () => {
    const { m, dep } = await carregar()
    const p = m.agendarBenchmarkDoAparelho({
      ...dep,
      medirBenchmark: async () => {
        throw new Error('gpu')
      },
    })
    await vi.advanceTimersByTimeAsync(3500)
    await expect(p).resolves.toBeUndefined()
  })
})
