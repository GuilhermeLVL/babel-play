/**
 * PARIDADE DA MATRIZ DE PLANOS — servidor e cliente leem a MESMA fonte.
 *
 * A lista de planos vivia copiada à mão em cinco lugares, e quatro falhavam em silêncio: plano
 * desconhecido virava `free`, o cliente descartava a resposta inteira, quotas devolviam zero.
 * Estes testes prendem a consolidação: se alguém recriar uma lista à mão e ela divergir, é aqui
 * que quebra — em vez de na conta de um assinante.
 *
 * E a MATRIZ V3 (change `planos-v3-e-rota-inteligente`, ADR 0013): Grátis e três planos pagos por
 * nível de serviço — Essencial, Premium e Ao Vivo —, cada um com as suas horas, e TODO valor cobrável
 * distinto dos outros, porque o webhook descobre o plano pelo valor pago.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import { capDeArmazenamento } from '../server/lib/storageQuota'
import {
  capForPlan,
  capSegundosAoVivoParaPlano,
  capSegundosParaPlano,
  capTokensParaPlano,
} from '../server/lib/usageQuota'
import {
  ehPlanoDeAssinatura,
  horasDeTranscricao,
  menorPrecoDeAssinatura,
  normalizarPlano,
  PARCELAS_DO_ANUAL,
  PLAN_MATRIX,
  PLANO_DO_TESTE,
  planoPagoMaisBarato,
  planoPeloPagamento,
  PLANOS_DE_ASSINATURA,
  PLANOS_LEGADOS,
  PLANOS_PAGOS,
  valoresDasParcelas,
} from '../src/core/planos'
import { PLAN_LABELS } from '../src/lib/entitlements'

afterEach(() => {
  delete process.env.PREMIUM_MONTHLY_STT_SECONDS
})

const HORA = 3_600

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
      expect(capSegundosAoVivoParaPlano(p), `ao vivo de ${p}`).toBe(
        q.sttAoVivoSegundosMes === null ? Infinity : q.sttAoVivoSegundosMes,
      )
      expect(capTokensParaPlano(p), `tokens de ${p}`).toBe(q.tokensMes === null ? Infinity : q.tokensMes)
      const bytes = capDeArmazenamento(p)
      if (q.armazenamentoMb === null) expect(bytes).toBe(Infinity)
      else expect(bytes, `armazenamento de ${p}`).toBe(q.armazenamentoMb * 1024 * 1024)
    }
  })
})

/*
 * A MATRIZ V3 (decisões de 09/10/2026, `design.md` §1 e §11): Essencial R$ 9,90 (ou R$ 79,90 no ano),
 * Premium R$ 19,90 (ou R$ 149,90), Ao Vivo R$ 39,90 (só mensal). 5 h, 20 h e 20 h + 10 h ao vivo. A
 * conta de custo está no topo de `src/core/planos.ts`.
 */
