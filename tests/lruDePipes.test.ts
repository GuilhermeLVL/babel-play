/**
 * O CACHE DE TRADUTORES DO WORKER TEM TETO (plano "Grátis sem travar", A7).
 *
 * O `mtWorker` guardava num `Map` sem fim cada opus-mt que carregou (~113 MB de pesos cada, mais a
 * sessão do ORT): trocar de par de idiomas numa sessão longa empilhava modelos até a aba morrer. Agora
 * ficam os DOIS mais recentes (a conversa usa dois sentidos), e o que sai é DESCARTADO de verdade
 * (`dispose()` solta as sessões do ORT) — nunca enquanto uma tradução o usa.
 */
import { describe, expect, it, vi } from 'vitest'

import { LruDePipes } from '../src/gateway/adapters/lruDePipes'

const pipe = (nome: string) => ({ nome, dispose: vi.fn(async () => {}) })

describe('LruDePipes', () => {
  it('guarda até a capacidade; o terceiro despeja o MENOS recente, com dispose esperado', async () => {
    const saiu = vi.fn()
    const lru = new LruDePipes<ReturnType<typeof pipe>>(2, saiu)
    const a = pipe('a')
    const b = pipe('b')
    const c = pipe('c')
    await lru.guardar('a', a)
    await lru.guardar('b', b)
    await lru.guardar('c', c)
    expect(lru.chaves()).toEqual(['b', 'c'])
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(saiu).toHaveBeenCalledWith('a')
    expect(b.dispose).not.toHaveBeenCalled()
  })

  it('obter() conta como uso: o consultado por último fica', async () => {
    const lru = new LruDePipes<ReturnType<typeof pipe>>(2)
    const a = pipe('a')
    const b = pipe('b')
    await lru.guardar('a', a)
    await lru.guardar('b', b)
    expect(lru.obter('a')).toBe(a)
    await lru.guardar('c', pipe('c'))
    expect(lru.chaves()).toEqual(['a', 'c'])
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })

  it('guardar() só volta DEPOIS do dispose do despejado (a memória é devolvida antes de seguir)', async () => {
    let terminar!: () => void
    const a = { dispose: vi.fn(() => new Promise<void>((r) => (terminar = r))) }
    const lru = new LruDePipes<object>(1)
    await lru.guardar('a', a)
    let voltou = false
    const p = lru.guardar('b', {}).then(() => (voltou = true))
    await Promise.resolve()
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(voltou).toBe(false)
    terminar()
    await p
    expect(voltou).toBe(true)
  })

  it('abrirEspaco() despeja ANTES da próxima carga: o pico não soma três modelos', async () => {
    const lru = new LruDePipes<ReturnType<typeof pipe>>(2)
    const a = pipe('a')
    await lru.guardar('a', a)
    await lru.guardar('b', pipe('b'))
    await lru.abrirEspaco()
    expect(lru.chaves()).toEqual(['b'])
    expect(a.dispose).toHaveBeenCalledTimes(1)
  })

  it('o que está EM USO (reservado) não é despejado; sai quando é solto', async () => {
    const saiu = vi.fn()
    const lru = new LruDePipes<ReturnType<typeof pipe>>(2, saiu)
    const a = pipe('a')
    await lru.guardar('a', a)
    await lru.guardar('b', pipe('b'))
    const usoDeA = lru.reservar('a')!
    expect(usoDeA.valor).toBe(a)
    await lru.guardar('b', lru.obter('b')!) // 'b' fica mais recente que 'a', que está em uso
    await lru.guardar('c', pipe('c'))
    expect(a.dispose).not.toHaveBeenCalled()
    expect(lru.chaves()).toEqual(['a', 'c']) // saiu 'b', o mais antigo LIVRE
    lru.reservar('c')
    await lru.guardar('d', pipe('d'))
    // 'a' e 'c' em uso: a capacidade estoura por um instante, ninguém é descartado no meio do uso.
    expect(lru.chaves()).toEqual(['a', 'c', 'd'])
    await usoDeA.soltar()
    await usoDeA.soltar() // soltar duas vezes não conta dois usos
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(saiu).toHaveBeenCalledWith('a')
    expect(lru.chaves()).toEqual(['c', 'd'])
  })

  it('dispose que falha não trava o cache', async () => {
    const lru = new LruDePipes<object>(1)
    await lru.guardar('a', { dispose: () => Promise.reject(new Error('sessão já solta')) })
    await expect(lru.guardar('b', {})).resolves.toBeUndefined()
    expect(lru.chaves()).toEqual(['b'])
  })

  it('limpar() descarta tudo; o que está em uso só no soltar', async () => {
    const lru = new LruDePipes<ReturnType<typeof pipe>>(2)
    const a = pipe('a')
    const b = pipe('b')
    await lru.guardar('a', a)
    await lru.guardar('b', b)
    const usoDeB = lru.reservar('b')!
    await lru.limpar()
    expect(lru.tamanho).toBe(0)
    expect(a.dispose).toHaveBeenCalledTimes(1)
    expect(b.dispose).not.toHaveBeenCalled()
    await usoDeB.soltar()
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })

  it('reservar() de quem não está: undefined', () => {
    expect(new LruDePipes(2).reservar('x')).toBeUndefined()
  })
})
