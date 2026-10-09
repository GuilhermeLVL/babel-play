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

type Fala = (texto: string, opcoes: { lang: string; rate?: number; onStart?: () => void; onEnd?: () => void }) => void

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

/**
 * O aparelho do teste: o headset (o padrão desta suíte) ou o computador com o desenho novo ligado.
 * `voz` = o aparelho tem voz de leitura própria (a `speechSynthesis` do navegador narra).
 */
const aparelho = vi.hoisted(() => ({ quest: true, voz: false }))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const m = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...m,
    perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: aparelho.quest ? 'quest' : 'desktop-com-gpu' }),
  }
})
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
  aparelhoTemVoz: () => aparelho.voz,
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
  aparelho.quest = true
  aparelho.voz = false
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
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** As palavras que a narração já marcou no texto. */
const ditas = (raiz: ParentNode) => [...raiz.querySelectorAll('.ql-frase .w.dita')].map((w) => w.textContent)

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
    // No desenho novo o texto abre na largura do cartão, como no protótipo (`telas3.js:72`).
    expect(texto().className).not.toContain('coluna')
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
    fireEvent.click(grupo('Largura')[0])
    expect(texto().className).toContain('coluna')
    expect(localStorage.getItem('reading_layout_width')).toBe('centered')
    fireEvent.click(grupo('Largura')[1])
    expect(texto().className).not.toContain('coluna')
    expect(localStorage.getItem('reading_layout_width')).toBe('full')
  })
})

