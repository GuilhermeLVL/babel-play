// @vitest-environment jsdom
/**
 * O VOCABULÁRIO NO QUEST (segunda rodada do desenho do headset, 01/10/2026): a tela nova monta, e cada
 * função da tela de sempre continua alcançável: as três ações do caderno (adicionar, trazer do Anki,
 * exportar), as quatro abas, o convite da revisão, as quatro fases, o catálogo (busca, ordem, filtros de
 * nível e origem, limpar, mostrar mais, erro e vazio), a palavra aberta no centro (ouvir, dicionários,
 * editar, suspender, excluir com desfazer, exercitar, revisar) e os painéis de análise.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

type Fn = ReturnType<(typeof import('vitest'))['vi']['fn']>
const api = vi.hoisted(() => ({
  deck: [] as unknown[],
  falas: [] as unknown[],
  paginas: [] as string[],
  erroNoCatalogo: false,
  cursor: null as null | { valor: unknown; id: string },
  atualizar: null as unknown as Fn,
  apagar: null as unknown as Fn,
}))
const aparelho = vi.hoisted(() => ({ vozes: new Set<string>(['en']) }))
const anki = vi.hoisted(() => ({ baralhos: [] as unknown[] }))
const avisos = vi.hoisted(() => ({ ok: null as unknown as Fn, aviso: null as unknown as Fn }))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/voz/haVoz', () => ({
  haVozPara: (idioma: string) => aparelho.vozes.has((idioma || '').toLowerCase().split('-')[0]),
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG, onLangConfigChange: () => () => {} }
})
vi.mock('../src/lib/dictionary', () => ({ lookup: vi.fn(async () => null), forvoUrl: () => '#forvo', wiktionaryUrl: () => '#wiki' }))
vi.mock('../src/data/apiAnki', () => ({
  listarBaralhosAnki: async () => anki.baralhos,
  ativarNotasDoBaralho: vi.fn(),
  desativarBaralho: vi.fn(),
  listarNotasDoBaralho: vi.fn(),
  purgarBaralho: vi.fn(),
}))
vi.mock('../src/components/Toast', async (orig) => {
  avisos.ok = vi.fn()
  avisos.aviso = vi.fn()
  return {
    ...(await orig<typeof import('../src/components/Toast')>()),
    toast: { ok: avisos.ok, error: vi.fn(), warn: avisos.aviso, info: vi.fn() },
  }
})
vi.mock('../src/data/api', async (orig) => {
  api.atualizar = vi.fn(async (id: string, patch: object) => ({
    ...(api.deck as Array<{ id: string }>).find((c) => c.id === id),
    ...patch,
  }))
  api.apagar = vi.fn(async () => undefined)
  const resposta = (corpo: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, statusText: ok ? 'OK' : 'Erro do servidor', json: async () => corpo })
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchDeck: async () => api.deck,
    fetchAllUtterances: async () => api.falas,
    fetchExerciseResults: async () => [],
    fetchMetrics: async () => null,
    fetchMemoriaDoCartao: async () => ({ revisoes: 4, acertos: 3 }),
    fetchOcorrencias: async () => [],
    fetchSessionTranscript: vi.fn(),
    updateCard: api.atualizar,
    deleteCard: api.apagar,
    apiFetch: vi.fn(async (url: string) => {
      if (url.startsWith('/api/vocab/inicio-da-contagem')) return resposta({ inicioEm: null, totalLegado: 0, total: 3 })
      if (!url.startsWith('/api/vocab/pagina')) return resposta(null, false)
      api.paginas.push(url)
      if (api.erroNoCatalogo) return resposta(null, false)
      const p = new URL(url, 'http://x').searchParams
      const niveis = (p.get('niveis') ?? '').split(',').filter(Boolean)
      const q = (p.get('q') ?? '').toLowerCase()
      const itens = (api.deck as Array<{ id: string; word: string; translation: string; cefrLevel?: string }>)
        .filter((c) => (!niveis.length || niveis.includes(c.cefrLevel ?? 'ausente')) && (!q || c.word.includes(q)))
        .map((c) => ({
          id: c.id,
          word: c.word,
          back: c.translation || null,
          cefrLevel: c.cefrLevel ?? null,
          cefrSource: 'wordlist',
          occurrences: 1,
          lastSeenAt: null,
          firstSeenAt: null,
          difficultyScore: null,
          dueAt: null,
          origens: ['sessao'],
        }))
      return resposta({ itens, total: itens.length, proximoCursor: api.cursor, porOrigem: { sessao: itens.length, trilha: 0, manual: 0, legado: 0 } })
    }),
  }
})

import Metrics from '../src/components/views/Metrics'
import type { AppMetrics } from '../src/data/api'
import type { VocabCard } from '../src/types'

const cartao = (id: string, word: string, translation: string, extra: Partial<VocabCard> = {}): VocabCard =>
  ({
    id,
    word,
    translation,
    phonetics: '',
    explanation: '',
    sentence: `I saw a ${word} yesterday.`,
    srcLang: 'en',
    tgtLang: 'pt',
    cefrLevel: 'B1',
    inDeck: true,
    leitnerBox: 1,
    leitnerDueAt: '',
    fsrsState: 'Review',
    fsrsStability: 4,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0.9,
    fsrsDueAt: '',
    dueAtMs: Date.now() - 86_400_000,
    sourceSessionId: 's1',
    ...extra,
  }) as unknown as VocabCard

const metricas = (extra: Partial<AppMetrics> = {}): AppMetrics =>
  ({
    dueToday: 2,
    newCards: 1,
    deckSize: 3,
    accuracy: 0.8,
    accuracyConfidence: 1,
    streakDays: 4,
    revisoesRecentes: [Date.now(), Date.now()],
    levelDistribution: [
      { level: 'B1', count: 15 },
      { level: 'C1', count: 5 },
    ],
    levelConfidence: 0.7,
    uniqueWords: 120,
    wordsCaptured: 300,
    speakingMs: 0,
    wpm: 0,
    wpmConfidence: 0,
    ...extra,
  }) as unknown as AppMetrics

async function montar(props: Partial<React.ComponentProps<typeof Metrics>> = {}) {
  const ir = vi.fn()
  const tela = render(<Metrics recordings={[]} onChangeView={ir} metrics={metricas()} {...props} />)
  await act(async () => {})
  await act(async () => {})
  const palco = () => tela.container.querySelector('.q-palco.qv') as HTMLElement
  const botao = (nome: RegExp | string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  const aba = (nome: RegExp | string) => screen.getByRole('tab', { name: nome })
  const painel = () => screen.getByRole('tabpanel')
  const tocar = async (el: Element) => {
    fireEvent.click(el)
    await act(async () => {})
    await act(async () => {})
  }
  const linhas = () => [...tela.container.querySelectorAll<HTMLTableRowElement>('.qv-tabela tbody tr')]
  return { ...tela, ir, palco, botao, aba, painel, tocar, linhas }
}

beforeEach(() => {
  localStorage.clear()
  api.deck = [
    cartao('c1', 'cat', 'gato', { fsrsState: 'New' }),
    cartao('c2', 'dog', 'cão', { cefrLevel: 'A2', fsrsState: 'Learning' }),
    cartao('c3', 'bird', 'pássaro'),
  ]
  api.falas = []
  api.paginas = []
  api.erroNoCatalogo = false
  api.cursor = null
  aparelho.vozes = new Set(['en'])
  anki.baralhos = []
  api.atualizar.mockClear()
  api.apagar.mockClear()
  avisos.ok.mockClear()
  avisos.aviso.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Vocabulário no Quest', () => {
  it('o cabeçalho com as três ações do caderno e as quatro abas', async () => {
    const { palco } = await montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Vocabulário' })).toBeTruthy()
    expect([...palco().querySelectorAll('.q-cab .q-ctl')].map((b) => b.textContent?.trim())).toEqual([
      'Palavra',
      'Trazer do Anki',
      'Exportar',
    ])
    // A frase que explica a tela continua escrita.
    expect(palco().querySelector('.qv-sub')?.textContent).toContain('As palavras que você guardou')
    expect(screen.getAllByRole('tab').map((a) => a.textContent?.trim())).toHaveLength(4)
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').dataset.painel).toBe('palavras')
  })

  it('Minhas palavras: o convite da revisão é o único botão principal, e as quatro fases têm número', async () => {
    const { palco, botao, ir } = await montar()
    const convite = screen.getByTestId('convite-da-revisao')
    expect(convite.querySelector('.qv-contagem')?.textContent).toBe('2')
    expect(convite.textContent).toContain('1 nova')
    expect(convite.textContent).toContain('3 no total')
    expect(palco().querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Revisar agora/))
    expect(ir).toHaveBeenCalledWith('study')

    const fases = [...screen.getByTestId('fases-do-baralho').querySelectorAll('.q-num')].map((n) => [
      n.querySelector('.q-rotulo')?.textContent,
      n.querySelector('b')?.textContent,
    ])
    expect(fases).toEqual([
      ['Guardadas', '3'],
      ['Novas', '1'],
      ['Aprendendo', '1'],
      ['Em revisão', '1'],
    ])
  })

  it('sem nada vencendo, a tela diz que está tudo em dia e oferece o Jogar', async () => {
    const { botao, ir } = await montar({ metrics: metricas({ dueToday: 0 }) })
    expect(screen.queryByTestId('convite-da-revisao')).toBeNull()
    expect(screen.getByTestId('tudo-revisado').textContent).toContain('Tudo revisado por hoje.')
    fireEvent.click(botao(/Abrir Jogar/))
    expect(ir).toHaveBeenCalledWith('play')
  })

  it('o catálogo lista as palavras com tradução, nível, origem e estado, e diz quantas são', async () => {
    const { linhas } = await montar()
    const catalogo = screen.getByTestId('catalogo-no-quest')
    expect(catalogo.querySelector('.qv-quantas')?.textContent).toBe('3 de 3 no caderno')
    expect(catalogo.textContent).toContain('Busque, filtre por nível e origem.')
    const celula = (c: Element) => c.querySelector('.q-tag')?.textContent?.trim() ?? c.textContent?.trim()
    expect(linhas().map((l) => [...l.querySelectorAll('td')].map(celula))).toEqual([
      ['cat', 'gato', 'B1', 'Sessão', 'Nova'],
      ['dog', 'cão', 'A2', 'Sessão', 'Aprendendo'],
      ['bird', 'pássaro', 'B1', 'Sessão', 'Em revisão'],
    ])
    // De onde veio o nível: escrito na linha (no headset não há dica ao apontar).
    expect(linhas().map((l) => l.querySelector('.qv-fonte')?.textContent)).toEqual([
      'lista CEFR-J',
      'lista CEFR-J',
      'lista CEFR-J',
    ])
  })

  it('busca (com a espera de 300 ms) e ordem vão ao servidor', async () => {
    vi.useFakeTimers()
    const { linhas } = await montar()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar palavra' }), { target: { value: 'do' } })
    await act(async () => {
      vi.advanceTimersByTime(320)
    })
    await act(async () => {})
    expect(api.paginas.at(-1)).toContain('q=do')
    expect(linhas().map((l) => l.dataset.palavra)).toEqual(['dog'])

    const ordem = screen.getByRole('combobox', { name: 'Ordenar' }) as HTMLSelectElement
    expect([...ordem.options].map((o) => o.textContent)).toEqual([
      'Mais recentes',
      'Mais vistas',
      'Mais difíceis',
      'A → Z',
      'Nível',
    ])
    fireEvent.change(ordem, { target: { value: 'alfabetica' } })
    await act(async () => {})
    expect(api.paginas.at(-1)).toContain('ordem=alfabetica')
  })

  it('os filtros ficam atrás de "Filtros": sete níveis, quatro origens e Limpar', async () => {
    const { botao, tocar, linhas } = await montar()
    const filtros = botao(/Filtros/)
    expect(filtros.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Nível' })).toBeNull()

    await tocar(filtros)
    const niveis = within(screen.getByRole('group', { name: 'Nível' })).getAllByRole('button')
    const origens = within(screen.getByRole('group', { name: 'Origem' })).getAllByRole('button')
    expect(niveis).toHaveLength(7)
    expect(origens).toHaveLength(4)
    // Nível sem palavra nenhuma não é um alvo.
    expect((niveis.find((n) => n.textContent?.startsWith('C2')) as HTMLButtonElement).disabled).toBe(true)

    await tocar(niveis.find((n) => n.textContent?.startsWith('A2')) as HTMLElement)
    expect(api.paginas.at(-1)).toContain('niveis=A2')
    expect(linhas().map((l) => l.dataset.palavra)).toEqual(['dog'])
    expect(filtros.querySelector('.q-tag')?.textContent).toBe('1')

    await tocar(origens.find((o) => o.textContent?.startsWith('Sessão')) as HTMLElement)
    expect(api.paginas.at(-1)).toContain('origens=sessao')

    await tocar(botao(/^Limpar$/))
    expect(linhas()).toHaveLength(3)
    expect(filtros.querySelector('.q-tag')).toBeNull()
  })

  it('"Mostrar mais" pede a página seguinte; erro e vazio têm o seu estado', async () => {
    api.cursor = { valor: 1, id: 'c3' }
    const com = await montar()
    await com.tocar(com.botao(/Mostrar mais \(3 de 3\)/))
    expect(api.paginas.at(-1)).toContain('cursorId=c3')
    cleanup()

    api.cursor = null
    api.erroNoCatalogo = true
    const erro = await montar()
    expect(screen.getByRole('alert').textContent).toContain('Não consegui carregar seu vocabulário.')
    api.erroNoCatalogo = false
    await erro.tocar(erro.botao(/Tentar de novo/))
    expect(erro.linhas()).toHaveLength(3)
    cleanup()

    api.deck = []
    await montar({ metrics: metricas({ deckSize: 0, dueToday: 0 }) })
    expect(screen.getByTestId('catalogo-no-quest').textContent).toContain('Seu vocabulário está vazio')
  })

  it('busca sem resultado: a tela diz e "Limpar filtros" devolve a lista', async () => {
    vi.useFakeTimers()
    const { botao, linhas } = await montar()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar palavra' }), { target: { value: 'zzz' } })
    await act(async () => {
      vi.advanceTimersByTime(320)
    })
    await act(async () => {})
    expect(screen.getByTestId('catalogo-no-quest').textContent).toContain('Nada com esses filtros')
    fireEvent.click(botao(/Limpar filtros/))
    await act(async () => {
      vi.advanceTimersByTime(320)
    })
    await act(async () => {})
    expect(linhas()).toHaveLength(3)
  })

  it('palavras sem tradução: o aviso leva aos Ajustes', async () => {
    api.deck = [cartao('c1', 'cat', ''), cartao('c2', 'dog', 'cão')]
    const { botao, ir } = await montar()
    expect(screen.getByTestId('catalogo-no-quest').textContent).toContain('1 palavra está sem tradução.')
    fireEvent.click(botao(/Conferir os dois idiomas/))
    expect(ir).toHaveBeenCalledWith('settings')
  })

  it('tocar numa linha abre a palavra no centro, com ouvir, velocidade, dicionários e a memória', async () => {
    const { linhas, tocar } = await montar()
    await tocar(linhas()[0])
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.classList.contains('gaveta')).toBe(true)
    const d = within(dialogo)
    expect(d.getByRole('heading', { name: 'cat' })).toBeTruthy()
    const ouvir = d.getByRole('button', { name: /Ouvir/ })
    expect(ouvir.getAttribute('data-precisa')).toBeNull()
    expect(d.getByRole('radiogroup', { name: 'Velocidade da pronúncia' })).toBeTruthy()
    expect(d.getByRole('link', { name: /Wiktionary/ })).toBeTruthy()
    expect(d.getByRole('link', { name: /Forvo/ })).toBeTruthy()
    expect(dialogo.textContent).toContain('Tradução automática')
    expect(dialogo.textContent).toContain('Dicionário')
    expect(dialogo.textContent).toContain('Na sua memória')
    expect(dialogo.textContent).toContain('3 de 4')
  })

  it('sem voz para o idioma da palavra, ouvir e a velocidade não aparecem', async () => {
    api.deck = [cartao('d1', 'katze', 'gato', { srcLang: 'de' })]
    const { linhas, tocar } = await montar()
    await tocar(linhas()[0])
    const d = within(screen.getByRole('dialog'))
    expect(d.getByRole('button', { name: /Ouvir/ }).getAttribute('data-precisa')).toBe('voz')
    expect(d.queryByRole('radiogroup', { name: 'Velocidade da pronúncia' })).toBeNull()
  })

  it('na palavra aberta: editar e salvar, suspender, exercitar e revisar', async () => {
    const { linhas, tocar, ir } = await montar()
    await tocar(linhas()[0])
    let d = within(screen.getByRole('dialog'))

    await tocar(d.getByRole('button', { name: /^Editar$/ }))
    const traducao = d.getByLabelText('Tradução') as HTMLInputElement
    expect(d.getByLabelText('Frase de exemplo')).toBeTruthy()
    expect(d.getByLabelText('Nível')).toBeTruthy()
    fireEvent.change(traducao, { target: { value: 'gatinho' } })
    await tocar(d.getByRole('button', { name: /Salvar/ }))
    expect(api.atualizar).toHaveBeenCalledWith('c1', expect.objectContaining({ translation: 'gatinho' }))

    d = within(screen.getByRole('dialog'))
    await tocar(d.getByRole('button', { name: /Suspender/ }))
    expect(api.atualizar).toHaveBeenLastCalledWith('c1', { inDeck: false })
    expect(d.getByRole('button', { name: /Reativar/ })).toBeTruthy()

    await tocar(d.getByRole('button', { name: /Exercitar/ }))
    expect(ir).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ seed: expect.objectContaining({ word: 'cat' }) }))
  })

  it('excluir pede dois toques, e o aviso oferece desfazer por 8 segundos', async () => {
    const { linhas, tocar } = await montar()
    await tocar(linhas()[1])
    const d = within(screen.getByRole('dialog'))
    await tocar(d.getByRole('button', { name: /^Excluir$/ }))
    expect(avisos.aviso).toHaveBeenCalledTimes(1)
    await tocar(d.getByRole('button', { name: /Confirmar exclusão/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const [texto, opcoes] = avisos.ok.mock.calls.at(-1) as [string, { duration: number; action: { label: string; onClick: () => void } }]
    expect(texto).toContain('dog')
    expect(opcoes.duration).toBe(8000)
    expect(opcoes.action.label).toBe('Desfazer')
    expect(api.apagar).not.toHaveBeenCalled()
  })

  it('"Revisar", na palavra aberta, leva à revisão', async () => {
    const { linhas, tocar, ir } = await montar()
    await tocar(linhas()[2])
    await tocar(within(screen.getByRole('dialog')).getByRole('button', { name: /^Revisar$/ }))
    expect(ir).toHaveBeenCalledWith('study')
  })

  it('"+ Palavra" abre o diálogo de adicionar, com palavra, tradução, frase e nível', async () => {
    const { botao, tocar } = await montar()
    await tocar(botao(/^Palavra$/))
    const dialogo = screen.getByRole('dialog')
    const d = within(dialogo)
    expect(d.getByRole('heading', { name: 'Adicionar palavra' })).toBeTruthy()
    expect(dialogo.querySelector('.qv-dlg')).toBeTruthy()
    expect(d.getByLabelText('Palavra ou expressão')).toBeTruthy()
    expect(d.getByLabelText('Tradução')).toBeTruthy()
    expect(d.getByLabelText(/Frase de exemplo/)).toBeTruthy()
    expect([...(d.getByLabelText('Nível') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Detectar',
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
    ])
    // Palavra repetida: o diálogo diz e não envia.
    fireEvent.change(d.getByLabelText('Palavra ou expressão'), { target: { value: 'cat' } })
    await tocar(d.getByRole('button', { name: /Adicionar/ }))
    expect(d.getByRole('alert').textContent).toContain('já está no caderno')
  })

  it('"Exportar" abre o diálogo com os quatro formatos, o escopo, a frase e a prévia do cartão', async () => {
    const { botao, tocar } = await montar()
    await tocar(botao(/^Exportar$/))
    const dialogo = screen.getByRole('dialog')
    const d = within(dialogo)
    const formatos = within(d.getByRole('radiogroup', { name: 'Formato' })).getAllByRole('radio')
    expect(formatos.map((f) => f.querySelector('b')?.textContent?.trim())).toEqual([
      'Baralho do Anki .apkg',
      'Planilha .csv',
      'Quizlet .txt',
      'Relatório .txt',
    ])
    expect(within(d.getByRole('radiogroup', { name: 'Quais palavras' })).getAllByRole('radio')).toHaveLength(3)
    expect(d.getByRole('switch', { name: 'Incluir a frase' })).toBeTruthy()
    expect(dialogo.querySelector('.cartao-anki .frente')?.textContent).toBe('cat')
    expect(d.getByRole('button', { name: /Baixar 3 palavras/ })).toBeTruthy()
    await tocar(formatos[3])
    expect(d.getByRole('button', { name: /Baixar o relatório/ })).toBeTruthy()
    expect(d.queryByRole('radiogroup', { name: 'Quais palavras' })).toBeNull()
  })

  it('"Trazer do Anki" abre a tela dos baralhos, e o voltar devolve ao Vocabulário', async () => {
    const { container, botao, tocar } = await montar()
    await tocar(botao(/Trazer do Anki/))
    expect(screen.getByRole('heading', { level: 1, name: 'Baralhos do Anki' })).toBeTruthy()
    expect(container.querySelector('.tela.qv-anki')).toBeTruthy()
    expect(container.textContent).toContain('Toque para escolher o arquivo')
    expect(screen.getAllByRole('tab').map((a) => a.textContent?.replace(/\d+$/, '').trim())).toEqual([
      'Trazer',
      'Levar embora',
      'Gerenciar',
    ])
    await tocar(botao(/Vocabulário/))
    expect(screen.getByRole('heading', { level: 1, name: 'Vocabulário' })).toBeTruthy()
  })

  it('em Gerenciar, o que os selos do Anki explicam por dica aparece escrito', async () => {
    anki.baralhos = [
      {
        id: 'b1',
        nome: 'Essential Words',
        estado: 'ativo',
        total: 100,
        ativas: 40,
        descartadas: 5,
        ausentes: 2,
        createdAt: Date.now(),
        idiomaOrigem: 'en',
        idiomaAlvo: 'pt',
        arquivoOrigem: 'essential.apkg',
      },
    ]
    const { botao, tocar } = await montar()
    await tocar(botao(/Trazer do Anki/))
    await tocar(screen.getByRole('tab', { name: /Gerenciar/ }))
    const notas = [...screen.getByTestId('notas-por-escrito').querySelectorAll('li')].map((l) => l.textContent)
    expect(notas).toHaveLength(3)
    expect(notas[1]).toContain('Descartadas: a régua de qualidade recusou')
    expect(notas[2]).toContain('Ausentes: estas notas sumiram do arquivo')
  })

  it('Visão geral: sete dias de revisões, com o número em cima de cada barra, e três números', async () => {
    const { tocar, painel } = await montar()
    await tocar(screen.getAllByRole('tab')[1])
    expect(painel().dataset.painel).toBe('dashboard')
    const colunas = [...painel().querySelectorAll('.qv-col')]
    expect(colunas).toHaveLength(7)
    expect(colunas.at(-1)?.querySelector('b')?.textContent).toBe('2')
    expect(colunas.at(-1)?.querySelector('small')?.textContent).toBe('hoje')
    expect([...painel().querySelectorAll('.q-num')].map((n) => n.querySelector('b')?.textContent)).toEqual([
      '80%',
      '0',
      '4 dias',
    ])
  })

  it('Inteligência lexical: com menos de 20 palavras explica e leva à captura; com 20, números e níveis', async () => {
    const pouco = await montar()
    await pouco.tocar(screen.getAllByRole('tab')[2])
    expect(pouco.painel().textContent).toContain('A inteligência lexical abre com 20 palavras')
    fireEvent.click(pouco.botao(/Capturar mais/))
    expect(pouco.ir).toHaveBeenCalledWith('capture')
    cleanup()

    api.deck = Array.from({ length: 20 }, (_, i) => cartao(`k${i}`, `word${i}`, `palavra${i}`))
    const { tocar, painel } = await montar()
    await tocar(screen.getAllByRole('tab')[2])
    expect([...painel().querySelectorAll('.q-grade .q-num b')].map((b) => b.textContent)).toEqual(['120', '3', '300'])
    const niveis = screen.getByTestId('niveis-do-vocabulario')
    expect(
      [...niveis.querySelectorAll('.qv-legenda li')].map((l) => [
        l.querySelector('span')?.textContent,
        l.querySelector('b')?.textContent,
      ]),
    ).toEqual([
      ['B1', '15 · 75%'],
      ['C1', '5 · 25%'],
    ])
    expect(niveis.textContent).toContain('estimativa')
    // O que o selo de confiança diz na dica, por escrito.
    expect(within(niveis).getByTestId('nota-de-confianca').textContent).toContain('Confiança suficiente')
  })

  it('Fluência: sem fala gravada leva ao Jogar; com fala, ritmo, tempo, complexidade e voz passiva', async () => {
    const sem = await montar()
    await sem.tocar(screen.getAllByRole('tab')[3])
    expect(sem.painel().textContent).toContain('Desempenho e fluência precisam de fala sua')
    fireEvent.click(sem.botao(/Ir para Jogar/))
    expect(sem.ir).toHaveBeenCalledWith('play')
    cleanup()

    api.falas = [
      { sourceText: 'The window was broken by the storm and the house was sold quickly', sourceLang: 'en' },
      { sourceText: 'We walked along the river until the evening came', sourceLang: 'en' },
    ]
    const { tocar, painel } = await montar({
      metrics: metricas({ speakingMs: 125_000, wpm: 132, wpmConfidence: 0.8 }),
    })
    await tocar(screen.getAllByRole('tab')[3])
    expect(screen.getByTestId('ritmo-de-fala').querySelector('.qv-grande b')?.textContent).toBe('132')
    expect(screen.getByTestId('tempo-de-fala').querySelector('.qv-grande b')?.textContent).toBe('2:05')
    expect(screen.getByTestId('complexidade').querySelectorAll('.q-num')).toHaveLength(4)
    expect(screen.getByTestId('voz-passiva').querySelector('.qv-grande')).toBeTruthy()
    expect(painel().textContent).toContain('Tom da fala')
    expect(painel().textContent).toContain('Radar de competências acústicas')
  })

  it('nos perfis infantil e sênior, as abas de análise ficam atrás de "Mais"', async () => {
    const { botao, tocar } = await montar({ ageProfile: 'kids' })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    await tocar(botao(/^Mais$/))
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /^Mais$/ })).toBeNull()
  })
})
