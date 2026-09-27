// @vitest-environment jsdom
/**
 * O RANKING GLOBAL MOSTRA SÓ OS JOGOS QUE TÊM RANKING.
 *
 * A tela tinha uma aba (chip) por jogo, mas só o Duelo envia pontuação: as outras oito abriam um
 * "Ninguém no placar deste jogo ainda" para sempre — um convite que nenhuma ação atende.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({ ...(await orig()), perfilProtegido: () => false }))
vi.mock('../src/data/api', async (orig) => ({ ...(await orig()), fetchRecordes: () => Promise.resolve([]) }))
const lerRanking = vi.fn(async (_jogo: string) => [])
vi.mock('../src/lib/ranking', async (orig) => ({
  ...(await orig()),
  lerRanking: (jogo: string) => lerRanking(jogo),
}))

const { default: Recordes } = await import('../src/components/views/play/Recordes')

afterEach(cleanup)

describe('Recordes · ranking global', () => {
  it('não oferece jogo que nunca envia pontuação', async () => {
    render(<Recordes ageProfile="pro" onFechar={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ranking global' }))
    await waitFor(() => expect(lerRanking).toHaveBeenCalledWith('blitz'))
    // Só o Duelo tem ranking: não há escolha de jogo a fazer, e nenhum outro jogo é consultado.
    expect(screen.queryByRole('radiogroup', { name: 'Jogo do ranking' })).toBeNull()
    expect(lerRanking.mock.calls.every(([j]) => j === 'blitz')).toBe(true)
    expect(screen.getByText(/Duelo/)).toBeTruthy()
  })
})
