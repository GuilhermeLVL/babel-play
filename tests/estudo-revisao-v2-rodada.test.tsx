// @vitest-environment jsdom
/**
 * A RODADA DA REVISÃO V2 (flag `estudo_revisao_v2`; openspec `cartoes` 2.6 e 3.2, `modelo-do-aluno-e-dados` 3.2): o seletor
 * único abre a mesma rodada de antes; o estudo livre não grava nota; sem nada vencido a flag não cai no baralho inteiro;
 * a lacuna esconde a palavra na frente; a frase gira a cada revisão.
 */
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

type Espia = ReturnType<(typeof import('vitest'))['vi']['fn']>
const flag = vi.hoisted(() => ({ ligada: true }))
const api = vi.hoisted(() => ({
  deck: [] as unknown[],
  ocorrencias: {} as Record<string, unknown[]>,
  falas: [] as unknown[],
  revisar: null as unknown as Espia,
  atualizar: null as unknown as Espia,
  lerOcorrencias: null as unknown as Espia,
  lerSessao: null as unknown as Espia,
}))
const avisos = vi.hoisted(() => ({ ok: null as unknown as Espia, warn: null as unknown as Espia }))
const som = vi.hoisted(() => ({ pedidos: [] as string[] }))

vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  useFlag: (chave: string) => chave === 'estudo_revisao_v2' && flag.ligada,
}))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true, haAlgumaVoz: () => true }))
vi.mock('../src/lib/tts', async (orig) => ({
  ...(await orig<typeof import('../src/lib/tts')>()),
  speak: vi.fn(),
  falar: (_texto: string, _idioma: string, o: { onEnd?: () => void } = {}) => {
    o.onEnd?.()
    return true
  },
  cancelSpeech: vi.fn(),
}))
/* O áudio da sessão: o teste só precisa saber SE e QUANDO ele foi pedido. */
vi.mock('../src/lib/audioDaSessao', () => ({
  urlDeAudio: (id: string) => {
    som.pedidos.push(id)
    return Promise.reject(new Error('sem áudio no teste'))
  },
  liberar: vi.fn(),
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG, onLangConfigChange: () => () => {} }
})
vi.mock('../src/lib/dictionary', () => ({
  lookup: vi.fn(async () => null),
  forvoUrl: () => '#',
  wiktionaryUrl: () => '#',
}))
vi.mock('../src/components/Toast', async (orig) => {
  avisos.ok = vi.fn()
  avisos.warn = vi.fn()
  return {
    ...(await orig<typeof import('../src/components/Toast')>()),
    toast: { ok: avisos.ok, error: vi.fn(), warn: avisos.warn, info: vi.fn() },
  }
})
vi.mock('../src/data/api', async (orig) => {
  const achar = (id: string) => (api.deck as Array<{ id: string }>).find((c) => c.id === id)
  api.revisar = vi.fn(async (id: string) => achar(id))
  api.atualizar = vi.fn(async (id: string, patch: object) => ({ ...achar(id), ...patch }))
  api.lerOcorrencias = vi.fn(async (id: string) => api.ocorrencias[id] ?? [])
  api.lerSessao = vi.fn(async () => ({ session: { title: 'Reunião de produto' }, utterances: api.falas }))
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchDeck: async () => api.deck,
    reviewCard: api.revisar,
    desfazerRevisao: vi.fn(async (id: string) => achar(id)),
    updateCard: api.atualizar,
    salvarRodada: vi.fn(async () => undefined),
    fetchMemoriaDoCartao: async () => ({ revisoes: 4, acertos: 3 }),
    fetchOcorrencias: api.lerOcorrencias,
    fetchSessionTranscript: api.lerSessao,
    fetchMetrics: async () => null,
    lerMissoes: async () => null,
  }
})

import Study from '../src/components/views/Study'
import { esquecerCenas } from '../src/lib/revisao/cena'
import type { Recording, VocabCard } from '../src/types'

const FRASE = "That's a big deal. Customers were complaining about it."
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
    fsrsDueAt: new Date(Date.now() - 86_400_000).toISOString(),
    dueAtMs: Date.now() - 86_400_000,
    lastReview: Date.now() - 5 * 86_400_000,
    stability: 4,
    reps: 3,
    ...extra,
  }) as unknown as VocabCard
