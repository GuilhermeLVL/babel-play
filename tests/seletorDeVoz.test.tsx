// @vitest-environment jsdom
/**
 * O SELETOR DE VOZ (`src/components/voz/SeletorDeVoz.tsx`) — o mesmo componente na Leitura, no intérprete
 * e nos Ajustes.
 *
 *   · A LISTA: "Automática" primeiro e marcada para quem nunca escolheu; depois as vozes do aparelho
 *     PARA AQUELE IDIOMA, com o nome legível, o país do sotaque e o que o navegador informa;
 *   · A VOZ NATURAL só aparece com a capacidade do plano (e a flag), com a frase que diz onde ela lê;
 *   · ESCOLHER grava a preferência do idioma (no aparelho e na conta);
 *   · A AMOSTRA toca uma frase curta no idioma com AQUELA voz — e a da "Automática" é a automática de
 *     verdade, mesmo com outra voz escolhida;
 *   · A VOZ QUE SUMIU: a marcada é a automática e a tela diz o que houve.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

interface VozFalsa {
  name: string
  lang: string
  localService: boolean
}
interface Fala {
  text: string
  lang: string
  voice: VozFalsa | null
  onstart: (() => void) | null
  onend: (() => void) | null
}

/* A `speechSynthesis` falsa nasce ANTES dos módulos: `tts.ts` lê as vozes ao carregar. */
const palco = vi.hoisted(() => {
  const vozes = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true },
  ]
  const faladas: unknown[] = []
  class FalaFalsa {
    lang = ''
    voice: unknown = null
    rate = 1
    pitch = 1
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => vozes,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak: (u: unknown) => faladas.push(u),
      cancel: () => undefined,
      resume: () => undefined,
      paused: false,
      speaking: false,
    },
  })
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FalaFalsa
  return {
    faladas,
    plano: { vozNatural: false },
    patch: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
    nuvem: { falas: [] as Array<{ texto: string; lang: string }>, recuar: null as null | (() => void) },
  }
})

vi.mock('../src/data/api', () => {
  palco.patch = vi.fn(async () => ({ id: 'x' }))
  return { patchUiSettings: palco.patch, fetchSettings: async () => null }
})
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => palco.plano,
  onPlanChange: () => () => undefined,
}))
vi.mock('../src/lib/voz/vozDaNuvem', () => ({
  criarVozDaNuvem: (o: { aoRecuar?: () => void }) => {
    palco.nuvem.recuar = () => o.aoRecuar?.()
    return {
      speak: (texto: string, opts: { lang: string }) => palco.nuvem.falas.push({ texto, lang: opts.lang }),
      cancel: () => undefined,
    }
  },
}))

import PainelDaVoz from '../src/components/views/ajustes/PainelDaVoz'
import FolhaDasVozes from '../src/components/voz/FolhaDasVozes'
import SeletorDeVoz from '../src/components/voz/SeletorDeVoz'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { _reiniciarPreferencias } from '../src/lib/preferencias'
import { fraseDeAmostra, ladosDaVoz, nomeLegivelDaVoz } from '../src/lib/voz/catalogoDeVozes'

const DAVID = 'Microsoft David - English (United States)'
const ARIA = 'Microsoft Aria Online (Natural) - English (United States)'
const faladas = () => palco.faladas as Fala[]
const opcoes = (raiz: HTMLElement = document.body) => within(raiz).getAllByRole('radio')
const marcada = (raiz: HTMLElement = document.body) =>
  opcoes(raiz).find((o) => o.getAttribute('aria-checked') === 'true')
const guardadas = () => JSON.parse(localStorage.getItem('babel_voice_prefs') ?? '{}') as Record<string, string>

beforeEach(() => {
  localStorage.clear()
  _reiniciarPreferencias()
  definirEstadoDasFlags(null)
  palco.faladas.length = 0
  palco.nuvem.falas.length = 0
  palco.plano.vozNatural = false
  palco.patch.mockClear()
})
afterEach(cleanup)

