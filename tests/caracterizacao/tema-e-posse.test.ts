/**
 * CARACTERIZACAO — a posse de cosmeticos conferida em `PUT /api/settings`, por HTTP, no modo
 * self-host. Grava o comportamento ATUAL (rodada de saneamento, Fase 1).
 *
 * As chaves do blob `ui` que nomeiam item do catalogo (server/routes/settings.ts, CAMPOS_DE_ITEM):
 * theme, fonte, menuPosition, particulas, pack, cursor, rastro. O resto do blob passa direto.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { CATALOGO_DA_LOJA, type ItemDaLoja } from '../../src/core/loja'
import { type AppDeTeste,resposta, semear, subirApp } from './_app'

const DONO = 'local-owner'

// caracterizacao: comportamento atual, nao desejado — GET e PUT /api/settings devolvem `ui` como a
// STRING JSON gravada na coluna, e nao como objeto; quem le precisa fazer o parse do lado de ca
const uiDe = (corpo: { ui: unknown }): Record<string, unknown> => JSON.parse(String(corpo.ui))

async function ganhar(s: AppDeTeste, userId: string, rodadas: number) {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
  for (let n = 0; n < rodadas; n++) {
    await exerciseResultsRepo.addRodada(asUserId(userId), {
      roundId: `ganho-${userId}-${n}`, exerciseKind: 'termo', origem: 'baralho', score: 100, melhorSequencia: 20,
      itens: Array.from({ length: 20 }, (_, i) => ({ itemRef: `w${n}-${i}`, correct: 1, kind: 'drill' })),
    })
  }
}

describe('PUT /api/settings — posse de cosmeticos (modo self-host)', () => {
  let s: AppDeTeste
  let nivel = 0
  let saldo = 0
  /** Um tema acima do nivel atual que o saldo paga: o caso em que so a COMPRA libera. */
  let COMPRAVEL: ItemDaLoja
  const PREMIUM = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-premium')!
  const LIVRE = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-babel')!
  const EXCLUSIVO = CATALOGO_DA_LOJA.find((i) => i.id === 'cur-coroa')!

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    await semear(s, DONO)
    await ganhar(s, DONO, 5) // 125 Seeds
    const { asUserId } = await s.load('../../server/lib/authContext')
    const { economiaDoUsuario } = await s.load('../../server/db/repositories/metrics')
    ;({ nivel, saldo } = await economiaDoUsuario(asUserId(DONO)))
    COMPRAVEL = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && !i.exclusivoDe && i.precoSeeds !== undefined && i.nivel > nivel && i.precoSeeds <= saldo)!
  })
  afterAll(async () => { await s.encerrar() })

  it('a fixture sustenta o caso: ha um tema acima do nivel que o saldo paga, e o premium nao', () => {
    expect(COMPRAVEL).toBeDefined()
    expect(PREMIUM.nivel).toBeGreaterThan(nivel)
    expect(PREMIUM.precoSeeds!).toBeGreaterThan(saldo)
  })

  it('tema premium sem nivel e sem compra: 403 item_nao_possuido dizendo o que falta', async () => {
    const r = await s.put('/api/settings', { ui: { theme: PREMIUM.alvo } })
    expect(r.status).toBe(403)
    const corpo = await r.clone().json()
    expect(corpo).toMatchObject({ code: 'item_nao_possuido', detalhes: { tipo: 'tema', alvo: PREMIUM.alvo } })
    expect(corpo.detalhes.motivo).toBe(`exige nível ${PREMIUM.nivel} ou ${PREMIUM.precoSeeds} seeds`)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/put.settings.item-nao-possuido.json')
  })

  it('a recusa nao grava NADA do patch, nem os campos que nao sao item', async () => {
    const r = await s.put('/api/settings', { targetLanguage: 'de', ui: { theme: PREMIUM.alvo, onboarded: true } })
    expect(r.status).toBe(403)
    const atual = await (await s.get('/api/settings')).json()
    expect(atual.targetLanguage).not.toBe('de')
  })

  it('cosmetico exclusivo de conquista sem a conquista: 403 citando a conquista', async () => {
    const r = await s.put('/api/settings', { ui: { cursor: EXCLUSIVO.alvo } })
    expect(r.status).toBe(403)
    const corpo = await r.json()
    expect(corpo.detalhes).toMatchObject({ tipo: 'cursor', alvo: EXCLUSIVO.alvo })
    expect(corpo.detalhes.motivo).toContain(EXCLUSIVO.exclusivoDe)
  })

  it('tema livre (nivel 1, sem preco): 200 e a forma do settings gravado', async () => {
    const r = await s.put('/api/settings', { ui: { theme: LIVRE.alvo } })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(typeof corpo.ui).toBe('string')
    expect(uiDe(corpo)).toMatchObject({ theme: LIVRE.alvo })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/put.settings.tema-livre.json')
  })

  it('alvo fora do catalogo passa: a regua so tranca o que existe para vender ou premiar', async () => {
    // caracterizacao: comportamento atual — um `theme` inexistente e gravado sem recusa
    const r = await s.put('/api/settings', { ui: { theme: 'tema-que-nao-existe' } })
    expect(r.status).toBe(200)
    expect(uiDe(await r.json())).toMatchObject({ theme: 'tema-que-nao-existe' })
  })

  it('campos do blob que nao sao item passam direto', async () => {
    const r = await s.put('/api/settings', { ui: { onboarded: true, goal: 'jogos', plan: 'pro' } })
    expect(r.status).toBe(200)
  })

  it('depois de COMPRAR o tema por seeds/gastar, o mesmo PUT passa a 200', async () => {
    const negado = await s.put('/api/settings', { ui: { theme: COMPRAVEL.alvo } })
    expect(negado.status).toBe(403)

    const compra = await s.post('/api/metrics/seeds/gastar', { spendId: `compra-${COMPRAVEL.id}`, amount: COMPRAVEL.precoSeeds, reason: `loja:${COMPRAVEL.id}` })
    expect(compra.status).toBe(200)

    const aceito = await s.put('/api/settings', { ui: { theme: COMPRAVEL.alvo } })
    expect(aceito.status).toBe(200)
    expect(uiDe(await aceito.json())).toMatchObject({ theme: COMPRAVEL.alvo })
    expect(uiDe(await (await s.get('/api/settings')).json()).theme).toBe(COMPRAVEL.alvo)
  })

  it('a posse vale por chave: o tema comprado nao libera outro tipo de item do mesmo nivel', async () => {
    const outro = CATALOGO_DA_LOJA.find((i) => i.tipo === 'particulas' && !i.exclusivoDe && i.nivel > nivel && i.precoSeeds !== undefined)!
    const r = await s.put('/api/settings', { ui: { theme: COMPRAVEL.alvo, particulas: outro.alvo } })
    expect(r.status).toBe(403)
    expect((await r.json()).detalhes).toMatchObject({ tipo: 'particulas', alvo: outro.alvo })
  })
})
