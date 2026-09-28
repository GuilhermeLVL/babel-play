/**
 * LOJA COM CRÉDITOS (recompensas v2, onda 6, Task 6.1) — a vitrine e a régua do servidor.
 *
 * A vitrine de Créditos é CURTA e FECHADA: itens avulsos, conhecidos, com prévia e preço à vista.
 * Nada aleatório, nada de maestria, conquista ou temporada, nada que caia no baú ou que a Loja de
 * Seeds já venda com outro nome (mesmo `tipo` + `alvo`). Uma moeda por item.
 *
 * Os números e o equivalente em reais estão em `docs/economia-v2.md` ("Loja com Créditos").
 */
import 'fake-indexeddb/auto'

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CATALOGO_DE_CREDITOS } from '../src/core/creditos'
import {
  autorizarGastoDeCredito,
  ehRecusa,
  itensSorteaveisNoDrop,
  vendavelEmCreditos,
} from '../src/core/economiaAutoridade'
import { CATALOGO_DA_LOJA, type ItemDaLoja, VITRINE_DE_CREDITOS } from '../src/core/loja'
import { equivalenteDe } from '../src/core/reembolso'
import { CODIGO_EXIGE_CONTA, servidorEfemero } from '../src/data/efemero/servidor'

const VITRINE_ESPERADA = ['dourada-2', 'dourada-6', 'dourada-8', 'dourada-10']
const EMOJI = /\p{Extended_Pictographic}/u

describe('a vitrine de Créditos', () => {
  it('é a lista curada — e é exatamente o que tem `precoCreditos` no catálogo', () => {
    expect(VITRINE_DE_CREDITOS.map((i) => i.id)).toEqual(VITRINE_ESPERADA)
    expect(CATALOGO_DA_LOJA.filter((i) => i.precoCreditos !== undefined).map((i) => i.id)).toEqual(VITRINE_ESPERADA)
    expect(VITRINE_DE_CREDITOS.length).toBeGreaterThanOrEqual(4)
    expect(VITRINE_DE_CREDITOS.length).toBeLessThanOrEqual(6)
  })

  it('cada item: uma moeda só, lendário/épico, sem maestria, conquista, temporada nem baú', () => {
    const sorteaveis = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))
    for (const i of VITRINE_DE_CREDITOS) {
      expect(i.precoSeeds, i.id).toBeUndefined()
      expect(i.exclusivoDe, i.id).toBeUndefined()
      expect(i.origemMaestria, i.id).toBeUndefined()
      expect(i.origemTemporada, i.id).toBeUndefined()
      expect(['epico', 'lendario'], i.id).toContain(i.raridade)
      expect(sorteaveis.has(i.id), i.id).toBe(false)
      expect(vendavelEmCreditos(i), i.id).toBe(true)
    }
  })

  it('não vende com dinheiro o mesmo efeito que as Seeds ou o baú entregam (tipo + alvo)', () => {
    const deOutraPorta = CATALOGO_DA_LOJA.filter((i) => i.precoCreditos === undefined)
    for (const i of VITRINE_DE_CREDITOS) {
      const gemeo = deOutraPorta.find((o) => o.tipo === i.tipo && o.alvo === i.alvo)
      expect(gemeo?.id, `${i.id} repete ${gemeo?.id}`).toBeUndefined()
    }
  })

  it('sem emoji no nome nem na descrição (spec: nenhum emoji na interface)', () => {
    for (const i of VITRINE_DE_CREDITOS) {
      expect(EMOJI.test(i.nome), i.id).toBe(false)
      expect(EMOJI.test(i.desc), i.id).toBe(false)
    }
  })

  it('o preço cabe num pacote: nenhum item custa mais que o maior pacote', () => {
    const maior = Math.max(...CATALOGO_DE_CREDITOS.map((p) => p.creditos))
    for (const i of VITRINE_DE_CREDITOS) {
      expect(Number.isInteger(i.precoCreditos), i.id).toBe(true)
      expect(i.precoCreditos!, i.id).toBeGreaterThan(0)
      expect(i.precoCreditos!, i.id).toBeLessThanOrEqual(maior)
    }
  })

  it('todo pacote compra itens inteiros, sem troco que empurre a próxima compra', () => {
    for (const i of VITRINE_DE_CREDITOS) {
      for (const p of CATALOGO_DE_CREDITOS) expect(p.creditos % i.precoCreditos!, `${i.id} × ${p.sku}`).toBe(0)
    }
  })

  it('as douradas que saíram da vitrine viram um equivalente da vitrine — nenhum Crédito se perde', () => {
    for (const id of ['dourada-1', 'dourada-4', 'dourada-9']) {
      expect(CATALOGO_DA_LOJA.some((i) => i.id === id), id).toBe(false)
      expect(VITRINE_ESPERADA, id).toContain(equivalenteDe(id))
      expect(ehRecusa(autorizarGastoDeCredito(`premium:${id}`)), id).toBe(true)
    }
  })
})

