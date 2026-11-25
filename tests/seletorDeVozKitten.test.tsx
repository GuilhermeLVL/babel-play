// @vitest-environment jsdom
/**
 * A voz natural do Kitten no SELETOR DE VOZ (openspec `voz-natural-no-aparelho-kitten`, tarefa 4.4):
 *   · flag desligada (ou sem os pesos configurados): a opção não existe;
 *   · flag ligada, modelo ainda não baixado: uma linha "Voz natural (no aparelho)" que não escolhe, com o tamanho
 *     e o botão de baixar; o botão de ouvir fica desabilitado;
 *   · modelo baixado: uma linha por voz do idioma, escolher grava `@kitten` e a voz; o cartão oferece apagar;
 *   · vale em perfil protegido: a decisão do Kitten não olha o perfil protegido (a licença serve a todos).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const palco = vi.hoisted(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak: () => undefined,
      cancel: () => undefined,
      resume: () => undefined,
      paused: false,
      speaking: false,
    },
  })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
    constructor(public text: string) {}
  }
  return {
    estado: { fase: 'livre', idioma: null, recebidos: 0, total: 0 },
    oferecido: true,
    pronto: false,
    vozEscolhida: 'juliana',
    baixou: [] as string[],
    apagou: 0,
    definiu: [] as Array<[string, string]>,
    ouvidas: [] as Array<{ texto: string; voz?: string }>,
  }
})

vi.mock('../src/data/api', () => ({
  patchUiSettings: vi.fn(async () => ({ id: 'x' })),
  fetchSettings: async () => null,
}))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ vozNatural: false }),
  onPlanChange: () => () => undefined,
}))
vi.mock('../src/lib/voz/vozKitten', () => ({
  VOZ_KITTEN: '@kitten',
  raizDoKitten: () => (palco.oferecido ? 'https://pesos.exemplo' : null),
  kittenOferecido: () => palco.oferecido,
  modeloKittenPronto: () => palco.pronto,
  decisaoDoKitten: () => ({ variante: 'pico' }),
  downloadDoKitten: () => ({ mb: 8, confirmar: false }),
  estadoDoKitten: () => palco.estado,
  aoMudarKitten: () => () => undefined,
  verificarArmazenamentoDoKitten: async () => undefined,
  vozDoKittenNoIdioma: () => palco.vozEscolhida,
  definirVozDoKitten: (i: string, v: string) => {
    palco.vozEscolhida = v
    palco.definiu.push([i, v])
  },
  baixarVozKitten: async (i: string) => {
    palco.baixou.push(i)
    palco.pronto = true
    return true
  },
  cancelarDownloadDoKitten: () => undefined,
  apagarVozKitten: async () => {
    palco.apagou++
    palco.pronto = false
  },
  motorDoKitten: async () => ({
    speak: (texto: string, o: { voiceName?: string }) => palco.ouvidas.push({ texto, voz: o.voiceName }),
    cancel: () => undefined,
  }),
}))

import SeletorDeVoz from '../src/components/voz/SeletorDeVoz'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { _reiniciarPreferencias } from '../src/lib/preferencias'

const opcoes = () => screen.getAllByRole('radio')
const guardadas = () => JSON.parse(localStorage.getItem('babel_voice_prefs') ?? '{}') as Record<string, string>

beforeEach(() => {
  localStorage.clear()
  _reiniciarPreferencias()
  definirEstadoDasFlags({ voz_kitten: { ligada: true } })
  Object.assign(palco, { oferecido: true, pronto: false, vozEscolhida: 'juliana', apagou: 0 })
  palco.baixou.length = 0
  palco.definiu.length = 0
  palco.ouvidas.length = 0
})
afterEach(cleanup)

describe('a opção da voz natural (Kitten) no seletor', () => {
  it('sem a flag (ou sem os pesos): a opção e o cartão não existem', () => {
    palco.oferecido = false
    render(<SeletorDeVoz idioma="pt-BR" />)
    expect(screen.queryByRole('radio', { name: /Voz natural/ })).toBeNull()
    expect(screen.queryByTestId('voz-kitten')).toBeNull()
  })

  it('idioma fora de pt/en/es: não aparece', () => {
    render(<SeletorDeVoz idioma="ja" />)
    expect(screen.queryByRole('radio', { name: /Voz natural/ })).toBeNull()
  })

  it('ligada e sem o modelo: uma linha que não escolhe, com o tamanho no botão de baixar', () => {
    render(<SeletorDeVoz idioma="pt-BR" />)
    fireEvent.click(screen.getByRole('radio', { name: /Voz natural \(no aparelho\)/ }))
    expect(guardadas()).toEqual({})
    expect(screen.getByTestId('baixar-voz-kitten').textContent).toContain('8 MB')
    const ouvir = screen.getByRole('button', { name: /Ouvir uma amostra da voz Voz natural/ }) as HTMLButtonElement
    expect(ouvir.disabled).toBe(true)
  })

  it('baixar deixa o modelo pronto e escolhe a voz natural para o idioma', async () => {
    render(<SeletorDeVoz idioma="pt-BR" />)
    fireEvent.click(screen.getByTestId('baixar-voz-kitten'))
    await vi.waitFor(() => expect(palco.baixou).toEqual(['pt']))
    await vi.waitFor(() => expect(guardadas()).toEqual({ pt: '@kitten' }))
  })

  it('com o modelo: uma linha por voz; escolher grava @kitten e a voz; o cartão apaga', () => {
    palco.pronto = true
    render(<SeletorDeVoz idioma="pt-BR" />)
    expect(opcoes().some((o) => (o.textContent ?? '').includes('Juliana (voz natural)'))).toBe(true)
    const gustavo = screen.getByRole('radio', { name: /Gustavo \(voz natural\)/ })
    fireEvent.click(gustavo)
    expect(palco.definiu).toEqual([['pt', 'gustavo']])
    expect(guardadas()).toEqual({ pt: '@kitten' })
    fireEvent.click(within(screen.getByTestId('voz-kitten')).getByRole('button', { name: /Apagar a voz natural/ }))
    expect(palco.apagou).toBe(1)
  })

  it('a amostra toca com a voz da própria linha', async () => {
    palco.pronto = true
    render(<SeletorDeVoz idioma="pt-BR" />)
    fireEvent.click(screen.getByRole('button', { name: /Ouvir uma amostra da voz Gustavo/ }))
    await vi.waitFor(() => expect(palco.ouvidas).toHaveLength(1))
    expect(palco.ouvidas[0].voz).toBe('gustavo')
  })

  it('a escolha guardada sem o modelo pronto: marca a automática e diz o porquê', () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ pt: '@kitten' }))
    render(<SeletorDeVoz idioma="pt-BR" />)
    expect(screen.getByTestId('voz-que-sumiu').textContent).toContain('A voz natural não está pronta')
  })
})
