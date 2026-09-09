/**
 * FASE 4 — O MODELO DE IA PASSA A SEGUIR O PLANO.
 *
 * `largerModels` existe na matriz de planos desde a Fatia 1 (`src/core/planos.ts`): `false` para
 * anônimo, free e essencial, `true` para pro e selfhost. Ele é devolvido ao cliente em
 * `/api/me/entitlements` — e, medido em 2026-09-09 com `grep largerModels server/`, **nenhuma
 * linha do servidor o lia**. Todo plano recebia o mesmo modelo.
 *
 * São dois defeitos num só: o Pro paga por uma diferença que não existe, e o free usa o modelo
 * caro sem nada o impedir. O segundo é o que custa dinheiro.
 *
 * O que este arquivo trava é a REGRA, na função que a decide (`server/ai/provedores.ts`) e na
 * matriz que a alimenta. O enforcement por rota já tem rede própria (`plan-mt-enforcement`,
 * `plan-stt-enforcement`, `quota-reserve-proxies`); o que faltava era alguém ler o entitlement.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cascataDeTraducao, llmDeNuvem, MODELO_LLM_PADRAO } from '../../server/ai/provedores'
import { getEntitlements } from '../../server/lib/entitlements'
import { PLAN_MATRIX } from '../../src/core/planos'

const ANTES = { ...process.env }

beforeEach(() => {
  process.env.LLM_API_KEY = 'chave-de-teste'
  delete process.env.LLM_MODEL
  delete process.env.GROQ_LLM_MODEL
  delete process.env.GROQ_MODEL
  delete process.env.LLM_MODEL_GRANDE
})

afterEach(() => {
  process.env = { ...ANTES }
})

describe('quem recebe o modelo grande', () => {
  it('com LLM_MODEL_GRANDE definido, só quem tem o entitlement', () => {
    process.env.LLM_MODEL = 'modelo-de-todo-dia'
    process.env.LLM_MODEL_GRANDE = 'modelo-caro'

    expect(llmDeNuvem({ modelosGrandes: true })?.model).toBe('modelo-caro')
    expect(llmDeNuvem({ modelosGrandes: false })?.model).toBe('modelo-de-todo-dia')
    // Sem opção nenhuma é o mesmo que não ter o entitlement — o padrão seguro é o barato.
    expect(llmDeNuvem()?.model).toBe('modelo-de-todo-dia')
  })

  /**
   * A VARIÁVEL AUSENTE MANTÉM O COMPORTAMENTO ANTERIOR, de propósito: qual modelo vale a diferença
   * de preço é decisão de produto, e o código não tem por que inventar um nome. O que mudou é que,
   * definida, ela passa a ser respeitada.
   */
  it('sem LLM_MODEL_GRANDE, todo plano continua no mesmo modelo', () => {
    process.env.LLM_MODEL = 'modelo-de-todo-dia'
    expect(llmDeNuvem({ modelosGrandes: true })?.model).toBe('modelo-de-todo-dia')
    expect(llmDeNuvem({ modelosGrandes: false })?.model).toBe('modelo-de-todo-dia')
  })

  it('e sem LLM_MODEL nenhum, os dois caem no default medido', () => {
    expect(llmDeNuvem({ modelosGrandes: true })?.model).toBe(MODELO_LLM_PADRAO)
    expect(llmDeNuvem({ modelosGrandes: false })?.model).toBe(MODELO_LLM_PADRAO)
  })

  it('uma string vazia não conta como configurada', () => {
    process.env.LLM_MODEL = 'modelo-de-todo-dia'
    process.env.LLM_MODEL_GRANDE = '   '
    expect(llmDeNuvem({ modelosGrandes: true })?.model).toBe('modelo-de-todo-dia')
  })
})

describe('a cascata de tradução repassa o plano ao primário', () => {
  it('o primário segue o entitlement', () => {
    process.env.LLM_MODEL = 'modelo-de-todo-dia'
    process.env.LLM_MODEL_GRANDE = 'modelo-caro'
    expect(cascataDeTraducao({ modelosGrandes: true })[0].model).toBe('modelo-caro')
    expect(cascataDeTraducao({ modelosGrandes: false })[0].model).toBe('modelo-de-todo-dia')
  })

  /**
   * A RESERVA NÃO SEGUE, e isso é decisão e não esquecimento: ela existe para a chamada não morrer
   * quando o primário cai, e o modelo dela é o que o operador configurou NAQUELE provedor. Trocar
   * por um nome de modelo de outro catálogo produziria `model_not_found` exatamente no momento em
   * que a reserva precisa funcionar.
   */
  it('a reserva mantém o modelo dela, mesmo para quem tem o entitlement', () => {
    process.env.LLM_MODEL_GRANDE = 'modelo-caro'
    process.env.LLM_RESERVA_BASE_URL = 'https://reserva.exemplo/v1'
    process.env.LLM_RESERVA_API_KEY = 'chave-reserva'
    process.env.LLM_RESERVA_MODEL = 'modelo-da-reserva'

    const cascata = cascataDeTraducao({ modelosGrandes: true })
    expect(cascata).toHaveLength(2)
    expect(cascata[1].model).toBe('modelo-da-reserva')
  })
})

describe('a matriz de planos, que é quem alimenta a decisão', () => {
  it('os planos que prometem largerModels são pro e selfhost, e só eles', () => {
    const comModeloGrande = Object.keys(PLAN_MATRIX).filter((p) => getEntitlements(p as never).largerModels)
    expect(comModeloGrande.sort()).toEqual(['pro', 'selfhost'])
  })

  it('quem não tem managedCloudLlm também não tem largerModels', () => {
    // Um plano que pudesse escolher o modelo caro sem poder usar a nuvem gerenciada seria uma
    // combinação sem sentido — e a que abriria a porta se alguém editasse a matriz sem pensar.
    for (const plano of Object.keys(PLAN_MATRIX)) {
      const e = getEntitlements(plano as never)
      if (e.largerModels) expect(e.managedCloudLlm, plano).toBe(true)
    }
  })
})
