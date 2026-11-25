/**
 * O NÚCLEO DO BLOCO 2 DOS CARTÕES (openspec `cartoes`, 2.1, 2.2 e 2.4): as opções na conta, o que resta do limite do
 * dia e a fila de "quem erra revê". Lógica pura.
 */
import { describe, expect, it } from 'vitest'

import { DISTANCIA_DA_VOLTA, ehVolta, MAX_VOLTAS, reinserirErrado } from '../src/core/learning/filaDaRevisao'
import { feitoDoDia, normalizarOpcoes, OPCOES_DA_CONTA_PADRAO, restamHoje } from '../src/core/learning/opcoesDaRevisao'
import { hojeDosCartoes } from '../src/lib/cartoes/estadoDeHoje'

describe('opções da conta', () => {
  it('o que é inválido volta ao padrão, campo a campo, sem lançar', () => {
    expect(normalizarOpcoes(null)).toEqual(OPCOES_DA_CONTA_PADRAO)
    expect(
      normalizarOpcoes({ novas: 999, revisoes: 5, ordem: 'x', tipo: 'y', ouvir: 'sim', retencao: 50, botoes: 3 }),
    ).toEqual(OPCOES_DA_CONTA_PADRAO)
    expect(
      normalizarOpcoes({
        novas: 0,
        revisoes: 999,
        ordem: 'misturar',
        tipo: 'digitar',
        ouvir: false,
        retencao: 97,
        botoes: 2,
      }),
    ).toEqual({ novas: 0, revisoes: 999, ordem: 'misturar', tipo: 'digitar', ouvir: false, retencao: 97, botoes: 2 })
  })

  it('o valor de base vale onde o novo é inválido', () => {
    const base = { ...OPCOES_DA_CONTA_PADRAO, novas: 7 }
    expect(normalizarOpcoes({ revisoes: 'muitas' }, base).novas).toBe(7)
  })
})

describe('o que resta do limite do dia', () => {
  it('limite menos o feito, nunca abaixo de zero', () => {
    expect(restamHoje({ novas: 20, revisoes: 200 }, { novas: 0, revisoes: 0 })).toEqual({ novas: 20, revisoes: 200 })
    expect(restamHoje({ novas: 20, revisoes: 200 }, { novas: 5, revisoes: 120 })).toEqual({ novas: 15, revisoes: 80 })
    expect(restamHoje({ novas: 5, revisoes: 10 }, { novas: 9, revisoes: 99 })).toEqual({ novas: 0, revisoes: 0 })
  })

  it('o feito do dia separa as novas do resto das notas', () => {
    expect(feitoDoDia({ revisoesVivas: 30, novas: 8 })).toEqual({ novas: 8, revisoes: 22 })
    expect(feitoDoDia({ revisoesVivas: 3, novas: 8 })).toEqual({ novas: 8, revisoes: 0 })
  })
})

describe('Hoje com o contador do dia', () => {
  const resumo = {
    total: 100,
    revisoesDeSempre: 50,
    hoje: { novas: 5, aprendendo: 3, revisar: 18 },
  }
  const opcoes = { novas: 10, revisoes: 10 }

  it('sem contador vale só o limite por rodada e nunca há teto de hoje', () => {
    const h = hojeDosCartoes(resumo, opcoes, null, null)
    expect(h.tetoDeHoje).toBe(false)
    expect(h.rodada).toBe(5 + 10)
  })

  it('com o contador, a rodada é o que sobra do dia', () => {
    const h = hojeDosCartoes(resumo, opcoes, null, restamHoje(opcoes, { novas: 3, revisoes: 4 }))
    expect(h.rodada).toBe(5 + 6)
    expect(h.tetoDeHoje).toBe(false)
  })

  it('o limite do dia acabou: rodada zero e teto de hoje, mesmo vencendo cartão', () => {
    const h = hojeDosCartoes(resumo, opcoes, null, restamHoje(opcoes, { novas: 10, revisoes: 10 }))
    expect(h).toMatchObject({ estado: 'pilha', vencem: 26, rodada: 0, tetoDeHoje: true })
  })

  it('limite configurado em zero não é teto de hoje (a pessoa escolheu não estudar novas)', () => {
    const soNovas = { ...resumo, hoje: { novas: 5, aprendendo: 0, revisar: 0 } }
    const h = hojeDosCartoes(soNovas, { novas: 0, revisoes: 10 }, null, { novas: 0, revisoes: 10 })
    expect(h.tetoDeHoje).toBe(false)
  })
})

describe('quem erra revê', () => {
  const fila = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id }))

  it('o cartão errado volta depois de alguns outros, marcado como volta', () => {
    const r = reinserirErrado(fila, 1, fila[1], 0)!
    expect(r.posicao).toBe(1 + 1 + DISTANCIA_DA_VOLTA)
    expect(r.fila.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'b', 'g', 'h'])
    expect(ehVolta(r.fila[r.posicao])).toBe(true)
    expect(ehVolta(r.fila[1])).toBe(false)
  })

  it('numa fila curta volta no fim, antes do fim da rodada', () => {
    const r = reinserirErrado(fila.slice(0, 3), 0, fila[0], 0)!
    expect(r.fila.map((c) => c.id)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('só volta até o teto, e a fila original não muda', () => {
    expect(reinserirErrado(fila, 0, fila[0], MAX_VOLTAS)).toBeNull()
    reinserirErrado(fila, 0, fila[0], 0)
    expect(fila).toHaveLength(8)
  })
})
