/**
 * A POSSE É REGRA, NÃO SUGESTÃO (auditoria de 2026-09-07, achados A10 e A11).
 *
 * `PUT /api/settings` gravava `ui.theme` validando só a FORMA. Um POST com
 * `{"ui":{"theme":"premium"}}` equipava o tema mais caro do catálogo sem nível, sem seeds e sem
 * compra — toda a régua vivia no cliente, e régua no cliente é sugestão, porque a rota está aberta
 * a quem souber o caminho. Num app que VENDE esses itens, é a diferença entre um catálogo e uma
 * vitrine.
 *
 * O outro lado da mesma moeda, também travado aqui: a régua do servidor tem de dizer SIM para
 * quem pagou. Um gate que recusa o item comprado não é rigor, é um defeito com outra cara — e era
 * exatamente o que acontecia no cliente, onde a segunda régua (`desbloqueado`) não sabia de compra.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { CATALOGO_DA_LOJA } from '../../src/core/loja'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let settingsRouter: any

const U = asUserId('posse-u1')

/** Um tema que exige nível alto e pode ser comprado com seeds — o caso interessante. */
const TEMA_CARO = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.nivel >= 8 && i.precoSeeds !== undefined)!
/** Um tema livre desde o começo: a régua não pode atrapalhar quem não deve nada. */
const TEMA_LIVRE = CATALOGO_DA_LOJA.find((i) => i.tipo === 'tema' && i.nivel === 1 && !i.exclusivoDe)!

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

async function put(userId: string, corpo: unknown) {
  const camada = settingsRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.put)
  const req: any = { userId: asUserId(userId), path: '/', query: {}, params: {}, body: corpo }
  const res = fakeRes()
  await camada.route.stack[0].handle(req, res, () => {})
  return { status: res.statusCode, body: res.body }
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ settingsRouter } = (await h.load('../../server/routes/settings')) as any)
})
afterAll(async () => { await h?.cleanup?.() })

describe('PUT /api/settings — posse de cosméticos', () => {
  it('tema caro sem nível, sem compra: 403 dizendo o que falta', async () => {
    const r = await put(U, { ui: { theme: TEMA_CARO.alvo } })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('item_nao_possuido')
    expect(r.body.detalhes).toMatchObject({ tipo: 'tema', alvo: TEMA_CARO.alvo })
    // A recusa DIZ o que falta: um 403 mudo manda a pessoa adivinhar.
    expect(String(r.body.detalhes.motivo)).toMatch(/nível|seeds/i)
  })

  it('tema livre passa — a régua não atrapalha quem não deve nada', async () => {
    const r = await put(U, { ui: { theme: TEMA_LIVRE.alvo } })
    expect(r.status).toBe(200)
  })

  it('quem COMPROU o tema pode equipar', async () => {
    const { seedSpendsRepo } = (await h.load('../../server/db/repositories/seedSpends')) as any
    const comprador = 'posse-u2'
    await seedSpendsRepo.debitar(asUserId(comprador), {
      spendId: `compra-${TEMA_CARO.id}`,
      amount: TEMA_CARO.precoSeeds,
      reason: `loja:${TEMA_CARO.id}`,
    })
    const r = await put(comprador, { ui: { theme: TEMA_CARO.alvo } })
    expect(r.status, 'um gate que recusa quem pagou é um defeito com outra cara').toBe(200)
  })

  it('campo do blob que não é item passa direto — nem tudo em `ui` se compra', async () => {
    const r = await put(U, { ui: { onboarded: true, goal: 'jogos', captureSourceLang: 'pt-BR' } })
    expect(r.status).toBe(200)
  })

  it('exclusivo de conquista exige a conquista, e o crédito no razão é o que vale', async () => {
    const exclusivo = CATALOGO_DA_LOJA.find((i) => i.exclusivoDe)!
    const semConquista = 'posse-u3'
    const negado = await put(semConquista, { ui: { theme: exclusivo.alvo } })
    expect(negado.status).toBe(403)
    expect(String(negado.body.detalhes.motivo)).toContain(exclusivo.exclusivoDe)

    /* A POSSE DE CONQUISTA VEM DO RAZÃO, não do navegador: ela morava só em
       `localStorage['babel.conquistas']`, editável e nunca reconciliada (achado A12). */
    const { economiaRepo } = (await h.load('../../server/db/repositories/economia')) as any
    const comConquista = 'posse-u4'
    await economiaRepo.creditar(asUserId(comConquista), {
      creditoId: `conquista-${exclusivo.exclusivoDe}`,
      amount: 0,
      xp: 0,
      reason: `conquista:${exclusivo.exclusivoDe}`,
    })
    const aceito = await put(comConquista, { ui: { theme: exclusivo.alvo } })
    expect(aceito.status).toBe(200)
  })
})

/**
 * A RÉGUA É UMA SÓ, e as duas telas precisam concordar item a item.
 *
 * `desbloqueado` (seletor de aparência) tinha a própria tabela de níveis e não sabia de compra com
 * seeds nem de premium: quem comprasse o tema Linear por 60 seeds no nível 1 via o item como "seu"
 * na Loja e o cadeado no seletor — pagou e não pôde usar.
 */
describe('as duas réguas do cliente concordam', () => {
  it('para todo item de aparência do catálogo, `desbloqueado` segue `estadoDoItem`', async () => {
    const { desbloqueado } = await import('../../src/lib/desbloqueios')
    const { estadoDoItem } = await import('../../src/lib/loja')
    const TIPOS = ['tema', 'fonte', 'posicao', 'estudio']

    for (const item of CATALOGO_DA_LOJA.filter((i) => TIPOS.includes(i.tipo))) {
      for (const nivel of [1, 5, 10, 20]) {
        const equipavelPelaLoja = estadoDoItem(item, nivel, 0).estado === 'equipavel'
        const pelaAparencia = desbloqueado(nivel, item.tipo as any, item.alvo)
        expect(
          pelaAparencia,
          `"${item.id}" no nível ${nivel}: Loja diz ${equipavelPelaLoja}, aparência diz ${pelaAparencia}`,
        ).toBe(equipavelPelaLoja)
      }
    }
  })

  it('o nível exigido sai do catálogo, e não de uma segunda tabela', async () => {
    const { nivelNecessario } = await import('../../src/lib/desbloqueios')
    for (const item of CATALOGO_DA_LOJA.filter((i) => ['tema', 'posicao', 'estudio'].includes(i.tipo))) {
      expect(nivelNecessario(item.tipo as any, item.alvo), item.id).toBe(item.nivel)
    }
  })
})
