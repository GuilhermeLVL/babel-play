// @vitest-environment jsdom
/**
 * A SESSÃO GRAVADA NO QUEST (a rodada "todas as telas no desenho do headset", 02/10/2026): a tela nova
 * monta, e cada função da Análise de sempre continua alcançável sem hover e sem duplo clique. O cabeçalho
 * (voltar, trocar de sessão, exportar, as quatro abas), a transcrição (o player, as falas com "Ouvir" e
 * "Opções", editar, praticar a pronúncia, as palavras, polir, ajustar exibição), os jogos e a visão geral.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const palco = vi.hoisted(() => ({
  falas: [] as unknown[],
  cartoes: [] as unknown[],
  falhar: false,
  pendente: false,
  pedidos: 0,
  voz: true,
  erroDoAudio: null as string | null,
  verbete: null as unknown,
  falar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  salvar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))

/** O aparelho do teste: o headset (o padrão desta suíte) ou o computador com o desenho novo ligado. */
const aparelho = vi.hoisted(() => ({ quest: true }))

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
vi.mock('../src/data/api', async (orig) => {
  palco.salvar = vi.fn(async (id: string, corpo: { sourceText: string; translatedText: string }) => ({ id, ...corpo }))
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchSessionTranscript: () => {
      palco.pedidos += 1
      if (palco.pendente) return new Promise(() => {})
      if (palco.falhar) return Promise.reject(new Error('fora do ar'))
      return Promise.resolve({ session: { sourceLang: 'en', targetLang: 'pt' }, utterances: palco.falas })
    },
    fetchDeck: () => Promise.resolve(palco.cartoes),
    fetchSettings: async () => null,
    updateUtterance: palco.salvar,
  }
})
// A folha da palavra busca as imagens no Wikcionário; aqui nenhuma palavra tem imagem e nada vai à rede.
vi.mock('../src/lib/imagens/imagensDaPalavra', () => ({ buscarImagensDaPalavra: async () => [] }))
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
  lookup: async () => palco.verbete ?? { status: 'not-found', sourceUrl: 'https://exemplo.test/wiki' },
}))
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: () => palco.voz,
  aparelhoTemVoz: () => false,
}))
vi.mock('../src/lib/tts', async (orig) => {
  palco.falar = vi.fn()
  return { ...(await orig<typeof import('../src/lib/tts')>()), speak: palco.falar }
})
vi.mock('../src/lib/audioDaSessao', async (orig) => ({
  ...(await orig<typeof import('../src/lib/audioDaSessao')>()),
  useAudioDaSessao: (_id: string, tem: boolean) => ({
    url: tem && !palco.erroDoAudio ? 'blob:audio' : null,
    carregando: false,
    erro: tem ? palco.erroDoAudio : null,
    refazer: () => false,
  }),
}))
/* O lobby dos jogos é de outra frente (e pesa 200 kB): aqui só importa que a aba o monte. */
vi.mock('../src/components/views/Play', () => ({
  default: ({ embutido }: { embutido?: boolean }) => <div data-testid="lobby-embutido">{String(embutido)}</div>,
}))
/* A Leitura tem o próprio teste (`questLeitura.test.tsx`). */
vi.mock('../src/components/views/Reading', () => ({
  default: () => <div data-testid="leitura" />,
}))

import TokensClicaveis from '../src/components/TokensClicaveis'
import Analysis from '../src/components/views/Analysis'
import { tokenizarTexto } from '../src/lib/vocabWord'
import type { Recording } from '../src/types'

const gravacao = (id: string, extra: Partial<Recording> = {}): Recording => ({
  id,
  title: `Reunião ${id}`,
  date: 'Ontem',
  durationStr: '0:12',
  wordCount: 14,
  type: 'audio',
  tags: [],
  status: 'Processado',
  audioUrl: `/api/sessions/${id}/audio`,
  ...extra,
})

