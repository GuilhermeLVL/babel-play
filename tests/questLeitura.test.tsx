// @vitest-environment jsdom
/**
 * A LEITURA NO QUEST (a rodada "todas as telas no desenho do headset", 02/10/2026): a tela nova monta, e
 * cada função da Leitura de sempre continua alcançável sem hover. Os modos de visualização e a largura,
 * a narração (pela voz do site, que é a que o Quest tem), "Voz, idioma e tom", o desenho livre, a
 * anotação por frase, o comentário em áudio, "Estudos & notas" e a folha da palavra.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

type Fala = (texto: string, opcoes: { lang: string; rate?: number; onEnd?: () => void }) => void

const palco = vi.hoisted(() => ({
  falas: [] as unknown[],
  cartoes: [] as unknown[],
  pendente: false,
  /** Os idiomas (base) para os quais há voz neste aparelho. */
  vozes: ['en'] as string[],
  falar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  calar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  fichar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchSessionTranscript: () =>
    palco.pendente
      ? new Promise(() => {})
      : Promise.resolve({ session: { sourceLang: 'en', targetLang: 'pt' }, utterances: palco.falas }),
  fetchDeck: () => Promise.resolve(palco.cartoes),
  fetchSettings: async () => null,
  searchImages: async () => [{ url: 'https://exemplo.test/flow.jpg', thumbnail: '' }],
}))
vi.mock('../src/lib/vocabWord', async (orig) => ({
  ...(await orig<typeof import('../src/lib/vocabWord')>()),
  buildVocabWord: async (origem: { word: string; context?: string }) => ({
    vocab: { word: origem.word, translation: `tradução de ${origem.word}`, example: origem.context, lang: 'en' },
    resolved: { lang: 'en', targetLang: 'pt' },
  }),
  resolveWord: async () => ({ lang: 'en', targetLang: 'pt' }),
  mtNoteFor: () => null,
}))
vi.mock('../src/lib/dictionary', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dictionary')>()),
  lookup: async () => ({ status: 'not-found', sourceUrl: 'https://exemplo.test/wiki' }),
}))
vi.mock('../src/lib/langDetect', () => ({
  detectLanguage: async () => null,
  hasNativeDetector: async () => false,
}))
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: (idioma: string) => palco.vozes.includes(idioma.toLowerCase().split('-')[0]),
  aparelhoTemVoz: () => false,
}))
vi.mock('../src/lib/tts', async (orig) => {
  palco.falar = vi.fn()
  palco.calar = vi.fn()
  return { ...(await orig<typeof import('../src/lib/tts')>()), speak: palco.falar, cancelSpeech: palco.calar }
})
vi.mock('../src/lib/adicionarAoDeck', async (orig) => {
  palco.fichar = vi.fn(async (c: { word: string; back: string }) => [
    { id: `novo-${c.word}`, word: c.word, translation: c.back, inDeck: true },
  ])
  return { ...(await orig<typeof import('../src/lib/adicionarAoDeck')>()), ficharCartao: palco.fichar }
})

import Reading from '../src/components/views/Reading'
import type { Recording } from '../src/types'

const gravacao: Recording = {
  id: 's1',
  title: 'Aula de produto',
  date: 'Ontem',
  durationStr: '0:30',
  wordCount: 20,
  type: 'audio',
  tags: [],
  status: 'Processado',
}

const FALAS = [
  {
    id: 'u1',
    sourceText: 'We need to improve retention.',
    translatedText: 'Precisamos melhorar a retenção.',
    sourceLang: 'en',
    targetLang: 'pt',
  },
  {
    id: 'u2',
    sourceText: 'The onboarding flow is long.',
    translatedText: 'O fluxo de entrada é longo.',
    sourceLang: 'en',
    targetLang: 'pt',
  },
  {
    id: 'u3',
    sourceText: 'Short steps help new users.',
    translatedText: 'Passos curtos ajudam quem chega.',
    sourceLang: 'en',
    targetLang: 'pt',
  },
]

async function montar() {
  const ir = vi.fn()
  const tela = render(<Reading recording={gravacao} onChangeView={ir} />)
  await act(async () => {})
  const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const frases = () => [...tela.container.querySelectorAll<HTMLButtonElement>('.ql-frase')]
  const narrador = () => within(screen.getByRole('toolbar', { name: 'Narração' }))
  return { ...tela, ir, botao, frases, narrador }
}