describe('a lista de vozes', () => {
  it('"Automática" vem primeiro e marcada; depois, só as vozes daquele idioma, com nome legível e variante', () => {
    render(<SeletorDeVoz idioma="en-US" />)
    expect(screen.getByRole('radiogroup', { name: 'Voz para inglês' })).toBeTruthy()
    const linhas = opcoes().map((o) => o.textContent)
    expect(linhas[0]).toContain('Automática')
    expect(marcada()?.textContent).toContain('Automática')
    // As naturais antes; "Microsoft", "Online (Natural)" e o nome do idioma saem do nome.
    expect(linhas.slice(1)).toEqual([
      'Google UK English FemaleReino Unido · Natural · Pela internet',
      'AriaEstados Unidos · Natural · Pela internet',
      'DavidEstados Unidos · No aparelho',
    ])
    expect(document.body.textContent).not.toContain('Maria')
  })

  it('o nome legível tira o fabricante e o sufixo do sistema, e não deixa o nome vazio', () => {
    expect(nomeLegivelDaVoz(ARIA)).toBe('Aria')
    expect(nomeLegivelDaVoz('Luciana (Enhanced)')).toBe('Luciana')
    expect(nomeLegivelDaVoz('Google português do Brasil')).toBe('Google português do Brasil')
    expect(nomeLegivelDaVoz('Microsoft')).toBe('Microsoft')
  })

  it('idioma sem voz no aparelho: só a "Automática", e a nota diz que não há voz instalada', () => {
    render(<SeletorDeVoz idioma="ja" />)
    expect(opcoes()).toHaveLength(1)
    expect(screen.getByTestId('sem-voz-do-aparelho').textContent).toBe('Nenhuma voz instalada para este idioma.')
  })
})

describe('a voz natural da nuvem', () => {
  it('sem a capacidade do plano, não aparece', () => {
    render(<SeletorDeVoz idioma="en" />)
    expect(screen.queryByRole('radio', { name: /Voz natural/ })).toBeNull()
  })

  it('o plano tem, mas a flag está desligada: não aparece (nada é prometido)', () => {
    palco.plano.vozNatural = true
    render(<SeletorDeVoz idioma="en" />)
    expect(screen.queryByRole('radio', { name: /Voz natural/ })).toBeNull()
  })

  it('com a capacidade e a flag: é a segunda opção, com a etiqueta e onde ela lê', () => {
    palco.plano.vozNatural = true
    definirEstadoDasFlags({ voz_natural: { ligada: true } })
    render(<SeletorDeVoz idioma="en" />)
    const natural = opcoes()[1]
    expect(natural.textContent).toContain('Voz natural')
    expect(natural.textContent).toContain('Nuvem')
    expect(natural.textContent).toContain('Lê no intérprete e na conversa virtual')
    // Continua sendo a automática a marcada: o comportamento de quem nunca escolheu não muda.
    expect(marcada()?.textContent).toContain('Automática')
    fireEvent.click(natural)
    expect(guardadas()).toEqual({ en: '@nuvem' })
    expect(marcada()?.textContent).toContain('Voz natural')
  })

  it('a escolha "voz natural" de quem perdeu a capacidade: marca a automática e diz o porquê', () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: '@nuvem' }))
    render(<SeletorDeVoz idioma="en" />)
    expect(marcada()?.textContent).toContain('Automática')
    expect(screen.getByTestId('voz-que-sumiu').textContent).toContain('não faz parte do seu plano')
  })
})

describe('escolher', () => {
  it('grava a voz do idioma no aparelho e na conta, e marca a opção', async () => {
    const aoEscolher = vi.fn()
    render(<SeletorDeVoz idioma="en-US" aoEscolher={aoEscolher} />)
    await act(async () => void fireEvent.click(screen.getByRole('radio', { name: /David/ })))
    expect(guardadas()).toEqual({ en: DAVID })
    expect(marcada()?.textContent).toContain('David')
    expect(aoEscolher).toHaveBeenCalledWith(DAVID)
    expect(palco.patch).toHaveBeenLastCalledWith({ preferencias: expect.objectContaining({ vozes: { en: DAVID } }) })
  })

  it('voltar à "Automática" apaga a escolha', async () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: DAVID }))
    render(<SeletorDeVoz idioma="en" />)
    expect(marcada()?.textContent).toContain('David')
    await act(async () => void fireEvent.click(screen.getByRole('radio', { name: /Automática/ })))
    expect(guardadas()).toEqual({})
    expect(marcada()?.textContent).toContain('Automática')
  })

  it('a voz guardada que não existe neste aparelho: a automática fica marcada e a tela avisa', () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: 'Samantha' }))
    render(<SeletorDeVoz idioma="en" />)
    expect(marcada()?.textContent).toContain('Automática')
    expect(screen.getByTestId('voz-que-sumiu').textContent).toBe(
      'A voz Samantha não existe neste aparelho. Lendo com a voz automática.',
    )
    // Nada foi apagado: no aparelho que tem a voz, ela volta a valer.
    expect(guardadas()).toEqual({ en: 'Samantha' })
  })
})

