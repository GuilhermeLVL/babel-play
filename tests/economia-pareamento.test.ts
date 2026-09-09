/**
 * O PAR (XP, SEEDS) É O MESMO EM TODA TELA QUE O MOSTRA.
 *
 * Os valores já têm fonte única (`PESOS_XP` e `PESOS_SEEDS`, em `src/core/learning/xp.ts`), e a
 * auditoria de 2026-09-07 (achado A55) chamou isso de "cálculo duplicado" — não é. O que se repete
 * é o PAREAMENTO: qual peso de XP anda junto de qual peso de Seeds em cada evento. E o pareamento
 * erra fácil, porque nem sempre é um para um: acertar uma revisão vale `revisao + revisaoCerta` de
 * XP e só `revisaoCerta` de Seeds.
 *
 * Três lugares pareiam hoje: `REGRAS` (a tabela "como eu ganho", no núcleo), as missões de
 * `deriveProgress` (os cartões do Hub) e a tela de Conquistas. Nada os comparava. Este teste
 * compara, e a decisão de não unificá-los está em `docs/adr/0002-pareamento-de-recompensa-cobrado-por-teste.md`.
 */
import { describe, it, expect } from 'vitest'
import { REGRAS } from '../src/core/learning/economia'
import { PESOS_XP, PESOS_SEEDS } from '../src/core/learning/xp'
import { deriveProgress } from '../src/lib/progress'
import type { AppMetrics } from '../src/data/api'

/** Métricas mínimas para `deriveProgress` devolver as três missões com as recompensas preenchidas. */
const METRICAS = {
  sessions: 0,
  dueToday: 3,
  newCards: 5,
  deckSize: 10,
  reviews: 0,
  correctReviews: 0,
  drillItems: 0,
  drillCorrect: 0,
  seedsGastas: 0,
  words: 0,
  minutes: 0,
} as unknown as AppMetrics

/**
 * Missão do Hub → regra de `REGRAS` que ela anuncia. `null` significa "não corresponde a uma regra
 * só", e cada caso desses precisa do motivo escrito aqui — é a exceção que o ADR previu.
 */
const MISSAO_PARA_REGRA: Record<string, string | null> = {
  /*
   * caracterizacao: comportamento atual, e ele MISTURA duas regras. A missão "capturar" promete o
   * XP de `sessao` (salvar a gravação) com os Seeds de `captura` (1 a cada 5 minutos gravados).
   * Os dois valores existem e são creditados de verdade — mas como recompensas de EVENTOS
   * DIFERENTES, e o cartão os apresenta como se fossem de um só. Quem grava 2 minutos e salva
   * recebe o XP prometido e nenhum Seed.
   *
   * Não é corrigido aqui porque a correção é decisão de produto (o cartão promete o que? gravar,
   * salvar, ou os dois em linhas separadas?). Fica registrado e medido.
   */
  capture: null,
  practice: 'revisaoCerta',
  vocabulary: 'cartao',
}

describe('o par (XP, Seeds) não diverge entre as telas', () => {
  const regraPorId = new Map(REGRAS.map((r) => [r.id, r]))
  const missoes = deriveProgress(METRICAS).missions

  it('toda missão do Hub está mapeada — uma missão nova sem par declarado falha aqui', () => {
    for (const m of missoes) {
      expect(
        Object.prototype.hasOwnProperty.call(MISSAO_PARA_REGRA, m.id),
        `missão "${m.id}" não tem regra declarada em MISSAO_PARA_REGRA (nem null com o motivo)`,
      ).toBe(true)
    }
  })

  for (const [idMissao, idRegra] of Object.entries(MISSAO_PARA_REGRA)) {
    if (!idRegra) continue
    it(`missão "${idMissao}" anuncia o mesmo par que a regra "${idRegra}"`, () => {
      const missao = missoes.find((m) => m.id === idMissao)
      const regra = regraPorId.get(idRegra)
      expect(missao, `missão ${idMissao} sumiu de deriveProgress`).toBeTruthy()
      expect(regra, `regra ${idRegra} sumiu de REGRAS`).toBeTruthy()
      expect(missao!.rewardXp, `XP divergente entre o Hub e a tabela de ganhos`).toBe(regra!.xp)
      expect(missao!.rewardSeeds, `Seeds divergentes entre o Hub e a tabela de ganhos`).toBe(regra!.seeds)
    })
  }

  it('a missão "capture" continua misturando duas regras — se isto mudar, o ADR 0002 muda junto', () => {
    const missao = missoes.find((m) => m.id === 'capture')!
    expect(missao.rewardXp, 'XP da missão de captura').toBe(PESOS_XP.sessao)
    expect(missao.rewardSeeds, 'Seeds da missão de captura').toBe(PESOS_SEEDS.capturaPor5Min)
    // E o que a tabela de ganhos diz sobre cada um dos dois eventos, separadamente:
    expect(regraPorId.get('sessao')!.seeds, 'salvar a sessão não rende Seeds').toBe(0)
    expect(regraPorId.get('captura')!.xp, 'gravar rende XP por 5 min').toBe(PESOS_XP.capturaPor5Min)
  })

  it('nenhuma regra inventa valor fora de PESOS_XP/PESOS_SEEDS', () => {
    const xpConhecidos = new Set<number>([0, ...Object.values(PESOS_XP)])
    const seedsConhecidos = new Set<number>([0, ...Object.values(PESOS_SEEDS)])
    /* Somas de dois pesos são legítimas (revisão certa, item de jogo certo): o que não pode é um
       número que não sai de nenhum peso nem da soma de dois. */
    const somas = (v: Set<number>) => {
      const s = new Set(v)
      for (const a of v) for (const b of v) s.add(a + b)
      return s
    }
    const xpValidos = somas(xpConhecidos)
    const seedsValidos = somas(seedsConhecidos)
    for (const r of REGRAS) {
      expect(xpValidos.has(r.xp), `regra "${r.id}" tem XP ${r.xp}, que não vem de PESOS_XP`).toBe(true)
      expect(seedsValidos.has(r.seeds), `regra "${r.id}" tem ${r.seeds} Seeds, que não vem de PESOS_SEEDS`).toBe(true)
    }
  })
})