const SESSAO = { id: 's1', title: 'Reunião de produto', audioUrl: '/api/sessions/s1/audio' } as Recording
const FALA = {
  id: 'u1',
  speakerName: 'Ana',
  sourceText: FRASE,
  translatedText: 'Isso é importante. Os clientes estavam reclamando disso.',
  tStartMs: 38_000,
  tEndMs: 42_000,
}

async function assentar() {
  await act(async () => {
    await vi.dynamicImportSettled()
  })
  await act(async () => {})
}
async function montar(props: Partial<React.ComponentProps<typeof Study>> = {}) {
  const ir = vi.fn()
  const tela = render(<Study onChangeView={ir} gravacoes={[SESSAO]} {...props} />)
  await assentar()
  const palco = () => tela.container.querySelector('.q-palco.q-revisao') as HTMLElement
  const tocar = async (el: Element) => {
    fireEvent.click(el)
    await assentar()
  }
  return { ...tela, ir, palco, tocar }
}

beforeEach(() => {
  localStorage.clear()
  esquecerCenas()
  som.pedidos.length = 0
  api.ocorrencias = {}
  api.falas = [FALA]
  api.revisar?.mockClear()
  api.atualizar?.mockClear()
  api.lerOcorrencias?.mockClear()
  api.lerSessao?.mockClear()
  avisos.ok?.mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:teste')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'Audio',
    class {
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      pause() {}
      play() {
        queueMicrotask(() => this.onended?.())
        return Promise.resolve()
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EM_DIAS = (n: number) => Date.now() + n * 86_400_000

describe('o seletor único abre a mesma rodada de antes (flag desligada)', () => {
  it('vencidos primeiro; sem nada vencido cai no baralho inteiro, como sempre', async () => {
    flag.ligada = false
    api.deck = [
      cartao('c1', 'tomorrow', 'amanhã', { dueAtMs: EM_DIAS(3), fsrsDueAt: new Date(EM_DIAS(3)).toISOString() }),
    ]
    const { palco } = await montar()
    expect(palco()).toBeTruthy()
    expect(palco().querySelector('.termo')?.textContent).toBe('tomorrow')
  })
})

describe('sem nada vencido, com a flag', () => {
  it('não abre rodada escondida: avisa que há o estudo livre', async () => {
    flag.ligada = true
    api.deck = [
      cartao('c1', 'tomorrow', 'amanhã', { dueAtMs: EM_DIAS(3), fsrsDueAt: new Date(EM_DIAS(3)).toISOString() }),
    ]
    const { palco } = await montar()
    expect(palco().querySelector('.termo')).toBeNull()
    expect(palco().querySelector('.qr-conta')).toBeNull()
    expect(api.revisar).not.toHaveBeenCalled()
  })
})

describe('estudo livre (cartões 2.6)', () => {
  it('abre com o baralho fora da agenda e a nota NÃO vai ao servidor nem muda vencimento', async () => {
    flag.ligada = true
    api.deck = [
      cartao('c1', 'tomorrow', 'amanhã', { dueAtMs: EM_DIAS(3), fsrsDueAt: new Date(EM_DIAS(3)).toISOString() }),
      cartao('c2', 'weekend', 'fim de semana', { dueAtMs: EM_DIAS(1), fsrsDueAt: new Date(EM_DIAS(1)).toISOString() }),
    ]
    const { palco, tocar } = await montar({ rodada: { livre: true } })
    /* As que vencem antes primeiro. */
    expect(palco().querySelector('.termo')?.textContent).toBe('weekend')
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    await tocar(palco().querySelector('.fsrs button.b') as HTMLElement)
    expect(api.revisar).not.toHaveBeenCalled()
    expect(api.atualizar).not.toHaveBeenCalled()
    expect(palco().querySelector('.termo')?.textContent).toBe('tomorrow')
  })

  it('"só as difíceis": só entram as com 8 erros ou mais, as que mais escapam primeiro', async () => {
    flag.ligada = true
    api.deck = [
      cartao('c1', 'easy', 'fácil', { lapses: 1 } as Partial<VocabCard>),
      cartao('c2', 'hard', 'difícil', { lapses: 9 } as Partial<VocabCard>),
      cartao('c3', 'harder', 'mais difícil', { lapses: 14 } as Partial<VocabCard>),
    ]
    const { palco } = await montar({ rodada: { livre: true, soDificeis: true } })
    expect(palco().querySelector('.termo')?.textContent).toBe('harder')
    expect(palco().querySelector('.qr-conta')?.textContent).toContain('1 / 2')
  })
})

describe('formato lacuna e frase da vez (cartões 3.2)', () => {
  it('com a opção ligada, a frente mostra a frase com a palavra escondida e a tradução; o verso é o de sempre', async () => {
    flag.ligada = true
    localStorage.setItem('revisao.formatoLacuna', 'true')
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'Customers like to complain about prices.' })]
    const { palco, tocar } = await montar()
    const frente = palco().querySelector('[data-testid="frase-com-lacuna"]') as HTMLElement
    expect(frente).toBeTruthy()
    expect(frente.querySelector('.qr-vao')).toBeTruthy()
    expect(frente.textContent).not.toContain('complain')
    expect(palco().querySelector('.termo')).toBeNull()
    expect(palco().textContent).toContain('reclamar')
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    expect(palco().querySelector('.termo')?.textContent).toBe('complain')
    expect(palco().querySelector('.exemplo mark')?.textContent).toBe('complain')
  })

  it('a nota de um cartão em lacuna grava o formato "lacuna"', async () => {
    flag.ligada = true
    localStorage.setItem('revisao.formatoLacuna', 'true')
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'Customers like to complain about prices.' })]
    const { palco, tocar } = await montar()
    await tocar(screen.getByRole('button', { name: /Mostrar resposta/ }))
    await tocar(palco().querySelector('.fsrs button.b') as HTMLElement)
    expect(api.revisar).toHaveBeenCalledWith(
      'c1',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ formato: 'lacuna' }),
    )
  })

  it('sem frase com a palavra, o cartão fica no formato normal', async () => {
    flag.ligada = true
    localStorage.setItem('revisao.formatoLacuna', 'true')
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'Customers are unhappy today.' })]
    const { palco } = await montar()
    expect(palco().querySelector('[data-testid="frase-com-lacuna"]')).toBeNull()
    expect(palco().querySelector('.termo')?.textContent).toBe('complain')
  })

  it('com a flag desligada a opção guardada não muda nada', async () => {
    flag.ligada = false
    localStorage.setItem('revisao.formatoLacuna', 'true')
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'Customers like to complain about prices.' })]
    const { palco } = await montar()
    expect(palco().querySelector('[data-testid="frase-com-lacuna"]')).toBeNull()
    expect(palco().querySelector('.termo')?.textContent).toBe('complain')
  })

  it('a frase muda a cada revisão: a segunda revisão do cartão usa a outra frase', async () => {
    flag.ligada = true
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'First we complain.', reps: 1 })]
    api.ocorrencias = {
      c1: [
        { originKind: 'sessao', originRef: 's1', sentence: 'First we complain.', utteranceId: null, occurredAt: 1 },
        {
          originKind: 'sessao',
          originRef: 's1',
          sentence: 'Then they complain again.',
          utteranceId: null,
          occurredAt: 2,
        },
      ],
    }
    const { palco } = await montar()
    await waitFor(() =>
      expect(palco().querySelector('.ct-frase .exemplo')?.textContent).toContain('Then they complain again.'),
    )
  })

  it('com a flag desligada a frase é sempre a do cartão', async () => {
    flag.ligada = false
    api.deck = [cartao('c1', 'complain', 'reclamar', { sentence: 'First we complain.', reps: 1 })]
    api.ocorrencias = {
      c1: [
        {
          originKind: 'sessao',
          originRef: 's1',
          sentence: 'Then they complain again.',
          utteranceId: null,
          occurredAt: 2,
        },
      ],
    }
    const { palco } = await montar()
    expect(palco().querySelector('.ct-frase .exemplo')?.textContent).toContain('First we complain.')
  })
})