describe('a matriz v3', () => {
  it('cinco planos, nesta ordem: free, essencial, premium, aovivo e selfhost', () => {
    expect([...PLANOS_DE_ASSINATURA]).toEqual(['free', 'essencial', 'premium', 'aovivo', 'selfhost'])
    expect([...PLANOS_PAGOS]).toEqual(['essencial', 'premium', 'aovivo'])
  })

  it('os preços: Essencial 9,90 / 79,90; Premium 19,90 / 149,90; Ao Vivo 39,90, só mensal', () => {
    expect(PLAN_MATRIX.essencial).toMatchObject({ rotulo: 'Essencial', precoMensalBrl: 9.9, precoAnualBrl: 79.9 })
    expect(PLAN_MATRIX.premium).toMatchObject({ rotulo: 'Premium', precoMensalBrl: 19.9, precoAnualBrl: 149.9 })
    expect(PLAN_MATRIX.aovivo).toMatchObject({ rotulo: 'Ao Vivo', precoMensalBrl: 39.9, precoAnualBrl: null })
    expect(PARCELAS_DO_ANUAL).toBe(12)
    expect(PLAN_MATRIX.free.precoAnualBrl).toBeNull()
    expect(PLAN_MATRIX.selfhost.precoAnualBrl).toBeNull()
    expect(planoPagoMaisBarato()).toBe('essencial')
  })

  /* "A partir de R$ X" é o menor preço do que está À VENDA: com a venda dos planos novos fechada
     (como nasce), anunciar os R$ 9,90 do Essencial seria prometer um plano que o checkout recusa. */
  it('o menor preço anunciado é o do que se vende: R$ 19,90 com a venda fechada, R$ 9,90 aberta', () => {
    expect(menorPrecoDeAssinatura()).toBe('19,90')
    expect(menorPrecoDeAssinatura(() => true)).toBe('9,90')
    expect(menorPrecoDeAssinatura((chave) => chave === 'stt_ao_vivo')).toBe('19,90')
  })

  it('as horas: Essencial 5 h por trechos; Premium 20 h; Ao Vivo 20 h por trechos MAIS 10 h ao vivo', () => {
    const horas = (p: (typeof PLANOS_PAGOS)[number]) => ({
      trechos: (PLAN_MATRIX[p].quotas.sttSegundosMes as number) / HORA,
      aovivo: (PLAN_MATRIX[p].quotas.sttAoVivoSegundosMes as number) / HORA,
    })
    expect(horas('essencial')).toEqual({ trechos: 5, aovivo: 0 })
    expect(horas('premium')).toEqual({ trechos: 20, aovivo: 0 })
    expect(horas('aovivo')).toEqual({ trechos: 20, aovivo: 10 })
    // A tela escreve as horas a partir daqui.
    expect(horasDeTranscricao('essencial')).toBe(5)
    expect(horasDeTranscricao('premium')).toBe(20)
  })

  /* A tabela do `design.md` §1, linha a linha. */
  it('as capacidades de cada plano pago', () => {
    expect(getEntitlements('essencial')).toMatchObject({
      semAnuncios: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      sttAoVivo: false,
      traducaoNuance: true,
      interpreteAutomatico: false,
      vozNatural: false,
      nivelDeVoz: 'aparelho',
    })
    expect(getEntitlements('premium')).toMatchObject({
      semAnuncios: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      sttAoVivo: false,
      traducaoNuance: true,
      interpreteAutomatico: true,
      vozNatural: true,
      nivelDeVoz: 'basica',
    })
    expect(getEntitlements('aovivo')).toMatchObject({
      semAnuncios: true,
      managedCloudStt: true,
      managedCloudLlm: true,
      largerModels: true,
      sttAoVivo: true,
      traducaoNuance: true,
      interpreteAutomatico: true,
      vozNatural: true,
      nivelDeVoz: 'boa',
    })
  })

  it('o Grátis não tem nuvem, Nuance, voz natural nem intérprete automático; o self-host tem tudo', () => {
    expect(getEntitlements('free')).toMatchObject({
      managedCloudStt: false,
      managedCloudLlm: false,
      traducaoNuance: false,
      vozNatural: false,
      interpreteAutomatico: false,
    })
    const tudo = getEntitlements('selfhost')
    expect(tudo.traducaoNuance && tudo.vozNatural && tudo.interpreteAutomatico && tudo.youtubeImport).toBe(true)
  })

  /* Cada plano contém o de baixo: é o que deixa a migração 0049 pôr o Ao Vivo em toda regra que cita
     o Premium, e o que impede a tela de vender um plano mais caro com menos coisa. */
  it('a escada: o Premium tem tudo do Essencial, e o Ao Vivo tem tudo do Premium', () => {
    const contem = (maior: (typeof PLANOS_PAGOS)[number], menor: (typeof PLANOS_PAGOS)[number]) => {
      const a = PLAN_MATRIX[maior]
      const b = PLAN_MATRIX[menor]
      for (const [campo, valor] of Object.entries(b.entitlements)) {
        if (valor === true) expect(a.entitlements, `${maior} sem ${campo} do ${menor}`).toHaveProperty(campo, true)
      }
      for (const [campo, valor] of Object.entries(b.quotas)) {
        const doMaior = (a.quotas as unknown as Record<string, number | null>)[campo]
        if (valor !== null && doMaior !== null)
          expect(doMaior, `${campo}: ${maior} < ${menor}`).toBeGreaterThanOrEqual(valor)
      }
      expect(a.precoMensalBrl as number).toBeGreaterThan(b.precoMensalBrl as number)
    }
    contem('premium', 'essencial')
    contem('aovivo', 'premium')
  })

  it('o teste de 14 dias continua sendo do Premium', () => {
    expect(PLANO_DO_TESTE).toBe('premium')
  })

  it('o teto mensal do Premium: 20 h (72.000 s), e a env sobrepõe', () => {
    expect(capSegundosParaPlano('premium')).toBe(72_000)
    process.env.PREMIUM_MONTHLY_STT_SECONDS = '216000'
    expect(capSegundosParaPlano('premium')).toBe(216_000)
  })

  it('o uso justo do dia: 2 h (7.200 s) e os tokens de 2 h de fala', () => {
    expect(PLAN_MATRIX.premium.quotas.sttSegundosDia).toBe(7_200)
    // 150 mil tokens por hora de fala (a mistura medida na bancada) — ver o topo da matriz.
    expect(PLAN_MATRIX.premium.quotas.tokensDia).toBe(300_000)
    expect(PLAN_MATRIX.aovivo.quotas.sttSegundosDia).toBe(7_200)
    // Sem teto no dia = nada é contado por dia. No Essencial, as 5 h do mês já são o limite.
    for (const p of ['free', 'essencial', 'selfhost'] as const) {
      expect(PLAN_MATRIX[p].quotas.sttSegundosDia, p).toBeNull()
      expect(PLAN_MATRIX[p].quotas.tokensDia, p).toBeNull()
    }
  })

  it('o dia cabe no mês: o teto do dia nunca é maior que o do mês, em nenhum plano', () => {
    for (const p of PLANOS_PAGOS) {
      const q = PLAN_MATRIX[p].quotas
      if (q.sttSegundosDia !== null) expect(q.sttSegundosDia, p).toBeLessThanOrEqual(q.sttSegundosMes!)
      if (q.tokensDia !== null) expect(q.tokensDia, p).toBeLessThanOrEqual(q.tokensMes!)
      if (q.vozCaracteresDia !== null) expect(q.vozCaracteresDia, p).toBeLessThanOrEqual(q.vozCaracteresMes!)
    }
  })

  /* 150 mil tokens por hora de fala: os tokens do plano traduzem as horas que ele vende. */
  it('os tokens cobrem as horas vendidas (por trechos e ao vivo)', () => {
    for (const p of PLANOS_PAGOS) {
      const q = PLAN_MATRIX[p].quotas
      const horas = ((q.sttSegundosMes as number) + (q.sttAoVivoSegundosMes as number)) / HORA
      expect(q.tokensMes, p).toBeGreaterThanOrEqual(horas * 150_000)
    }
  })

  it('as chamadas cobrem as horas vendidas: cada fala de ~6 s usa duas (transcrever + traduzir)', () => {
    for (const p of PLANOS_PAGOS) {
      const falas = PLAN_MATRIX[p].quotas.sttSegundosMes! / 6
      expect(capForPlan(p), p).toBeGreaterThanOrEqual(falas * 2)
    }
  })

  // MVP (04/10/2026): nenhum plano vende espaço enquanto o áudio dividir o volume com o banco.
  it('nenhum plano pago vende espaço: o teto de armazenamento é o do Grátis', () => {
    for (const p of PLANOS_PAGOS) {
      expect(PLAN_MATRIX[p].quotas.armazenamentoMb, p).toBe(PLAN_MATRIX.free.quotas.armazenamentoMb)
    }
  })

  it('YouTube não é vendido: no modo hospedado a rota responde 403', () => {
    for (const p of PLANOS_PAGOS) expect(getEntitlements(p).youtubeImport, p).toBe(false)
    expect(getEntitlements('selfhost').youtubeImport).toBe(true)
  })

  it('a nuvem de alívio do Grátis fica como está enquanto os anúncios não existem', async () => {
    const { FRANQUIA_DE_ALIVIO } = await import('../src/core/planos')
    expect(FRANQUIA_DE_ALIVIO).toEqual({
      sttSegundosMes: 10_800,
      tokensMes: 540_000,
      chamadasMes: 4_000,
      tetoUsdMes: 0.13,
    })
    expect(PLAN_MATRIX.free.quotas.sttSegundosMes).toBe(0)
  })
})