describe('autorizarGastoDeCredito — o que o servidor aceita', () => {
  it('item da vitrine: o preço é o do catálogo', () => {
    for (const i of VITRINE_DE_CREDITOS) {
      expect(autorizarGastoDeCredito(`premium:${i.id}`)).toEqual({ tipo: 'premium', itemId: i.id, preco: i.precoCreditos })
    }
  })

  it('recusa maestria, conquista, temporada, item de Seeds e o que não existe', () => {
    const recusados = [
      CATALOGO_DA_LOJA.find((i) => i.origemMaestria),
      CATALOGO_DA_LOJA.find((i) => i.exclusivoDe),
      CATALOGO_DA_LOJA.find((i) => i.origemTemporada),
      CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined),
    ]
    for (const i of recusados) {
      expect(i).toBeTruthy()
      expect(ehRecusa(autorizarGastoDeCredito(`premium:${i!.id}`)), i!.id).toBe(true)
    }
    for (const r of ['premium:', 'premium:nao-existe', 'bau', 'drop:x', 'seeds:100', 'loja:tema-neon']) {
      expect(ehRecusa(autorizarGastoDeCredito(r)), r).toBe(true)
    }
  })

  it('a régua recusa mesmo se um item mal cadastrado tiver `precoCreditos` (defesa em profundidade)', () => {
    const base: ItemDaLoja = { id: 'x', tipo: 'tema', alvo: 'x', nome: 'x', desc: '', raridade: 'lendario', precoCreditos: 150 }
    expect(vendavelEmCreditos(base)).toBe(true)
    expect(vendavelEmCreditos({ ...base, precoCreditos: undefined })).toBe(false)
    expect(vendavelEmCreditos({ ...base, precoSeeds: 100 })).toBe(false)
    expect(vendavelEmCreditos({ ...base, exclusivoDe: 'constante' })).toBe(false)
    expect(vendavelEmCreditos({ ...base, origemMaestria: { jogo: 'memory', nivel: 5 } })).toBe(false)
    expect(vendavelEmCreditos({ ...base, origemTemporada: { temporada: 't1', precoSeedsDepois: 1000 } })).toBe(false)
    expect(vendavelEmCreditos({ ...base, raridade: 'raro' })).toBe(false)
    expect(vendavelEmCreditos({ ...base, precoCreditos: 0 })).toBe(false)
  })
})

describe('edição estática: sem cobrança', () => {
  it('as rotas de billing não têm espelho — respondem "exige conta" e nada é gasto', async () => {
    for (const [metodo, rota] of [
      ['GET', '/api/billing/creditos'],
      ['POST', '/api/billing/gastar'],
      ['POST', '/api/billing/comprar'],
    ] as const) {
      const res = await servidorEfemero(rota, {
        method: metodo,
        body: metodo === 'GET' ? undefined : JSON.stringify({ spendId: 'estatica-001', amount: 150, reason: 'premium:dourada-2' }),
      })
      expect(res.ok, rota).toBe(false)
      expect(res.status, rota).toBe(501)
      expect(((await res.json()) as { codigo?: string }).codigo, rota).toBe(CODIGO_EXIGE_CONTA)
    }
  })

  it('o build estático não liga a conta — a carteira fica `disponivel: false`', () => {
    const build = readFileSync('scripts/build-estatica.mjs', 'utf8')
    expect(build).toMatch(/VITE_AUTH_REQUIRED:\s*''/)
    const carteira = readFileSync('src/lib/carteira.ts', 'utf8')
    // Sem conta, a carteira nunca pergunta ao servidor e se declara indisponível.
    expect(carteira).toMatch(/if \(!authRequired\) \{ setDisponivel\(false\); return \}/)
  })
})
