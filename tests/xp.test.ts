/**
 * O XP AGORA TEM DOIS LEITORES, e é isso que este arquivo protege.
 *
 * Os pesos moravam em `src/lib/progress.ts` (cliente). Enquanto a tela era a única a somar, uma
 * cópia bastava. O servidor passou a precisar deles para reconstruir a curva ao longo do tempo, e
 * duas cópias divergiriam na primeira mudança de fórmula — o gráfico contaria uma história e o
 * distintivo contaria outra, **sobre a mesma pessoa**, na mesma tela.
 *
 * A invariante central: o último ponto da curva é EXATAMENTE o XP de hoje. Ela é verificada aqui
 * sobre a fórmula (`xpDeEventos` é a única definição, usada pelos dois lados) e foi conferida
 * também contra o banco real — 60.474 dos dois lados.
 */
import { describe, it, expect } from 'vitest'
import {
  PESOS_XP, PESOS_SEEDS, xpDeEventos, seedsGanhasDeEventos,
  levelFloor, nivelDoXp, posicaoNoNivel, NIVEL_MAXIMO,
} from '../src/core/learning/xp'
import { deriveProgress, EMPTY_PROGRESS } from '../src/lib/progress'
import type { AppMetrics } from '../src/core/learning/contract'

/** Métricas mínimas, com os campos que a fórmula usa. */
function metricas(p: Partial<AppMetrics> = {}): AppMetrics {
  return {
    sessions: 0, wordsCaptured: 0, reviews: 0, correctReviews: 0,
    drillItems: 0, drillCorrect: 0, seedsGastas: 0, streakDays: 0,
    dueToday: 0, newCards: 0, deckSize: 0, uniqueWords: 0,
    speakingMs: 0, wpm: 0, wpmConfidence: 0, accuracy: 0,
    avgStability: 0, avgRetention: 0, levelConfidence: 0,
    levelDistribution: [], vocabByWeek: [],
    escopo: 'global', base: { considerados: 0, total: 0 },
    ...p,
  } as AppMetrics
}

describe('a fórmula é uma só', () => {
  it('deriveProgress usa exatamente xpDeEventos', () => {
    const m = metricas({ sessions: 3, wordsCaptured: 40, reviews: 12, correctReviews: 9, drillItems: 20, drillCorrect: 15 })

    const esperado = xpDeEventos({
      sessoes: 3, palavrasCapturadas: 40, revisoes: 12, revisoesCertas: 9,
      itensDeJogo: 20, itensDeJogoCertos: 15,
    })

    expect(deriveProgress(m).xp).toBe(esperado)
  })

  it('cada peso entra uma vez, e só uma', () => {
    expect(xpDeEventos({ sessoes: 1, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0 })).toBe(PESOS_XP.sessao)
    // Uma revisão CERTA vale a revisão mais o bônus — nunca só o bônus.
    expect(xpDeEventos({ sessoes: 0, palavrasCapturadas: 0, revisoes: 1, revisoesCertas: 1 }))
      .toBe(PESOS_XP.revisao + PESOS_XP.revisaoCerta)
  })

  it('um item de jogo vale MENOS que uma revisão — a revisão move a memória', () => {
    expect(PESOS_XP.itemDeJogo + PESOS_XP.itemDeJogoCerto).toBeLessThan(PESOS_XP.revisao + PESOS_XP.revisaoCerta)
  })

  it('nada de esforço, nada de XP', () => {
    expect(xpDeEventos({ sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0 })).toBe(0)
  })
})

describe('seeds — o ganho nunca encolhe', () => {
  it('não depende da ofensiva', () => {
    /* O termo `streakDays * 10` saiu da fórmula: com Seeds virando SALDO, perder um dia de ofensiva
       reduziria o ganho TOTAL e o saldo ficaria negativo — o app cobraria de volta uma compra já
       feita. Este teste existe para o termo não voltar. */
    const eventos = { palavrasCapturadas: 50, revisoesCertas: 10 }
    expect(seedsGanhasDeEventos(eventos)).toBe(50 * PESOS_SEEDS.palavraCapturada + 10 * PESOS_SEEDS.revisaoCerta)
  })

  it('o saldo nunca fica negativo, mesmo com gasto acima do ganho', () => {
    const p = deriveProgress(metricas({ wordsCaptured: 1, seedsGastas: 9999 }))
    expect(p.seeds).toBe(0)
  })
})

describe('curva de nível', () => {
  it('os marcos clássicos: 100, 300, 600, 1000', () => {
    expect(levelFloor(2)).toBe(100)
    expect(levelFloor(3)).toBe(300)
    expect(levelFloor(4)).toBe(600)
    expect(levelFloor(5)).toBe(1000)
  })

  it('o nível sobe exatamente no piso, nunca antes', () => {
    expect(nivelDoXp(99)).toBe(1)
    expect(nivelDoXp(100)).toBe(2)
    expect(nivelDoXp(299)).toBe(2)
    expect(nivelDoXp(300)).toBe(3)
  })

  it('não entra em laço com XP absurdo', () => {
    expect(nivelDoXp(Number.MAX_SAFE_INTEGER)).toBe(NIVEL_MAXIMO)
  })

  it('a posição dentro do nível fecha em 100%', () => {
    const p = posicaoNoNivel(299)
    expect(p.level).toBe(2)
    expect(p.xpIntoLevel + levelFloor(2)).toBe(299)
    expect(p.xpForLevel).toBe(levelFloor(3) - levelFloor(2))
    expect(p.levelPct).toBeGreaterThan(90)
    expect(p.levelPct).toBeLessThanOrEqual(100)
  })

  it('XP zero é nível 1 com barra vazia — nunca nível 0', () => {
    const p = posicaoNoNivel(0)
    expect(p.level).toBe(1)
    expect(p.levelPct).toBe(0)
  })
})

describe('as missões prometem o que o sistema credita', () => {
  it('nenhuma recompensa de seeds sai de fora das regras de ganho', () => {
    /* A missão de captura anunciava "+20 Seeds" — um número solto. `seedsGanhasDeEventos` só conta
       palavra capturada (1) e revisão certa (4); gravar, por si, não credita seed nenhuma. A
       promessa era falsa e nunca seria cumprida. */
    const permitidos = new Set([0, PESOS_SEEDS.palavraCapturada, PESOS_SEEDS.revisaoCerta])
    for (const m of deriveProgress(metricas()).missions) {
      expect(permitidos.has(m.rewardSeeds), `missão ${m.id} promete ${m.rewardSeeds} seeds, fora das regras de ganho`).toBe(true)
    }
    for (const m of EMPTY_PROGRESS.missions) {
      expect(permitidos.has(m.rewardSeeds), `missão ${m.id} do estado vazio promete ${m.rewardSeeds}`).toBe(true)
    }
  })

  it('nenhuma recompensa de XP sai de fora dos pesos', () => {
    const permitidos = new Set(Object.values(PESOS_XP) as number[])
    permitidos.add(PESOS_XP.revisao + PESOS_XP.revisaoCerta)  // revisão certa = os dois somados
    for (const m of deriveProgress(metricas()).missions) {
      expect(permitidos.has(m.rewardXp), `missão ${m.id} promete ${m.rewardXp} XP`).toBe(true)
    }
  })
})

describe('sem métrica, nenhum número falso', () => {
  it('devolve o estado vazio marcado como indisponível', () => {
    const p = deriveProgress(null)
    expect(p.available).toBe(false)
    expect(p.xp).toBe(0)
  })
})