const FALAS = [
  {
    id: 'u1',
    idx: 0,
    sourceText: 'We need to improve retention this quarter.',
    translatedText: 'Precisamos melhorar a retenção neste trimestre.',
    speakerName: 'Ana',
    sourceLang: 'en',
    targetLang: 'pt',
    tStartMs: 0,
    tEndMs: 4000,
    engine: 'whisper-local',
  },
  {
    id: 'u2',
    idx: 1,
    sourceText: 'Retention depends on the onboarding flow.',
    translatedText: 'A retenção depende do fluxo de entrada.',
    speakerName: 'Bruno',
    sourceLang: 'en',
    targetLang: 'pt',
    tStartMs: 5000,
    tEndMs: 9000,
    engine: 'whisper-local',
  },
]
const CARTAO = {
  id: 'c1',
  word: 'retention',
  translation: 'retenção',
  inDeck: true,
  sourceSessionId: 'a',
  sentence: 'We need to improve retention this quarter.',
  cefrLevel: 'B2',
}

function Tela({
  rec,
  todas,
  abaInicial,
  ir,
  trocar,
}: {
  rec: Recording
  todas: Recording[]
  abaInicial: string
  ir: (view: string, data?: unknown) => void
  trocar: (aba: string) => void
}) {
  const [aba, setAba] = useState(abaInicial)
  return (
    <Analysis
      onChangeView={ir}
      recording={rec}
      allRecordings={todas}
      subTab={aba}
      onSubTabChange={(nova) => {
        trocar(nova)
        // 'study' abre a revisão (outra tela, de outra frente): o teste só confere o pedido.
        if (nova !== 'study') setAba(nova)
      }}
      progress={{} as never}
      metrics={null}
    />
  )
}

async function montar(opcoes: { rec?: Recording; aba?: string } = {}) {
  const rec = opcoes.rec ?? gravacao('a')
  const ir = vi.fn()
  const trocar = vi.fn()
  const tela = render(
    <Tela rec={rec} todas={[rec, gravacao('b')]} abaInicial={opcoes.aba ?? 'transcript'} ir={ir} trocar={trocar} />,
  )
  await act(async () => {})
  const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const falas = () => [...tela.container.querySelectorAll<HTMLElement>('.qs-fala')]
  return { ...tela, ir, trocar, botao, falas }
}

/** A folha aberta por último (as folhas empilham: a da palavra abre sobre a da fala). */
const folha = () => {
  const todas = screen.getAllByRole('dialog')
  return todas[todas.length - 1]
}

