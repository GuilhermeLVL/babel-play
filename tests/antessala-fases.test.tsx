// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

afterEach(cleanup)
import AntessalaDaRodada from '../src/components/minigames/AntessalaDaRodada'
import ScratchReward from '../src/components/minigames/ScratchReward'
import type { FaseJogada } from '../src/core/minigames/fases'

vi.mock('../src/data/api', () => ({
  fetchRecordes: vi.fn(async () => [
    { exerciseKind: 'memory', melhorPontos: 320, melhorEm: 1, rodadas: 4, melhorCombo: 6, precisao: 88 },
  ]),
}))
vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), pontosDoElemento: vi.fn() }))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), burstFromElement: vi.fn() }))

const FASES: FaseJogada[] = [
  { roundId: 'r2', quando: Date.now(), pontos: 200, combo: 5, acertos: 4, total: 4, precisao: 100, estrelas: 3, refs: ['a', 'b'] },
  { roundId: 'r1', quando: Date.now() - 86_400_000, pontos: 90, combo: 2, acertos: 2, total: 4, precisao: 50, estrelas: 1, refs: ['c', 'd'] },
]

function montar(extra: Partial<React.ComponentProps<typeof AntessalaDaRodada>> = {}) {
  return render(
    <AntessalaDaRodada
      titulo="Jogo da memória"
      gameId="memory"
      itens={[{ ref: 'a', titulo: 'gato', forma: '4 letras' } as never]}
      historico={new Map()}
      vencidos={new Set()}
      repetidos={0}
      ageProfile="pro"
      onRepetir={null}
      onTrocar={() => {}}
      onJogar={() => {}}
      onSair={() => {}}
      pularSempre={false}
      onMudarPularSempre={() => {}}
      {...extra}
    />,
  )
}

describe('antessala redesenhada', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mostra o herói de progresso: nível, rodadas, recorde e % do vocabulário', async () => {
    montar({ acervoTotal: 20, itensJogados: 5 })
    // recorde.rodadas = 4 → nível 2 (3 rodadas por nível)
    await waitFor(() => expect(screen.getByText(/Nível 2/)).toBeTruthy())
    expect(screen.getByText(/rodadas jogadas/)).toBeTruthy()
    expect(screen.getByText('320')).toBeTruthy()
    expect(screen.getByText(/25%/)).toBeTruthy() // 5 de 20
  })

  it('as fases passadas aparecem com estrelas e o clique rejoga os refs exatos', async () => {
    const onJogarFase = vi.fn()
    montar({ fases: FASES, onJogarFase })
    expect(screen.getByText('Suas fases neste jogo')).toBeTruthy()
    const cartoes = screen.getAllByTitle(/Jogar esta fase de novo/)
    expect(cartoes).toHaveLength(2)
    fireEvent.click(cartoes[0])
    expect(onJogarFase).toHaveBeenCalledWith(['a', 'b'])
  })

  it('os chips de dificuldade ficam RECOLHIDOS atrás de "Ajustar a rodada"', () => {
    montar({
      filtroDificuldade: {
        faixas: [], estrategia: 'equilibrado', aoTrocarFaixa: () => {}, aoTrocarEstrategia: () => {},
        disponivelPorFaixa: { facil: 5, medio: 5, dificil: 5 }, minimoDoJogo: 3, origemDaComposicao: 'servidor',
      },
    })
    const detalhes = screen.getByText(/Ajustar a rodada/).closest('details') as HTMLDetailsElement
    expect(detalhes).toBeTruthy()
    expect(detalhes.open).toBe(false) // fechado por padrão: configuração não cobre o progresso
  })
})

describe('fim de rodada (raspadinha)', () => {
  const report = {
    gameId: 'memory' as const,
    items: [
      { itemRef: 'a', correct: true }, { itemRef: 'b', correct: true },
      { itemRef: 'c', correct: true }, { itemRef: 'd', correct: false },
    ],
    score: 150,
    durationMs: 42_000,
  }

  it('mostra as estrelas da rodada e as estatísticas com a mesma régua do mapa de fases', () => {
    render(
      <ScratchReward
        report={report as never} ageProfile="pro" sequencia={null} recorde={null}
        onContinuar={() => {}} onRepetir={null} onDone={() => {}}
        onPularVez={null} custoPular={10} saldoSeeds={0}
      />,
    )
    // 3/4 = 75% → 2 estrelas
    expect(screen.getByLabelText('2 de 3 estrelas')).toBeTruthy()
    expect(screen.getByText('150')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('42s')).toBeTruthy()
  })

  it('com o recorde ao alcance, diz a distância depois de revelar', () => {
    render(
      <ScratchReward
        report={report as never} ageProfile="pro"
        sequencia={{ rodadas: 2, pontos: 300, precisao: 80, combo: 2 } as never}
        recorde={320}
        onContinuar={() => {}} onRepetir={null} onDone={() => {}}
        onPularVez={null} custoPular={10} saldoSeeds={0}
      />,
    )
    fireEvent.click(screen.getByText('revelar sem raspar'))
    expect(screen.getByText(/faltam 20 pts para o seu recorde/)).toBeTruthy()
  })
})
