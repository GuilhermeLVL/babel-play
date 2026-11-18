// @vitest-environment jsdom
/**
 * UM TEXTO DA LEITURA ATIVA, de ponta a ponta na tela (specs `leitura-ativa-voz-alta` e `leitura-ativa-acesso`):
 * sem reconhecimento local a voz alta fica esmaecida e os outros modos funcionam; "Ouvir primeiro" lê frase a frase
 * com a voz do aparelho (simulada) e destaca a frase da vez; no perfil protegido o aviso infantil vem antes de
 * qualquer reconhecedor, e o resumo não mostra palavras por minuto nem oferta de plano.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'
import textos from '../src/data/leitura/textos.json'

const falas = vi.hoisted(() => [] as Array<{ texto: string; onEnd?: () => void }>)
vi.mock('../src/lib/tts', async (orig) => ({
  ...(await orig<typeof import('../src/lib/tts')>()),
  falar: (texto: string, _lang: string, o: { onEnd?: () => void } = {}) => {
    falas.push({ texto, onEnd: o.onEnd })
    return true
  },
  cancelSpeech: () => {},
}))

const { default: SessaoDeLeitura } = await import('../src/components/views/leituraAtiva/SessaoDeLeitura')

const MERCADO = textos.find((t) => t.id === 'a1-no-mercado') as FichaDeTexto
const conhecimento = { conhecidas: new Set<string>(), sessoes: 0, temConta: true, noCaderno: () => false }
const iniciados: string[] = []

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

function comReconhecimentoLocal() {
  class Falso {
    lang = ''
    onresult = null
    onend = null
    start() {
      iniciados.push(this.lang)
    }
    stop() {}
    abort() {}
  }
  Object.defineProperty(Falso.prototype, 'processLocally', { value: false, writable: true })
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Falso
}

beforeEach(() => {
  falas.length = 0
  iniciados.length = 0
  try {
    localStorage.clear()
  } catch {
    /* sem armazenamento */
  }
})
afterEach(() => {
  cleanup()
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
})

describe('antes de ler', () => {
  it('sem reconhecimento local: "Ler em voz alta" esmaecido com a explicação; os outros dois funcionam', () => {
    abrir()
    const voz = screen.getByRole('radio', { name: /Ler em voz alta/ })
    expect(voz.getAttribute('aria-disabled')).toBe('true')
    expect(voz.textContent).toContain('ainda não consegue ouvir você sem mandar a voz para fora')
    fireEvent.click(voz)
    expect(voz.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: /Ler em silêncio/ }))
    expect(screen.getByRole('radio', { name: /Ler em silêncio/ }).getAttribute('aria-checked')).toBe('true')
  })

  it('o rodapé de crédito sai da ficha: equipe Frasy, criado com IA e revisado, CC BY 4.0', () => {
    const { container } = abrir()
    expect(container.textContent).toContain('Texto: equipe Frasy, criado com IA e revisado. Licença CC BY 4.0.')
    expect(container.textContent).toContain('Criado com IA e revisado por pessoas')
  })
})

describe('ouvir primeiro', () => {
  it('a voz do aparelho lê frase a frase e a frase da vez fica destacada', async () => {
    const { container } = abrir()
    fireEvent.click(screen.getByRole('radio', { name: /Ouvir primeiro/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(falas.map((f) => f.texto)).toEqual(['It is Saturday morning.'])
    expect(container.querySelector('.la-frase[data-atual="true"]')!.getAttribute('data-frase')).toBe('0')
    await act(async () => falas[0].onEnd?.())
    expect(falas.at(-1)!.texto).toBe('Lia and her dad go to the market.')
    expect(container.querySelector('.la-frase[data-atual="true"]')!.getAttribute('data-frase')).toBe('1')
    expect(screen.getByText('Frase 2 de 13')).toBeTruthy()
  })
})

describe('ler em voz alta no perfil protegido', () => {
  it('o aviso infantil vem antes de qualquer reconhecedor; "Agora não" volta sem ligar nada', () => {
    comReconhecimentoLocal()
    abrir(true)
    fireEvent.click(screen.getByRole('radio', { name: /Ler em voz alta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(screen.getByRole('dialog').textContent).toContain('Você pode desligar o microfone quando quiser.')
    expect(iniciados).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(iniciados).toEqual([])
    /* De novo: no perfil protegido o aviso aparece toda vez. */
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }))
    expect(iniciados).toEqual(['en-US'])
  })

  it('o resumo de um menor não mostra palavras por minuto nem plano', async () => {
    comReconhecimentoLocal()
    const { container } = abrir(true)
    fireEvent.click(screen.getByRole('radio', { name: /Ler em voz alta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }))
    fireEvent.click(screen.getByTestId('terminei'))
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    /* A escrita vem depois das perguntas, sem falar de plano para o menor. */
    expect(screen.getByTestId('leitura-ativa-escrita')).toBeTruthy()
    expect(container.textContent).not.toMatch(/plano/i)
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(screen.getByTestId('leitura-ativa-resumo')).toBeTruthy()
    expect(container.textContent).not.toContain('palavras por minuto')
    expect(container.textContent).not.toMatch(/plano|ranking|mais lidos/i)
  })
})

void React
