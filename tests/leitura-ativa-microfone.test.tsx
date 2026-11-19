// @vitest-environment jsdom
/**
 * O MICROFONE DA LEITURA EM VOZ ALTA (spec `leitura-ativa-voz-alta`): ele só liga por toque explícito. O ouvido local
 * é SIMULADO (`abrirOuvinteLocal` trocado) e a voz do aparelho também (`falar`/`cancelSpeech`): nada de áudio de
 * verdade e nenhuma rede.
 *
 * O que se prova: "Ouvir esta frase" religa o microfone só no fim da fala, com a tela aberta, ainda lendo e com a aba
 * visível (sair da tela, "Terminei", a fala cancelada e a aba em segundo plano NÃO religam); a aba em segundo plano
 * pausa ("Pausamos enquanto você estava fora.") e só volta com "Continuar"; o motor local que falha mostra "O
 * microfone parou." com "Ligar de novo" e "Seguir em silêncio"; "O Frasy se perdeu" aparece com o cursor parado e o
 * toque na palavra reposiciona; nada vai à rede durante a leitura em voz alta.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'
import textos from '../src/data/leitura/textos.json'

type Fala = { texto: string; onEnd?: () => void; onError?: () => void }
const voz = vi.hoisted(() => ({ falas: [] as Fala[], cancelamentos: 0 }))
vi.mock('../src/lib/tts', async (orig) => ({
  ...(await orig<typeof import('../src/lib/tts')>()),
  falar: (texto: string, _lang: string, o: { onEnd?: () => void; onError?: () => void } = {}) => {
    voz.falas.push({ texto, onEnd: o.onEnd, onError: o.onError })
    return true
  },
  /* Como no navegador: cancelar a fala dispara o `onerror` dela. */
  cancelSpeech: () => {
    voz.cancelamentos++
    const pendentes = voz.falas.splice(0)
    for (const f of pendentes) f.onError?.()
  },
}))

type Aberto = {
  aoParcial: (texto: string, final: boolean) => void
  aoFalhar: (f: 'sem-motor-local' | 'sem-microfone' | 'negado' | 'parou') => void
  parado: boolean
}
const ouvido = vi.hoisted(() => ({ abertos: [] as Aberto[] }))
vi.mock('../src/lib/leituraAtiva/ouvinteLocal', async (orig) => ({
  ...(await orig<typeof import('../src/lib/leituraAtiva/ouvinteLocal')>()),
  ouvinteDisponivel: () => true,
  abrirOuvinteLocal: (o: Pick<Aberto, 'aoParcial' | 'aoFalhar'>) => {
    /* Como o ouvido de verdade: a falha fatal já solta o motor. */
    const a: Aberto = {
      aoParcial: o.aoParcial,
      aoFalhar: (f) => {
        a.parado = true
        o.aoFalhar(f)
      },
      parado: false,
    }
    ouvido.abertos.push(a)
    return {
      parar: () => void (a.parado = true),
      descartar: () => {},
    }
  },
}))
vi.mock('../src/lib/vocabWord', async (orig) => ({
  ...(await orig<typeof import('../src/lib/vocabWord')>()),
  buildVocabWord: async (o: { word: string; context: string }) => ({
    vocab: { word: o.word, translation: '', example: o.context, lang: 'en' },
    resolved: null,
  }),
}))

const { default: SessaoDeLeitura } = await import('../src/components/views/leituraAtiva/SessaoDeLeitura')

const MERCADO = textos.find((t) => t.id === 'a1-no-mercado') as FichaDeTexto
const conhecimento = {
  conhecidas: new Set<string>(),
  sessoes: 0,
  temConta: false,
  noCaderno: (_chave: string): boolean => false,
}

/** Os ouvidos abertos e ainda ligados. */
const ligados = () => ouvido.abertos.filter((a) => !a.parado)
const estado = () => screen.getByTestId('estado-do-microfone')

