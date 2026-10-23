/**
 * "UMA CAPTURA ESTÁ GRAVANDO?" de qualquer aba: a captura segura uma trava do Web Locks enquanto grava,
 * e a tela de modelos pergunta por ela (`navigator.locks.query`) antes de baixar 672 MB e carregar o
 * Parakeet na memória. A trava some sozinha quando a aba fecha ou cai.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { algumaAbaGravando, segurarTravaDaGravacao } from '../src/lib/captura/travaDaGravacao'

/** Um `navigator.locks` mínimo: request segura até a promessa do callback resolver; query lista. */
function locksFalsos() {
  const seguradas: string[] = []
  return {
    seguradas,
    request: async (nome: string, _opcoes: unknown, f: () => Promise<unknown>) => {
      seguradas.push(nome)
      try {
        return await f()
      } finally {
        seguradas.splice(seguradas.indexOf(nome), 1)
      }
    },
    query: async () => ({ held: seguradas.map((name) => ({ name })), pending: [] }),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('travaDaGravacao', () => {
  it('segura enquanto grava e solta ao parar', async () => {
    const locks = locksFalsos()
    vi.stubGlobal('navigator', { locks })
    expect(await algumaAbaGravando()).toBe(false)
    const soltar = segurarTravaDaGravacao()
    await Promise.resolve()
    expect(await algumaAbaGravando()).toBe(true)
    soltar()
    await new Promise((r) => setTimeout(r, 0))
    expect(await algumaAbaGravando()).toBe(false)
  })

  it('sem Web Locks: não lança e responde que não', async () => {
    vi.stubGlobal('navigator', {})
    const soltar = segurarTravaDaGravacao()
    expect(() => soltar()).not.toThrow()
    expect(await algumaAbaGravando()).toBe(false)
  })
})
