/**
 * ROTAS PEQUENAS: UMA LEITURA POR TABELA, E O PERFIL RESPONDE 304 (auditoria de desempenho do
 * servidor de 10/10/2026, achado A11 a, b, c).
 *
 *   a) `GET /api/me/uso` fazia o MESMO `SELECT` em `usage_counters` uma vez por contador (quatro
 *      do mês e, em plano com teto no dia, mais dois): a tela de captura pede a rota três vezes.
 *   b) `GET /api/billing/status` lia `subscriptions` três vezes e `testes_premium` duas (a rota, a
 *      situação do teste e o plano por trás das flags de venda, cada um por conta própria); é a
 *      rota que o checkout sonda a cada 5 s.
 *   c) `GET /api/metrics/profile` nunca respondia 304: o corpo leva `asOf` e a retenção média, que
 *      mudam a cada milissegundo, então o ETag do Express (hash do corpo) nunca batia.
 *
 * O corpo de cada rota é o de ANTES (gravado com o código anterior, relógio congelado); o que cai
 * é a contagem de consultas. Modo público, que é onde as três tabelas são lidas.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { PLANO_PAGO } from '../harness/planoPago'
import { semearRico } from './_semeaduraRica'

const AGORA = Date.UTC(2026, 9, 5, 15, 0, 0)
const MINUTO = 60_000
const PAGANTE = 'consultas-pagante'
const GRATIS = 'consultas-gratis'
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`
const foto = (nome: string) => `../__snapshots__/consultas-repetidas/${nome}.json`

describe('rotas pequenas: uma leitura por tabela', () => {
  let s: AppDeTeste
  let pagante: string
  let gratis: string
  let instrucoes: string[] = []

  async function medir(f: () => Promise<Response>): Promise<{ r: Response; sql: string[] }> {
    instrucoes = []
    const r = await f()
    await r.clone().arrayBuffer()
    /* DIAG_CONSULTAS=1 imprime o que cada chamada custou: é de onde saem os números do relatório. */
    if (process.env.DIAG_CONSULTAS === '1') {
      const tabela = (x: string) => /(?:from|into|update)\s+"?([a-z_]+)"?/i.exec(x)?.[1] ?? '?'
      const porTabela: Record<string, number> = {}
      for (const x of instrucoes) porTabela[tabela(x)] = (porTabela[tabela(x)] ?? 0) + 1
      console.log(`[consultas] ${new URL(r.url).pathname} ${r.status}: ${instrucoes.length}`, JSON.stringify(porTabela))
    }
    return { r, sql: instrucoes }
  }
  const leituras = (sql: string[], tabela: string) =>
    sql.filter((x) => /^\s*select/i.test(x) && x.includes(`"${tabela}"`)).length

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'publico' })
    pagante = await s.token(PAGANTE)
    gratis = await s.token(GRATIS)
    const { asUserId } = await s.load('../../server/lib/authContext')
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    const { usageCountersRepo } = await s.load('../../server/db/repositories/usageCounters')
    const quota = await s.load('../../server/lib/usageQuota')
    for (const [id, token] of [
      [PAGANTE, pagante],
      [GRATIS, gratis],
    ]) {
      expect((await s.get('/api/me/entitlements', token)).status).toBe(200)
      expect((await s.put('/api/me/idade', { nascimento: '1990-05-17' }, token)).status).toBeLessThan(300)
      void id
    }
    await subscriptionsRepo.upsert(asUserId(PAGANTE), {
      plan: PLANO_PAGO,
      status: 'active',
      currentPeriodEnd: AGORA + 20 * 86_400_000,
    })
    /* Um valor diferente em cada contador: trocar um pelo outro aparece no corpo. */
    const mes = new Date(AGORA).toISOString().slice(0, 7)
    const dia = await quota.janelaDoDia(asUserId(PAGANTE))
    const u = asUserId(PAGANTE)
    await usageCountersRepo.increment(u, quota.METRIC_MANAGED, mes, 11)
    await usageCountersRepo.increment(u, quota.METRIC_STT_SEGUNDOS, mes, 222)
    await usageCountersRepo.increment(u, quota.METRIC_STT_AO_VIVO_SEGUNDOS, mes, 33)
    await usageCountersRepo.increment(u, quota.METRIC_LLM_TOKENS, mes, 4444)
    await usageCountersRepo.increment(u, quota.METRIC_STT_SEGUNDOS_DIA, dia, 55)
    await usageCountersRepo.increment(u, quota.METRIC_LLM_TOKENS_DIA, dia, 666)
    /* Mês passado e outra conta: não podem entrar na soma de ninguém. */
    await usageCountersRepo.increment(u, quota.METRIC_MANAGED, '2026-09', 9000)
    await usageCountersRepo.increment(asUserId(GRATIS), quota.METRIC_MANAGED, mes, 7)
    await semearRico(s, PAGANTE)

    const { client } = await s.load('../../server/db/db')
    const execute = client.execute.bind(client)
    const batch = client.batch.bind(client)
    const texto = (x: unknown) => (typeof x === 'string' ? x : ((x as { sql?: string }).sql ?? ''))
    client.execute = ((...a: Parameters<typeof execute>) => {
      instrucoes.push(texto(a[0]))
      return execute(...a)
    }) as typeof client.execute
    client.batch = ((...a: Parameters<typeof batch>) => {
      for (const x of a[0] as unknown[]) instrucoes.push(texto(x))
      return batch(...a)
    }) as typeof client.batch
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  describe('GET /api/me/uso', () => {
    /* O CUSTO FIXO de toda requisição autenticada inclui uma leitura de `usage_counters` (o
       limitador de força bruta, que lê sem gravar): medido numa rota que não toca nos contadores,
       para a conta abaixo ser só a da rota. */
    async function leituraFixa(token: string): Promise<number> {
      const { sql } = await medir(() => s.get('/api/me/idade', token))
      return leituras(sql, 'usage_counters')
    }

    it('assinante: o corpo de antes, com UMA leitura de usage_counters', async () => {
      const { r, sql } = await medir(() => s.get('/api/me/uso', pagante))
      expect(r.status).toBe(200)
      const corpo = await r.json()
      expect(corpo.chamadas.usado).toBe(11)
      expect(corpo.segundosDeAudio.usado).toBe(222)
      expect(corpo.porNivel.aovivo.usado).toBe(33)
      expect(corpo.tokensDeLlm.usado).toBe(4444)
      await expect(json(corpo)).toMatchFileSnapshot(foto('me-uso-pagante'))
      expect(leituras(sql, 'usage_counters') - (await leituraFixa(pagante))).toBe(1)
    })

    it('conta grátis: o corpo de antes, e a leitura dos contadores do plano continua sendo uma', async () => {
      const { r, sql } = await medir(() => s.get('/api/me/uso', gratis))
      expect(r.status).toBe(200)
      const corpo = await r.json()
      expect(corpo.chamadas.usado).toBe(7)
      await expect(json(corpo)).toMatchFileSnapshot(foto('me-uso-gratis'))
      /* Com a nuvem de alívio desligada (o padrão), a conta Grátis não lê mais nada dos contadores. */
      expect(leituras(sql, 'usage_counters') - (await leituraFixa(gratis))).toBe(1)
    })
  })

  describe('GET /api/billing/status', () => {
    it('assinante: o corpo de antes, com uma leitura de subscriptions e uma de testes_premium', async () => {
      const { r, sql } = await medir(() => s.get('/api/billing/status', pagante))
      expect(r.status).toBe(200)
      const corpo = await r.json()
      expect(corpo.assinatura).toMatchObject({ status: 'active', valeAte: AGORA + 20 * 86_400_000 })
      await expect(json(corpo)).toMatchFileSnapshot(foto('billing-status-pagante'))
      expect(leituras(sql, 'subscriptions')).toBe(1)
      expect(leituras(sql, 'testes_premium')).toBeLessThanOrEqual(1)
    })

    it('conta grátis: o corpo de antes, com as mesmas leituras únicas', async () => {
      const { r, sql } = await medir(() => s.get('/api/billing/status', gratis))
      expect(r.status).toBe(200)
      await expect(json(await r.json())).toMatchFileSnapshot(foto('billing-status-gratis'))
      expect(leituras(sql, 'subscriptions')).toBe(1)
      expect(leituras(sql, 'testes_premium')).toBeLessThanOrEqual(1)
    })
  })

  describe('GET /api/metrics/profile: 304 sem montar o perfil', () => {
    let etag = ''

    it('o corpo é o de antes, `asOf` incluído, e a resposta traz o ETag do perfil', async () => {
      const r = await s.get('/api/metrics/profile', pagante)
      expect(r.status).toBe(200)
      etag = r.headers.get('etag') ?? ''
      const corpo = await r.json()
      expect(corpo.asOf).toBe(AGORA)
      await expect(json(corpo)).toMatchFileSnapshot(foto('perfil'))
      expect(etag).toMatch(/^W\/"perfil-/)
    })

    it('segundos depois, sem escrita: 304, sem corpo e sem reler as tabelas grandes', async () => {
      vi.setSystemTime(AGORA + 20_000)
      const { r, sql } = await medir(() =>
        s.chamar('GET', '/api/metrics/profile', { token: pagante, headers: { 'if-none-match': etag } }),
      )
      expect(r.status).toBe(304)
      expect(await r.text()).toBe('')
      expect(sql.filter((x) => /review_logs|vocab_cards|exercise_results|utterances/.test(x))).toEqual([])
    })

    it('sem If-None-Match o corpo vem inteiro, com o `asOf` do instante do pedido', async () => {
      const r = await s.get('/api/metrics/profile', pagante)
      expect(r.status).toBe(200)
      expect((await r.json()).asOf).toBe(AGORA + 20_000)
    })

    it('o ETag de outra conta não vale', async () => {
      const r = await s.chamar('GET', '/api/metrics/profile', { token: gratis, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      await r.arrayBuffer()
    })

    it('no minuto seguinte o ETag antigo não vale: o que depende do relógio é recalculado', async () => {
      vi.setSystemTime(AGORA + MINUTO + 1000)
      const r = await s.chamar('GET', '/api/metrics/profile', { token: pagante, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      expect((await r.json()).asOf).toBe(AGORA + MINUTO + 1000)
      etag = r.headers.get('etag') ?? ''
    })

    it('uma revisão nova (versão de atividade) derruba o ETag', async () => {
      const lista = (await (await s.get('/api/vocab', pagante)).json()) as Array<{ id: string }>
      expect((await s.post(`/api/vocab/${lista[0].id}/review`, { grade: 3 }, pagante)).status).toBe(200)
      const r = await s.chamar('GET', '/api/metrics/profile', { token: pagante, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      etag = r.headers.get('etag') ?? ''
      await r.arrayBuffer()
    })

    it('um gasto de Seeds (razão, sem gatilho de versão) também derruba o ETag', async () => {
      const { asUserId } = await s.load('../../server/lib/authContext')
      const { seedSpendsRepo } = await s.load('../../server/db/repositories/seedSpends')
      await seedSpendsRepo.debitar(
        asUserId(PAGANTE),
        { spendId: 'etag-gasto-1', amount: 1, reason: 'pular-rodada' },
        {},
      )
      const r = await s.chamar('GET', '/api/metrics/profile', { token: pagante, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      await r.arrayBuffer()
    })

    it('o escopo de sessão não ganha o ETag do perfil da conta', async () => {
      const r = await s.get('/api/metrics/profile?sessao=nao-existe', pagante)
      expect(r.status).toBe(200)
      expect(r.headers.get('etag') ?? '').not.toMatch(/^W\/"perfil-/)
      await r.arrayBuffer()
    })
  })
})
