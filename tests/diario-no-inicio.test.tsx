// @vitest-environment jsdom
/**
 * O CARTÃO "ESCREVA SOBRE O SEU DIA" NO INÍCIO (openspec `diario-com-correcao-que-vira-cartao`, tarefa 5.1): só aparece com
 * a flag `diario` ligada; desligada, o Início é o de antes. Sem item novo no trilho.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { definirEstadoDasFlags } from '../src/lib/flagsCache'

vi.mock('../src/lib/protecaoDoMenor', async (original) => ({
  ...(await original<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => false,
}))
vi.mock('../src/data/rotas/settings', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/settings')>()),
  fetchSettings: async () => null,
}))
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn(), tocarPreviaDoEfeito: vi.fn() }))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  carregarFlags: async () => ({}),
  iniciarAtualizacaoDeFlags: () => () => {},
}))

const { default: InicioDoQuest } = await import('../src/components/views/quest/InicioDoQuest')

type Progresso = Parameters<typeof InicioDoQuest>[0]['progress']
const PROGRESSO = {
  available: true,
  level: 3,
  xp: 420,
  xpIntoLevel: 20,
  xpForLevel: 200,
  levelPct: 10,
  seeds: 37,
  streakDays: 2,
  practicedToday: false,
} as unknown as Progresso

afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
})

const inicio = (onChangeView: (v: string) => void = () => {}) =>
  render(
    <InicioDoQuest onChangeView={onChangeView} recordings={[]} progress={PROGRESSO} metrics={null} missoes={null} />,
  )

describe('o Início com a flag diario', () => {
  it('desligada: nenhum cartão do diário', () => {
    definirEstadoDasFlags({})
    inicio()
    expect(screen.queryByTestId('diario-no-inicio')).toBeNull()
  })

  it('ligada: o cartão aparece e leva a /diario', () => {
    definirEstadoDasFlags({ diario: { ligada: true } })
    const ir = vi.fn()
    inicio(ir)
    const linha = screen.getByTestId('diario-no-inicio')
    expect(linha.textContent).toContain('Escreva sobre o seu dia')
    fireEvent.click(linha)
    expect(ir).toHaveBeenCalledWith('diario')
  })
})
