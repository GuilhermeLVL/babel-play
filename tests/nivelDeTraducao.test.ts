/**
 * B3 (Fase B, 29/09/2026) — O CONTRATO DOS NÍVEIS DE TRADUÇÃO, compartilhado por servidor e cliente.
 *
 * `rapida` é o que o Grátis e o convidado recebem ("Tradução rápida ao vivo", o modelo barato);
 * `nuance`, o que quem paga recebe ("Tradução Nuance"); `polimento` existe no contrato para a Fase D
 * (D5, "polir a sessão"), sem rota agora. A regra que estes testes prendem é a de quem PODE: ela lê a
 * CAPACIDADE do plano (`traducaoNuance`), nunca o nome dele — a Fase C renomeia os planos, e um
 * `plan === 'pro'` espalhado viraria, no rename, um pagante recebendo o modelo do Grátis.
 */
import { describe, expect, it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import { ehNivelDaTraducao, NIVEIS_DA_TRADUCAO, niveisAtendidos, rebaixarNivel } from '../src/core/nivelDeTraducao'
import { PLAN_MATRIX, PLANO_CONVIDADO, PLANOS_DE_ASSINATURA } from '../src/core/planos'

describe('o vocabulário', () => {
  it('são três níveis, em ordem crescente de custo', () => {
    expect(NIVEIS_DA_TRADUCAO).toEqual(['rapida', 'nuance', 'polimento'])
  })

  it('só os três nomes valem — o resto (inclusive caixa diferente) não é nível', () => {
    for (const n of NIVEIS_DA_TRADUCAO) expect(ehNivelDaTraducao(n)).toBe(true)
    for (const v of ['Rapida', 'premium', '', null, undefined, 1, {}]) expect(ehNivelDaTraducao(v)).toBe(false)
  })
})

describe('a cadeia de cada nível — o que atende quando o modelo do nível falta ou cai', () => {
  it('rápida é só rápida: quem não paga nunca cai num modelo caro', () => {
    expect(niveisAtendidos('rapida')).toEqual(['rapida'])
  })

  it('nuance tenta o modelo da nuance e cai no mais barato', () => {
    expect(niveisAtendidos('nuance')).toEqual(['nuance', 'rapida'])
  })

  it('polimento desce a escada inteira', () => {
    expect(niveisAtendidos('polimento')).toEqual(['polimento', 'nuance', 'rapida'])
  })
})

describe('quem PODE: a capacidade, não o nome do plano', () => {
  it('sem traducaoNuance, qualquer pedido vira rápida', () => {
    for (const n of NIVEIS_DA_TRADUCAO) expect(rebaixarNivel(n, { traducaoNuance: false })).toBe('rapida')
    expect(rebaixarNivel(undefined, { traducaoNuance: false })).toBe('rapida')
  })

  it('com traducaoNuance, o pedido vale como veio', () => {
    for (const n of NIVEIS_DA_TRADUCAO) expect(rebaixarNivel(n, { traducaoNuance: true })).toBe(n)
  })

  it('capacidade ausente (cliente antigo, forma desconhecida) é a segura: rápida', () => {
    expect(rebaixarNivel('nuance', {})).toBe('rapida')
  })
})

describe('o entitlement na matriz', () => {
  it('traducaoNuance: verdadeiro nos planos pagos e no selfhost; falso no Grátis e no convidado', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      const pago = PLAN_MATRIX[p].precoMensalBrl !== null
      expect(PLAN_MATRIX[p].entitlements.traducaoNuance, p).toBe(pago || p === 'selfhost')
    }
    expect(PLANO_CONVIDADO.entitlements.traducaoNuance).toBe(false)
  })

  it('o servidor o devolve junto com os outros (sai da matriz)', () => {
    expect(getEntitlements('free').traducaoNuance).toBe(false)
    expect(getEntitlements('selfhost').traducaoNuance).toBe(true)
    expect(getEntitlements('convidado').traducaoNuance).toBe(false)
  })

  it('quem tem a nuance tem a nuvem gerenciada: nuance sem managedCloudLlm não teria por onde chegar', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      const e = PLAN_MATRIX[p].entitlements
      if (e.traducaoNuance) expect(e.managedCloudLlm, p).toBe(true)
    }
  })
})
