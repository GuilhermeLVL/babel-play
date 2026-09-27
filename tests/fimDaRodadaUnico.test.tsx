// @vitest-environment jsdom
/**
 * UM FIM DE RODADA, UMA RÉGUA DE ESTRELAS, E "FEVER" SÓ ONDE HÁ FEVER.
 *
 *  - O HUD comum dizia "FEVER" na sequência 10 de qualquer jogo, mas só o Duelo tem a mecânica
 *    (o multiplicador que dobra). Agora o rótulo depende de o jogo declarar que tem.
 *  - O Duelo tinha a própria tela de resultado (estrelas por `blitzRegras`) antes da comum
 *    (estrelas por `fases`): duas telas e duas notas para a mesma rodada. Ficou a comum, e o envio
 *    ao ranking — que só o Duelo tem — mora nela.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/juice', async (orig) => ({
  ...(await orig<typeof import('../src/lib/juice')>()),
  comemorar: vi.fn(),
  contarAte: vi.fn(async () => {}),
  pontosDoElemento: vi.fn(),
  tremor: vi.fn(),
  flashDeTela: vi.fn(),
}))
vi.mock('../src/lib/effects', async (orig) => ({ ...(await orig()), burstFromElement: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({ ...(await orig()), perfilProtegido: () => false }))

const { default: HudDaRodada } = await import('../src/components/minigames/casca/HudDaRodada')
const { default: ResultadoDaRodada } = await import('../src/components/minigames/ResultadoDaRodada')
const { temRanking } = await import('../src/lib/ranking')

afterEach(cleanup)

describe('HUD: FEVER só no jogo que tem FEVER', () => {
  const hud = (extra: Partial<React.ComponentProps<typeof HudDaRodada>> = {}) =>
    render(<HudDaRodada pontos={0} sequencia={12} acertos={12} rotulo="x" progresso={0.5} {...extra} />)

  it('um jogo comum na sequência 12 não diz FEVER', () => {
    hud()
    expect(screen.getByRole('group', { name: 'Placar da rodada' }).textContent).not.toMatch(/FEVER/)
  })

  it('o Duelo (comFever) diz', () => {
    hud({ comFever: true })
    expect(screen.getByRole('group', { name: 'Placar da rodada' }).textContent).toMatch(/FEVER/)
  })
})

describe('fim de rodada comum com o ranking do Duelo', () => {
  const itens = Array.from({ length: 4 }, (_, i) => ({ itemRef: `w${i}`, correct: true, attempts: 1, ms: 900 }))
  const montar = (gameId: 'blitz' | 'memory') =>
    render(
      <ResultadoDaRodada
        report={{ gameId, items: itens, score: 120, durationMs: 30_000 } as never}
        jogo="Jogo"
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
      />,
    )

  it('só o Duelo tem ranking', () => {
    expect(temRanking('blitz')).toBe(true)
    expect(temRanking('memory')).toBe(false)
  })

  it('no Duelo, o envio ao ranking está no fim comum', () => {
    montar('blitz')
    expect(screen.getByLabelText('Apelido para o ranking')).toBeTruthy()
  })

  it('nos outros jogos, não', () => {
    montar('memory')
    expect(screen.queryByLabelText('Apelido para o ranking')).toBeNull()
  })
})
