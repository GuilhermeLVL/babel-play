/**
 * A ABA "HOJE" DOS CARTÕES escolhe o desenho pelo dado real (`lib/cartoes/estadoDeHoje`): os cinco
 * estados do protótipo (`CT_HOJES`, `cartoes.js:42`) sem seletor nem número inventado.
 */
import { describe, expect, it } from 'vitest'

import {
  diasAPartirDeAmanha,
  hojeDosCartoes,
  porcentoDeLembradas,
  proximaAbertura,
} from '../src/lib/cartoes/estadoDeHoje'
import { tamanhoDaRodada } from '../src/lib/revisao/preferencias'

const opcoes = { novas: 20, revisoes: 200 }
const resumo = (total: number, revisoesDeSempre: number, hoje: [number, number, number]) => ({
  total,
  revisoesDeSempre,
  hoje: { novas: hoje[0], aprendendo: hoje[1], revisar: hoje[2] },
})

describe('o estado da aba Hoje', () => {
  it('sem resumo (sem conta, ou a leitura falhou) e sem cartões: vazio', () => {
    expect(hojeDosCartoes(null, opcoes).estado).toBe('vazio')
    expect(hojeDosCartoes(resumo(0, 0, [0, 0, 0]), opcoes).estado).toBe('vazio')
  })

  it('há cartões e nunca houve revisão: primeiras palavras, mesmo com tudo vencendo', () => {
    expect(hojeDosCartoes(resumo(34, 0, [34, 0, 0]), opcoes)).toEqual({ estado: 'primeiro', vencem: 34, rodada: 20 })
  })

  it('vence o que cabe numa rodada: normal, e a rodada é tudo o que vence', () => {
    expect(hojeDosCartoes(resumo(422, 600, [5, 3, 18]), opcoes)).toEqual({ estado: 'normal', vencem: 26, rodada: 26 })
  })

  it('vence mais do que cabe: pilha, com o tamanho da rodada como o teto', () => {
    expect(hojeDosCartoes(resumo(422, 600, [5, 3, 240]), opcoes)).toEqual({ estado: 'pilha', vencem: 248, rodada: 205 })
    expect(hojeDosCartoes(resumo(422, 600, [30, 0, 0]), opcoes).estado).toBe('pilha')
  })

  it('nada vence agora: dia cumprido', () => {
    expect(hojeDosCartoes(resumo(422, 600, [0, 0, 0]), opcoes)).toEqual({ estado: 'feito', vencem: 0, rodada: 0 })
  })
})

describe('as contas pequenas da tela', () => {
  it('a rodada leva no máximo N novas e M revisões (aprendendo conta como revisão)', () => {
    expect(tamanhoDaRodada({ novas: 50, aprendendo: 3, revisar: 10 }, { novas: 20, revisoes: 200 })).toBe(33)
    expect(tamanhoDaRodada({ novas: 5, aprendendo: 30, revisar: 30 }, { novas: 20, revisoes: 40 })).toBe(45)
  })

  it('a previsão começa amanhã: sábado, o primeiro dia é domingo', () => {
    const sabado = new Date(2026, 9, 10).getTime()
    expect(diasAPartirDeAmanha(sabado, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('a próxima abertura é o primeiro dia com cartão depois de hoje', () => {
    expect(proximaAbertura([12, 0, 0, 8, 3])).toEqual({ emDias: 3, n: 8 })
    expect(proximaAbertura([12, 8])).toEqual({ emDias: 1, n: 8 })
    expect(proximaAbertura([12, 0, 0])).toBeNull()
  })

  it('sem revisão no período não há porcentagem', () => {
    expect(porcentoDeLembradas({ total: 0, lembradas: 0 })).toBeNull()
    expect(porcentoDeLembradas({ total: 11, lembradas: 10 })).toBe(91)
  })
})
