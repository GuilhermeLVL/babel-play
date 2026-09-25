/**
 * O ETag DO BARALHO É DO USUÁRIO — modo público, duas contas (fix/rotas-caras).
 *
 * O ETag de `GET /api/vocab` sai de um CONTADOR (`versoes_de_dados.vocab`), não de um hash do
 * corpo. Dois usuários com o mesmo número de escritas teriam o mesmo contador — e um navegador
 * compartilhado (a sala de aula, o computador da família) guarda a resposta de uma conta e
 * revalida com o ETag dela quando a outra entra. Se o ETag fosse só o contador, a segunda conta
 * receberia 304 e o navegador mostraria o baralho da PRIMEIRA. O resumo do usuário no ETag é o
 * que impede isso, e este teste o cobra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

describe('ETag de GET /api/vocab por conta (modo público)', () => {
  let s: AppDeTeste
  let ana = ''
  let bia = ''

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    ana = await s.token('etag-ana')
    bia = await s.token('etag-bia')
    const nasc = new Date(Date.now() - 30 * 365.25 * 86_400_000).toISOString().slice(0, 10)
    for (const t of [ana, bia]) {
      expect((await s.put('/api/me/idade', { nascimento: nasc }, t)).status).toBe(200)
      // A MESMA quantidade de escritas nas duas contas: os contadores coincidem.
      const r = await s.post(
        '/api/vocab/bulk-add',
        { cards: [{ word: 'harvest', srcLang: 'en', back: 'colheita' }] },
        t,
      )
      expect(r.status).toBe(200)
    }
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
  })

  it('contadores iguais, ETags diferentes: o ETag de uma conta não revalida o baralho da outra', async () => {
    const ra = await s.get('/api/vocab', ana)
    const rb = await s.get('/api/vocab', bia)
    const etagA = ra.headers.get('etag')
    const etagB = rb.headers.get('etag')
    expect(etagA).toBeTruthy()
    expect(etagB).toBeTruthy()
    expect(etagA).not.toBe(etagB)
    const cartaoDaAna = ((await ra.json()) as Array<{ id: string }>)[0].id

    const cruzado = await s.chamar('GET', '/api/vocab', { token: bia, headers: { 'if-none-match': etagA! } })
    expect(cruzado.status).toBe(200)
    const daBia = (await cruzado.json()) as Array<{ id: string }>
    expect(daBia.map((c) => c.id)).not.toContain(cartaoDaAna)

    const proprio = await s.chamar('GET', '/api/vocab', { token: ana, headers: { 'if-none-match': etagA! } })
    expect(proprio.status).toBe(304)
  })

  it('a escrita de uma conta não invalida o ETag da outra', async () => {
    const etagB = (await s.get('/api/vocab', bia)).headers.get('etag')!
    const add = await s.post('/api/vocab/bulk-add', { cards: [{ word: 'river', srcLang: 'en', back: 'rio' }] }, ana)
    expect(add.status).toBe(200)
    const r = await s.chamar('GET', '/api/vocab', { token: bia, headers: { 'if-none-match': etagB } })
    expect(r.status).toBe(304)
  })

  it('a exclusão da conta não deixa a linha de versões com o id da pessoa (LGPD)', async () => {
    const { client } = await s.load('../../server/db/db')
    const { contaRepo } = await s.load('../../server/db/repositories/conta')
    const { asUserId } = await s.load('../../server/lib/authContext')
    const linhas = async () =>
      (await client.execute({ sql: 'SELECT user_id FROM versoes_de_dados WHERE user_id = ?', args: ['etag-bia'] })).rows
    expect(await linhas()).toHaveLength(1)
    await contaRepo.excluir(asUserId('etag-bia'))
    expect(await linhas()).toHaveLength(0)
  })
})
