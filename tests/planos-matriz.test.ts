/**
 * PARIDADE DA MATRIZ DE PLANOS — servidor e cliente leem a MESMA fonte.
 *
 * A lista de planos vivia copiada à mão em cinco lugares, e quatro falhavam em silêncio: plano
 * desconhecido virava `free`, o cliente descartava a resposta inteira, quotas devolviam zero.
 * Estes testes prendem a consolidação: se alguém recriar uma lista à mão e ela divergir, é aqui
 * que quebra — em vez de na conta de um assinante.
 *
 * E a MATRIZ V2 (change `planos-v2`, ADR 0011): um plano pago só, o Premium, com o anual e o uso
 * justo por dia; os nomes antigos (`essencial`, `pro`) são lidos como ele.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import { capDeArmazenamento } from '../server/lib/storageQuota'
import { capForPlan, capSegundosParaPlano, capTokensParaPlano } from '../server/lib/usageQuota'
import {
  ehPlanoDeAssinatura,
  normalizarPlano,
  PARCELAS_DO_ANUAL,
  PLAN_MATRIX,
  planoPeloPagamento,
  PLANOS_DE_ASSINATURA,
  PLANOS_LEGADOS,
  valoresDasParcelas,
} from '../src/core/planos'
import { PLAN_LABELS } from '../src/lib/entitlements'

afterEach(() => {
  delete process.env.PREMIUM_MONTHLY_STT_SECONDS
})

describe('a matriz é a fonte única', () => {
  it('todo plano da matriz tem rótulo na UI', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      expect(PLAN_LABELS[p], `rótulo de ${p}`).toBe(PLAN_MATRIX[p].rotulo)
    }
  })

  it('os entitlements do servidor saem da matriz, plano a plano', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      expect(getEntitlements(p)).toEqual({ plan: p, ...PLAN_MATRIX[p].entitlements })
    }
  })

  it('as quotas do servidor saem da matriz (sem env definida)', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      const q = PLAN_MATRIX[p].quotas
      expect(capForPlan(p), `chamadas de ${p}`).toBe(q.chamadasMes === null ? Infinity : q.chamadasMes)
      expect(capSegundosParaPlano(p), `segundos de ${p}`).toBe(q.sttSegundosMes === null ? Infinity : q.sttSegundosMes)
      expect(capTokensParaPlano(p), `tokens de ${p}`).toBe(q.tokensMes === null ? Infinity : q.tokensMes)
      const bytes = capDeArmazenamento(p)
      if (q.armazenamentoMb === null) expect(bytes).toBe(Infinity)
      else expect(bytes, `armazenamento de ${p}`).toBe(q.armazenamentoMb * 1024 * 1024)
    }
  })
})

/*
 * A MATRIZ V2 (decisão do dono em 29/09/2026): Grátis + Premium. Premium R$ 19,90/mês ou R$ 179/ano,
 * "sem limite no dia a dia" com uso justo de 2 h/dia de nuvem. O teto MENSAL fica no empate de custo
 * da pilha atual (40 h) até o B7 medir a cascata barata. A conta está no topo de `src/core/planos.ts`.
 */
describe('a matriz v2', () => {
  it('três planos: free, premium e selfhost — o Essencial e o Pro saíram', () => {
    expect([...PLANOS_DE_ASSINATURA].sort()).toEqual(['free', 'premium', 'selfhost'])
  })

  it('Premium: R$ 19,90 por mês ou R$ 179 por ano, e o 12x é do anual', () => {
    expect(PLAN_MATRIX.premium.precoMensalBrl).toBe(19.9)
    expect(PLAN_MATRIX.premium.precoAnualBrl).toBe(179)
    expect(PARCELAS_DO_ANUAL).toBe(12)
    expect(PLAN_MATRIX.free.precoAnualBrl).toBeNull()
    expect(PLAN_MATRIX.selfhost.precoAnualBrl).toBeNull()
  })

  it('Premium tem a nuvem inteira: STT, LLM, modelo maior, Tradução Nuance e voz natural', () => {
    const e = getEntitlements('premium')
    expect(e.managedCloudStt && e.managedCloudLlm && e.largerModels).toBe(true)
    expect(e.traducaoNuance).toBe(true)
    expect(e.vozNatural).toBe(true)
  })

  it('o Grátis não tem Nuance nem voz natural; o self-host tem tudo', () => {
    expect(getEntitlements('free').traducaoNuance).toBe(false)
    expect(getEntitlements('free').vozNatural).toBe(false)
    expect(getEntitlements('selfhost').traducaoNuance).toBe(true)
    expect(getEntitlements('selfhost').vozNatural).toBe(true)
  })

  /* Decisão do dono (30/09): o modo automático do intérprete é do Premium. No Grátis ele pediria o
     download do modelo de voz no aparelho; lá fica o modo por toque. */
  it('o modo automático do intérprete é do Premium (e do self-host), não do Grátis nem do convidado', () => {
    expect(getEntitlements('premium').interpreteAutomatico).toBe(true)
    expect(getEntitlements('selfhost').interpreteAutomatico).toBe(true)
    expect(getEntitlements('free').interpreteAutomatico).toBe(false)
  })

  it('o teto mensal é o empate de custo: 40 h (144.000 s), e a env sobrepõe', () => {
    expect(capSegundosParaPlano('premium')).toBe(144_000)
    process.env.PREMIUM_MONTHLY_STT_SECONDS = '216000'
    expect(capSegundosParaPlano('premium')).toBe(216_000)
  })

  it('o uso justo do dia: 2 h (7.200 s) e os tokens de 2 h de fala', () => {
    expect(PLAN_MATRIX.premium.quotas.sttSegundosDia).toBe(7_200)
    // 150 mil tokens por hora de fala (a mistura medida na bancada) — ver o topo da matriz.
    expect(PLAN_MATRIX.premium.quotas.tokensDia).toBe(300_000)
    // Sem teto no dia = nada é contado por dia.
    for (const p of ['free', 'selfhost'] as const) {
      expect(PLAN_MATRIX[p].quotas.sttSegundosDia, p).toBeNull()
      expect(PLAN_MATRIX[p].quotas.tokensDia, p).toBeNull()
    }
  })

  it('o dia cabe no mês: o teto do dia nunca é maior que o do mês', () => {
    const q = PLAN_MATRIX.premium.quotas
    expect(q.sttSegundosDia!).toBeLessThanOrEqual(q.sttSegundosMes!)
    expect(q.tokensDia!).toBeLessThanOrEqual(q.tokensMes!)
  })

  it('ninguém do Pro perde espaço: o Premium guarda 5 GB', () => {
    expect(PLAN_MATRIX.premium.quotas.armazenamentoMb).toBe(5_000)
  })

  it('YouTube não é vendido: no modo hospedado a rota responde 403', () => {
    expect(getEntitlements('premium').youtubeImport).toBe(false)
    expect(getEntitlements('selfhost').youtubeImport).toBe(true)
  })

  it('as chamadas cobrem as horas vendidas: cada fala de ~6 s usa duas (transcrever + traduzir)', () => {
    const falas = PLAN_MATRIX.premium.quotas.sttSegundosMes! / 6
    expect(capForPlan('premium')).toBeGreaterThanOrEqual(falas * 2)
  })
})

