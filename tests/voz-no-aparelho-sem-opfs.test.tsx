// @vitest-environment jsdom
/**
 * SEM OPFS (Safari em navegação privada): o app não oferece o que vai falhar. O convite "Quer uma voz mais natural?" não
 * aparece (nem antes de a sonda responder), e no seletor a opção "Voz de alta qualidade" fica DESABILITADA, com UMA linha de
 * motivo lida por leitor de tela (`aria-disabled` + `aria-describedby`). Com OPFS, tudo igual ao de antes.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sinais = vi.hoisted(() => ({ flag: true }))

vi.mock('../src/lib/flagsCache', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flagsCache')>()),
  flagLigada: (k: string) => (k === 'voz_no_aparelho' ? sinais.flag : false),
}))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => false,
}))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/perfil')>()),
  perfilDoDispositivo: () => ({
    tipo: 'desktop-com-gpu',
    poucaMemoria: false,
    sinais: {
      memoriaGb: 8,
      webGpu: true,
      isolado: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',
      toques: 0,
    },
  }),
}))

const vna = await import('../src/lib/voz/vozNoAparelho')
const { esquecerOpfsSondado } = await import('../src/lib/voz/opfsUtilizavel')
const { default: SeletorDeVoz } = await import('../src/components/voz/SeletorDeVoz')

const MOTIVO = 'Esta janela não permite guardar a voz (navegação privada?). Abra uma janela normal para baixá-la.'

const storage = (v: unknown) => Object.defineProperty(navigator, 'storage', { configurable: true, value: v })
const opfsBom = () => ({
  getDirectory: async () => ({ getFileHandle: async () => ({}), removeEntry: async () => undefined }),
})
const opfsRuim = () => ({ getDirectory: () => Promise.reject(new DOMException('', 'SecurityError')) })

beforeEach(() => {
  localStorage.clear()
  sinais.flag = true
  vi.stubEnv('VITE_VOZ_MODELO_URL', 'http://localhost:3185/assets')
  esquecerOpfsSondado()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  storage(undefined)
})

describe('convite da voz no aparelho sem OPFS', () => {
  it('antes da resposta da sonda: não convida (e não bloqueia nada)', () => {
    storage(opfsBom())
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
  })
  it('OPFS que falha: não convida', async () => {
    storage(opfsRuim())
    await vna.verificarArmazenamentoDaVoz()
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
  })
  it('OPFS que funciona: convida como antes', async () => {
    storage(opfsBom())
    await vna.verificarArmazenamentoDaVoz()
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(true)
  })
  it('flag desligada: nem sonda o OPFS', async () => {
    sinais.flag = false
    const getDirectory = vi.fn(async () => ({}))
    storage({ getDirectory })
    await vna.verificarArmazenamentoDaVoz()
    expect(getDirectory).not.toHaveBeenCalled()
  })
})

describe('SeletorDeVoz sem OPFS', () => {
  const opcao = () => document.querySelector<HTMLElement>('[role="radio"][data-voz="@no-aparelho"]')

  it('OPFS que falha: a opção fica desabilitada, com o motivo visível e ligado a ela', async () => {
    storage(opfsRuim())
    render(<SeletorDeVoz idioma="pt" nuvem={false} />)
    await act(async () => {
      await vna.verificarArmazenamentoDaVoz()
    })
    const o = opcao()
    expect(o).not.toBeNull()
    expect(o?.getAttribute('aria-disabled')).toBe('true')
    const motivo = screen.getByTestId('voz-no-aparelho-indisponivel')
    expect(motivo.textContent).toBe(MOTIVO)
    expect(o?.getAttribute('aria-describedby')).toBe(motivo.id)
    expect(screen.queryByTestId('baixar-voz-no-aparelho')).toBeNull()
  })

  it('OPFS que falha: sem o cartão do modelo (folha do intérprete), a linha some em vez de ficar muda', async () => {
    storage(opfsRuim())
    render(<SeletorDeVoz idioma="pt" nuvem={false} comModelo={false} />)
    await act(async () => {
      await vna.verificarArmazenamentoDaVoz()
    })
    expect(opcao()).toBeNull()
  })

  it('OPFS que funciona: a opção é habilitada e o botão de baixar aparece, como antes', async () => {
    storage(opfsBom())
    render(<SeletorDeVoz idioma="pt" nuvem={false} />)
    await act(async () => {
      await vna.verificarArmazenamentoDaVoz()
    })
    expect(opcao()?.getAttribute('aria-disabled')).toBeNull()
    expect(screen.getByTestId('baixar-voz-no-aparelho')).toBeTruthy()
    expect(screen.queryByTestId('voz-no-aparelho-indisponivel')).toBeNull()
  })

  it('antes da resposta da sonda: a opção aparece normal (nada bloqueado)', () => {
    storage(opfsBom())
    render(<SeletorDeVoz idioma="pt" nuvem={false} />)
    expect(opcao()?.getAttribute('aria-disabled')).toBeNull()
  })
})
