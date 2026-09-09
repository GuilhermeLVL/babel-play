/**
 * A AUTORIDADE DO SERVIDOR SOBRE O VALOR (mudança servidor-e-autoridade).
 *
 * Estes testes existem por causa de dois ataques que a auditoria de 01/09 encontrou e que a suíte
 * antiga não pegava — ela protegia CONTABILIDADE (idempotência, unicidade por usuário, valor
 * negativo) e nunca AUTORIZAÇÃO:
 *
 *   1. `{amount: 1, reason: 'loja:tema-custom'}` comprava um lendário de 600 Seeds por 1, e o
 *      servidor passava a atestar a posse (ela é derivada de `reason LIKE 'loja:%'`).
 *   2. `{creditoId: 'qualquer-coisa', amount: 10000, xp: 10000}` cunhava Seeds e XP sem limite.
 *
 * O que se prova aqui é a decisão pura: dado um motivo, o que ele autoriza e por quanto. A rota
 * que consome isto é testada em `tests/integration/economia-autoridade.test.ts`.
 */
import { describe, expect,it } from 'vitest'

import {
  autorizarGasto, CATALOGO_DA_LOJA, conquistaDoCreditoId, CONQUISTAS,
  CUSTO_PULAR_RODADA, CUSTOS_DE_NIVEL,
ehRecusa, PRECO_DO_CROMA, } from '../src/core'

describe('autorizarGasto — o preço vem do catálogo, não do cliente', () => {
  it('item da Loja cobra o preço do catálogo', () => {
    const item = CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined && !i.exclusivoDe)!
    const r = autorizarGasto(`loja:${item.id}`)
    expect(ehRecusa(r)).toBe(false)
    expect(r).toMatchObject({ tipo: 'loja', itemId: item.id, preco: item.precoSeeds })
  })

  it('item inexistente é recusado — era assim que se inventava posse', () => {
    const r = autorizarGasto('loja:nao-existe-este-item')
    expect(ehRecusa(r)).toBe(true)
  })

  it('EXCLUSIVO DE CONQUISTA nunca entra pela porta da compra', () => {
    const exclusivo = CATALOGO_DA_LOJA.find((i) => i.exclusivoDe)!
    const r = autorizarGasto(`loja:${exclusivo.id}`)
    expect(ehRecusa(r), `${exclusivo.id} não pode ser comprável`).toBe(true)
  })

  it('item que só destrava por nível não tem preço para cobrar', () => {
    const semPreco = CATALOGO_DA_LOJA.find((i) => i.precoSeeds === undefined && !i.exclusivoDe)
    if (!semPreco) return // catálogo pode não ter nenhum; o ramo continua protegido pelo tipo
    expect(ehRecusa(autorizarGasto(`loja:${semPreco.id}`))).toBe(true)
  })

  it('croma cobra pela raridade da PEÇA', () => {
    const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'rastro')!
    const r = autorizarGasto(`croma:${item.id}:ambar`)
    expect(r).toMatchObject({ tipo: 'croma', matiz: 'ambar', preco: PRECO_DO_CROMA[item.raridade] })
  })

  it('croma malformado ou de item inexistente é recusado', () => {
    expect(ehRecusa(autorizarGasto('croma:so-uma-parte'))).toBe(true)
    expect(ehRecusa(autorizarGasto('croma:nao-existe:ambar'))).toBe(true)
  })

  it('aprimoramento cobra o degrau certo da escada', () => {
    expect(autorizarGasto('aprimoramento:particulas:1')).toMatchObject({ preco: CUSTOS_DE_NIVEL[0] })
    expect(autorizarGasto('aprimoramento:particulas:3')).toMatchObject({ preco: CUSTOS_DE_NIVEL[2] })
  })

  it('degrau fora da escada e alvo inventado são recusados', () => {
    expect(ehRecusa(autorizarGasto('aprimoramento:particulas:4'))).toBe(true)
    expect(ehRecusa(autorizarGasto('aprimoramento:particulas:0'))).toBe(true)
    expect(ehRecusa(autorizarGasto('aprimoramento:dinheiro-infinito:1'))).toBe(true)
  })

  it('pular rodada tem preço fixo', () => {
    expect(autorizarGasto('pular-rodada')).toMatchObject({ preco: CUSTO_PULAR_RODADA })
  })

  it('motivo em formato desconhecido é recusado — o razão deixa de ser texto livre', () => {
    for (const r of ['', 'qualquer coisa', 'LOJA:tema-custom', 'loja', 'presente-gratis']) {
      expect(ehRecusa(autorizarGasto(r)), `"${r}" não pode autorizar nada`).toBe(true)
    }
  })
})

describe('conquistaDoCreditoId — o crédito vem da regra, não do corpo', () => {
  it('resolve o id que o cliente usa hoje (`conquista-<id>`)', () => {
    const c = CONQUISTAS[0]
    const achada = conquistaDoCreditoId(`conquista-${c.id}`)
    expect(achada?.id).toBe(c.id)
    expect(achada?.recompensa.seeds).toBe(c.recompensa.seeds)
  })

  it('id inventado não resolve — era por aqui que se cunhava moeda', () => {
    expect(conquistaDoCreditoId('conquista-dinheiro-infinito')).toBeNull()
    expect(conquistaDoCreditoId('qualquer-coisa-com-8-chars')).toBeNull()
  })

  it('toda conquista do catálogo tem recompensa que cabe no teto de sanidade', () => {
    // Se uma conquista passar de 10.000, o teto do Zod passaria a recusar um crédito legítimo.
    for (const c of CONQUISTAS) {
      expect(c.recompensa.seeds, c.id).toBeLessThanOrEqual(10_000)
      expect(c.recompensa.xp, c.id).toBeLessThanOrEqual(10_000)
    }
  })
})