describe('os nomes antigos', () => {
  it('só `pro` é apelido (do Premium); `essencial` voltou a ser um plano de verdade', () => {
    expect(PLANOS_LEGADOS).toEqual({ pro: 'premium' })
    expect(normalizarPlano('pro')).toBe('premium')
    expect(normalizarPlano('essencial')).toBe('essencial')
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
    expect(ehPlanoDeAssinatura('essencial')).toBe(true)
    expect(ehPlanoDeAssinatura('aovivo')).toBe(true)
    expect(ehPlanoDeAssinatura('pro')).toBe(false)
  })
})

/** Todo valor que o Asaas pode cobrar por um plano, com o que ele tem de pagar. */
function valoresCobraveis() {
  const lista: Array<{ plano: string; ciclo: 'mensal' | 'anual'; valor: number; parcelas: number; oQue: string }> = []
  for (const plano of PLANOS_PAGOS) {
    const { precoMensalBrl: mensal, precoAnualBrl: anual } = PLAN_MATRIX[plano]
    lista.push({ plano, ciclo: 'mensal', valor: mensal as number, parcelas: 1, oQue: 'mensalidade' })
    if (anual === null) continue
    const { padrao, ultima } = valoresDasParcelas(anual, PARCELAS_DO_ANUAL)
    lista.push({ plano, ciclo: 'anual', valor: anual, parcelas: 1, oQue: 'ano à vista' })
    lista.push({ plano, ciclo: 'anual', valor: padrao, parcelas: PARCELAS_DO_ANUAL, oQue: 'parcela do 12x' })
    lista.push({ plano, ciclo: 'anual', valor: ultima, parcelas: PARCELAS_DO_ANUAL, oQue: 'última parcela do 12x' })
  }
  return lista
}

