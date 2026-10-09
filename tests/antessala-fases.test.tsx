// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)
import AntessalaDaRodada from '../src/components/minigames/AntessalaDaRodada'
import type { FaseJogada } from '../src/core/minigames/fases'

vi.mock('../src/data/api', () => ({
  fetchRecordes: vi.fn(async () => [
    { exerciseKind: 'memory', melhorPontos: 320, melhorEm: 1, rodadas: 4, melhorCombo: 6, precisao: 88 },
  ]),
}))
vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), pontosDoElemento: vi.fn() }))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), burstFromElement: vi.fn() }))

const FASES: FaseJogada[] = [
  {
    roundId: 'r2',
    quando: Date.now(),
    pontos: 200,
    combo: 5,
    acertos: 4,
    total: 4,
    precisao: 100,
    estrelas: 3,
    refs: ['a', 'b'],
  },
  {
    roundId: 'r1',
    quando: Date.now() - 86_400_000,
    pontos: 90,
    combo: 2,
    acertos: 2,
    total: 4,
    precisao: 50,
    estrelas: 1,
    refs: ['c', 'd'],
  },
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
    expect(screen.getByText(/melhor 320/)).toBeTruthy()
    expect(screen.getByText(/25%/)).toBeTruthy() // 5 de 20
  })

  it('as fases passadas aparecem com estrelas e o clique rejoga os refs exatos', async () => {
    const onJogarFase = vi.fn()
    montar({ fases: FASES, onJogarFase })
    expect(screen.getByText('Suas fases neste jogo')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /de 3 estrelas/ })).toHaveLength(2)
    const repetir = screen.getAllByRole('button', { name: /^Repetir a fase/ })
    expect(repetir).toHaveLength(2)
    fireEvent.click(repetir[0])
    expect(onJogarFase).toHaveBeenCalledWith(['a', 'b'])
  })

  const filtro = {
    faixas: [] as [],
    estrategia: 'equilibrado' as const,
    aoTrocarFaixa: () => {},
    aoTrocarEstrategia: () => {},
    disponivelPorFaixa: { facil: 5, medio: 5, dificil: 5 },
    minimoDoJogo: 3,
    origemDaComposicao: 'servidor' as const,
  }

  it('os chips de dificuldade ficam RECOLHIDOS', () => {
    montar({ filtroDificuldade: filtro })
    const trocar = screen.getByRole('button', { name: /Trocar$/ })
    // fechado por padrão: configuração não cobre o progresso
    expect(trocar.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: /Dificuldade das palavras/ })).toBeNull()
    fireEvent.click(trocar)
    expect(screen.getByRole('group', { name: /Dificuldade das palavras/ })).toBeTruthy()
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
    roundId: `r${n}`,
    quando: Date.now() - n * 3_600_000,
    pontos: n * 10,
    combo: 2,
    acertos: 3,
    total: 4,
    precisao: 75,
    estrelas: 2,
    refs: [`w${n}a`, `w${n}b`],
    ...extra,
  })

  it('mostra fase, pontos, estrelas e quando — os quatro campos que se comparam', () => {
    montar({ fases: [fase(1)], onJogarFase: () => {} })
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent)
    expect(cabecalhos).toEqual(['Fase', 'Pontos', 'Estrelas', 'Quando', 'O que caiu', 'Repetir'])
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
    expect(screen.getByText('1 / 2')).toBeTruthy()
    // A primeira página numera de cima para baixo a partir do total.
    expect(screen.getByLabelText('Repetir a fase 8')).toBeTruthy()
    expect(screen.queryByLabelText('Repetir a fase 2')).toBeNull()

    fireEvent.click(screen.getByLabelText('Próxima página'))
    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(screen.getByLabelText('Repetir a fase 2')).toBeTruthy()
    expect(screen.getByLabelText('Repetir a fase 1')).toBeTruthy()
    expect(screen.queryByLabelText('Repetir a fase 8')).toBeNull()
  })

  it('clicar numa linha rejoga AQUELA fase, com os refs dela', () => {
    const onJogarFase = vi.fn()
    const fases = [fase(1), fase(2)]
    montar({ fases, onJogarFase })
    fireEvent.click(screen.getByLabelText('Repetir a fase 1'))
    // `Fase 1` é a MAIS ANTIGA: numeração cresce para baixo, então é o último item da lista.
    expect(onJogarFase).toHaveBeenCalledWith(fases[1].refs)
  })

  it('a rodada antiga que não guardou palavras não finge que dá para rejogar', () => {
    const onJogarFase = vi.fn()
    montar({ fases: [fase(1, { refs: [] })], onJogarFase })
    const botao = screen.getByLabelText('Repetir a fase 1') as HTMLButtonElement
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
    expect(screen.getByText('abrigo, cozinha +5')).toBeTruthy()
  })

  it('sem amostra, cai no placar da fase — nunca inventa conteúdo', () => {
    montar({ fases: [fase(1)], onJogarFase: () => {} })
    expect(screen.getByText(/3 de 4 nesta fase/)).toBeTruthy()
  })
})
