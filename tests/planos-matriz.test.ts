/**
 * PARIDADE DA MATRIZ DE PLANOS — servidor e cliente leem a MESMA fonte.
 *
 * A lista de planos vivia copiada à mão em cinco lugares, e quatro falhavam em silêncio: plano
 * desconhecido virava `free`, o cliente descartava a resposta inteira, quotas devolviam zero.
 * Estes testes prendem a consolidação: se alguém recriar uma lista à mão e ela divergir, é aqui
 * que quebra — em vez de na conta de um assinante.
 */
import { describe, expect, it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import { capDeArmazenamento } from '../server/lib/storageQuota'
import { capForPlan, capSegundosParaPlano, capTokensParaPlano } from '../server/lib/usageQuota'
import { ehPlanoDeAssinatura, PLAN_MATRIX, PLANOS_DE_ASSINATURA } from '../src/core/planos'
import { PLAN_LABELS } from '../src/lib/entitlements'

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
 * OS PLANOS DO LANÇAMENTO (Fase 2, decisão do dono em 24/09/2026): Essencial R$ 19,90 com LLM e
 * transcrição de nuvem por 15 h/mês; Pro R$ 39,90 com 20 h/mês e o modelo maior. A conta de custo
 * de cada número está no comentário de `src/core/planos.ts`.
 */
describe('os planos do lançamento', () => {
  it('Essencial: R$ 19,90, LLM e transcrição de nuvem, 15 h (54.000 s) por mês', () => {
    const e = getEntitlements('essencial')
    expect(PLAN_MATRIX.essencial.precoMensalBrl).toBe(19.9)
    expect(e.managedCloudLlm).toBe(true)
    expect(e.managedCloudStt).toBe(true)
    expect(e.largerModels).toBe(false)
    expect(capSegundosParaPlano('essencial')).toBe(54_000)
  })

  it('Pro: R$ 39,90, 20 h (72.000 s) por mês e o modelo maior', () => {
    const e = getEntitlements('pro')
    expect(PLAN_MATRIX.pro.precoMensalBrl).toBe(39.9)
    expect(e.managedCloudLlm && e.managedCloudStt && e.largerModels).toBe(true)
    expect(capSegundosParaPlano('pro')).toBe(72_000)
  })

  it('YouTube não é vendido em plano nenhum: no modo hospedado a rota responde 403', () => {
    expect(getEntitlements('essencial').youtubeImport).toBe(false)
    expect(getEntitlements('pro').youtubeImport).toBe(false)
    // Só o self-host (servidor do próprio dono) importa do YouTube.
    expect(getEntitlements('selfhost').youtubeImport).toBe(true)
  })

  it('as chamadas cobrem as horas vendidas: cada fala de ~6 s usa duas (transcrever + traduzir)', () => {
    for (const p of ['essencial', 'pro'] as const) {
      const falas = PLAN_MATRIX[p].quotas.sttSegundosMes! / 6
      expect(capForPlan(p), p).toBeGreaterThanOrEqual(falas * 2)
    }
  })

  it('o Pro tem mais de tudo que o Essencial', () => {
    const e = PLAN_MATRIX.essencial.quotas
    const p = PLAN_MATRIX.pro.quotas
    expect(p.sttSegundosMes!).toBeGreaterThan(e.sttSegundosMes!)
    expect(p.tokensMes!).toBeGreaterThan(e.tokensMes!)
    expect(p.chamadasMes!).toBeGreaterThan(e.chamadasMes!)
  })
})

describe('degradação barulhenta', () => {
  it('o guard rejeita plano fora da matriz', () => {
    expect(ehPlanoDeAssinatura('essencial')).toBe(true)
    expect(ehPlanoDeAssinatura('premium')).toBe(false)
    expect(ehPlanoDeAssinatura('')).toBe(false)
    expect(ehPlanoDeAssinatura(null)).toBe(false)
  })
})