/*
 * O PLANO E O CICLO SAEM DO DINHEIRO (GAP-001): o webhook pergunta "o que este valor paga?". O Asaas
 * TRUNCA a divisão do 12x e joga a diferença na última parcela (sondagem de 29/09/2026,
 * `openspec/changes/planos-v2/design.md`): 149,90 = 11 × 12,49 + 12,51; 79,90 = 11 × 6,65 + 6,75.
 */
describe('planoPeloPagamento', () => {
  it('o mensal e o anual inteiro de cada plano', () => {
    expect(planoPeloPagamento(9.9)).toEqual({ plano: 'essencial', ciclo: 'mensal' })
    expect(planoPeloPagamento(79.9)).toEqual({ plano: 'essencial', ciclo: 'anual' })
    expect(planoPeloPagamento(19.9)).toEqual({ plano: 'premium', ciclo: 'mensal' })
    expect(planoPeloPagamento(149.9)).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(149.9, { parcelas: 1 })).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(39.9)).toEqual({ plano: 'aovivo', ciclo: 'mensal' })
  })

  /* O defeito que a regra fecha: o webhook identifica o plano pelo valor, então dois planos com um
     valor em comum fariam um pagar o outro. Vale para TODOS os valores juntos (mensalidade, ano e as
     duas parcelas), não só dentro de cada ciclo: um evento de parcela que chegasse sem dizer que é
     parcela não pode cair na mensalidade de outro plano. */
  it('TODO valor cobrável é distinto de todos os outros', () => {
    const lista = valoresCobraveis()
    // 3 mensalidades + 2 planos com anual × (ano, parcela, última).
    expect(lista).toHaveLength(9)
    const centavos = lista.map((v) => Math.round(v.valor * 100))
    const repetidos = lista.filter((_, i) => centavos.indexOf(centavos[i]) !== i)
    expect(repetidos, 'dois planos (ou dois ciclos) cobram o mesmo valor').toEqual([])
    // E distintos com folga maior que a tolerância de ponto flutuante do casamento (meio centavo).
    const ordenados = [...centavos].sort((a, b) => a - b)
    for (let i = 1; i < ordenados.length; i++) expect(ordenados[i] - ordenados[i - 1]).toBeGreaterThanOrEqual(1)
  })

  it('cada valor cobrável paga o plano e o ciclo dele — e só ele', () => {
    for (const v of valoresCobraveis()) {
      expect(planoPeloPagamento(v.valor, { parcelas: v.parcelas }), `${v.oQue} do ${v.plano}`).toEqual({
        plano: v.plano,
        ciclo: v.ciclo,
      })
    }
  })

  it('tolera o ponto flutuante do provedor (menos de meio centavo)', () => {
    expect(planoPeloPagamento(19.899999)).toEqual({ plano: 'premium', ciclo: 'mensal' })
    expect(planoPeloPagamento(9.900001)).toEqual({ plano: 'essencial', ciclo: 'mensal' })
  })

  it('as parcelas do 12x, como o Asaas as cobra', () => {
    expect(valoresDasParcelas(149.9, 12)).toEqual({ padrao: 12.49, ultima: 12.51 })
    expect(valoresDasParcelas(79.9, 12)).toEqual({ padrao: 6.65, ultima: 6.75 })
    expect(planoPeloPagamento(12.49, { parcelas: 12 })).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(12.51, { parcelas: 12 })).toEqual({ plano: 'premium', ciclo: 'anual' })
    expect(planoPeloPagamento(6.65, { parcelas: 12 })).toEqual({ plano: 'essencial', ciclo: 'anual' })
    expect(planoPeloPagamento(6.75, { parcelas: 12 })).toEqual({ plano: 'essencial', ciclo: 'anual' })
  })

  it('parcela sem dizer que é parcela não paga plano nenhum', () => {
    expect(planoPeloPagamento(12.49)).toBeNull()
    expect(planoPeloPagamento(6.65)).toBeNull()
  })

  it('só o 12x é vendido: outra quantidade de parcelas não paga plano', () => {
    const { padrao } = valoresDasParcelas(149.9, 6)
    expect(planoPeloPagamento(padrao, { parcelas: 6 })).toBeNull()
    expect(planoPeloPagamento(15, { parcelas: 12 })).toBeNull()
    // O Ao Vivo não tem anual: a mensalidade dele não é parcela de nada.
    expect(planoPeloPagamento(39.9, { parcelas: 12 })).toBeNull()
  })

  /* `design.md` §11, item 3: R$ 39,90 era lido como "o Pro antigo" e concedia o Premium; R$ 179 era
     o anual da v2. Nenhum dos dois paga mais o que pagava. */
  it('os preços da v2 saíram: R$ 179 e as parcelas dele não pagam nada, e R$ 39,90 é o Ao Vivo', () => {
    expect(planoPeloPagamento(179)).toBeNull()
    expect(planoPeloPagamento(14.91, { parcelas: 12 })).toBeNull()
    expect(planoPeloPagamento(14.99, { parcelas: 12 })).toBeNull()
    expect(planoPeloPagamento(39.9)?.plano).toBe('aovivo')
  })

  it('valor que não é de plano, ou que não é número, é null', () => {
    expect(planoPeloPagamento(5)).toBeNull()
    expect(planoPeloPagamento(undefined)).toBeNull()
    expect(planoPeloPagamento(Number.NaN)).toBeNull()
    expect(planoPeloPagamento(0)).toBeNull()
  })
})
