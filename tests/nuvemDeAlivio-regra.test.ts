/**
 * A NUVEM DE ALÍVIO (A10 do plano "Grátis sem travar") — a REGRA, pura, e a FRANQUIA.
 *
 * O Grátis tem 3 h/mês de nuvem para aparelho fraco, além do aparelho sem limite. Aqui se prende:
 *  - QUEM precisa do alívio (aparelho leve, travamento, sem GPU real) e quem não (o aparelho forte
 *    roda local de graça: oferecer nuvem ali só custaria dinheiro);
 *  - o perfil PROTEGIDO só com a autorização do responsável — a mesma régua da nuvem do resto do
 *    app (`rapidoDoMicPermitido`): vínculo aceito e conta não restrita;
 *  - a FRANQUIA: 10.800 s de STT, e o teto em DÓLAR por conta que garante o aceite (≤ US$ 0,13);
 *  - o que resta, o pool do dia (≤ 20% do orçamento diário) e a reserva de 80% dos pagantes;
 *  - quando a oferta aparece no cliente.
 */
import { describe, expect, it } from 'vitest'

import {
  alivioAutorizadoPelaIdade,
  aparelhoPedeAlivio,
  deveOferecerAlivio,
  FRACAO_DO_ALIVIO_NO_ORCAMENTO,
  poolDoAlivioUsd,
  reservaDosPagantesAtingida,
  segundosRestantesDoAlivio,
} from '../src/core/nuvemDeAlivio'
import { FATOR_FATURADO_DO_STT, FRANQUIA_DE_ALIVIO, PLAN_MATRIX } from '../src/core/planos'

describe('franquia de alívio', () => {
  it('3 h de STT por mês (10.800 s), e o free continua sem cota de nuvem na matriz', () => {
    expect(FRANQUIA_DE_ALIVIO.sttSegundosMes).toBe(10_800)
    expect(PLAN_MATRIX.free.quotas.sttSegundosMes).toBe(0)
    expect(PLAN_MATRIX.free.entitlements.managedCloudStt).toBe(false)
  })

  it('o teto em dólar por conta é o aceite do plano: no máximo US$ 0,13 por usuário grátis/mês', () => {
    expect(FRANQUIA_DE_ALIVIO.tetoUsdMes).toBeLessThanOrEqual(0.13)
  })

  it('as 3 h de transcrição cabem no teto em dólar com o preço e o fator faturado do código', () => {
    // whisper-large-v3-turbo US$ 0,04/h (`server/lib/orcamentoDeIa.ts`), faturado 1,08× (bancada 2026-09).
    const custo = (FRANQUIA_DE_ALIVIO.sttSegundosMes * FATOR_FATURADO_DO_STT * 0.04) / 3600
    expect(custo).toBeLessThanOrEqual(FRANQUIA_DE_ALIVIO.tetoUsdMes)
  })

  it('tokens e chamadas são tetos de uso justo, com folga para as falas das 3 h', () => {
    // 10.800 s ÷ 6 s por fala × 2 chamadas (transcrever + traduzir) = 3.600.
    expect(FRANQUIA_DE_ALIVIO.chamadasMes).toBeGreaterThanOrEqual(3_600)
    expect(FRANQUIA_DE_ALIVIO.tokensMes).toBeGreaterThan(0)
  })
})

describe('quem precisa do alívio', () => {
  it('aparelho leve, travamento ou sem GPU real pedem; o forte não', () => {
    expect(aparelhoPedeAlivio({ leve: true, travamento: false, gpuReal: true })).toBe(true)
    expect(aparelhoPedeAlivio({ leve: false, travamento: true, gpuReal: true })).toBe(true)
    expect(aparelhoPedeAlivio({ leve: false, travamento: false, gpuReal: false })).toBe(true)
    expect(aparelhoPedeAlivio({ leve: false, travamento: false, gpuReal: true })).toBe(false)
  })

  it('GPU desconhecida (sonda ainda não rodou) não conta como "sem GPU": na dúvida, não oferece', () => {
    expect(aparelhoPedeAlivio({ leve: false, travamento: false, gpuReal: null })).toBe(false)
  })
})

describe('perfil protegido', () => {
  const adulto = { protegido: false, restrita: false, vinculo: { estado: 'nenhum' as const } }

  it('adulto declarado: autorizado', () => {
    expect(alivioAutorizadoPelaIdade(adulto)).toBe(true)
  })

  it('menor com o vínculo do responsável aceito e a conta liberada: autorizado', () => {
    expect(alivioAutorizadoPelaIdade({ protegido: true, restrita: false, vinculo: { estado: 'aceito' } })).toBe(true)
  })

  it('menor sem responsável, com convite pendente, ou restrito (menor de 12 sem consentimento): recusado', () => {
    expect(alivioAutorizadoPelaIdade({ protegido: true, restrita: false, vinculo: { estado: 'nenhum' } })).toBe(false)
    expect(alivioAutorizadoPelaIdade({ protegido: true, restrita: true, vinculo: { estado: 'convidado' } })).toBe(false)
    expect(alivioAutorizadoPelaIdade({ protegido: true, restrita: true, vinculo: { estado: 'aceito' } })).toBe(false)
  })

  it('estado desconhecido é tratado como protegido sem autorização (a configuração mais protetiva)', () => {
    expect(alivioAutorizadoPelaIdade(null)).toBe(false)
  })
})

