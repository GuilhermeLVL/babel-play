/**
 * UM BAÚ POR RODADA — e a rodada tem de ser de verdade.
 *
 * O drop é o único crédito em que o servidor decide também O QUÊ, e por isso ele tem dois modos
 * de falhar que nenhuma outra família tem:
 *
 *  1. SORTEAR DE NOVO NO RETRY. A idempotência de `seed_credits` é por `creditoId` — o `ON
 *     CONFLICT` impede a segunda LINHA, mas não impede a rota de sortear outro item e RESPONDER
 *     esse outro item. O banco ficaria certo e a tela mostraria um prêmio que ninguém recebeu. Foi
 *     por não enxergar isto que a versão do ramo de trabalho pôs `Date.now()` dentro do
 *     `creditoId`: com o relógio no id não há retry, há um baú novo por montagem de tela.
 *  2. BAÚ SEM PARTIDA. `creditoId` é uma string livre de 8 a 80 caracteres no Zod. Sem a âncora na
 *     rodada gravada, `drop:qualquer-coisa` num loop vira um item por request — o furo de 01/09,
 *     de volta pela porta do baú.
 *
 * Os dois se provam contra o banco, não em unidade: é o banco que guarda o razão de onde a posse
 * é derivada.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { SEEDS_DO_DROP, itensSorteaveisNoDrop } from '../../src/core/economiaAutoridade'

let h: EphemeralDb
let metricsRouter: any
let economiaRepo: any
let exerciseResultsRepo: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u: string) => ({ userId: asUserId(u), body, requestId: 'req-drop', path: '/x' })

async function creditar(u: string, creditoId: string) {
  const res = mockRes()
  await handler('/seeds/creditar')(req({ creditoId }, u), res)
  return { status: res.statusCode, body: res.body }
}

/** Uma rodada REAL: é a âncora do baú, e sem ela o drop não existe. */
async function jogarRodada(u: string, roundId: string) {
  await exerciseResultsRepo.addRodada(asUserId(u), {
    roundId, exerciseKind: 'termo', origem: 'baralho', score: 100, melhorSequencia: 5,
    itens: Array.from({ length: 5 }, (_, i) => ({ itemRef: `${roundId}-${i}`, correct: 1, kind: 'drill' })),
  })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ economiaRepo } = (await h.load('../../server/db/repositories/economia')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('o drop é idempotente pela rodada', () => {
  it('o mesmo `drop:<roundId>` duas vezes entrega o MESMO item e credita as Seeds uma vez só', async () => {
    const u = 'u-drop-idem'
    await jogarRodada(u, 'termo-1-aaa')

    const primeiro = await creditar(u, 'drop:termo-1-aaa')
    expect(primeiro.status).toBe(200)
    expect(primeiro.body.jaExistia).toBe(false)
    expect(typeof primeiro.body.item).toBe('string')
    expect(primeiro.body.seedsCreditadas).toBe(SEEDS_DO_DROP)

    const segundo = await creditar(u, 'drop:termo-1-aaa')
    expect(segundo.status).toBe(200)
    expect(segundo.body.jaExistia).toBe(true)
    /* O ponto do teste: o item da resposta é LIDO do razão gravado, não sorteado de novo. */
    expect(segundo.body.item).toBe(primeiro.body.item)
    expect(segundo.body.seedsCreditadas).toBe(SEEDS_DO_DROP)

    // Uma linha de ledger, com o item no razão — é dali que a posse se deriva.
    const drops = await economiaRepo.dropsSorteados(asUserId(u))
    expect(drops).toEqual([{ creditoId: 'drop:termo-1-aaa', itemId: primeiro.body.item }])
  })

  it('o item sorteado é sempre um dos sorteáveis — nunca conquista, Créditos, épico ou lendário', async () => {
    const u = 'u-drop-catalogo'
    const permitidos = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))
    for (let n = 0; n < 12; n++) {
      await jogarRodada(u, `termo-c-${n}`)
      const r = await creditar(u, `drop:termo-c-${n}`)
      expect(r.status).toBe(200)
      expect(permitidos.has(r.body.item), `rodada ${n} entregou ${r.body.item}`).toBe(true)
    }
  })

  it('doze rodadas seguidas nunca repetem um item — duplicata não é prêmio', async () => {
    const drops = await economiaRepo.dropsSorteados(asUserId('u-drop-catalogo'))
    const ids = drops.map((d: any) => d.itemId)
    expect(ids.length).toBe(12)
    expect(new Set(ids).size).toBe(12)
  })
})

describe('o baú precisa de uma partida', () => {
  it('um roundId que não existe é recusado — senão qualquer string viraria um item', async () => {
    const r = await creditar('u-drop-sem-partida', 'drop:rodada-inventada-999')
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('rodada_inexistente')
    expect(await economiaRepo.dropsSorteados(asUserId('u-drop-sem-partida'))).toEqual([])
  })

  it('a rodada de OUTRA pessoa não serve de âncora', async () => {
    await jogarRodada('u-dono-da-rodada', 'termo-alheia-1')
    const r = await creditar('u-invasor', 'drop:termo-alheia-1')
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('rodada_inexistente')
  })
})