function lerEmVozAlta() {
  const r = render(
    <SessaoDeLeitura
      ficha={MERCADO}
      conhecimento={conhecimento}
      protegido={false}
      aoVoltar={() => {}}
      aoTerminar={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('radio', { name: /Ler em voz alta/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }))
  expect(ligados()).toHaveLength(1)
  return r
}

let visibilidade: DocumentVisibilityState = 'visible'
function mudarVisibilidade(v: DocumentVisibilityState) {
  visibilidade = v
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

beforeEach(() => {
  voz.falas.length = 0
  voz.cancelamentos = 0
  ouvido.abertos.length = 0
  visibilidade = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade })
  try {
    localStorage.clear()
  } catch {
    /* sem armazenamento */
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('"Ouvir esta frase" e o microfone', () => {
  it('o microfone pausa durante a fala e religa no fim dela', () => {
    lerEmVozAlta()
    fireEvent.click(screen.getByRole('button', { name: /Ouvir esta frase/ }))
    expect(ligados()).toHaveLength(0)
    expect(estado().getAttribute('data-mic')).toBe('pausado')
    act(() => voz.falas[0].onEnd?.())
    expect(ligados()).toHaveLength(1)
    expect(estado().getAttribute('data-mic')).toBe('ouvindo')
  })

  it('sair da tela durante a fala: o cancelamento não liga o microfone', () => {
    const { unmount } = lerEmVozAlta()
    fireEvent.click(screen.getByRole('button', { name: /Ouvir esta frase/ }))
    const fala = voz.falas[0]
    unmount()
    expect(voz.cancelamentos).toBeGreaterThan(0)
    fala.onEnd?.()
    expect(ligados()).toHaveLength(0)
    expect(ouvido.abertos).toHaveLength(1)
  })

  it('"Terminei" durante a fala: o microfone não volta nas perguntas', () => {
    lerEmVozAlta()
    fireEvent.click(screen.getByRole('button', { name: /Ouvir esta frase/ }))
    const fala = voz.falas[0]
    fireEvent.click(screen.getByTestId('terminei'))
    act(() => fala.onEnd?.())
    expect(ligados()).toHaveLength(0)
    expect(ouvido.abertos).toHaveLength(1)
  })

  it('a fala que dá erro não liga o microfone; fica o "Continuar"', () => {
    lerEmVozAlta()
    fireEvent.click(screen.getByRole('button', { name: /Ouvir esta frase/ }))
    act(() => voz.falas[0].onError?.())
    expect(ligados()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy()
  })

  it('a fala termina com a aba em segundo plano: o microfone não liga e a tela diz que pausou', () => {
    lerEmVozAlta()
    fireEvent.click(screen.getByRole('button', { name: /Ouvir esta frase/ }))
    const fala = voz.falas[0]
    mudarVisibilidade('hidden')
    act(() => fala.onEnd?.())
    expect(ligados()).toHaveLength(0)
    mudarVisibilidade('visible')
    expect(ligados()).toHaveLength(0)
    expect(estado().textContent).toBe('Pausamos enquanto você estava fora.')
  })
})

describe('aba em segundo plano', () => {
  it('o microfone para na hora, diz "Pausamos enquanto você estava fora." e só volta com "Continuar"', () => {
    lerEmVozAlta()
    mudarVisibilidade('hidden')
    expect(ligados()).toHaveLength(0)
    mudarVisibilidade('visible')
    expect(ligados()).toHaveLength(0)
    expect(estado().textContent).toBe('Pausamos enquanto você estava fora.')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(ligados()).toHaveLength(1)
  })
})

describe('o motor local falha', () => {
  it('"O microfone parou." com "Ligar de novo" e "Seguir em silêncio"', () => {
    lerEmVozAlta()
    act(() => ouvido.abertos[0].aoFalhar('parou'))
    expect(estado().textContent).toBe('O microfone parou.')
    fireEvent.click(screen.getByRole('button', { name: 'Ligar de novo' }))
    expect(ouvido.abertos).toHaveLength(2)
    expect(estado().getAttribute('data-mic')).toBe('ouvindo')
    act(() => ouvido.abertos[1].aoFalhar('parou'))
    fireEvent.click(screen.getByRole('button', { name: 'Seguir em silêncio' }))
    expect(screen.queryByTestId('estado-do-microfone')).toBeNull()
    expect(screen.getByText('13 frases')).toBeTruthy()
    expect(ligados()).toHaveLength(0)
  })
})

describe('"O Frasy se perdeu um pouco"', () => {
  it('o cursor parado com fala ativa mostra o aviso; o toque na palavra reposiciona sem abrir o cartão', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const { container } = lerEmVozAlta()
    const a = ouvido.abertos[0]
    act(() => a.aoParcial('it is', false))
    expect(container.querySelector('[aria-current="true"]')?.textContent).toBe('Saturday')
    for (let s = 0; s < 6; s++) {
      act(() => a.aoParcial(`it is ${'hmm okay '.repeat(s + 1)}`, false))
      act(() => vi.advanceTimersByTime(1000))
    }
    expect(screen.getByTestId('frasy-se-perdeu')).toBeTruthy()
    const lia = [...container.querySelectorAll<HTMLButtonElement>('.la-palavra')].find((b) => b.textContent === 'Lia')!
    fireEvent.click(lia)
    expect(screen.queryByTestId('frasy-se-perdeu')).toBeNull()
    expect(lia.getAttribute('aria-current')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('privacidade', () => {
  it('nada vai à rede durante a leitura em voz alta (só texto local para o alinhador)', () => {
    const rede = vi.fn(() => Promise.reject(new Error('sem rede no teste')))
    vi.stubGlobal('fetch', rede)
    const enviar = vi.spyOn(XMLHttpRequest.prototype, 'send')
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
    lerEmVozAlta()
    const a = ouvido.abertos[0]
    act(() => a.aoParcial('it is saturday', false))
    act(() => a.aoParcial('it is saturday morning', true))
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(rede).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })
})

void React