/** A folha aberta por último (a da palavra abre sobre a da frase). */
const folha = () => {
  const todas = screen.getAllByRole('dialog')
  return todas[todas.length - 1]
}
/** O que o motor de voz recebeu na última fala. */
const ultimaFala = () => (palco.falar.mock.calls.at(-1) ?? []) as Parameters<Fala>

beforeEach(() => {
  localStorage.clear()
  palco.falas = FALAS
  palco.cartoes = []
  palco.pendente = false
  palco.vozes = ['en']
  palco.falar.mockClear()
  palco.calar.mockClear()
  palco.fichar.mockClear()
  // O jsdom não desenha: a tela de desenho só precisa existir e receber o raio.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = () => ''
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('A leitura no Quest: o texto', () => {
  it('enquanto o texto não chega, mostra a forma do que vem; sem falas, diz que não há texto', async () => {
    palco.pendente = true
    const espera = await montar()
    expect(espera.container.querySelector('.ql')).toBeTruthy()
    expect(espera.container.querySelectorAll('.ql-texto .q-esqueleto')).toHaveLength(3)
    expect(
      espera
        .narrador()
        .getByRole('button', { name: /Narrar/ })
        .hasAttribute('disabled'),
    ).toBe(true)
    cleanup()

    palco.pendente = false
    palco.falas = []
    const vazia = await montar()
    expect(vazia.container.querySelector('.q-vazio h2')?.textContent).toBe('Sem texto nesta sessão')
  })

  it('cada frase é um alvo inteiro, com o original e a tradução; nada da tela de sempre', async () => {
    const { container, frases } = await montar()
    expect(container.querySelector('.barra-leitura, .leitura-grade, .frase')).toBeNull()
    expect(frases()).toHaveLength(3)
    expect(frases()[0].querySelector('.ql-o')?.textContent?.trim()).toBe(FALAS[0].sourceText)
    expect(frases()[0].querySelector('.ql-t')?.textContent).toBe(FALAS[0].translatedText)
  })

  it('as marcas por palavra de antes (grifo, nota, áudio) continuam no texto e em "Estudos & notas"', async () => {
    localStorage.setItem(
      'readingAnnotations:s1',
      JSON.stringify([
        {
          id: 'g1',
          type: 'highlight',
          textIndex: 0,
          wordIndex: '1-need',
          wordText: 'need',
          content: 'Marcação',
          createdAt: 1,
        },
        {
          id: 'n1',
          type: 'note',
          textIndex: 0,
          wordIndex: '3-improve',
          wordText: 'improve',
          content: 'verbo regular',
          createdAt: 2,
        },
        {
          id: 'a1',
          type: 'audio',
          textIndex: 1,
          wordIndex: '2-flow',
          wordText: 'flow',
          audioUrl: 'blob:x',
          createdAt: 3,
        },
      ]),
    )
    const { frases, botao } = await montar()
    const marcas = (i: number) =>
      [...frases()[i].querySelectorAll<HTMLElement>('[data-marca]')].map((m) => [m.textContent, m.dataset.marca])
    expect(marcas(0)).toEqual([
      ['need', 'grifo'],
      ['improve', 'nota'],
    ])
    expect(marcas(1)).toEqual([['flow', 'audio']])
    expect(frases()[0].querySelector('[data-marca="grifo"]')?.className).toContain('bg-warn-soft')
    expect(frases()[0].querySelector('[data-marca="nota"]')?.className).toContain('decoration-dashed')
    expect(frases()[1].querySelector('[data-marca="audio"]')?.className).toContain('decoration-double')
    // E a frase aberta nas opções mostra as mesmas marcas.
    fireEvent.click(frases()[0])
    expect(folha().querySelectorAll('.qs-folha-texto [data-marca]')).toHaveLength(2)
    fireEvent.click(within(folha()).getByRole('button', { name: 'Fechar' }))
    fireEvent.click(botao(/Estudos & notas/))
    expect(folha().querySelectorAll('.ql-nota')).toHaveLength(3)
    expect(folha().textContent).toContain('verbo regular')
  })

  it('"Ajustar exibição": intercalado, lado a lado ou só o original, e a largura', async () => {
    const { container, botao, frases } = await montar()
    const texto = () => container.querySelector<HTMLElement>('.ql-texto')!
    expect(texto().className).toContain('coluna')
    fireEvent.click(botao(/Ajustar exibição/))
    const grupo = (nome: string) => within(within(folha()).getByRole('group', { name: nome })).getAllByRole('button')
    expect(grupo('Modo de visualização').map((b) => b.textContent)).toEqual([
      'Intercalado',
      'Lado a lado',
      'Só o original',
    ])
    expect(grupo('Largura').map((b) => b.textContent)).toEqual(['Coluna', 'Largura total'])

    fireEvent.click(grupo('Modo de visualização')[1])
    expect(texto().className).toContain('lado-a-lado')
    fireEvent.click(grupo('Modo de visualização')[2])
    expect(frases()[0].querySelector('.ql-t')).toBeNull()
    fireEvent.click(grupo('Largura')[1])
    expect(texto().className).not.toContain('coluna')
    expect(localStorage.getItem('reading_layout_width')).toBe('full')
  })
})

describe('A leitura no Quest: narração', () => {
  it('"Narrar" lê pela voz do app, frase a frase, e a faixa diz onde está', async () => {
    const { frases, narrador, container } = await montar()
    expect(container.querySelectorAll('.ql-narrador .q-ctl.pri')).toHaveLength(1)
    expect(container.querySelector('.ql-onde')?.textContent).toBe('3 frases')
    fireEvent.click(narrador().getByRole('button', { name: /Narrar/ }))
    await act(async () => {})
    expect(ultimaFala()[0]).toBe(FALAS[0].sourceText)
    expect(ultimaFala()[1]).toMatchObject({ lang: 'en-US', rate: 1.25 })
    expect(frases()[0].classList.contains('narrando')).toBe(true)
    expect(container.querySelector('.ql-onde')?.textContent).toBe('Frase 1 de 3')

    // A frase terminou: a seguinte começa sozinha.
    await act(async () => ultimaFala()[1].onEnd?.())
    expect(ultimaFala()[0]).toBe(FALAS[1].sourceText)
    expect(frases()[1].classList.contains('narrando')).toBe(true)
  })

  it('pausar guarda o lugar, retomar relê a frase; anterior, próxima e parar', async () => {
    const { narrador, container } = await montar()
    fireEvent.click(narrador().getByRole('button', { name: /Narrar/ }))
    await act(async () => {})
    fireEvent.click(narrador().getByRole('button', { name: 'Próxima frase' }))
    await act(async () => {})
    expect(ultimaFala()[0]).toBe(FALAS[1].sourceText)

    fireEvent.click(narrador().getByRole('button', { name: /Pausar/ }))
    expect(palco.calar).toHaveBeenCalled()
    expect(container.querySelector('.ql-onde')?.textContent).toBe('Frase 2 de 3')
    palco.falar.mockClear()
    fireEvent.click(narrador().getByRole('button', { name: /Retomar/ }))
    await act(async () => {})
    expect(ultimaFala()[0]).toBe(FALAS[1].sourceText)

    fireEvent.click(narrador().getByRole('button', { name: 'Frase anterior' }))
    await act(async () => {})
    expect(ultimaFala()[0]).toBe(FALAS[0].sourceText)
    expect(narrador().getByRole('button', { name: 'Frase anterior' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(narrador().getByRole('button', { name: 'Parar e voltar ao início' }))
    expect(container.querySelector('.ql-frase.narrando')).toBeNull()
    expect(narrador().getByRole('button', { name: /Narrar/ })).toBeTruthy()
  })

  it('sem voz para o idioma, a narração não oferece um botão que não toca: diz o motivo', async () => {
    palco.vozes = []
    const { narrador, container, frases } = await montar()
    expect(
      narrador()
        .getByRole('button', { name: /Narrar/ })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(container.querySelector('.ql-onde')?.textContent).toContain('Sem voz para narrar')
    fireEvent.click(frases()[0])
    expect(within(folha()).queryByRole('button', { name: /Narrar a partir daqui/ })).toBeNull()
  })

  it('"Voz, idioma e tom": velocidade, o que narrar, idioma, voz e tom, e o aviso de voz ausente', async () => {
    const { narrador } = await montar()
    fireEvent.click(narrador().getByRole('button', { name: /Voz, idioma e tom/ }))
    const ajustes = within(screen.getByTestId('ajustes-do-narrador'))
    const grupo = (nome: string) => within(ajustes.getByRole('group', { name: nome })).getAllByRole('button')
    expect(grupo('Velocidade da narração').map((b) => b.textContent)).toEqual(['0,75×', '1×', '1,25×', '1,5×'])
    expect(grupo('O que narrar').map((b) => b.textContent)).toEqual(['Original', 'Tradução', 'Bilíngue', 'Auto'])
    expect(ajustes.getByRole('combobox', { name: 'Voz' })).toBeTruthy()
    expect(ajustes.getByRole('slider', { name: 'Tom da voz' })).toBeTruthy()
    expect(screen.getByTestId('ajustes-do-narrador').textContent).toContain('Força um idioma para toda a narração')
    expect(screen.queryByTestId('voz-ausente')).toBeNull()

    fireEvent.click(grupo('Velocidade da narração')[0])
    expect(grupo('Velocidade da narração')[0].getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('reading_narration_rate')).toBe('0.75')

    // Narrar a tradução (português): o site não tem voz para ela, e a folha diz isso.
    fireEvent.click(grupo('O que narrar')[1])
    expect(screen.getByTestId('voz-ausente').textContent).toMatch(/Sem voz neste aparelho para .*Portugu/i)
    fireEvent.change(ajustes.getByRole('slider', { name: 'Tom da voz' }), { target: { value: '1.3' } })
    expect(screen.getByTestId('ajustes-do-narrador').textContent).toContain('Tom · 1.3')
  })
})

describe('A leitura no Quest: a frase e a palavra', () => {
  it('tocar numa frase abre as opções: narrar dali, a anotação semântica e as palavras', async () => {
    const { frases } = await montar()
    fireEvent.click(frases()[1])
    const opcoes = within(screen.getByTestId('opcoes-da-frase'))
    expect(folha().querySelector('.qs-folha-texto')?.textContent?.trim()).toBe(FALAS[1].sourceText)
    expect(folha().querySelector('.qs-folha-trad')?.textContent).toBe(FALAS[1].translatedText)
    expect(
      within(opcoes.getByRole('group', { name: 'Anotar a frase' }))
        .getAllByRole('button')
        .map((b) => b.textContent?.trim()),
    ).toEqual(['Vocabulário', 'Gramática', 'Expressão', 'Dúvida', 'Áudio', 'Apagar'])
    expect([...folha().querySelectorAll('.qs-palavra')].map((p) => p.textContent)).toEqual([
      'The',
      'onboarding',
      'flow',
      'long',
    ])

    fireEvent.click(opcoes.getByRole('button', { name: /Narrar a partir daqui/ }))
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ultimaFala()[0]).toBe(FALAS[1].sourceText)
  })

  it('a anotação marca a frase, entra em "Estudos & notas" e pode ser removida', async () => {
    const { frases, botao } = await montar()
    expect(botao(/Estudos & notas/).querySelector('.qs-n')?.textContent).toBe('0')
    fireEvent.click(botao(/Estudos & notas/))
    expect(folha().textContent).toContain('Nenhum grifo ou nota')
    fireEvent.click(within(folha()).getByRole('button', { name: 'Fechar' }))

    fireEvent.click(frases()[0])
    fireEvent.click(within(folha()).getByRole('button', { name: 'Gramática' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(frases()[0].classList.contains('nota-gram')).toBe(true)
    expect(frases()[0].querySelector('.q-tag')?.textContent?.trim()).toBe('Gramática')
    expect(JSON.parse(localStorage.getItem('readingAnnotations:s1') ?? '[]')).toHaveLength(1)

    fireEvent.click(botao(/Estudos & notas/))
    const nota = folha().querySelector<HTMLElement>('.ql-nota')!
    expect(nota.textContent).toContain('Gramática')
    expect(nota.textContent).toContain(FALAS[0].sourceText)
    fireEvent.click(within(nota).getByRole('button', { name: 'Remover nota' }))
    expect(folha().textContent).toContain('Nenhum grifo ou nota')
    expect(frases()[0].classList.contains('nota-gram')).toBe(false)
  })

  it('"Apagar" tira a anotação da frase', async () => {
    const { frases } = await montar()
    fireEvent.click(frases()[2])
    fireEvent.click(within(folha()).getByRole('button', { name: 'Dúvida' }))
    expect(frases()[2].classList.contains('nota-duvida')).toBe(true)
    fireEvent.click(frases()[2])
    expect(within(folha()).getByRole('button', { name: 'Dúvida' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(folha()).getByRole('button', { name: 'Apagar' }))
    expect(frases()[2].className).not.toContain('nota-')
  })

  it('"Áudio" abre o gravador do comentário, no centro', async () => {
    const { frases } = await montar()
    fireEvent.click(frases()[0])
    fireEvent.click(within(folha()).getByRole('button', { name: 'Áudio' }))
    const gravador = screen.getByTestId('gravar-comentario')
    expect(gravador.textContent).toContain(FALAS[0].sourceText)
    expect(within(folha()).getByRole('heading', { name: 'Gravar comentário em áudio' })).toBeTruthy()
    expect(within(folha()).getByRole('button', { name: /Iniciar gravação/ })).toBeTruthy()
    fireEvent.click(within(folha()).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tocar numa palavra abre a folha dela: imagem, tradução, ouvir, deck, revisar e duelo', async () => {
    const { frases, ir } = await montar()
    fireEvent.click(frases()[1])
    fireEvent.click(within(folha()).getByRole('button', { name: 'flow' }))
    await act(async () => {})
    // A palavra é pronunciada ao abrir, no idioma da frase.
    expect(palco.falar).toHaveBeenCalledWith('flow', expect.objectContaining({ lang: 'en-US' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    const palavra = within(screen.getByTestId('folha-da-palavra').closest('dialog') as HTMLElement)
    expect(palavra.getByRole('heading', { name: 'flow' })).toBeTruthy()
    expect(folha().querySelector('.qp-traducao')?.textContent).toBe('tradução de flow')
    expect(folha().querySelector('.qp-imagem img')?.getAttribute('src')).toBe('https://exemplo.test/flow.jpg')
    expect(
      within(palavra.getByRole('group', { name: 'Velocidade do áudio' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['0,75×', '1×'])
    fireEvent.click(palavra.getByRole('button', { name: /^Ouvir$/ }))
    expect(palco.falar).toHaveBeenLastCalledWith('flow', expect.objectContaining({ lang: 'en-US', rate: 1 }))

    fireEvent.click(palavra.getByRole('button', { name: /Adicionar ao Deck/ }))
    await act(async () => {})
    expect(palco.fichar).toHaveBeenCalledWith(expect.objectContaining({ word: 'flow', sessionId: 's1' }))
    expect(folha().querySelector('.qp-no-deck')?.textContent).toContain('Já está no Deck')

    fireEvent.click(palavra.getByRole('button', { name: /Duelo com esta palavra/ }))
    await act(async () => {})
    expect(ir).toHaveBeenCalledWith(
      'play',
      expect.objectContaining({ id: 's1', seed: expect.objectContaining({ word: 'flow' }) }),
    )
  })
})

describe('A leitura no Quest: desenho livre', () => {
  it('o modo de desenho troca a dica pelas ferramentas e passa o raio para a tela de desenho', async () => {
    const { container, botao, frases } = await montar()
    const tela = () => container.querySelector<HTMLCanvasElement>('canvas.ql-tela-de-desenho')!
    expect(tela().style.pointerEvents).toBe('none')
    expect(container.querySelector('.ql-desenho')).toBeNull()

    fireEvent.click(botao(/Desenho livre/))
    expect(botao(/Desenho livre/).getAttribute('aria-pressed')).toBe('true')
    expect(tela().style.pointerEvents).toBe('auto')
    expect(container.querySelector('.ql-texto')?.className).toContain('desenhando')
    const ferramentas = within(screen.getByRole('group', { name: 'Ferramenta de desenho' })).getAllByRole('button')
    expect(ferramentas.map((f) => f.textContent?.trim())).toEqual(['Caneta', 'Marca-texto', 'Borracha'])
    fireEvent.click(ferramentas[1])
    expect(ferramentas[1].getAttribute('aria-pressed')).toBe('true')
    expect(botao(/Limpar tudo/)).toBeTruthy()

    // Desenhando, a frase não abre as opções.
    fireEvent.click(frases()[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(botao(/Modo interativo/))
    expect(tela().style.pointerEvents).toBe('none')
  })
})
