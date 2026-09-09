/**
 * PARIDADE DA MATRIZ DE PLANOS — servidor e cliente leem a MESMA fonte.
 *
 * A lista de planos vivia copiada à mão em cinco lugares, e quatro falhavam em silêncio: plano
 * desconhecido virava `free`, o cliente descartava a resposta inteira, quotas devolviam zero.
 * Estes testes prendem a consolidação: se alguém recriar uma lista à mão e ela divergir, é aqui
 * que quebra — em vez de na conta de um assinante.
 */
import { describe, expect,it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import { capDeArmazenamento } from '../server/lib/storageQuota'
import { capForPlan, capSegundosParaPlano } from '../server/lib/usageQuota'
import { ehPlanoDeAssinatura,PLAN_MATRIX, PLANOS_DE_ASSINATURA } from '../src/core/planos'
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
      const bytes = capDeArmazenamento(p)
      if (q.armazenamentoMb === null) expect(bytes).toBe(Infinity)
      else expect(bytes, `armazenamento de ${p}`).toBe(q.armazenamentoMb * 1024 * 1024)
    }
  })
})

describe('o plano Essencial — a assimetria que o torna barato', () => {
  it('tradução de nuvem SIM, STT de nuvem NÃO', () => {
    const e = getEntitlements('essencial')
    expect(e.managedCloudLlm).toBe(true)
    expect(e.managedCloudStt).toBe(false)
    expect(e.youtubeImport).toBe(false)
    expect(e.largerModels).toBe(false)
  })

  it('tem chamadas para traduzir e ZERO segundos de STT de nuvem', () => {
    expect(capForPlan('essencial')).toBe(12_000)
    // Zero de propósito: é o teto de gasto de STT que faz o plano custar < R$ 1/usuário.
    expect(capSegundosParaPlano('essencial')).toBe(0)
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
