// @vitest-environment jsdom
import { cleanup,fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

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

  const filtro = {
    faixas: [] as [], estrategia: 'equilibrado' as const, aoTrocarFaixa: () => {}, aoTrocarEstrategia: () => {},
    disponivelPorFaixa: { facil: 5, medio: 5, dificil: 5 }, minimoDoJogo: 3, origemDaComposicao: 'servidor' as const,
  }

  it('os chips de dificuldade ficam RECOLHIDOS', () => {
    montar({ filtroDificuldade: filtro })
    const detalhes = screen.getByText(/foco:/).closest('details') as HTMLDetailsElement
    expect(detalhes).toBeTruthy()
    expect(detalhes.open).toBe(false) // fechado por padrão: configuração não cobre o progresso
  })

  /**
   * O CONTROLE PRECISA DIZER O QUE ESTÁ VALENDO.
   *
   * Recolhido ele estava certo; MUDO ele não estava. O resumo dizia só "Ajustar a rodada (nível e
   * foco)" em texto apagado, e o nível vigente ("Difícil mantido") era reportado quatro faixas
   * abaixo, dentro de "Por que estas?". Quem queria trocar a dificuldade não achava o controle, e
   * quem achava não sabia de onde estava saindo.
   */
  it('o resumo anuncia o nível vigente sem precisar abrir', () => {
    montar({ filtroDificuldade: filtro, auto: { faixa: 'dificil', motivo: 'Difícil mantido: 100% nas últimas 3.' } })
    expect(screen.getByText(/Nível: difícil \(automático\)/i)).toBeTruthy()
    expect(screen.getByText(/foco: equilibrado/i)).toBeTruthy()
  })

  it('com escolha manual, o resumo mostra as faixas escolhidas em vez do automático', () => {
    montar({
      filtroDificuldade: { ...filtro, faixas: ['facil'] },
      auto: { faixa: 'dificil', motivo: 'Difícil mantido.' },
    })
    expect(screen.getByText(/Nível: fácil/i)).toBeTruthy()
    expect(screen.queryByText(/\(automático\)/i)).toBeNull()
  })
})

/**
 * AS FASES PASSADAS VIRARAM TABELA PAGINADA — e cada regra abaixo custou um defeito.
 *
 * Eram cartões numa grade cortada nas 6 mais recentes: quem jogou vinte rodadas via seis e não
 * tinha como chegar nas outras. Tabela porque os campos se repetem em toda linha e comparar entre
 * rodadas é o que se faz aqui.
 */
describe('a tabela de fases', () => {
  const fase = (n: number, extra: Partial<FaseJogada> = {}): FaseJogada => ({
    roundId: `r${n}`, quando: Date.now() - n * 3_600_000, pontos: n * 10, combo: 2,
    acertos: 3, total: 4, precisao: 75, estrelas: 2, refs: [`w${n}a`, `w${n}b`], ...extra,
  })

  it('mostra fase, pontos, estrelas e quando — os quatro campos que se comparam', () => {
    montar({ fases: [fase(1)], onJogarFase: () => {} })
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toEqual(['Fase', 'Pontos', 'Estrelas', 'Quando', 'O que caiu'])
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByLabelText('2 de 3 estrelas')).toBeTruthy()
  })

  it('sem passar de uma página, o paginador não aparece', () => {
    montar({ fases: [fase(1), fase(2)], onJogarFase: () => {} })
    expect(screen.queryByLabelText('Páginas das fases')).toBeNull()
  })

  /**
   * O CORTE EM 6 ERA UM TETO, NÃO UMA PÁGINA — e as rodadas além dele eram inalcançáveis.
   */
  it('passando de 6 fases, o paginador aparece e a segunda página traz as MAIS ANTIGAS', () => {
    const fases = Array.from({ length: 8 }, (_, i) => fase(i + 1))
    montar({ fases, onJogarFase: () => {} })
    expect(screen.getByLabelText('Páginas das fases')).toBeTruthy()
    expect(screen.getByText('1/2')).toBeTruthy()
    // A primeira página numera de cima para baixo a partir do total.
    expect(screen.getByText('Fase 8')).toBeTruthy()
    expect(screen.queryByText('Fase 2')).toBeNull()

    fireEvent.click(screen.getByLabelText('Próxima página'))
    expect(screen.getByText('2/2')).toBeTruthy()
    expect(screen.getByText('Fase 2')).toBeTruthy()
    expect(screen.getByText('Fase 1')).toBeTruthy()
    expect(screen.queryByText('Fase 8')).toBeNull()
  })

  it('clicar numa linha rejoga AQUELA fase, com os refs dela', () => {
    const onJogarFase = vi.fn()
    const fases = [fase(1), fase(2)]
    montar({ fases, onJogarFase })
    fireEvent.click(screen.getByText('Fase 1'))
    // `Fase 1` é a MAIS ANTIGA: numeração cresce para baixo, então é o último item da lista.
    expect(onJogarFase).toHaveBeenCalledWith(fases[1].refs)
  })

  it('a rodada antiga que não guardou palavras não finge que dá para rejogar', () => {
    const onJogarFase = vi.fn()
    montar({ fases: [fase(1, { refs: [] })], onJogarFase })
    const botao = screen.getByText('Fase 1').closest('button') as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.click(botao)
    expect(onJogarFase).not.toHaveBeenCalled()
  })

  /**
   * A AMOSTRA NÃO PODE ENTREGAR A RESPOSTA — e é por isso que ela vem de fora, já filtrada.
   *
   * A linha oferece "jogar esta fase de novo". Se a amostra imprimisse a palavra que o Termo vai
   * pedir para soletrar, a linha estragaria o próprio convite. Quem decide o que pode aparecer é
   * `previaSegura`, no chamador — aqui só se garante que a tabela mostra o que recebeu e nada
   * além, e que ela diz quantas ficaram de fora em vez de sugerir que aquilo é a rodada inteira.
   */
  it('mostra a amostra recebida e ANUNCIA o que não coube', () => {
    montar({
      fases: [fase(1)],
      onJogarFase: () => {},
      amostraDaFase: () => ({ textos: ['abrigo', 'cozinha'], total: 7 }),
    })
    expect(screen.getByText('abrigo')).toBeTruthy()
    expect(screen.getByText('cozinha')).toBeTruthy()
    expect(screen.getByText('+5')).toBeTruthy()
  })

  it('sem amostra, cai no placar da fase — nunca inventa conteúdo', () => {
    montar({ fases: [fase(1)], onJogarFase: () => {} })
    expect(screen.getByText(/3 de 4 nesta fase/)).toBeTruthy()
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
