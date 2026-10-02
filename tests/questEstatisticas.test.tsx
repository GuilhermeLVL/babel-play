// @vitest-environment jsdom
/**
 * AS ESTATÍSTICAS NO QUEST (segunda rodada do desenho do headset, 01/10/2026): a tela nova monta, e cada
 * função da tela de sempre continua alcançável: o período, exportar (CSV e impressão), os cinco números,
 * os seis gráficos com a tabela equivalente, "Praticar agora", a meta de nível e a espera.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const api = vi.hoisted(() => ({
  resultados: [] as unknown[],
  cartoes: [] as unknown[],
  pendente: false,
  patch: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
/* O aparelho: o headset, salvo no caso "no computador com o desenho novo". */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' as string }))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})
vi.mock('../src/data/api', async (orig) => {
  api.patch = vi.fn(async () => undefined)
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    fetchExerciseResults: () => (api.pendente ? new Promise(() => {}) : Promise.resolve(api.resultados)),
    fetchDeck: () => (api.pendente ? new Promise(() => {}) : Promise.resolve(api.cartoes)),
    fetchSettings: async () => null,
    patchUiSettings: api.patch,
  }
})

import Estatisticas from '../src/components/views/Estatisticas'
import type { AppMetrics } from '../src/data/api'

const metricas = {
  acertoPorExercicio: [
    { kind: 'memory', total: 10, acerto: 80 },
    { kind: 'termo', total: 6, acerto: 40 },
  ],
  levelDistribution: [
    { level: 'B1', count: 3 },
    { level: 'C1', count: 1 },
  ],
  streakDays: 2,
  maiorSequenciaPresenca: 5,
  speakingMs: 0,
  wpm: 0,
} as unknown as AppMetrics

async function montar(metrics: AppMetrics | null = metricas) {
  const ir = vi.fn()
  const tela = render(<Estatisticas metrics={metrics} onChangeView={ir} />)
  await act(async () => {})
  const aba = (nome: RegExp) => screen.getByRole('tab', { name: nome })
  const painel = () => screen.getByRole('tabpanel')
  return { ...tela, ir, aba, painel }
}