describe('A leitura no Quest: narração', () => {
  it('"Narrar" lê pela voz do app, frase a frase, e a faixa diz onde está', async () => {
    const { frases, narrador, container } = await montar()
    expect(container.querySelectorAll('.ql-narrador .q-ctl.pri')).toHaveLength(1)
    // Parado, a faixa já diz "Frase 1 de N", como no protótipo (`telas3.js:25, 73`).
    expect(container.querySelector('.ql-onde')?.textContent).toBe('Frase 1 de 3')
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

    // A faixa é a do protótipo (`telas3.js:73`): anterior, o principal, próxima e a voz. Sem "Parar".
    expect(narrador().queryByRole('button', { name: 'Parar e voltar ao início' })).toBeNull()
    expect(narrador().getAllByRole('button')).toHaveLength(4)
  })

  /* O defeito relatado pelo dono: "pauso e o sublinhado continua, e marca tudo como se tivesse sido
     lido". A marcação andava num relógio próprio que a pausa não parava. */
  it('a marcação segue a fala: pausar não marca mais palavras; retomar relê a frase e a marcação dela', async () => {
    const { narrador, container } = await montar()
    vi.useFakeTimers()
    fireEvent.click(narrador().getByRole('button', { name: /Narrar/ }))
    await act(async () => {})
    // A voz do site ainda não começou a soar: nada marcado.
    expect(ditas(container)).toEqual([])
    act(() => ultimaFala()[1].onStart?.())
    expect(ditas(container)).toEqual(['We'])
    // A 1,25x, "We" leva (2 + 1) x 62 / 1,25 = 149 ms.
    act(() => void vi.advanceTimersByTime(200))
    expect(ditas(container)).toEqual(['We', 'need'])

    fireEvent.click(narrador().getByRole('button', { name: /Pausar/ }))
    act(() => void vi.advanceTimersByTime(10_000))
    expect(ditas(container)).toEqual(['We', 'need'])

    // A voz do site não pausa no meio: retomar relê a frase, e a marcação recomeça COM a fala.
    fireEvent.click(narrador().getByRole('button', { name: /Retomar/ }))
    await act(async () => {})
    expect(ultimaFala()[0]).toBe(FALAS[0].sourceText)
    expect(ditas(container)).toEqual([])
    act(() => ultimaFala()[1].onStart?.())
    expect(ditas(container)).toEqual(['We'])
    act(() => void vi.advanceTimersByTime(10_000))
    expect(ditas(container)).toEqual(['We', 'need', 'to', 'improve', 'retention.'])

    // A frase seguinte entra com a anterior marcada; "Frase anterior" (um salto) recomeça limpo.
    await act(async () => ultimaFala()[1].onEnd?.())
    act(() => ultimaFala()[1].onStart?.())
    expect(ditas(container)).toHaveLength(6)
    fireEvent.click(narrador().getByRole('button', { name: 'Frase anterior' }))
    await act(async () => {})
    expect(ditas(container)).toEqual([])
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
    // O chip é o do protótipo (`telas3.js:71`): só o nome, sem ícone e sem a contagem.
    expect(botao(/Estudos & notas/).textContent).toBe('Estudos & notas')
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

/* O MESMO DESENHO NO COMPUTADOR (02/10/2026): o que era limite do headset volta, dentro do desenho novo. */
describe('A leitura no computador com o desenho novo', () => {
  beforeEach(() => {
    aparelho.quest = false
  })

  it('no headset as palavras do texto não são alvos soltos: a frase inteira abre as opções', async () => {
    aparelho.quest = true
    const { container, frases } = await montar()
    expect(container.querySelector('.ql-palavra')).toBeNull()
    // A dica de como tocar não está no protótipo e saiu da tela.
    expect(container.querySelector('.ql .qs-apoio')).toBeNull()
    fireEvent.click(frases()[1].querySelector('.ql-o span') as HTMLElement)
    expect(screen.getByTestId('opcoes-da-frase')).toBeTruthy()
  })

  it('cada palavra do texto abre a folha dela com UM clique; o resto da frase abre as opções', async () => {
    const { container, frases } = await montar()
    expect(container.querySelector('.ql')).toBeTruthy()
    expect(container.querySelector('.ql .qs-apoio')).toBeNull()
    const palavra = [...frases()[1].querySelectorAll<HTMLElement>('.ql-palavra')].find((p) => p.textContent === 'flow')!
    fireEvent.click(palavra)
    await act(async () => {})
    // Só a folha da palavra (pronunciada ao abrir, no idioma da frase): as opções da frase não abrem.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(folha()).getByRole('heading', { name: 'flow' })).toBeTruthy()
    expect(palco.falar).toHaveBeenCalledWith('flow', expect.objectContaining({ lang: 'en-US' }))
    expect(folha().querySelector('.qp-imagem img')?.getAttribute('src')).toBe('https://exemplo.test/flow.jpg')
    fireEvent.click(within(folha()).getByRole('button', { name: 'Fechar' }))

    // Palavra curta ("is") não é alvo: o clique nela é o clique na frase.
    expect([...frases()[1].querySelectorAll('.ql-palavra')].map((p) => p.textContent)).toEqual([
      'The',
      'onboarding',
      'flow',
      'long.',
    ])
    fireEvent.click(frases()[1])
    expect(screen.getByTestId('opcoes-da-frase')).toBeTruthy()
  })

  it('desenhando, as palavras deixam de ser alvos (o traço é que vale)', async () => {
    const { container } = await montar()
    fireEvent.click(screen.getByRole('radio', { name: 'Desenho livre' }))
    expect(container.querySelector('.ql-palavra')).toBeNull()
  })

  it('"Voz, idioma e tom": a escolha de voz está lá, e a falta de voz fala do sistema, não do headset', async () => {
    const { narrador } = await montar()
    fireEvent.click(narrador().getByRole('button', { name: /Voz, idioma e tom/ }))
    const ajustes = within(screen.getByTestId('ajustes-do-narrador'))
    expect(ajustes.getByRole('combobox', { name: 'Voz' })).toBeTruthy()
    expect(screen.getByTestId('ajustes-do-narrador').textContent).not.toContain('No Quest a voz é a do site')
    fireEvent.click(within(ajustes.getByRole('group', { name: 'O que narrar' })).getAllByRole('button')[1])
    const aviso = screen.getByTestId('voz-ausente').textContent ?? ''
    expect(aviso).toMatch(/Seu sistema não tem voz instalada para .*Portugu/i)
    expect(aviso).not.toContain('voz do site')
  })
})

/* A VOZ DO NAVEGADOR (`speechSynthesis`): a marcação segue o aviso de palavra da própria fala, e a
   pausa do botão é a pausa da voz E da marcação. */
describe('A leitura com a voz do navegador: a marcação segue a fala', () => {
  class FalaFalsa {
    lang = ''
    voice: unknown = null
    rate = 1
    pitch = 1
    onstart: (() => void) | null = null
    onboundary: ((ev: { name?: string; charIndex: number }) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  const voz = {
    faladas: [] as FalaFalsa[],
    paused: false,
    speaking: false,
    /** `false` = o `pause()` deste navegador não pausa de fato (as vozes online do Chrome). */
    obedece: true,
    cancelamentos: 0,
    speak(u: FalaFalsa) {
      this.faladas.push(u)
      this.speaking = true
      this.paused = false
    },
    cancel() {
      this.cancelamentos++
      this.speaking = false
      this.paused = false
    },
    pause() {
      if (this.obedece) this.paused = true
    },
    resume() {
      this.paused = false
    },
    getVoices: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  const ultima = () => voz.faladas[voz.faladas.length - 1]

  beforeEach(() => {
    aparelho.quest = false
    aparelho.voz = true
    Object.assign(voz, { faladas: [], paused: false, speaking: false, obedece: true, cancelamentos: 0 })
    vi.stubGlobal('speechSynthesis', voz)
    vi.stubGlobal('SpeechSynthesisUtterance', FalaFalsa)
  })

  const narrar = async () => {
    const tela = await montar()
    vi.useFakeTimers()
    fireEvent.click(tela.narrador().getByRole('button', { name: /Narrar/ }))
    await act(async () => {})
    const principal = () => tela.container.querySelector('.ql-narrador .q-ctl.pri') as HTMLButtonElement
    return { ...tela, principal }
  }

  it('o aviso de palavra (boundary) marca a palavra que a voz está dizendo, e não um relógio', async () => {
    const { container, frases } = await narrar()
    const texto = FALAS[0].sourceText
    expect(ultima().text).toBe(texto)
    expect(ditas(container)).toEqual([])
    act(() => ultima().onstart?.())
    expect(ditas(container)).toEqual(['We'])
    act(() => ultima().onboundary?.({ name: 'word', charIndex: texto.indexOf('improve') }))
    expect(ditas(container)).toEqual(['We', 'need', 'to', 'improve'])
    // Quem manda é a voz: o tempo passa e nada mais é marcado até ela avisar.
    act(() => void vi.advanceTimersByTime(10_000))
    expect(ditas(container)).toEqual(['We', 'need', 'to', 'improve'])
    // O aviso de FRASE não diz palavra nenhuma.
    act(() => ultima().onboundary?.({ name: 'sentence', charIndex: 0 }))
    expect(ditas(container)).toHaveLength(4)
    act(() => ultima().onboundary?.({ name: 'word', charIndex: texto.indexOf('retention') }))
    expect(ditas(container)).toHaveLength(5)

    // A frase seguinte: a anterior fica marcada e a nova começa na primeira palavra.
    await act(async () => ultima().onend?.())
    expect(ultima().text).toBe(FALAS[1].sourceText)
    expect(frases()[1].classList.contains('narrando')).toBe(true)
    act(() => ultima().onstart?.())
    expect(ditas(container)).toEqual(['We', 'need', 'to', 'improve', 'retention.', 'The'])
  })

  it('a voz que não avisa cai na cadência pela velocidade; pausar não marca mais e retomar continua', async () => {
    const { container, principal } = await narrar()
    act(() => ultima().onstart?.())
    expect(ditas(container)).toEqual(['We'])
    // Sem aviso em 400 ms: a cadência estimada (a 1,25x) entra na palavra em que a voz deve estar.
    act(() => void vi.advanceTimersByTime(400))
    expect(ditas(container)).toEqual(['We', 'need', 'to'])

    fireEvent.click(principal())
    expect(principal().textContent?.trim()).toBe('Retomar')
    expect(voz.paused).toBe(true)
    act(() => void vi.advanceTimersByTime(3000))
    expect(ditas(container)).toEqual(['We', 'need', 'to'])
    expect(voz.cancelamentos, 'a voz pausou de verdade: a fala não é cancelada').toBe(1) // só o do início

    fireEvent.click(principal())
    expect(principal().textContent?.trim()).toBe('Pausar')
    expect(voz.paused).toBe(false)
    expect(ditas(container)).toEqual(['We', 'need', 'to'])
    act(() => void vi.advanceTimersByTime(3000))
    expect(ditas(container)).toEqual(['We', 'need', 'to', 'improve', 'retention.'])
    expect(voz.faladas, 'retomou a mesma fala, sem reler').toHaveLength(1)
  })

  it('o aviso que chega durante a pausa não marca nada', async () => {
    const { container, principal } = await narrar()
    act(() => ultima().onstart?.())
    fireEvent.click(principal())
    act(() => ultima().onboundary?.({ name: 'word', charIndex: FALAS[0].sourceText.indexOf('retention') }))
    expect(ditas(container)).toEqual(['We'])
  })

  it('o navegador que não pausa de fato: a fala é calada, e retomar relê a frase desde o começo', async () => {
    voz.obedece = false
    const { container, principal, frases } = await narrar()
    act(() => ultima().onstart?.())
    act(() => ultima().onboundary?.({ name: 'word', charIndex: 3 }))
    expect(ditas(container)).toEqual(['We', 'need'])

    fireEvent.click(principal())
    // O botão responde no mesmo clique, antes de se saber se a voz obedeceu.
    expect(principal().textContent?.trim()).toBe('Retomar')
    expect(voz.cancelamentos).toBe(1)
    act(() => void vi.advanceTimersByTime(250))
    expect(voz.cancelamentos, 'a voz seguia falando: a fala é cancelada').toBe(2)
    // O cancelamento dispara `onend`/`onerror` na fala velha: a narração não avança nem para.
    await act(async () => {
      ultima().onerror?.()
      ultima().onend?.()
    })
    expect(voz.faladas).toHaveLength(1)
    expect(principal().textContent?.trim()).toBe('Retomar')
    expect(frases()[0].classList.contains('narrando')).toBe(true)
    act(() => void vi.advanceTimersByTime(5000))
    expect(ditas(container)).toEqual(['We', 'need'])

    fireEvent.click(principal())
    await act(async () => {})
    expect(principal().textContent?.trim()).toBe('Pausar')
    expect(voz.faladas).toHaveLength(2)
    expect(ultima().text).toBe(FALAS[0].sourceText)
    expect(ditas(container)).toEqual([])
    act(() => ultima().onstart?.())
    expect(ditas(container)).toEqual(['We'])
  })

  it('a pausa longa (que o Chrome não retoma) também vira pausa por cancelamento', async () => {
    const { principal } = await narrar()
    act(() => ultima().onstart?.())
    fireEvent.click(principal())
    act(() => void vi.advanceTimersByTime(9000))
    expect(voz.cancelamentos).toBe(1)
    act(() => void vi.advanceTimersByTime(2000))
    expect(voz.cancelamentos).toBe(2)
    fireEvent.click(principal())
    await act(async () => {})
    expect(voz.faladas).toHaveLength(2)
  })

  it('dois cliques seguidos (pausar e retomar) não deixam o botão nem a fala trocados', async () => {
    const { container, principal } = await narrar()
    act(() => ultima().onstart?.())
    fireEvent.click(principal())
    fireEvent.click(principal())
    expect(principal().textContent?.trim()).toBe('Pausar')
    expect(voz.paused).toBe(false)
    // A conferência da pausa (250 ms) foi desarmada pelo segundo clique: nada é cancelado nem relido.
    act(() => void vi.advanceTimersByTime(1000))
    expect(voz.cancelamentos).toBe(1)
    expect(voz.faladas).toHaveLength(1)
    expect(ditas(container).length).toBeGreaterThan(1)

    // E três: fica pausado, com o rótulo certo.
    fireEvent.click(principal())
    fireEvent.click(principal())
    fireEvent.click(principal())
    expect(principal().textContent?.trim()).toBe('Retomar')
    expect(voz.paused).toBe(true)
  })
})

describe('A leitura no Quest: desenho livre', () => {
  it('o modo de desenho troca a dica pela barra de ferramentas e liga a tela de desenho', async () => {
    const { container, botao, frases } = await montar()
    // A tela de desenho é a `canvas.desenho-tela`; `data-ativo` diz se ela recebe o ponteiro.
    const tela = () => container.querySelector<HTMLCanvasElement>('canvas.desenho-tela')!
    expect(tela().getAttribute('data-ativo')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Ferramentas de desenho' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Desenho livre' }))
    expect(screen.getByRole('radio', { name: 'Desenho livre' }).getAttribute('aria-checked')).toBe('true')
    expect(tela().getAttribute('data-ativo')).toBe('true')
    expect(container.querySelector('.ql-texto')?.className).toContain('desenhando')
    const ferramentas = within(screen.getByRole('group', { name: 'Ferramenta de desenho' })).getAllByRole('button')
    expect(ferramentas.map((f) => f.textContent?.trim())).toEqual([
      'Caneta',
      'Caneta-tinteiro',
      'Pincel',
      'Marca-texto',
      'Borracha',
    ])
    fireEvent.click(ferramentas[3])
    expect(ferramentas[3].getAttribute('aria-pressed')).toBe('true')
    expect(botao(/Limpar tudo/)).toBeTruthy()

    // Desenhando, a frase não abre as opções.
    fireEvent.click(frases()[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Modo interativo' }))
    expect(tela().getAttribute('data-ativo')).toBe('false')
  })
})
