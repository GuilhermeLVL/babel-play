// @vitest-environment jsdom
/**
 * A TELA COM A VOZ LOCAL (openspec `leitura-ativa-com-moonshine`, 3.1 a 3.3): sem Web Speech local, "Ler em voz alta"
 * só fica disponível com a flag `leitura_voz_local`; o download do modelo pede aceite ANTES de qualquer requisição
 * e do microfone; falha no meio vira "O microfone parou." com "Ligar de novo" e "Seguir em silêncio". Com a flag
 * desligada a tela é a de hoje. O ouvido, o modelo e a voz do aparelho são simulados: nenhuma rede, nenhum áudio.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'
import textos from '../src/data/leitura/textos.json'

const flag = vi.hoisted(() => ({ ligada: false }))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  useFlag: (chave: string) => chave === 'leitura_voz_local' && flag.ligada,
}))

const modelo = vi.hoisted(() => ({ preparados: [] as string[], falha: false }))
vi.mock('../src/lib/fala/transcritorDaSombra', () => ({
  prepararSombraLocal: async (motor: string) => {
    if (modelo.falha) throw new Error('sem rede')
    modelo.preparados.push(motor)
  },
  liberarSombraLocal: () => {},
  transcreverFrase: async () => '',
  transcreverParcial: async () => null,
}))

vi.mock('../src/lib/tts', async (orig) => ({
  ...(await orig<typeof import('../src/lib/tts')>()),
  falar: () => true,
  cancelSpeech: () => {},
}))

type Aberto = { aoFalhar: (f: 'parou') => void; parado: boolean }
const ouvido = vi.hoisted(() => ({ abertos: [] as Aberto[] }))
vi.mock('../src/lib/leituraAtiva/ouvinteLocal', async (orig) => ({
  ...(await orig<typeof import('../src/lib/leituraAtiva/ouvinteLocal')>()),
  /* Sem Web Speech local neste navegador (Firefox, Safari, Quest). */
  ouvinteDisponivel: () => false,
  abrirOuvinteLocal: (o: { aoFalhar: Aberto['aoFalhar'] }) => {
    const a: Aberto = { aoFalhar: o.aoFalhar, parado: false }
    ouvido.abertos.push(a)
    return { parar: () => void (a.parado = true), descartar: () => {} }
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

function abrir(protegido = false) {
  return render(
    <SessaoDeLeitura
      ficha={MERCADO}
      conhecimento={conhecimento}
      protegido={protegido}
      aoVoltar={() => {}}
      aoTerminar={() => {}}
    />,
  )
}
const modoVozAlta = () => screen.getByRole('radio', { name: /Ler em voz alta/ })

beforeEach(() => {
  flag.ligada = false
  modelo.preparados.length = 0
  modelo.falha = false
  ouvido.abertos.length = 0
  try {
    localStorage.clear()
  } catch {
    /* sem armazenamento */
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('"Ler em voz alta" sem Web Speech local', () => {
  it('flag desligada: esmaecido, com a explicação de hoje, e nada é aberto', () => {
    abrir()
    expect(modoVozAlta().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/ainda não consegue ouvir você sem mandar a voz para fora/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(screen.queryByTestId('aviso-do-microfone')).toBeNull()
    expect(ouvido.abertos).toHaveLength(0)
    expect(modelo.preparados).toHaveLength(0)
  })

  it('flag ligada: habilitado; o aviso mostra o tamanho e NADA é baixado nem aberto antes do aceite', () => {
    flag.ligada = true
    const fetchEspiado = vi.fn()
    vi.stubGlobal('fetch', fetchEspiado)
    abrir()
    expect(modoVozAlta().getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(screen.getByTestId('aviso-do-download').textContent).toMatch(/\d+ MB/)
    expect(screen.getByRole('button', { name: 'Baixar e ligar o microfone' })).toBeTruthy()
    expect(modelo.preparados).toHaveLength(0)
    expect(ouvido.abertos).toHaveLength(0)
    expect(fetchEspiado).not.toHaveBeenCalled()
  })

  it('aquecimento: quem já aceitou carrega o modelo ao escolher o modo; quem não aceitou, nada', async () => {
    flag.ligada = true
    abrir()
    fireEvent.click(modoVozAlta())
    expect(modelo.preparados).toHaveLength(0)
    cleanup()
    localStorage.setItem('babel.sombraLocal.aceitou.local-moonshine-base', '1')
    localStorage.setItem('babel.sombraLocal.aceitou.local-moonshine-tiny', '1')
    abrir()
    fireEvent.click(modoVozAlta())
    await waitFor(() => expect(modelo.preparados).toHaveLength(1))
    expect(ouvido.abertos).toHaveLength(0) // o microfone só liga no "Começar"
  })

  it('"Agora não" não baixa nada', () => {
    flag.ligada = true
    abrir()
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(modelo.preparados).toHaveLength(0)
    expect(ouvido.abertos).toHaveLength(0)
  })

  it('o aceite baixa o modelo (tiny ou base) e só então liga o ouvido; o aceite fica guardado', async () => {
    flag.ligada = true
    abrir()
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Baixar e ligar o microfone' }))
    await waitFor(() => expect(ouvido.abertos).toHaveLength(1))
    expect(modelo.preparados).toHaveLength(1)
    expect(modelo.preparados[0]).toMatch(/^local-moonshine-(tiny|base)$/)
    expect(localStorage.getItem(`babel.sombraLocal.aceitou.${modelo.preparados[0]}`)).toBe('1')
  })

  it('perfil protegido: texto infantil do download e o aviso a cada sessão', () => {
    flag.ligada = true
    abrir(true)
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(screen.getByTestId('aviso-do-download').textContent).toMatch(/ajudante de \d+ MB/)
  })

  it('o download falha: avisa, não liga o microfone e deixa ler em silêncio', async () => {
    flag.ligada = true
    modelo.falha = true
    abrir()
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Baixar e ligar o microfone' }))
    await waitFor(() => expect(screen.getByTestId('preparo-do-moonshine').textContent).toMatch(/Não deu para baixar/))
    expect(ouvido.abertos).toHaveLength(0)
  })

  it('o motor falha no meio da leitura: "O microfone parou." com "Ligar de novo" e "Seguir em silêncio"', async () => {
    flag.ligada = true
    abrir()
    fireEvent.click(modoVozAlta())
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Baixar e ligar o microfone' }))
    await waitFor(() => expect(ouvido.abertos).toHaveLength(1))
    act(() => ouvido.abertos[0].aoFalhar('parou'))
    expect(screen.getByTestId('estado-do-microfone').getAttribute('data-mic')).toBe('parou')
    expect(screen.getByRole('button', { name: 'Ligar de novo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Seguir em silêncio' })).toBeTruthy()
  })
})
