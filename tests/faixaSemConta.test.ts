// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHAVE_DA_FAIXA_SEM_CONTA, gravarFaixaSemConta, lerFaixaSemConta } from '../src/lib/faixaSemConta'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('faixaSemConta', () => {
  it('começa sem resposta', () => {
    expect(lerFaixaSemConta()).toBeNull()
  })
  it('grava e lê adulto e menor, só no localStorage', () => {
    gravarFaixaSemConta('adulto')
    expect(lerFaixaSemConta()).toBe('adulto')
    gravarFaixaSemConta('menor')
    expect(lerFaixaSemConta()).toBe('menor')
    expect(localStorage.getItem(CHAVE_DA_FAIXA_SEM_CONTA)).toBe('menor')
  })
  it('valor estranho conta como sem resposta', () => {
    localStorage.setItem(CHAVE_DA_FAIXA_SEM_CONTA, 'qualquer')
    expect(lerFaixaSemConta()).toBeNull()
  })
  it('armazenamento recusado não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('negado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('negado')
    })
    expect(() => gravarFaixaSemConta('adulto')).not.toThrow()
    expect(lerFaixaSemConta()).toBeNull()
  })
})
