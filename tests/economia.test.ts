import { describe, expect, it } from 'vitest'

import {
diaLocal, marcosDeSequencia, palavrasPremiadas, REGRAS, sequencias, TETO_PALAVRAS_SALVAS_POR_DIA,
} from '../src/core/learning/economia'
import { PESOS_SEEDS, PESOS_XP, seedsGanhasDeEventos, xpDeEventos } from '../src/core/learning/xp'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

describe('economia v2 — a tabela é a regra', () => {
  it('toda regra com Seeds tem o mesmo número que o cálculo usa', () => {
    const porId = Object.fromEntries(REGRAS.map((r) => [r.id, r]))
    expect(porId.revisaoCerta.seeds).toBe(PESOS_SEEDS.revisaoCerta)
    expect(porId.jogoCerto.seeds).toBe(PESOS_SEEDS.jogoCerto)
    expect(porId.rodadaPerfeita.seeds).toBe(PESOS_SEEDS.rodadaPerfeita)
    expect(porId.cartao.seeds).toBe(PESOS_SEEDS.cartao)
    expect(porId.palavraSalva.seeds).toBe(PESOS_SEEDS.palavraSalva)
    expect(porId.metaDiaria.seeds).toBe(PESOS_SEEDS.metaDiaria)
    expect(porId.metaDiaria.xp).toBe(PESOS_XP.metaDiaria)
    expect(porId.sequencia7.seeds).toBe(PESOS_SEEDS.sequencia7)
    expect(porId.revisaoCerta.xp).toBe(PESOS_XP.revisao + PESOS_XP.revisaoCerta)
  })

  it('um dia ativo rende Seeds só de resultado (recompensas v2)', () => {
    // 10 palavras salvas + 20 revisões certas + 30 acertos de jogo + 1 rodada perfeita + meta do dia
    const dia = seedsGanhasDeEventos({
      palavrasSalvasPremiadas: 10, revisoesCertas: 20, itensDeJogoCertos: 30,
      rodadasPerfeitas: 1, cartoesCriados: 0, sequencias7: 0, seedsCreditadas: PESOS_SEEDS.metaDiaria,
    })
    expect(dia).toBe(10 + 40 + 30 + 5 + 15)
  })

  /* Recompensas v2: a meta deixou de ser "lendário em ≈ 1 semana" e passou a ser a da simulação
     (`tests/economia-calibragem.test.ts`): comum em 2–3 dias, lendário em ≈ 1 mês. */
  it('o item lendário mais caro não sai em menos de 3 semanas de dia ativo sem baú', () => {
    const dia = seedsGanhasDeEventos({ palavrasSalvasPremiadas: 10, revisoesCertas: 20, itensDeJogoCertos: 30, rodadasPerfeitas: 1, seedsCreditadas: PESOS_SEEDS.metaDiaria })
    const maisCaro = Math.max(...CATALOGO_DA_LOJA.map((i) => i.precoSeeds ?? 0))
    expect(Math.ceil(maisCaro / dia)).toBeGreaterThanOrEqual(21)
  })

  it('XP: rodada perfeita e marco de prática entram; crédito avulso soma direto', () => {
    const base = { sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0 }
    expect(xpDeEventos({ ...base, sequencias7: 2 })).toBe(2 * PESOS_XP.sequencia7)
    expect(xpDeEventos({ ...base, rodadasPerfeitas: 1, xpCreditado: 7 })).toBe(PESOS_XP.rodadaPerfeita + 7)
  })
})

describe('tetos e sequências', () => {
  it('palavra salva: teto diário — 120 num dia premiam só 30; dois dias de 20 premiam 40', () => {
    expect(palavrasPremiadas([120])).toBe(TETO_PALAVRAS_SALVAS_POR_DIA)
    expect(palavrasPremiadas([20, 20])).toBe(40)
    expect(palavrasPremiadas([])).toBe(0)
  })

  it('marcos de 7 dias: contados do histórico, nunca cobrados de volta', () => {
    const quinzeSeguidos = Array.from({ length: 15 }, (_, i) => 100 + i)
    expect(marcosDeSequencia(quinzeSeguidos)).toBe(2)
    // três sequências separadas de 7 = 3 marcos
    const tres = [...Array.from({ length: 7 }, (_, i) => 1 + i), ...Array.from({ length: 7 }, (_, i) => 20 + i), ...Array.from({ length: 7 }, (_, i) => 40 + i)]
    expect(marcosDeSequencia(tres)).toBe(3)
    expect(marcosDeSequencia([1, 2, 3])).toBe(0)
    // dia repetido não conta duas vezes
    expect(marcosDeSequencia([1, 1, 2, 3, 4, 5, 6, 7])).toBe(1)
  })

  it('sequência atual termina hoje; a maior é histórica', () => {
    const dias = [10, 11, 12, 13, 14, 20, 21]
    expect(sequencias(dias, 21)).toEqual({ atual: 2, maior: 5 })
    expect(sequencias(dias, 22)).toEqual({ atual: 0, maior: 5 })
  })

  it('diaLocal muda à meia-noite LOCAL, não UTC', () => {
    const d = new Date(2026, 7, 28, 23, 59, 0)
    const e = new Date(2026, 7, 29, 0, 1, 0)
    expect(diaLocal(e.getTime()) - diaLocal(d.getTime())).toBe(1)
  })
})
