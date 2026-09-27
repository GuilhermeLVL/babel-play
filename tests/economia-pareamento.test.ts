/**
 * O PAR (XP, SEEDS) É O MESMO EM TODA TELA QUE O MOSTRA.
 *
 * Os valores já têm fonte única (`PESOS_XP` e `PESOS_SEEDS`, em `src/core/learning/xp.ts`), e a
 * auditoria de 2026-09-07 (achado A55) chamou isso de "cálculo duplicado" — não é. O que se repete
 * é o PAREAMENTO: qual peso de XP anda junto de qual peso de Seeds em cada evento. E o pareamento
 * erra fácil, porque nem sempre é um para um: acertar uma revisão vale `revisao + revisaoCerta` de
 * XP e só `revisaoCerta` de Seeds.
 *
 * Três lugares pareiam hoje: `REGRAS` (a tabela "como eu ganho", no núcleo), a meta das missões do
 * dia (`RECOMPENSA_DA_META`, o cartão "Missões do dia" do Hub — recompensas v2, onda 5) e a tela de
 * Conquistas. Nada os comparava. Este teste
 * compara, e a decisão de não unificá-los está em `docs/adr/0002-pareamento-de-recompensa-cobrado-por-teste.md`.
 */
import { describe, expect,it } from 'vitest'

import { valorDoCredito } from '../src/core/economiaAutoridade'
import { REGRAS } from '../src/core/learning/economia'
import { PESOS_SEEDS,PESOS_XP } from '../src/core/learning/xp'
import { RECOMPENSA_DA_META } from '../src/core/missoes'

describe('o par (XP, Seeds) não diverge entre as telas', () => {
  const regraPorId = new Map(REGRAS.map((r) => [r.id, r]))

  /* As "missões" antigas do Hub (capturar / praticar / vocabulário) saíram nas recompensas v2
     (onda 5): eram as três frentes do app, e a de captura misturava duas regras. O que o Hub
     promete agora é a META do dia — e ela anuncia o mesmo par que a tabela de ganhos e que o
     crédito `meta:<dia>` lança. */
  it('a meta das missões do dia anuncia o mesmo par que a regra "metaDiaria" e que o crédito', () => {
    const regra = regraPorId.get('metaDiaria')
    expect(regra, 'regra metaDiaria sumiu de REGRAS').toBeTruthy()
    expect(RECOMPENSA_DA_META.xp, 'XP divergente entre o Hub e a tabela de ganhos').toBe(regra!.xp)
    expect(RECOMPENSA_DA_META.seeds, 'Seeds divergentes entre o Hub e a tabela de ganhos').toBe(regra!.seeds)
    expect(valorDoCredito('meta:2026-10-05')).toMatchObject({ seeds: RECOMPENSA_DA_META.seeds, xp: RECOMPENSA_DA_META.xp })
  })

  it('gravar não rende por tempo, e salvar a sessão não rende Seeds', () => {
    expect(regraPorId.get('sessao')!.seeds, 'salvar a sessão não rende Seeds').toBe(0)
    expect(regraPorId.get('palavraSalva')!.xp, 'palavra salva não rende XP extra').toBe(0)
    expect(regraPorId.has('captura'), 'gravar não rende mais por tempo').toBe(false)
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
