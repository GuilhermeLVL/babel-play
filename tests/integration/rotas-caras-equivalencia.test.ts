/**
 * AS ROTAS CARAS DEVOLVEM O MESMO QUE DEVOLVIAM — e param de reler o banco inteiro a cada chamada
 * (fix/rotas-caras, auditoria de prontidão Fase 2 §2.1).
 *
 * `GET /api/vocab` (133 ms de CPU por request), `GET /api/metrics/profile` (77 ms),
 * `POST /api/metrics/seeds/gastar` (154 ms) e `PUT /api/settings` (até 98 consultas) foram
 * baratas por cache com versão, não por mudar a conta. Este arquivo trava as duas metades:
 *
 *  1. EQUIVALÊNCIA — o JSON INTEIRO (não só a forma) de cada rota, para um usuário semeado com
 *     todos os ramos de `computeProfile`, gravado com o código ANTERIOR à otimização. Qualquer
 *     diferença de valor, ordem de chave ou de elemento derruba o teste.
 *  2. INVALIDAÇÃO E CUSTO — depois de cada escrita (revisão, cartão novo, gasto, fala) a leitura
 *     seguinte enxerga a escrita; e sem escrita, a leitura repetida faz poucas consultas.
 *
 * Relógio: só `Date` é congelado (os timers continuam reais, o servidor HTTP precisa deles), e o
 * fuso é fixado porque `diaLocal` e `toDateString` dependem dele.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { AGORA, type Semeado, semearRico } from './_semeaduraRica'

const DONO = 'local-owner'
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`

describe('rotas caras: equivalência, invalidação e custo', () => {
  let s: AppDeTeste
  let semeado: Semeado
  let consultas = 0

  /** Uma chamada HTTP e quantas consultas ao banco ela custou. */
  async function medir(f: () => Promise<Response>): Promise<{ r: Response; n: number }> {
    const antes = consultas
    const r = await f()
    await r.clone().arrayBuffer()
    return { r, n: consultas - antes }
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'self-host' })
    semeado = await semearRico(s, DONO)
    const { settingsRepo } = await s.load('../../server/db/repositories/settings')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await settingsRepo.ensure(asUserId(DONO))
    /* CONTADOR DE CONSULTAS: toda leitura e escrita do drizzle passa por `client.execute` (ou
       `batch`). Envolver o método do cliente conta o que cada request custa ao banco. */
    const { client } = await s.load('../../server/db/db')
    const execute = client.execute.bind(client)
    const batch = client.batch.bind(client)
    client.execute = ((...a: Parameters<typeof execute>) => {
      consultas++
      return execute(...a)
    }) as typeof client.execute
    client.batch = ((...a: Parameters<typeof batch>) => {
      consultas++
      return batch(...a)
    }) as typeof client.batch
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  describe('equivalência com o código anterior (JSON inteiro)', () => {
    it('GET /api/vocab', async () => {
      const r = await s.get('/api/vocab')
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/vocab.json')
    })

    it('GET /api/metrics/profile (conta inteira)', async () => {
      const r = await s.get('/api/metrics/profile')
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/perfil-global.json')
    })

    it('GET /api/metrics/profile (escopo de sessão)', async () => {
      const r = await s.get(`/api/metrics/profile?sessao=${semeado.sessoes[1]}`)
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot('../__snapshots__/rotas-caras/perfil-sessao.json')
    })

    it('economiaDoUsuario', async () => {
      const { asUserId } = await s.load('../../server/lib/authContext')
      const { economiaDoUsuario } = await s.load('../../server/db/repositories/metrics')
      const { nivel, ganhas, gastas, saldo } = await economiaDoUsuario(asUserId(DONO))
      await expect(json({ nivel, ganhas, gastas, saldo })).toMatchFileSnapshot(
        '../__snapshots__/rotas-caras/economia.json',
      )
    })

    it('PUT /api/settings: item possuído passa, item trancado é 403 com o mesmo motivo', async () => {
      const ok = await s.put('/api/settings', {
        ui: {
          theme: 'linear',
          fonte: 'padrao',
          menuPosition: 'right',
          pack: 'classico',
          cursor: 'padrao',
          rastro: 'off',
        },
      })
      /* Era `cursor: 'coroa'` (Perfeccionista); cursores saíram nas recompensas v2 e o exclusivo que
         continua é o rastro do Duelista. */
      const recusa = await s.put('/api/settings', { ui: { theme: 'linear', fonte: 'padrao', rastro: 'croma:pixel:verde' } })
      const corpoOk = (await ok.json()) as Record<string, unknown>
      await expect(
        json({
          ok: { status: ok.status, ui: corpoOk.ui },
          recusa: { status: recusa.status, corpo: await recusa.json() },
        }),
      ).toMatchFileSnapshot('../__snapshots__/rotas-caras/settings-put.json')
    })
  })
  describe('GET /api/vocab: ETag pela versão, 304 sem materializar, invalidação nas escritas', () => {
    let etag = ''

    it('devolve ETag fraco e responde 304 ao If-None-Match igual, com no máximo uma consulta', async () => {
      const r = await s.get('/api/vocab')
      etag = r.headers.get('etag') ?? ''
      expect(etag).toMatch(/^W\/"vocab-/)
      await r.arrayBuffer()
      const { r: r304, n } = await medir(() => s.chamar('GET', '/api/vocab', { headers: { 'if-none-match': etag } }))
      expect(r304.status).toBe(304)
      expect(await r304.text()).toBe('')
      expect(n).toBeLessThanOrEqual(1)
    })

    it('a mesma versão pedida de novo sem ETag é o MESMO corpo, sem reler o baralho', async () => {
      const a = await (await s.get('/api/vocab')).text()
      const { r, n } = await medir(() => s.get('/api/vocab'))
      expect(await r.text()).toBe(a)
      expect(r.headers.get('etag')).toBe(etag)
      expect(n).toBeLessThanOrEqual(1)
    })

    it('depois de uma REVISÃO o ETag antigo não vale mais e o cartão chega revisado', async () => {
      const id = semeado.cartoes[1]
      const lista = (await (await s.get('/api/vocab')).json()) as Array<{ id: string; reps: number | null }>
      const antes = lista.find((c) => c.id === id)!
      expect((await s.post(`/api/vocab/${id}/review`, { grade: 3 })).status).toBe(200)
      const r = await s.chamar('GET', '/api/vocab', { headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const depois = ((await r.json()) as Array<{ id: string; reps: number | null }>).find((c) => c.id === id)!
      expect(depois.reps).toBe((antes.reps ?? 0) + 1)
      expect(r.headers.get('etag')).not.toBe(etag)
      etag = r.headers.get('etag') ?? ''
    })

    it('depois de um bulk-add e de um PATCH o baralho novo chega', async () => {
      const add = await s.post('/api/vocab/bulk-add', { cards: [{ word: 'lantern', srcLang: 'en', back: 'lanterna' }] })
      expect(add.status).toBe(200)
      let r = await s.chamar('GET', '/api/vocab', { headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const nova = ((await r.json()) as Array<{ id: string; word: string }>).find((c) => c.word === 'lantern')!
      expect(nova).toBeTruthy()
      etag = r.headers.get('etag') ?? ''
      expect((await s.patch(`/api/vocab/${nova.id}`, { inDeck: false })).status).toBe(200)
      r = await s.chamar('GET', '/api/vocab', { headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const editada = ((await r.json()) as Array<{ id: string; inDeck: number }>).find((c) => c.id === nova.id)!
      expect(editada.inDeck).toBe(0)
      etag = r.headers.get('etag') ?? ''
    })

    it('uma escrita FORA dos repositórios (SQL cru numa ocorrência) também invalida', async () => {
      const { client } = await s.load('../../server/db/db')
      await client.execute({
        sql: `INSERT INTO vocab_occurrences (id, created_at, updated_at, user_id, card_id, occurred_at, origin_kind, origin_ref)
              VALUES ('occ-cru', 1, 1, ?, ?, 1, 'trilha', 'en')`,
        args: [DONO, semeado.cartoes[2]],
      })
      const r = await s.chamar('GET', '/api/vocab', { headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const cartao = ((await r.json()) as Array<{ id: string; daTrilha: boolean }>).find(
        (c) => c.id === semeado.cartoes[2],
      )!
      expect(cartao.daTrilha).toBe(true)
    })
  })

  describe('GET /api/metrics/profile: sem escrita não relê as tabelas; com escrita, enxerga', () => {
    it('a segunda leitura sem escrita no meio custa no máximo quatro consultas e devolve o mesmo JSON', async () => {
      const a = await (await s.get('/api/metrics/profile')).json()
      const { r, n } = await medir(() => s.get('/api/metrics/profile'))
      expect(await r.json()).toEqual(a)
      expect(n).toBeLessThanOrEqual(4)
    })

    it('uma revisão nova aparece em reviews', async () => {
      const antes = (await (await s.get('/api/metrics/profile')).json()) as { reviews: number }
      expect((await s.post(`/api/vocab/${semeado.cartoes[3]}/review`, { grade: 4 })).status).toBe(200)
      const depois = (await (await s.get('/api/metrics/profile')).json()) as { reviews: number }
      expect(depois.reviews).toBe(antes.reviews + 1)
    })

    it('uma sessão nova aparece em sessions', async () => {
      const antes = (await (await s.get('/api/metrics/profile')).json()) as { sessions: number }
      const { asUserId } = await s.load('../../server/lib/authContext')
      const { sessionsRepo } = await s.load('../../server/db/repositories/sessions')
      await sessionsRepo.createWithUtterances(
        asUserId(DONO),
        { title: 'nova', kind: 'live', status: 'done', durationMs: 1000 },
        [],
      )
      const depois = (await (await s.get('/api/metrics/profile')).json()) as { sessions: number }
      expect(depois.sessions).toBe(antes.sessions + 1)
    })
  })

  describe('POST /api/metrics/seeds/gastar e PUT /api/settings: a economia é calculada uma vez', () => {
    it('gastar devolve o total do razão, o perfil seguinte já desconta, e custa poucas consultas', async () => {
      const antes = (await (await s.get('/api/metrics/profile')).json()) as { seedsGastas: number }
      const pedido = { spendId: 'equivalencia-1', amount: 40, reason: 'pular-rodada' }
      const { r, n } = await medir(() => s.post('/api/metrics/seeds/gastar', pedido))
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ jaExistia: false, gasto: 40, seedsGastas: antes.seedsGastas + 40 })
      expect(n).toBeLessThanOrEqual(9)
      const depois = (await (await s.get('/api/metrics/profile')).json()) as { seedsGastas: number }
      expect(depois.seedsGastas).toBe(antes.seedsGastas + 40)
      const repetido = await s.post('/api/metrics/seeds/gastar', pedido)
      expect(await repetido.json()).toEqual({ jaExistia: true, gasto: 40, seedsGastas: antes.seedsGastas + 40 })
    })

    it('PUT /api/settings com seis itens do catálogo confere a posse com uma leitura de economia só', async () => {
      const ui = {
        theme: 'linear',
        fonte: 'padrao',
        menuPosition: 'right',
        pack: 'classico',
        cursor: 'padrao',
        rastro: 'off',
      }
      const { r, n } = await medir(() => s.put('/api/settings', { ui }))
      expect(r.status).toBe(200)
      expect(n).toBeLessThanOrEqual(12)
    })
  })
})
