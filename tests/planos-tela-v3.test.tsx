// @vitest-environment jsdom
/**
 * A TELA DE PLANOS NO LANÇAMENTO (change `planos-v3-e-rota-inteligente`, 9.1 e 9.4): Grátis, Essencial e
 * Premium à venda; o Ao Vivo (flag `stt_ao_vivo`) e a voz neural (flag `voz_natural`) só aparecem na
 * tela quando a flag está ligada. Nada de prometer o que a flag não entrega.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  apiFetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
}))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true, anual: false }),
}))

import Planos from '../src/components/views/Planos'
import { PLAN_MATRIX } from '../src/core/planos'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

const aguardar = () => act(async () => {})
const abrir = async (aVenda: string, flags: Record<string, { ligada: boolean }> = {}) => {
  localStorage.setItem('babel.px.planosAVendaDeProva', aVenda)
  definirEstadoDasFlags(flags)
  const tela = render(<Planos />)
  await aguardar()
  return tela
}
const cartoes = () =>
  [...document.querySelectorAll<HTMLElement>('.pl-planos-grade > .pl-plano')].map((c) => c.dataset.plPlano)
const tela = () => document.body.textContent ?? ''

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  _reiniciarIdentidade()
  definirIdentidade('conta')
})
afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
})

describe('Planos no lançamento: Grátis, Essencial e Premium', () => {
  it('desenha três cartões na ordem, com as horas da matriz', async () => {
    await abrir('essencial,premium')
    expect(cartoes()).toEqual(['gratis', 'essencial', 'premium'])
    expect((PLAN_MATRIX.essencial.quotas.sttSegundosMes ?? 0) / 3600).toBe(5)
    expect((PLAN_MATRIX.premium.quotas.sttSegundosMes ?? 0) / 3600).toBe(20)
    expect(tela()).toContain('5 h de nuvem por mês')
    expect(tela()).toContain('20 h de nuvem por mês')
  })

  it('não promete o Ao Vivo nem a voz neural com as flags desligadas', async () => {
    await abrir('essencial,premium')
    expect(tela()).not.toMatch(/Ao [Vv]ivo/)
    expect(tela()).not.toMatch(/Texto durante a fala/)
    expect(tela()).not.toMatch(/neural/i)
  })

  it('com `voz_natural` ligada a voz neural volta ao Premium', async () => {
    await abrir('essencial,premium', { voz_natural: { ligada: true } })
    expect(tela()).toMatch(/neural/i)
  })

  it('a comparação tem uma coluna por plano à venda e não fala de "Grátis ou Premium"', async () => {
    await abrir('essencial,premium')
    expect(tela()).not.toContain('Grátis ou Premium')
    const colunas = [...document.querySelectorAll<HTMLElement>('.pl-compara thead th[data-c]')].map((c) => c.dataset.c)
    expect(colunas).toEqual(['gratis', 'essencial', 'premium'])
  })

  it('com o Ao Vivo à venda são quatro cartões', async () => {
    await abrir('essencial,premium,aovivo')
    expect(cartoes()).toEqual(['gratis', 'essencial', 'premium', 'aovivo'])
  })
})
