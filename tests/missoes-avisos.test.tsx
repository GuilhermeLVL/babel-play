// @vitest-environment jsdom
/**
 * AS MISSÕES NA TELA E NO SINO (recompensas v2, onda 5 — Task 5.2).
 *
 *   · "missão quase completa": 1 por dia, nunca entre 22h e 8h, nunca para o perfil protegido;
 *   · "ofensiva em risco": nunca para o perfil protegido;
 *   · o cartão "Missões do dia" vira PONTO DE PARADA quando as três fecham — sem convite a "mais uma";
 *   · o cliente só pede `meta:<dia>` quando o servidor diz que fechou e ainda não creditou.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EstadoDasMissoes, Missao } from '../src/core/missoes'

const creditarSeeds = vi.fn()
vi.mock('../src/data/api', async (orig) => ({ ...(await orig<object>()), creditarSeeds: (...a: unknown[]) => creditarSeeds(...a) }))

const { podeAvisarMissao, registrarAvisoDeMissao, reivindicarMetaDoDia } = await import('../src/lib/metaDoDia')
const { podeAvisarOfensiva } = await import('../src/lib/ofensiva')
const { default: MissoesDoDia } = await import('../src/components/progress/MissoesDoDia')

const as = (h: number, dia = 5) => new Date(2026, 9, dia, h, 30)
const missao = (tipo: Missao['tipo'], alvo: number, atual: number): Missao => ({ id: tipo, tipo, alvo, atual })
const QUASE = [missao('revisar', 10, 10), missao('palavras', 3, 3), missao('rodadaBoa', 1, 0)]
const CHEIAS = [missao('revisar', 10, 12), missao('palavras', 3, 3), missao('rodadaBoa', 1, 1)]
const estado = (missoes: Missao[], extra: Partial<EstadoDasMissoes> = {}): EstadoDasMissoes => ({
  dia: '2026-10-05',
  missoes,
  metaConcluida: missoes.every((m) => m.atual >= m.alvo),
  metaCreditada: false,
  recompensa: { seeds: 15, xp: 20 },
  ofensiva: 4,
  congelamentos: 0,
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  creditarSeeds.mockReset()
})

describe('aviso "missão quase completa"', () => {
  it('sai quando falta uma missão, de dia', () => {
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(12))).toBe(true)
  })

  it('nunca entre 22h e 8h', () => {
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(22))).toBe(false)
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(23))).toBe(false)
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(3))).toBe(false)
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(7))).toBe(false)
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(8))).toBe(true)
  })

  it('nunca para o perfil protegido', () => {
    expect(podeAvisarMissao({ missoes: QUASE, protegido: true }, as(12))).toBe(false)
  })

  it('uma vez por dia', () => {
    registrarAvisoDeMissao(as(10))
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(15))).toBe(false)
    expect(podeAvisarMissao({ missoes: QUASE, protegido: false }, as(15, 6))).toBe(true)
  })

  it('nem com a meta fechada, nem com duas faltando', () => {
    expect(podeAvisarMissao({ missoes: CHEIAS, protegido: false }, as(12))).toBe(false)
    const duas = [missao('revisar', 10, 0), missao('palavras', 3, 0), missao('rodadaBoa', 1, 1)]
    expect(podeAvisarMissao({ missoes: duas, protegido: false }, as(12))).toBe(false)
    expect(podeAvisarMissao({ missoes: null, protegido: false }, as(12))).toBe(false)
  })
})

describe('aviso "ofensiva em risco"', () => {
  it('nunca para o perfil protegido, mesmo na janela', () => {
    expect(podeAvisarOfensiva({ streakDays: 5, estudouHoje: false }, as(19))).toBe(true)
    expect(podeAvisarOfensiva({ streakDays: 5, estudouHoje: false, protegido: true }, as(19))).toBe(false)
  })
})

describe('o pedido do crédito da meta', () => {
  it('só pede quando o servidor diz que fechou e ainda não creditou', async () => {
    expect(await reivindicarMetaDoDia(null)).toBeNull()
    expect(await reivindicarMetaDoDia(estado(QUASE))).toBeNull()
    expect(await reivindicarMetaDoDia(estado(CHEIAS, { metaCreditada: true }))).toBeNull()
    expect(creditarSeeds).not.toHaveBeenCalled()

    creditarSeeds.mockResolvedValueOnce({ jaExistia: false, seedsCreditadas: 15, xpCreditado: 20 })
    expect(await reivindicarMetaDoDia(estado(CHEIAS))).toEqual({ seeds: 15, xp: 20 })
    expect(creditarSeeds).toHaveBeenCalledWith({ creditoId: 'meta:2026-10-05' })

    creditarSeeds.mockResolvedValueOnce({ jaExistia: true, seedsCreditadas: 15, xpCreditado: 20 })
    expect(await reivindicarMetaDoDia(estado(CHEIAS))).toBeNull()
  })
})

describe('o cartão "Missões do dia"', () => {
  it('sem estado, não aparece (nada de progresso inventado)', () => {
    const { container } = render(<MissoesDoDia estado={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('mostra as três missões com o progresso do servidor', () => {
    render(<MissoesDoDia estado={estado(QUASE)} />)
    expect(screen.getByText('Missões do dia')).toBeTruthy()
    expect(screen.getByTestId('missoes-feitas').textContent).toBe('2/3')
    expect(document.querySelectorAll('[data-missao]')).toHaveLength(3)
  })

  it('com as três fechadas é o ponto de parada: "Meta do dia concluída", sem botão de "mais uma"', () => {
    render(<MissoesDoDia estado={estado(CHEIAS)} />)
    expect(screen.getByText('Meta do dia concluída')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(/mais uma|continue|jogar de novo/i)
    // Progresso limitado ao alvo: 12 revisões de 10 aparecem como 10/10.
    expect(document.body.textContent).toContain('10/10')
  })
})
