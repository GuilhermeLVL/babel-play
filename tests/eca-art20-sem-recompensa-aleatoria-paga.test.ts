/**
 * ECA DIGITAL (Lei 15.211/2025), ART. 20 — NADA ALEATÓRIO SE OBTÉM COM DINHEIRO.
 *
 * O art. 20 veda "caixas de recompensa" (loot boxes) em jogos de provável acesso por crianças e
 * adolescentes — e o app é aberto a menores. A revisão da Fase 4 (24/09/2026) encontrou UMA
 * recompensa aleatória: o BAÚ DE FIM DE RODADA (`sortearItemDoDrop`, sorteado no servidor em
 * `server/routes/metrics.ts`). Ele é obtido JOGANDO uma rodada, que é grátis, e não sorteia item
 * vendido em Créditos (a moeda comprada com dinheiro). Tudo o que custa dinheiro é DETERMINÍSTICO:
 * a assinatura (e a trilha de assinante da temporada, com item fixo por nível), os pacotes de
 * Créditos (quantidade fixa) e os itens premium (compra de UM item escolhido, pelo preço do catálogo).
 *
 * Este arquivo trava essa fronteira. Se alguém um dia puser um item pago no baú, vender um baú, ou
 * trouxer sorteio para o caminho do dinheiro, o CI cai aqui com o motivo.
 *
 * PENDENTE DE ADVOGADO: se o baú GRÁTIS também é "caixa de recompensa" para o art. 20 (a definição
 * da lei fala em aquisição "mediante pagamento"). Se for, a correção é tornar o baú determinístico
 * para o perfil protegido — o ponto é `sortearItemDoDrop` no servidor.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { CATALOGO_DE_CREDITOS } from '../src/core/creditos'
import { autorizarGastoDeCredito, itensSorteaveisNoDrop } from '../src/core/economiaAutoridade'
import { CATALOGO_DA_LOJA } from '../src/core/loja'
import { recompensaDaTrilha } from '../src/core/temporada'

describe('ECA Digital art. 20 — recompensa aleatória não se compra', () => {
  it('o baú de fim de rodada nunca sorteia item vendido em Créditos (moeda comprada)', () => {
    const sorteaveis = itensSorteaveisNoDrop(new Set())
    expect(sorteaveis.length).toBeGreaterThan(0)
    expect(sorteaveis.filter((i) => i.precoCreditos !== undefined).map((i) => i.id)).toEqual([])
  })

  it('gastar Créditos compra UM item escolhido, pelo preço do catálogo — nunca um sorteio', () => {
    const pagos = CATALOGO_DA_LOJA.filter((i) => i.precoCreditos !== undefined)
    expect(pagos.length).toBeGreaterThan(0)
    for (const item of pagos) {
      const a = autorizarGastoDeCredito(`premium:${item.id}`)
      expect(a).toEqual({ tipo: 'premium', itemId: item.id, preco: item.precoCreditos })
    }
    // Não existe motivo de gasto que não seja um item nomeado (ex.: "abrir baú").
    expect(autorizarGastoDeCredito('drop:qualquer')).toHaveProperty('erro')
    expect(autorizarGastoDeCredito('bau')).toHaveProperty('erro')
  })

  it('os pacotes de Créditos entregam quantidade fixa', () => {
    for (const p of CATALOGO_DE_CREDITOS) {
      expect(Number.isInteger(p.creditos), p.sku).toBe(true)
      expect(p.creditos, p.sku).toBeGreaterThanOrEqual(0)
    }
  })

  it('a trilha de assinante da temporada é a mesma a cada leitura (item fixo por nível, nunca Seeds)', () => {
    for (let lv = 1; lv <= 30; lv++) {
      const r = recompensaDaTrilha(lv, 'assinante')
      expect(r).toEqual(recompensaDaTrilha(lv, 'assinante'))
      // Seeds pela assinatura seriam Seeds compráveis — a trilha paga só entrega item.
      expect(r && 'seeds' in r, `nível ${lv}`).toBe(false)
    }
  })

  it('o caminho do dinheiro não tem sorteio no código', () => {
    const arquivos = [
      'server/routes/billing.ts',
      'server/lib/billingEventos.ts',
      'server/db/repositories/credits.ts',
      'src/core/creditos.ts',
      'src/core/temporada.ts',
      'src/core/catalogoTemporada.ts',
    ]
    for (const f of arquivos) {
      const fonte = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(/Math\.random|sortear|randomInt/.test(fonte), `${f} não pode sortear`).toBe(false)
    }
  })
})