describe('a amostra', () => {
  it('toca uma frase curta no idioma com a voz daquela linha, e o botão vira "parar" enquanto toca', () => {
    render(<SeletorDeVoz idioma="en-US" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir uma amostra da voz David' }))
    const fala = faladas().at(-1)!
    expect(fala.text).toBe(fraseDeAmostra('en'))
    expect(fala.voice?.name).toBe(DAVID)
    expect(fala.lang).toBe('en-US')
    // Ouvir não é escolher.
    expect(guardadas()).toEqual({})
    const parar = screen.getByRole('button', { name: 'Parar a amostra' })
    expect(parar.getAttribute('aria-pressed')).toBe('true')
    act(() => fala.onend?.())
    expect(screen.queryByRole('button', { name: 'Parar a amostra' })).toBeNull()
  })

  it('a amostra da "Automática" é a automática de verdade, mesmo com outra voz escolhida', () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: DAVID }))
    render(<SeletorDeVoz idioma="en-US" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir uma amostra da voz Automática' }))
    expect(faladas().at(-1)?.voice?.name).toBe(ARIA)
  })

  it('a frase da amostra é do idioma da voz; sem frase pronta, o nome do idioma nele mesmo', () => {
    expect(fraseDeAmostra('pt-BR')).toMatch(/^Olá/)
    expect(fraseDeAmostra('ja')).toMatch(/こんにちは/)
    expect(fraseDeAmostra('fi')).toBe('suomi')
  })

  it('a amostra da voz natural vai à nuvem; se ela não responde, a tela diz que quem leu foi o aparelho', async () => {
    render(<SeletorDeVoz idioma="en" nuvem />)
    await act(
      async () => void fireEvent.click(screen.getByRole('button', { name: 'Ouvir uma amostra da voz Voz natural' })),
    )
    expect(palco.nuvem.falas).toEqual([{ texto: fraseDeAmostra('en'), lang: 'en-US' }])
    expect(faladas()).toHaveLength(0)
    expect(screen.queryByTestId('amostra-pela-reserva')).toBeNull()
    act(() => palco.nuvem.recuar?.())
    expect(screen.getByTestId('amostra-pela-reserva').textContent).toContain('lida pela voz do aparelho')
  })
})

describe('as portas', () => {
  it('a folha do intérprete tem uma lista por lado, cada uma no idioma que aquele lado ouve', async () => {
    render(<FolhaDasVozes lados={ladosDaVoz({ meu: 'pt-BR', outro: 'en-US' })} aoFechar={() => undefined} />)
    const folha = screen.getByTestId('folha-das-vozes')
    expect(within(folha).getByText(/Para você · português/i)).toBeTruthy()
    expect(within(folha).getByText(/Para a outra pessoa · inglês/i)).toBeTruthy()
    const doPortugues = within(folha).getByRole('radiogroup', { name: 'Voz para português' })
    const doIngles = within(folha).getByRole('radiogroup', { name: 'Voz para inglês' })
    await act(async () => void fireEvent.click(within(doPortugues).getByRole('radio', { name: /Maria/ })))
    await act(async () => void fireEvent.click(within(doIngles).getByRole('radio', { name: /Aria/ })))
    expect(guardadas()).toEqual({ pt: 'Microsoft Maria - Portuguese (Brazil)', en: ARIA })
  })

  it('Ajustes → Voz: uma linha por idioma que a pessoa usa, com a voz em uso, e o seletor num diálogo', async () => {
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: DAVID, es: 'Helena' }))
    render(<PainelDaVoz estudando="en-US" meu="pt-BR" />)
    const painel = within(screen.getByTestId('painel-da-voz'))
    // O que estuda, o dela, e o idioma para o qual já escolheu uma voz (que não existe aqui: automática).
    expect(painel.getByRole('button', { name: 'Voz para inglês: David' })).toBeTruthy()
    expect(painel.getByRole('button', { name: 'Voz para português: Automática' })).toBeTruthy()
    expect(painel.getByRole('button', { name: 'Voz para espanhol: Automática' })).toBeTruthy()

    fireEvent.click(painel.getByRole('button', { name: 'Voz para português: Automática' }))
    const dialogo = screen.getByRole('dialog', { name: 'Voz para português' })
    await act(async () => void fireEvent.click(within(dialogo).getByRole('radio', { name: /Maria/ })))
    expect(painel.getByRole('button', { name: 'Voz para português: Maria' })).toBeTruthy()
  })
})
