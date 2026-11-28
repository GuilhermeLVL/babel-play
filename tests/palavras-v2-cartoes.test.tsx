// @vitest-environment jsdom
/**
 * A TELA CARTÕES COM A FLAG `estudo_palavras_v2` (frente `palavras`):
 *   · as abas de "Praticar" (Cartões e Jogos) mostram as contagens do catálogo de conteúdo, da fonte escolhida;
 *   · o "…" lembra dos baralhos do Anki desativados e leva ao gerenciar;
 *   · desligada, a tela é a de antes (sem números nas abas, sem a linha dos desativados).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResumoDosCartoes } from '../src/core/learning/resumoDosCartoes'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const mundo = vi.hoisted(() => ({ flag: true, cinco: true }))

const api = vi.hoisted(() => ({
  resumo: null as unknown,
  lerResumo: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  baralho: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  doAnki: [] as unknown[],
  ativar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  contagens: null as unknown,
  /** O que o servidor conta de HOJE (cartões 2.1); `null` = sem contador (sem conta ou sem rede). */
  feitoHoje: null as null | { novas: number; revisoes: number },
}))

vi.mock('../src/data/api', async (orig) => {
  api.lerResumo = vi.fn(async () => api.resumo)
  api.baralho = vi.fn(async () => [])
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    lerResumoDosCartoes: api.lerResumo,
    fetchDeck: api.baralho,
  }
})
vi.mock('../src/data/apiAnki', async (orig) => {
  api.ativar = vi.fn(async () => ({ ativadas: 20, restantes: 100 }))
  return {
    ...(await orig<typeof import('../src/data/apiAnki')>()),
    listarBaralhosAnki: vi.fn(async () => api.doAnki),
    ativarNotasDoBaralho: api.ativar,
  }
})
vi.mock('../src/data/rotas/settings', () => ({
  fetchSettings: async () => null,
  patchUiSettings: vi.fn(async () => null),
  saveSettings: async () => null,
}))
vi.mock('../src/data/rotas/opcoesDaRevisao', () => ({
  fetchOpcoesDaRevisao: async () =>
    api.feitoHoje
      ? {
          opcoes: { novas: 10, revisoes: 10, ordem: 'vencidas', tipo: 'lembrar', ouvir: true, retencao: 90, botoes: 4 },
          naConta: true,
          hoje: {
            ...api.feitoHoje,
            restamNovas: Math.max(0, 10 - api.feitoHoje.novas),
            restamRevisoes: Math.max(0, 10 - api.feitoHoje.revisoes),
          },
        }
      : null,
  gravarOpcoesDaRevisaoNaConta: async () => null,
}))
vi.mock('../src/data/rotas/conteudo', () => ({
  lerContagensDeConteudo: async () => api.contagens,
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return {
    ...real,
    useLangConfig: () => real.DEFAULT_LANG_CONFIG,
    fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG,
  }
})
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))
vi.mock('../src/lib/polimento/celular', async (orig) => ({
  ...(await orig<typeof import('../src/lib/polimento/celular')>()),
  useBarraDeCinco: () => mundo.cinco,
}))

import Cartoes from '../src/components/views/Cartoes'
import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { conteudoAtual, escolherConteudo, zerarConteudoParaTeste } from '../src/lib/conteudo/loja'
import { _reiniciarIdentidade } from '../src/lib/identidade'
import type { Recording } from '../src/types'

const HOJE = new Date(2026, 9, 10).getTime() // sábado

const resumoBase = (mudou: Partial<ResumoDosCartoes> = {}): ResumoDosCartoes => ({
  agora: HOJE + 12 * 3_600_000,
  inicioDoDia: HOJE,
  total: 422,
  suspensas: 9,
  idiomas: 2,
  dificeis: 6,
  revisoesDeSempre: 612,
  revisadasHoje: 0,
  hoje: { novas: 5, aprendendo: 3, revisar: 18 },
  guardadas: 0,
  fases: { novas: 96, aprendendo: 41, jovens: 148, maduras: 128 },
  previsao: [26, 8, 14, 21, 9, 17, 12, 26, ...Array.from({ length: 23 }, () => 10)],
  calendario: Array.from({ length: 84 }, (_, i) => (i % 3 === 0 ? 0 : 5)),
  retencao: {
    d7: { total: 100, lembradas: 91 },
    d30: { total: 612, lembradas: 539 },
    semanas: Array.from({ length: 8 }, () => ({ total: 50, lembradas: 44 })),
  },
  botoes: [73, 55, 416, 68],
  baralhos: {
    idiomas: [
      { id: 'en', total: 318, novas: 4, aprendendo: 3, revisar: 15 },
      { id: 'es', total: 104, novas: 1, aprendendo: 0, revisar: 3 },
    ],
    sessoes: [
      { id: 's-reuniao', total: 37, novas: 3, aprendendo: 2, revisar: 4 },
      { id: 's-apagada', total: 5, novas: 0, aprendendo: 0, revisar: 1 },
    ],
    anki: [{ id: 'a-pv', total: 120, novas: 0, aprendendo: 0, revisar: 2 }],
    trilha: { total: 60, novas: 1, aprendendo: 0, revisar: 1 },
  },
  ...mudou,
})

const sessao: Recording = {
  id: 's-reuniao',
  title: 'Reunião de produto: roadmap do trimestre',
  date: 'hoje',
  durationStr: '38 min',
  wordCount: 400,
  type: 'audio',
  tags: [],
  status: 'Processado',
  idioma: 'en',
}