describe('o que resta da franquia', () => {
  const porSegundo = (0.04 * FATOR_FATURADO_DO_STT) / 3600

  it('sem uso: as 3 h inteiras', () => {
    expect(segundosRestantesDoAlivio({ sttUsados: 0, gastoUsd: 0, custoPorSegundoUsd: porSegundo })).toBe(10_800)
  })

  it('os segundos usados descontam', () => {
    expect(segundosRestantesDoAlivio({ sttUsados: 3_600, gastoUsd: 0, custoPorSegundoUsd: porSegundo })).toBe(7_200)
  })

  it('o dólar gasto em TRADUÇÃO também encurta o tempo: o teto em dólar é um só', () => {
    const r = segundosRestantesDoAlivio({ sttUsados: 0, gastoUsd: 0.065, custoPorSegundoUsd: porSegundo })
    expect(r).toBeLessThan(10_800)
    expect(r).toBeGreaterThan(5_000)
  })

  it('nunca negativo, e zero com o teto em dólar atingido', () => {
    expect(segundosRestantesDoAlivio({ sttUsados: 20_000, gastoUsd: 0, custoPorSegundoUsd: porSegundo })).toBe(0)
    expect(segundosRestantesDoAlivio({ sttUsados: 0, gastoUsd: 0.2, custoPorSegundoUsd: porSegundo })).toBe(0)
  })
})

describe('pool do dia e reserva dos pagantes', () => {
  it('o alívio nunca passa de 20% do orçamento diário', () => {
    expect(FRACAO_DO_ALIVIO_NO_ORCAMENTO).toBe(0.2)
    expect(poolDoAlivioUsd({ tetoDiaUsd: 4, tetoMesUsd: 40, poolConfiguradoUsd: null })).toBeCloseTo(0.8)
  })

  it('sem teto diário, a referência é o mensal ÷ 30', () => {
    expect(poolDoAlivioUsd({ tetoDiaUsd: Infinity, tetoMesUsd: 30, poolConfiguradoUsd: null })).toBeCloseTo(0.2)
  })

  it('o pool configurado vale só para BAIXO: nunca passa dos 20%', () => {
    expect(poolDoAlivioUsd({ tetoDiaUsd: 4, tetoMesUsd: 40, poolConfiguradoUsd: 0.3 })).toBeCloseTo(0.3)
    expect(poolDoAlivioUsd({ tetoDiaUsd: 4, tetoMesUsd: 40, poolConfiguradoUsd: 5 })).toBeCloseTo(0.8)
  })

  it('com o gasto do dia ou do mês a 80% do teto, o alívio fecha: o resto é de quem paga', () => {
    const base = { gastoDiaUsd: 0, tetoDiaUsd: 10, gastoMesUsd: 0, tetoMesUsd: 100 }
    expect(reservaDosPagantesAtingida(base)).toBe(false)
    expect(reservaDosPagantesAtingida({ ...base, gastoDiaUsd: 7.99 })).toBe(false)
    expect(reservaDosPagantesAtingida({ ...base, gastoDiaUsd: 8 })).toBe(true)
    expect(reservaDosPagantesAtingida({ ...base, gastoMesUsd: 80 })).toBe(true)
    expect(reservaDosPagantesAtingida({ ...base, tetoDiaUsd: Infinity, gastoDiaUsd: 1e9 })).toBe(false)
  })
})

describe('a oferta no cliente', () => {
  const pede = { leve: true, travamento: false, gpuReal: false }
  const base = {
    servidor: { disponivel: true, restanteSegundos: 9_000 },
    aparelho: pede,
    aceito: false,
    dispensado: false,
    perfilPrivado: false,
    edicaoEstatica: false,
  }

  it('aparelho fraco, servidor disponível e franquia sobrando: oferece', () => {
    expect(deveOferecerAlivio(base)).toBe(true)
  })

  it('aparelho forte: não oferece (roda local de graça)', () => {
    expect(deveOferecerAlivio({ ...base, aparelho: { leve: false, travamento: false, gpuReal: true } })).toBe(false)
  })

  it('servidor indisponível (flag, protegido, pool) ou franquia no fim: não oferece', () => {
    expect(deveOferecerAlivio({ ...base, servidor: null })).toBe(false)
    expect(deveOferecerAlivio({ ...base, servidor: { disponivel: false, restanteSegundos: 9_000 } })).toBe(false)
    expect(deveOferecerAlivio({ ...base, servidor: { disponivel: true, restanteSegundos: 30 } })).toBe(false)
  })

  it('já aceito, "Agora não" nesta sessão, perfil Privado ou edição estática: não oferece de novo', () => {
    expect(deveOferecerAlivio({ ...base, aceito: true })).toBe(false)
    expect(deveOferecerAlivio({ ...base, dispensado: true })).toBe(false)
    expect(deveOferecerAlivio({ ...base, perfilPrivado: true })).toBe(false)
    expect(deveOferecerAlivio({ ...base, edicaoEstatica: true })).toBe(false)
  })
})
