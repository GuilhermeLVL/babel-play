// @vitest-environment jsdom
/**
 * O CORTE DO CATÁLOGO E O REEMBOLSO (recompensas v2, Task 2.3).
 *
 * Três garantias: (1) o que era pago em Seeds por item removido volta, UMA vez, pelo razão;
 * (2) o pago em Créditos vira o equivalente; (3) o equipado que saiu cai no padrão sem lançar.
 * O Express é conferido em `tests/integration/economia-reembolso.test.ts`; aqui, o núcleo puro e o
 * espelho sem conta, inclusive dois pedidos simultâneos (duas abas abrindo juntas).
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { autorizarGasto, ehRecusa, itensSorteaveisNoDrop } from '../src/core/economiaAutoridade'
import { recompensasV2Ativas } from '../src/core/flags'
import { CATALOGO_DA_LOJA } from '../src/core/loja'
import {
  equivalenteDe,
  ITENS_REMOVIDOS,
  possePremiumComEquivalentes,
  reembolsosDevidos,
} from '../src/core/reembolso'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { abrirStore, fecharStore, limparTudo } from '../src/data/efemero/store'
import { equiparItem } from '../src/lib/galeria/equipar'
import type { ItemDaLoja } from '../src/lib/loja'
import { readParticulas } from '../src/lib/particulas'
import { readRastro } from '../src/lib/rastroDoMouse'

describe('reembolsosDevidos — o núcleo puro', () => {
  it('gasto em item removido volta com o mesmo valor, pelo motivo do gasto', () => {
    expect(reembolsosDevidos([{ reason: 'loja:cur-pato', amount: 100 }], new Set())).toEqual([
      { creditoId: 'reembolso:loja:cur-pato', seeds: 100 },
    ])
  })

  it('já creditado não volta de novo', () => {
    expect(reembolsosDevidos([{ reason: 'loja:cur-pato', amount: 100 }], new Set(['reembolso:loja:cur-pato']))).toEqual([])
  })

  it('aprimoramento, croma de item removido e posição paga também voltam; o resto não', () => {
    const gastos = [
      { reason: 'aprimoramento:particulas:1', amount: 50 },
      { reason: 'croma:ras-emoji:ambar', amount: 60 },
      { reason: 'loja:pos-direita', amount: 45 },
      { reason: 'loja:tema-linear', amount: 60 },
      { reason: 'croma:tema-linear:ambar', amount: 15 },
      { reason: 'pular-rodada', amount: 40 },
    ]
    const devidos = reembolsosDevidos(gastos, new Set())
    expect(devidos.map((d) => d.creditoId).sort()).toEqual([
      'reembolso:aprimoramento:particulas:1',
      'reembolso:croma:ras-emoji:ambar',
      'reembolso:loja:pos-direita',
    ])
    expect(devidos.reduce((n, d) => n + d.seeds, 0)).toBe(50 + 60 + 45)
  })

  it('os removidos saíram do catálogo e do baú', () => {
    const ids = new Set(CATALOGO_DA_LOJA.map((i) => i.id))
    const sorteaveis = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))
    for (const id of ITENS_REMOVIDOS) {
      expect(ids.has(id), id).toBe(false)
      expect(sorteaveis.has(id), id).toBe(false)
    }
    expect(ITENS_REMOVIDOS.has('cur-pato')).toBe(true)
    expect(ITENS_REMOVIDOS.has('pack-animais')).toBe(true)
    expect(ITENS_REMOVIDOS.has('apr-sorte')).toBe(true)
  })

  it('aprimoramento não se compra mais', () => {
    expect(ehRecusa(autorizarGasto('aprimoramento:particulas:1'))).toBe(true)
  })

  it('pago com Créditos vira o equivalente — nenhum Crédito se perde', () => {
    expect(equivalenteDe('dourada-3')).toBe('tema-aurora')
    expect(equivalenteDe('dourada-5')).toBe('tema-aurora')
    expect(equivalenteDe('dourada-2')).toBe('dourada-2')
    expect(possePremiumComEquivalentes(['dourada-3', 'dourada-7', 'dourada-2'])).toEqual(['tema-aurora', 'dourada-2'])
  })
})

describe('equipado que saiu cai no padrão, sem lançar', () => {
  beforeEach(() => localStorage.clear())

  it('partícula de emoji e rastro de emoji voltam ao padrão', () => {
    localStorage.setItem('app_particulas', 'emoji')
    localStorage.setItem('babel.rastro', 'emojis:🦆')
    expect(readParticulas()).toBe('tema')
    expect(readRastro()).toBe('off')
  })

  it('equiparItem com um item de tipo que saiu devolve false', () => {
    const fantasma = { id: 'cur-pato', tipo: 'cursor', alvo: 'pato', nome: 'x', desc: '', raridade: 'raro', nivel: 1 } as unknown as ItemDaLoja
    const ctx = { setTheme: vi.fn(), setFonte: vi.fn(), setMenuPosition: vi.fn(), onOpenStudio: vi.fn(), nivel: 99, saldo: 0 }
    expect(() => equiparItem(fantasma, ctx)).not.toThrow()
    expect(equiparItem(fantasma, ctx)).toBe(false)
  })
})

describe('a flag recompensas_v2', () => {
  it('com servidor, vale o que o servidor diz; na edição estática, só VITE_RECOMPENSAS_V2=1 liga', () => {
    expect(recompensasV2Ativas({ edicaoEstatica: false, envDoBuild: '1', flagDoServidor: false })).toBe(false)
    expect(recompensasV2Ativas({ edicaoEstatica: false, envDoBuild: undefined, flagDoServidor: true })).toBe(true)
    expect(recompensasV2Ativas({ edicaoEstatica: true, envDoBuild: undefined, flagDoServidor: true })).toBe(false)
    expect(recompensasV2Ativas({ edicaoEstatica: true, envDoBuild: '1', flagDoServidor: false })).toBe(true)
  })
})

describe('o reembolso pela rota (espelho sem conta)', () => {
  afterAll(() => fecharStore())
  beforeEach(async () => {
    await limparTudo()
    localStorage.clear()
  })

  const reembolsar = async () => (await servidorEfemero('/api/metrics/seeds/reembolso', { method: 'POST' })).json()
  const gastosAntigos = async () => {
    /* Gastos gravados ANTES do corte: a rota de gasto recusaria hoje (item inexistente), então o
       razão antigo é semeado direto no banco — é exatamente o estado de quem já tinha comprado. */
    const db = await abrirStore()
    await db.put('gastos', { spendId: 'loja-cur-pato', amount: 100, reason: 'loja:cur-pato', ref: null, createdAt: 1 })
    await db.put('gastos', { spendId: 'apr-sorte-n1', amount: 50, reason: 'aprimoramento:sorte:1', ref: null, createdAt: 2 })
  }

  it('credita uma vez: a segunda chamada devolve 0 e o total não muda', async () => {
    await gastosAntigos()
    const a = await reembolsar()
    const b = await reembolsar()
    expect(a).toMatchObject({ creditado: 150, reembolsado: 150, seedsCreditadas: 150 })
    expect(b).toMatchObject({ creditado: 0, reembolsado: 150, seedsCreditadas: 150 })
  })

  it('duas abas ao mesmo tempo: um crédito só', async () => {
    await gastosAntigos()
    const [a, b] = await Promise.all([reembolsar(), reembolsar()])
    expect(a.reembolsado).toBe(150)
    expect(b.reembolsado).toBe(150)
    const db = await abrirStore()
    const creditos = (await db.getAll('creditos')).filter((c) => c.creditoId.startsWith('reembolso:'))
    expect(creditos).toHaveLength(2)
    expect(creditos.reduce((n, c) => n + c.amount, 0)).toBe(150)
  })

  it('sem gasto de item removido, não há o que devolver', async () => {
    expect(await reembolsar()).toMatchObject({ creditado: 0, reembolsado: 0 })
  })
})
