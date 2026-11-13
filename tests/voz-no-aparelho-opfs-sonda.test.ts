// @vitest-environment jsdom
/**
 * A sonda do OPFS (`opfsUtilizavel`): só vale "sim" se a API existe, a pasta raiz abre e um arquivo minúsculo é criado
 * e apagado. Qualquer falha é "não", a resposta fica na sessão e a sonda nunca lança.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerOpfsSondado, opfsConhecido, opfsUtilizavel } from '../src/lib/voz/opfsUtilizavel'

const storage = (v: unknown) => Object.defineProperty(navigator, 'storage', { configurable: true, value: v })
const pasta = (sobre: Partial<Record<'getFileHandle' | 'removeEntry', () => Promise<unknown>>> = {}) => ({
  getFileHandle: vi.fn(sobre.getFileHandle ?? (async () => ({}))),
  removeEntry: vi.fn(sobre.removeEntry ?? (async () => undefined)),
})

beforeEach(() => esquecerOpfsSondado())
afterEach(() => storage(undefined))

describe('opfsUtilizavel', () => {
  it('antes de a sonda responder, o estado conhecido é "desconhecido"', () => {
    expect(opfsConhecido()).toBe('desconhecido')
  })

  it('sem navigator.storage ou sem getDirectory: false', async () => {
    storage(undefined)
    expect(await opfsUtilizavel()).toBe(false)
    esquecerOpfsSondado()
    storage({})
    expect(await opfsUtilizavel()).toBe(false)
    expect(opfsConhecido()).toBe(false)
  })

  it('getDirectory rejeita (Safari em navegação privada): false, sem lançar', async () => {
    storage({ getDirectory: () => Promise.reject(new DOMException('', 'SecurityError')) })
    await expect(opfsUtilizavel()).resolves.toBe(false)
  })

  it('getDirectory lança de forma síncrona: false', async () => {
    storage({
      getDirectory: () => {
        throw new Error('boom')
      },
    })
    await expect(opfsUtilizavel()).resolves.toBe(false)
  })

  it('criar o arquivo de teste falha: false', async () => {
    const p = pasta({ getFileHandle: () => Promise.reject(new DOMException('', 'InvalidStateError')) })
    storage({ getDirectory: async () => p })
    expect(await opfsUtilizavel()).toBe(false)
    expect(p.removeEntry).not.toHaveBeenCalled()
  })

  it('apagar o arquivo de teste falha: false', async () => {
    storage({ getDirectory: async () => pasta({ removeEntry: () => Promise.reject(new Error('x')) }) })
    expect(await opfsUtilizavel()).toBe(false)
  })

  it('sucesso: cria e apaga o arquivo ".sonda" e responde true', async () => {
    const p = pasta()
    storage({ getDirectory: async () => p })
    expect(await opfsUtilizavel()).toBe(true)
    expect(p.getFileHandle).toHaveBeenCalledWith('.sonda', { create: true })
    expect(p.removeEntry).toHaveBeenCalledWith('.sonda')
    expect(opfsConhecido()).toBe(true)
  })

  it('o resultado fica em cache na sessão: a segunda pergunta não toca o OPFS', async () => {
    const getDirectory = vi.fn(async () => pasta())
    storage({ getDirectory })
    await opfsUtilizavel()
    await opfsUtilizavel()
    expect(getDirectory).toHaveBeenCalledTimes(1)
    storage({ getDirectory: () => Promise.reject(new Error('x')) })
    expect(await opfsUtilizavel()).toBe(true)
  })
})
