/**
 * OS QUATRO BOTÕES DE REVISÃO TÊM DE DIZER O INTERVALO DO CARTÃO QUE ESTÁ NA TELA.
 *
 * Até aqui `Study.tsx` escrevia "Again (10m) · Hard (1.2d) · Good (3.5d) · Easy (8d)" como
 * STRING FIXA no JSX (`Study.tsx:1111-1138`). Os quatro números nunca saíram do agendador: não
 * chamavam `intervalDays`, não liam a `stability` nem a `difficulty` do cartão. Um cartão com
 * estabilidade de 200 dias e um cartão nunca revisado exibiam exatamente o mesmo rótulo.
 *
 * É a mesma classe de defeito que o próprio arquivo diz ter eliminado em `Study.tsx:160-169`
 * ("a estabilidade e a retenção prevista exibidas ao usuário eram uma simulação"): a correção
 * de lá parou no cartão persistido e não alcançou os rótulos.
 *
 * O que este teste trava: a previsão vem de `Fsrs5Strategy.review`, o MESMO caminho que o
 * servidor usa para agendar de verdade. Se um dia o agendador mudar de pesos, os rótulos mudam
 * junto — que é o ponto.
 */
import { describe, expect, it } from 'vitest'

import { estadoDoCartao, previsaoDosBotoes, rotuloDeIntervalo } from '../src/core/learning/previsaoDeIntervalo'
import { Fsrs5Strategy, type SchedulingState } from '../src/core/learning/scheduler'

const AGORA = Date.UTC(2026, 8, 11)
const DAY = 86_400_000

const novo = (): SchedulingState => ({ box: 1, dueAt: AGORA })
const maduro = (): SchedulingState => ({
  box: 4,
  dueAt: AGORA,
  stability: 200,
  difficulty: 4,
  reps: 12,
  lapses: 1,
  lastReview: AGORA - 30 * DAY,
})

describe('rotuloDeIntervalo', () => {
  it('mesmo dia vira "agora", não um número inventado de minutos', () => {
    expect(rotuloDeIntervalo(0)).toBe('agora')
  })

  it('escreve dias abaixo de um mês', () => {
    expect(rotuloDeIntervalo(1 * DAY)).toBe('1d')
    expect(rotuloDeIntervalo(8 * DAY)).toBe('8d')
    expect(rotuloDeIntervalo(29 * DAY)).toBe('29d')
  })

  it('vira meses a partir de 30 dias, e anos a partir de 365', () => {
    expect(rotuloDeIntervalo(30 * DAY)).toBe('1mes')
    expect(rotuloDeIntervalo(90 * DAY)).toBe('3mes')
    expect(rotuloDeIntervalo(365 * DAY)).toBe('1a')
    expect(rotuloDeIntervalo(730 * DAY)).toBe('2a')
  })
})

describe('estadoDoCartao', () => {
  it('estabilidade 0 do banco vira undefined — senão o cartão novo cai no ramo errado do FSRS', () => {
    /* `rowToVocabCard` escreve `fsrsStability: row.stability ?? 0`. O agendador decide a primeira
       revisão por `state.stability === undefined`; um 0 vazando daqui mudaria o agendamento. */
    expect(estadoDoCartao({ fsrsStability: 0 }, AGORA).stability).toBeUndefined()
    expect(estadoDoCartao({ stability: 0, fsrsStability: 0 }, AGORA).stability).toBeUndefined()
  })

  it('e um cartão novo assim agenda igual ao estado inicial do agendador', () => {
    const doBanco = estadoDoCartao({ fsrsStability: 0, fsrsDifficulty: 0, reps: 0 }, AGORA)
    expect(previsaoDosBotoes(doBanco, AGORA)).toEqual(previsaoDosBotoes(novo(), AGORA))
  })

  it('preserva a estabilidade real quando existe, pelos dois nomes que convivem no código', () => {
    expect(estadoDoCartao({ stability: 200 }, AGORA).stability).toBe(200)
    expect(estadoDoCartao({ fsrsStability: 200 }, AGORA).stability).toBe(200)
    expect(estadoDoCartao({ stability: 200, fsrsStability: 7 }, AGORA).stability).toBe(200)
  })

  it('sem dueAt gravado, o cartão vence agora — não numa data inventada', () => {
    expect(estadoDoCartao({}, AGORA).dueAt).toBe(AGORA)
  })
})

describe('previsaoDosBotoes', () => {
  it('devolve um rótulo para cada uma das quatro notas', () => {
    const p = previsaoDosBotoes(novo(), AGORA)
    expect(Object.keys(p).map(Number).sort()).toEqual([1, 2, 3, 4])
  })

  it('cada rótulo é exatamente o que o agendador faria com aquela nota', () => {
    const estado = maduro()
    for (const nota of [1, 2, 3, 4] as const) {
      const depois = Fsrs5Strategy.review(estado, nota, AGORA)
      expect(previsaoDosBotoes(estado, AGORA)[nota]).toBe(rotuloDeIntervalo(depois.dueAt - AGORA))
    }
  })

  it('Errei manda revisar agora — o agendador zera o intervalo no lapso', () => {
    expect(previsaoDosBotoes(maduro(), AGORA)[1]).toBe('agora')
  })

  it('a ordem Difícil < Bom < Fácil vale em cartão maduro', () => {
    const estado = maduro()
    const dias = (nota: 2 | 3 | 4) => Fsrs5Strategy.review(estado, nota, AGORA).dueAt - AGORA
    expect(dias(2)).toBeLessThan(dias(3))
    expect(dias(3)).toBeLessThan(dias(4))
  })

  it('O CARTÃO IMPORTA: maduro e nunca revisado não podem mostrar o mesmo rótulo', () => {
    const pNovo = previsaoDosBotoes(novo(), AGORA)
    const pMaduro = previsaoDosBotoes(maduro(), AGORA)
    expect(pMaduro[3]).not.toBe(pNovo[3])
  })

  it('nenhum rótulo repete os literais antigos do JSX para um cartão qualquer', () => {
    /* "10m" e "1.2d" não são produzíveis por este formatador: o agendador arredonda para dias
       inteiros e o lapso vira "agora". Se voltarem, é porque alguém recravou string na tela. */
    const p = previsaoDosBotoes(maduro(), AGORA)
    for (const rotulo of Object.values(p)) {
      expect(rotulo).not.toMatch(/^\d+m$/)
      expect(rotulo).not.toContain('.')
    }
  })
})