describe('os nomes antigos', () => {
  it('essencial e pro são lidos como premium', () => {
    expect(PLANOS_LEGADOS).toEqual({ essencial: 'premium', pro: 'premium' })
    expect(normalizarPlano('essencial')).toBe('premium')
    expect(normalizarPlano('pro')).toBe('premium')
  })

  it('o nome atual passa; o que não é plano é null', () => {
    for (const p of PLANOS_DE_ASSINATURA) expect(normalizarPlano(p)).toBe(p)
    expect(normalizarPlano('familia')).toBeNull()
    expect(normalizarPlano('')).toBeNull()
    expect(normalizarPlano(null)).toBeNull()
    expect(normalizarPlano(42)).toBeNull()
    // `constructor` e companhia não são plano: a busca não pode cair no protótipo.
    expect(normalizarPlano('constructor')).toBeNull()
  })

  it('o guard continua estrito: só o nome atual é plano de assinatura', () => {
    expect(ehPlanoDeAssinatura('premium')).toBe(true)
    expect(ehPlanoDeAssinatura('essencial')).toBe(false)
    expect(ehPlanoDeAssinatura('pro')).toBe(false)
  })
})

/*
 * O PLANO E O CICLO SAEM DO DINHEIRO (GAP-001): o webhook pergunta "o que este valor paga?". As
 * parcelas são as que o sandbox do Asaas devolveu em 29/09/2026 para 179 em 12x: ele TRUNCA a
 * divisão e joga a diferença na última (11 × 14,91 + 14,99 = 179,00) — `openspec/changes/planos-v2/design.md`.
 */
describe('planoPeloPagamento', () => {
  it('o mensal e o anual inteiro', () => {
    expect(planoPeloPagamento(19.9)).toEqual({ plano: 'premium', ciclo: 'mensal' })
    expect(planoPeloPagamento(179)).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(179, { parcelas: 1 })).toEqual({ plano: 'premium', ciclo: 'anual' })
  })

  it('o valor antigo do Pro (R$ 39,90) continua valendo: vira Premium mensal', () => {
    expect(planoPeloPagamento(39.9)).toEqual({ plano: 'premium', ciclo: 'mensal' })
  })

  it('tolera o ponto flutuante do provedor (um centavo)', () => {
    expect(planoPeloPagamento(19.899999)).toEqual({ plano: 'premium', ciclo: 'mensal' })
  })

  it('as parcelas do 12x, como o Asaas as cobra', () => {
    expect(valoresDasParcelas(179, 12)).toEqual({ padrao: 14.91, ultima: 14.99 })
    expect(planoPeloPagamento(14.91, { parcelas: 12 })).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(14.99, { parcelas: 12 })).toEqual({ plano: 'premium', ciclo: 'anual' })
  })

  it('parcela sem dizer que é parcela não paga plano nenhum', () => {
    expect(planoPeloPagamento(14.91)).toBeNull()
  })

  it('só o 12x é vendido: outra quantidade de parcelas não paga plano', () => {
    const { padrao } = valoresDasParcelas(179, 6)
    expect(planoPeloPagamento(padrao, { parcelas: 6 })).toBeNull()
    expect(planoPeloPagamento(15, { parcelas: 12 })).toBeNull()
  })

  it('valor que não é de plano, ou que não é número, é null', () => {
    expect(planoPeloPagamento(9.9)).toBeNull()
    expect(planoPeloPagamento(undefined)).toBeNull()
    expect(planoPeloPagamento(Number.NaN)).toBeNull()
    expect(planoPeloPagamento(0)).toBeNull()
  })
})