const SESSAO = { tipo: 'sessao', id: 's-reuniao', nome: 'Reunião de produto: roadmap do trimestre' } as const
const ANKI = { tipo: 'anki', id: 'a-pv', nome: 'English Phrasal Verbs (B1–B2)' } as const

/** O catálogo de conteúdo da conta de exemplo: dois idiomas, lido em inglês. */
const contagensBase = (mudou: Partial<ContagensDeConteudo> = {}): ContagensDeConteudo => ({
  agora: HOJE + 12 * 3_600_000,
  idioma: 'en',
  idiomas: [
    { id: 'en', palavras: 318 },
    { id: 'es', palavras: 104 },
  ],
  tudo: { palavras: 318, frases: 236, paraHoje: 22 },
  dificeis: { palavras: 5, frases: 5, paraHoje: 2 },
  sessoes: [
    {
      id: 's-reuniao',
      nome: SESSAO.nome,
      tipo: 'audio',
      quando: HOJE,
      duracaoMs: 38 * 60_000,
      palavras: 37,
      frases: 31,
      paraHoje: 9,
    },
    {
      id: 's-podcast',
      nome: 'Podcast: The science of sleep',
      tipo: 'audio',
      quando: HOJE - 86_400_000,
      duracaoMs: null,
      palavras: 52,
      frases: 40,
      paraHoje: 0,
    },
  ],
  anki: [
    {
      id: 'a-pv',
      nome: ANKI.nome,
      tipo: null,
      quando: HOJE - 28 * 86_400_000,
      duracaoMs: null,
      palavras: 120,
      frases: 96,
      paraHoje: 2,
    },
  ],
  trilha: { palavras: 60, frases: 0, paraHoje: 2 },
  ...mudou,
})

const montar = (extra: Partial<React.ComponentProps<typeof Cartoes>> = {}) => {
  const ir = vi.fn()
  const trocar = vi.fn()
  const r = render(
    <Cartoes
      aba="hoje"
      aoTrocarAba={trocar}
      estudo={null}
      recordings={[sessao]}
      metrics={{ streakDays: 4, maiorSequenciaPresenca: 11 } as never}
      onChangeView={ir}
      {...extra}
    />,
  )
  return { ir, trocar, ...r }
}
/** A tela leu o resumo E as contagens do catálogo (o número de Palavras na aba é o da fonte). */
const pronta = () =>
  waitFor(() => {
    expect(screen.getByTestId('cartoes').querySelector('.q-esqueleto')).toBeNull()
    expect(conteudoAtual().idioma).toBe('en')
  })
const folha = (nome: string | RegExp) => waitFor(() => screen.getByRole('dialog', { name: nome }))

beforeEach(() => {
  mundo.flag = true
  mundo.cinco = true
  localStorage.clear()
  zerarConteudoParaTeste()
  api.resumo = resumoBase()
  api.contagens = contagensBase()
  api.doAnki = []
  api.feitoHoje = null
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as never
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  _reiniciarIdentidade()
})

describe('com a flag estudo_palavras_v2', () => {
  it('as abas de Praticar trazem as contagens do catálogo, e acompanham a fonte', async () => {
    montar()
    await pronta()
    const abas = screen.getByTestId('abas-de-praticar')
    // Tudo em inglês: 22 para hoje, 318 palavras
    expect(
      within(abas)
        .getAllByRole('tab')
        .map((a) => a.textContent),
    ).toEqual(['Cartões22', 'Jogos318'])
    await act(async () => {
      escolherConteudo(ANKI as never, 'en')
    })
    await waitFor(() =>
      expect(
        within(screen.getByTestId('abas-de-praticar'))
          .getAllByRole('tab')
          .map((a) => a.textContent),
      ).toEqual(['Cartões2', 'Jogos120']),
    )
  })

  it('o "…" mostra os baralhos do Anki desativados e abre o gerenciar', async () => {
    api.doAnki = [
      { id: 'x', nome: 'Velho', estado: 'desativado', total: 40, ativas: 0 },
      { id: 'a-pv', nome: 'Phrasal', estado: 'ativo', total: 120, ativas: 20 },
    ]
    montar()
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    const menu = await folha(/Mais opções/)
    await waitFor(() => expect(within(menu).getByText('1 baralho do Anki desativado')).toBeTruthy())
  })

  it('sem desativados, a linha não aparece', async () => {
    api.doAnki = [{ id: 'a-pv', nome: 'Phrasal', estado: 'ativo', total: 120, ativas: 20 }]
    montar()
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    const menu = await folha(/Mais opções/)
    await new Promise((r) => setTimeout(r, 50))
    expect(within(menu).queryByText(/desativado/)).toBeNull()
  })

  it('desligada: abas sem número e sem a linha dos desativados', async () => {
    mundo.flag = false
    api.doAnki = [{ id: 'x', nome: 'Velho', estado: 'desativado', total: 40, ativas: 0 }]
    montar()
    await pronta()
    expect(
      within(screen.getByTestId('abas-de-praticar'))
        .getAllByRole('tab')
        .map((a) => a.textContent),
    ).toEqual(['Cartões', 'Jogos'])
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    const menu = await folha(/Mais opções/)
    await new Promise((r) => setTimeout(r, 50))
    expect(within(menu).queryByText(/desativado/)).toBeNull()
  })
})
