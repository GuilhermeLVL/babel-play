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

/* As rodadas, a missão e o caderno: simulados (nenhuma rede). */
const servidor = vi.hoisted(() => ({
  rodadas: [] as unknown[],
  missaoLeitura: { atual: 1, alvo: 1 } as { atual: number; alvo: number } | null,
  fichados: [] as Array<{ word: string; sentence: string }>,
  salvas: [] as string[],
}))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  salvarRodada: async (r: unknown) => {
    servidor.rodadas.push(r)
    return { ok: true }
  },
  lerMissoes: async () => ({
    missoes: servidor.missaoLeitura ? [{ id: 'leitura', tipo: 'leitura', ...servidor.missaoLeitura }] : [],
  }),
}))
vi.mock('../src/lib/adicionarAoDeck', async (orig) => ({
  ...(await orig<typeof import('../src/lib/adicionarAoDeck')>()),
  ficharCartao: async (c: { word: string; sentence: string }) => {
    servidor.fichados.push({ word: c.word, sentence: c.sentence })
    return [{ id: `c-${c.word}` }]
  },
}))
vi.mock('../src/lib/vocabWord', async (orig) => ({
  ...(await orig<typeof import('../src/lib/vocabWord')>()),
  buildVocabWord: async (o: { word: string; context: string }) => ({
    vocab: { word: o.word, translation: '', example: o.context, lang: 'en' },
    resolved: null,
  }),
}))
vi.mock('../src/lib/etiquetas/indiceDeEtiquetas', async (orig) => ({
  ...(await orig<typeof import('../src/lib/etiquetas/indiceDeEtiquetas')>()),
  marcarSalva: (w: string) => void servidor.salvas.push(w),
}))

const { default: SessaoDeLeitura } = await import('../src/components/views/leituraAtiva/SessaoDeLeitura')

const MERCADO = textos.find((t) => t.id === 'a1-no-mercado') as FichaDeTexto
const conhecimento = {
  conhecidas: new Set<string>(),
  sessoes: 0,
  temConta: true,
  noCaderno: (_chave: string): boolean => false,
}
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
  servidor.rodadas.length = 0
  servidor.fichados.length = 0
  servidor.salvas.length = 0
  servidor.missaoLeitura = { atual: 1, alvo: 1 }
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

describe('o texto pelo teclado', () => {
  it('o texto é uma parada de Tab só; as setas, Home e End andam de palavra em palavra', () => {
    const { container } = abrir()
    fireEvent.click(screen.getByRole('radio', { name: /Ler em silêncio/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    const palavras = [...container.querySelectorAll<HTMLButtonElement>('.la-palavra')]
    expect(palavras.length).toBeGreaterThan(50)
    expect(palavras.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(palavras[0].tabIndex).toBe(0)
    palavras[0].focus()
    fireEvent.keyDown(palavras[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(palavras[1])
    expect(palavras[1].tabIndex).toBe(0)
    expect(palavras[0].tabIndex).toBe(-1)
    fireEvent.keyDown(palavras[1], { key: 'End' })
    expect(document.activeElement).toBe(palavras.at(-1))
    fireEvent.keyDown(palavras.at(-1)!, { key: 'Home' })
    expect(document.activeElement).toBe(palavras[0])
    fireEvent.keyDown(palavras[0], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(palavras[0])
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

describe('o fim da leitura: rodada, missão e caderno', () => {
  /** Lê em silêncio (por `msLendo`), acerta a 1ª de primeira, pula as outras duas e pula a escrita. */
  async function lerAteOResumo(c = conhecimento, msLendo = 60_000) {
    render(
      <SessaoDeLeitura ficha={MERCADO} conhecimento={c} protegido={false} aoVoltar={() => {}} aoTerminar={() => {}} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: /Ler em silêncio/ }))
    const agora = Date.now()
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora)
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    relogio.mockReturnValue(agora + msLendo)
    fireEvent.click(screen.getByTestId('terminei'))
    relogio.mockRestore()
    const p1 = MERCADO.perguntas[0]
    fireEvent.click(screen.getByRole('button', { name: p1.opcoes[p1.correta] }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
  }

  it('com conta: uma rodada leituraAtiva só com o resultado; a missão fechada aparece no resumo', async () => {
    await lerAteOResumo()
    expect(servidor.rodadas).toHaveLength(1)
    const r = servidor.rodadas[0] as { exerciseKind: string; roundId: string; itens: unknown[] }
    expect(r.exerciseKind).toBe('leituraAtiva')
    expect(r.roundId).toMatch(/^leitura-a1-no-mercado-/)
    expect(r.itens).toEqual([
      { itemRef: 'a1-no-mercado#1', correct: 1, attempts: 1, kind: 'leitura' },
      { itemRef: 'a1-no-mercado#2', attempts: 0, kind: 'leitura' },
      { itemRef: 'a1-no-mercado#3', attempts: 0, kind: 'leitura' },
    ])
    expect(screen.getByTestId('missao-da-leitura').textContent).toBe('Missão do dia: Leia 1 texto ✓')
  })

  it('"Terminei" em 1 s: rápido demais para ter lido; nenhuma rodada sai e a missão não fecha', async () => {
    await lerAteOResumo(conhecimento, 1_000)
    expect(servidor.rodadas).toHaveLength(0)
    expect(screen.queryByTestId('missao-da-leitura')).toBeNull()
  })

  it('missão não sorteada: o resumo não fala dela', async () => {
    servidor.missaoLeitura = null
    await lerAteOResumo()
    expect(screen.queryByTestId('missao-da-leitura')).toBeNull()
  })

  it('sem conta: nenhuma rodada sai', async () => {
    await lerAteOResumo({ ...conhecimento, temConta: false })
    expect(servidor.rodadas).toHaveLength(0)
    expect(screen.getByText('Entre para guardar estas palavras e ganhar XP.')).toBeTruthy()
  })

  it('"Praticar estas palavras": cartão com a frase do texto e etiqueta salva; o que já está no caderno não duplica', async () => {
    /* "morning" já está no caderno; "friend" e "happy" são novas. */
    const noCaderno = (k: string) => k === 'morning'
    await lerAteOResumo({ ...conhecimento, noCaderno })
    const lista = screen.getByTestId('leitura-ativa-praticar')
    expect(lista.textContent).toContain('friend')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Praticar estas palavras' })))
    expect(servidor.fichados.map((f) => f.word)).not.toContain('morning')
    expect(servidor.fichados.find((f) => f.word === 'friend')?.sentence).toBe('Then Lia sees her friend Ben.')
    expect(servidor.salvas).toEqual(servidor.fichados.map((f) => f.word))
  })
})

void React