let tocar: ReturnType<typeof vi.fn>
beforeEach(() => {
  aparelho.quest = true
  palco.falas = FALAS
  palco.cartoes = [CARTAO]
  palco.falhar = false
  palco.pendente = false
  palco.pedidos = 0
  palco.voz = true
  palco.erroDoAudio = null
  palco.verbete = null
  palco.falar.mockClear()
  palco.salvar.mockClear()
  tocar = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.play = tocar as unknown as HTMLMediaElement['play']
  HTMLMediaElement.prototype.pause = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('sem rede no teste')
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('A sessão no Quest: a casca', () => {
  it('as abas trocam o painel: Leitura, Jogos e Visão geral', async () => {
    const { trocar } = await montar()
    fireEvent.click(screen.getByRole('tab', { name: 'Leitura' }))
    expect(trocar).toHaveBeenLastCalledWith('reading')
    expect(screen.getByTestId('leitura')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Visão geral/ }))
    expect(screen.getByTestId('visao-geral-do-quest')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Visão geral/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('"Exportar" abre as quatro saídas; o vídeo continua na lista, bloqueado', async () => {
    const { botao } = await montar()
    fireEvent.click(botao(/Exportar/))
    const opcoes = [...folha().querySelectorAll<HTMLButtonElement>('.q-linha')]
    expect(opcoes.map((o) => o.querySelector('b')?.textContent?.trim())).toEqual([
      'Áudio da sessão',
      'Vídeo da sessão',
      'Flashcards para Anki',
      'Métricas e desempenho',
    ])
    expect(opcoes.map((o) => o.getAttribute('aria-disabled'))).toEqual([null, 'true', null, null])
  })
})

describe('A sessão no Quest: transcrição', () => {
  it('enquanto a transcrição não chega, mostra a forma do que vem', async () => {
    palco.pendente = true
    const { container, falas } = await montar()
    expect(screen.getByTestId('falas-carregando').querySelectorAll('.q-esqueleto')).toHaveLength(3)
    expect(falas()).toHaveLength(0)
    expect(container.querySelector('.q-vazio')).toBeNull()
  })

  it('o pedido falhou: a tela diz, e "Tentar de novo" repete o pedido', async () => {
    palco.falhar = true
    const { botao, falas } = await montar()
    expect(screen.getByRole('alert').textContent).toContain('Não deu para carregar a transcrição')
    const antes = palco.pedidos
    palco.falhar = false
    fireEvent.click(botao(/Tentar de novo/))
    await act(async () => {})
    expect(palco.pedidos).toBe(antes + 1)
    expect(falas()).toHaveLength(2)
  })

  it('sessão sem falas: o estado vazio, e não uma lista em branco', async () => {
    palco.falas = []
    const { container } = await montar()
    expect(container.querySelector('.q-vazio h2')?.textContent).toBe('Sem texto nesta sessão')
  })

  it('"Ajustar exibição": os cinco ajustes, e cada um vale na lista de falas', async () => {
    const { container, botao } = await montar()
    fireEvent.click(botao(/Ajustar exibição/))
    const grupo = (nome: string) => within(within(folha()).getByRole('group', { name: nome })).getAllByRole('button')
    expect(grupo('Ordem').map((b) => b.textContent)).toEqual(['Original primeiro', 'Tradução primeiro'])
    expect(grupo('Original').map((b) => b.textContent)).toEqual(['Mostrar', 'Ocultar'])
    expect(grupo('Tamanho').map((b) => b.textContent)).toEqual(['P', 'M', 'G', 'GG'])
    expect(grupo('Fonte').map((b) => b.textContent)).toEqual(['Sans', 'Serif', 'Mono'])
    expect(grupo('Tema do texto').map((b) => b.textContent)).toEqual(['Padrão', 'Sépia', 'Contraste', 'Oceano', 'Neon'])

    const lista = () => container.querySelector<HTMLElement>('.qs-falas')!
    fireEvent.click(grupo('Tamanho')[3])
    fireEvent.click(grupo('Fonte')[1])
    fireEvent.click(grupo('Tema do texto')[1])
    expect(lista().className).toContain('s-gigante')
    expect(lista().className).toContain('f-serif')
    expect(lista().className).toContain('t-sepia')

    fireEvent.click(grupo('Ordem')[1])
    const texto = lista().querySelector('.qs-fala-texto')!
    expect([...texto.children].map((c) => c.className)).toEqual(['qs-meta', 'qs-t', 'qs-o'])
    fireEvent.click(grupo('Original')[1])
    expect(lista().querySelector('.qs-o')).toBeNull()
    expect(lista().querySelector('.qs-t')).toBeTruthy()
  })
})

describe('A sessão no Quest: jogos e visão geral', () => {
  it('Jogos sem palavras desta sessão no caderno: só o lobby, sem a faixa', async () => {
    palco.cartoes = []
    const { container } = await montar({ aba: 'practice' })
    expect(container.querySelector('.qs-revisar')).toBeNull()
    expect(await screen.findByTestId('lobby-embutido')).toBeTruthy()
  })
})

/* O MESMO DESENHO NO COMPUTADOR (02/10/2026): o que era limite do headset (o raio que não acerta uma
   palavra, sem teclado físico, sem reconhecimento de fala, a voz do site) volta, dentro do desenho novo. */
describe('A sessão no computador com o desenho novo', () => {
  beforeEach(() => {
    aparelho.quest = false
  })

  it('sem áudio gravado e sem voz: o player diz o motivo sem falar da voz do site', async () => {
    palco.voz = false
    const { container } = await montar({ rec: gravacao('a', { audioUrl: undefined }) })
    const motivo = container.querySelector('.qs-player-sem-voz')?.textContent ?? ''
    expect(motivo).toContain('este navegador não tem voz de leitura')
    expect(motivo).not.toContain('voz do site')
  })
})

describe('TokensClicaveis fora das folhas do Quest', () => {
  it('sem `comoBotoes`, mostra a frase inteira (o Quest não troca o texto por botões sozinho)', () => {
    const frase = 'We need to improve retention.'
    const { container } = render(
      <TokensClicaveis
        tokens={tokenizarTexto(frase)}
        className="orig"
        estaNoDeck={() => false}
        onMouseEnter={() => {}}
        onMouseLeave={() => {}}
        onExaminar={() => {}}
      />,
    )
    expect(container.textContent?.trim()).toBe(frase)
    expect(container.querySelector('button')).toBeNull()
  })
})
