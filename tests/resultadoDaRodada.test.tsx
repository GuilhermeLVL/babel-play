// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

vi.mock('../src/lib/juice', async (orig) => ({
  ...(await orig<typeof import('../src/lib/juice')>()),
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  tremor: vi.fn(),
  flashDeTela: vi.fn(),
}))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), burstFromElement: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: ResultadoDaRodada } = await import('../src/components/minigames/ResultadoDaRodada')

/**
 * O FIM DA RODADA (T.resultado do protótipo): estrelas, os quatro números, raspadinha e o resumo
 * que abre na mesma tela. Os números são os da rodada — nenhum inventado.
 */
const report = {
  gameId: 'memory' as const,
  items: [
    { itemRef: 'a', correct: true, attempts: 1, ms: 900 },
    { itemRef: 'b', correct: true, attempts: 1, ms: 900 },
    { itemRef: 'c', correct: true, attempts: 1, ms: 900 },
    { itemRef: 'd', correct: false, attempts: 2, ms: 900 },
  ],
  score: 150,
  durationMs: 42_000,
}
const itens = report.items.map((o) => ({ ...o, back: `trad-${o.itemRef}` }))

function montar(extra: Partial<React.ComponentProps<typeof ResultadoDaRodada>> = {}) {
  return render(
    <ResultadoDaRodada
      report={report as never}
      jogo="Memória: palavra e tradução"
      ageProfile="pro"
      sequencia={null}
      recorde={null}
      itens={itens}
      onContinuar={() => {}}
      onRepetir={null}
      onRefazerErradas={() => {}}
      onDone={() => {}}
      onPularVez={null}
      custoPular={10}
      saldoSeeds={0}
      {...extra}
    />,
  )
}

describe('ResultadoDaRodada', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra as estrelas e os números com a mesma régua do mapa de fases', async () => {
    montar()
    // 3/4 = 75% → 2 estrelas
    expect(screen.getByLabelText('2 de 3 estrelas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '3 de 4 pares' })).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('42s')).toBeTruthy()
    // melhor sequência: os três primeiros acertos seguidos
    expect(screen.getByText('Melhor sequência').parentElement?.textContent).toContain('3')
    // os pontos sobem até o score da rodada
    await waitFor(() => expect(screen.getByText('150')).toBeTruthy(), { timeout: 4000 })
  })

  it('a raspadinha esconde o prêmio até revelar; depois vêm as ações', () => {
    const onDone = vi.fn()
    montar({ onDone })
    expect(screen.queryByRole('button', { name: /Voltar aos jogos/ })).toBeNull()
    fireEvent.click(screen.getByText('Revelar sem raspar'))
    expect(screen.getByLabelText(/Recompensa revelada: mais 10 XP e 3 seeds/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Voltar aos jogos/ }))
    expect(onDone).toHaveBeenCalled()
  })

  it('com o recorde ao alcance, diz a distância', () => {
    montar({ sequencia: { rodadas: 2, pontos: 300, precisao: 80, combo: 2 } as never, recorde: 320 })
    expect(screen.getByText(/faltam 20 pts/)).toBeTruthy()
  })

  it('"Ver o que escapou" abre o resumo na mesma tela, e refazer leva só as erradas', () => {
    const onRefazerErradas = vi.fn()
    montar({ onRefazerErradas })
    fireEvent.click(screen.getByText('Revelar sem raspar'))
    fireEvent.click(screen.getByRole('button', { name: /Ver o que escapou/ }))
    expect(screen.getByText('O que aconteceu na rodada')).toBeTruthy()
    expect(screen.getByText('Errou (1)')).toBeTruthy()
    expect(screen.getByText('trad-d')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refazer só a errada' }))
    expect(onRefazerErradas).toHaveBeenCalledWith([expect.objectContaining({ itemRef: 'd' })])
  })
})