beforeEach(() => {
  const agora = Date.now()
  aparelho.tipo = 'quest'
  api.pendente = false
  api.resultados = [
    { createdAt: agora, ms: 12 * 60_000, correct: true, kind: 'memory' },
    { createdAt: agora, ms: 60_000, correct: false, kind: 'termo' },
  ]
  api.cartoes = [
    { createdAtMs: agora, inDeck: true, dueAtMs: agora },
    { createdAtMs: agora - 3 * 86_400_000, inDeck: true, dueAtMs: agora + 2 * 86_400_000 },
  ]
  api.patch.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Estatísticas no Quest', () => {
  it('enquanto os dados não chegam, mostra a forma do que vem e não deixa exportar', async () => {
    api.pendente = true
    const { container } = await montar()
    expect(container.querySelector('.q-palco.qe')).toBeTruthy()
    expect(container.querySelectorAll('.q-esqueleto').length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: /Exportar/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('os cinco números do período, com o período trocável entre 7, 30 e 90 dias', async () => {
    const { container } = await montar()
    const numeros = [...container.querySelectorAll('.qe-kpi')]
    expect(numeros).toHaveLength(5)
    expect(numeros.map((n) => n.querySelector('.q-rotulo')?.textContent?.trim())).toEqual([
      'Minutos de estudo',
      'Dias ativos',
      'Palavras novas',
      'Acerto médio',
      'Ofensiva atual',
    ])
    expect(numeros[0].querySelector('b')?.textContent).toBe('13')
    expect(numeros[1].textContent).toContain('1 de 30')

    const sete = screen.getByRole('button', { name: '7 dias' })
    expect(screen.getByRole('button', { name: '30 dias' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(sete)
    expect(sete.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('.qe-kpi')[1].textContent).toContain('1 de 7')
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }))
    expect(screen.getByRole('heading', { name: 'Minutos por semana' })).toBeTruthy()
  })

  it('seis gráficos e a meta, um por vez, cada gráfico com a tabela a um toque', async () => {
    const { container, aba, painel } = await montar()
    const abas = screen.getAllByRole('tab').map((a) => a.textContent?.trim())
    expect(abas).toEqual(['Minutos', 'Palavras', 'Calendário', 'Revisões', 'Jogos', 'Níveis', 'Meta'])

    const titulos: Record<string, string> = {
      Minutos: 'Minutos por dia',
      Palavras: 'Palavras no caderno',
      Calendário: 'Calendário de atividade',
      Revisões: 'Revisões nos próximos 7 dias',
      Jogos: 'Acerto por jogo',
      Níveis: 'Palavras por nível',
    }
    for (const [nome, titulo] of Object.entries(titulos)) {
      fireEvent.click(aba(new RegExp(`^${nome}$`)))
      expect(aba(new RegExp(`^${nome}$`)).getAttribute('aria-selected')).toBe('true')
      expect(within(painel()).getByRole('heading', { name: titulo })).toBeTruthy()
      expect(painel().querySelector('.q-tabela')).toBeNull()
      const alternar = within(painel()).getByRole('button', { name: 'Ver como tabela' })
      fireEvent.click(alternar)
      expect(painel().querySelector('.q-tabela tbody tr')).toBeTruthy()
      fireEvent.click(within(painel()).getByRole('button', { name: 'Ver gráfico' }))
      expect(painel().querySelector('.q-tabela')).toBeNull()
    }
    // Os gráficos em SVG são desenhados com a marcação de sempre (as classes que o CSS do headset engrossa).
    fireEvent.click(aba(/^Minutos$/))
    expect(container.querySelector('.qe-grafico svg.grafico-svg .g-barra')).toBeTruthy()
    fireEvent.click(aba(/^Calendário$/))
    expect(container.querySelectorAll('.qe-grafico .g-cel')).toHaveLength(84)
  })

  it('na tela aparece um painel; os outros seis ficam montados e escondidos, para a impressão trazer todos', async () => {
    const { container, aba } = await montar()
    const paineis = [...container.querySelectorAll<HTMLElement>('.qe-painel')]
    expect(paineis.map((p) => p.dataset.painel)).toEqual([
      'minutos',
      'vocab',
      'calendario',
      'previsao',
      'jogos',
      'niveis',
      'meta',
    ])
    expect(paineis.filter((p) => !p.hidden).map((p) => p.dataset.painel)).toEqual(['minutos'])
    // Os escondidos têm o conteúdo inteiro (é ele que o `@media print` mostra em sequência).
    expect(container.querySelector('[data-painel="calendario"]')?.querySelectorAll('.g-cel')).toHaveLength(84)
    expect(container.querySelector('[data-painel="jogos"]')?.textContent).toContain('Soletrar (Termo)')
    expect(container.querySelector('[data-painel="meta"] .qe-medida')).toBeTruthy()
    for (const p of paineis)
      expect(document.getElementById(`qe-aba-${p.dataset.painel}`)?.getAttribute('aria-controls')).toBe(p.id)

    fireEvent.click(aba(/^Jogos$/))
    expect(paineis.filter((p) => !p.hidden).map((p) => p.dataset.painel)).toEqual(['jogos'])
  })

  it('"Praticar agora" mora no gráfico de jogos, junto do jogo mais fraco', async () => {
    const { aba, painel, ir } = await montar()
    fireEvent.click(aba(/^Jogos$/))
    expect(painel().textContent).toContain('Mais fraco: Soletrar (Termo).')
    fireEvent.click(within(painel()).getByRole('button', { name: /Praticar agora/ }))
    expect(ir).toHaveBeenCalledWith('play')
  })

  it('a previsão de revisões diz o pico da semana', async () => {
    const { aba, painel } = await montar()
    fireEvent.click(aba(/^Revisões$/))
    expect(painel().querySelector('.q-aviso')?.textContent).toMatch(/Pico na \S+: 1 palavra\./)
  })

  it('a meta de nível é a sétima aba: o alvo se escolhe e fica gravado', async () => {
    const { aba, painel } = await montar()
    fireEvent.click(aba(/^Meta$/))
    // A meta lê o alvo gravado ao montar; só depois disso uma escolha é gravada.
    await act(async () => {})
    expect(within(painel()).getByRole('heading', { name: 'Meta de nível' })).toBeTruthy()
    expect(painel().querySelectorAll('.qe-medida')).toHaveLength(3)
    const c2 = within(painel()).getByRole('button', { name: /C2/ })
    fireEvent.click(c2)
    expect(c2.getAttribute('aria-pressed')).toBe('true')
    expect(api.patch).toHaveBeenCalledWith({ cefrGoal: 'C2' })
  })

  it('exportar abre no centro com as duas saídas: CSV e impressão', async () => {
    vi.useFakeTimers()
    try {
      const criar = vi.fn(() => 'blob:x')
      Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() })
      const imprimir = vi.fn()
      window.print = imprimir
      await montar()

      fireEvent.click(screen.getByRole('button', { name: /Exportar/ }))
      const dialogo = screen.getByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: /Dados em CSV/ }))
      expect(criar).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Exportar/ }))
      expect(screen.getByRole('dialog').textContent).toContain('todos os gráficos e a meta')
      // No headset a impressão pode não existir, e a linha avisa.
      expect(screen.getByRole('dialog').textContent).toContain('Se o headset não imprimir, use o CSV.')
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Imprimir ou salvar em PDF/ }))
      vi.advanceTimersByTime(60)
      expect(imprimir).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('no computador com o desenho novo: a mesma tela, e exportar não fala em headset', async () => {
    aparelho.tipo = 'desktop-com-gpu'
    const { container } = await montar()
    expect(container.querySelector('.q-palco.qe')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: /Dados em CSV/ })).toBeTruthy()
    expect(within(dialogo).getByRole('button', { name: /Imprimir ou salvar em PDF/ })).toBeTruthy()
    expect(dialogo.textContent).toContain('todos os gráficos e a meta')
    expect(dialogo.textContent).not.toMatch(/headset/i)
  })

  it('sem estudo nenhum, a tela diz o que falta e por onde começar; os gráficos vazios explicam', async () => {
    api.resultados = []
    api.cartoes = []
    const { aba, painel, ir } = await montar(null)
    const aviso = screen.getByTestId('sem-estudo')
    fireEvent.click(within(aviso).getByRole('button', { name: /Praticar agora/ }))
    expect(ir).toHaveBeenCalledWith('play')
    fireEvent.click(aba(/^Jogos$/))
    expect(painel().textContent).toContain('Nenhuma rodada registrada ainda.')
    fireEvent.click(aba(/^Níveis$/))
    expect(painel().textContent).toContain('Sem palavras no caderno ainda.')
  })
})
