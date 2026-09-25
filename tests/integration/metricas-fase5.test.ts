/**
 * AS MÉTRICAS QUE FALTAVAM PARA ALERTAR E PARA ESCALAR (Fase 5 de prontidão, 25/09/2026).
 *
 * A Fase 1/2 achou o `/metrics` com o que um painel de requisições precisa e sem o que um ALERTA
 * precisa: nada dizia que o event loop estava preso, quantas escritas/s o SQLite recebia (o gatilho
 * do ADR 0006), quanto a IA custou HOJE, quanto cada plano custa, se um disjuntor abriu, se o
 * semáforo de uploads estava no teto, nem se o cache de tradução acertava. Cada `describe` abaixo é
 * uma dessas perguntas, respondida pelo scrape de verdade (`register.metrics()`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let m: typeof import('../../server/http/metricas')
let promClient: typeof import('prom-client')

const salvos: Record<string, string | undefined> = {}
function fixar(nome: string, valor: string | undefined) {
  if (!(nome in salvos)) salvos[nome] = process.env[nome]
  if (valor === undefined) delete process.env[nome]
  else process.env[nome] = valor
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  m = await h.load('../../server/http/metricas')
  promClient = await import('prom-client')
  m.esquecerMetricas()
  m.handlerDeMetricas() // cria as métricas (o que o app faz com METRICS_ENABLED=1)
})

afterAll(async () => {
  m.esquecerMetricas()
  for (const [k, v] of Object.entries(salvos)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await h.cleanup()
})

const scrape = () => promClient.register.metrics()

/** O valor de uma série (primeira linha que começa com `prefixo`). */
function valor(corpo: string, prefixo: string): number | undefined {
  const linha = corpo.split('\n').find((l) => l.startsWith(prefixo))
  return linha === undefined ? undefined : Number(linha.slice(linha.lastIndexOf(' ') + 1))
}

describe('event loop: histograma de verdade, e ele VÊ o travamento', () => {
  it('um bloqueio síncrono de ~600 ms aparece acima do balde de 0,5 s', async () => {
    await scrape() // zera o intervalo
    /* Deixa o timer do monitor disparar depois do `reset` — o primeiro intervalo após zerar não é
       registrado, e é ele que conteria o bloqueio se travássemos já. */
    await new Promise((r) => setTimeout(r, 60))
    const fim = Date.now() + 600
    while (Date.now() < fim) {
      /* trava o loop de propósito — é o que o driver síncrono faz numa consulta cara */
    }
    await new Promise((r) => setTimeout(r, 60))
    const corpo = await scrape()
    expect(corpo).toContain('# TYPE event_loop_atraso_segundos histogram')
    const total = valor(corpo, 'event_loop_atraso_segundos_count')
    const ateMeioSegundo = valor(corpo, 'event_loop_atraso_segundos_bucket{le="0.5"}')
    expect(total).toBeGreaterThan(0)
    expect(ateMeioSegundo, 'nenhuma amostra acima de 0,5 s: o bloqueio não foi visto').toBeLessThan(total!)
  })
})

describe('banco: escritas e leituras contadas no cliente libsql', () => {
  it('um INSERT conta em db_escritas_total; um SELECT em db_leituras_total; com duração por tipo', async () => {
    const { client } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const antes = await scrape()
    const escritas0 = valor(antes, 'db_escritas_total') ?? 0
    const leituras0 = valor(antes, 'db_leituras_total') ?? 0

    await client.execute('CREATE TABLE IF NOT EXISTS _medir (x INTEGER)')
    await client.execute({ sql: 'INSERT INTO _medir (x) VALUES (?)', args: [1] })
    await client.batch([{ sql: 'INSERT INTO _medir (x) VALUES (?)', args: [2] }, 'SELECT 1'])
    await client.execute('SELECT count(*) FROM _medir')

    const depois = await scrape()
    expect(valor(depois, 'db_escritas_total')! - escritas0).toBe(3) // CREATE + 2 INSERT
    expect(valor(depois, 'db_leituras_total')! - leituras0).toBe(2)
    expect(depois).toContain('db_consulta_duracao_segundos_count{tipo="escrita"}')
    expect(depois).toContain('db_consulta_duracao_segundos_count{tipo="leitura"}')
  })

  it('classifica pela primeira palavra do SQL', () => {
    expect(m.tipoDaInstrucao('  insert into x values (1)')).toBe('escrita')
    expect(m.tipoDaInstrucao('UPDATE x SET a = 1')).toBe('escrita')
    expect(m.tipoDaInstrucao('delete from x')).toBe('escrita')
    expect(m.tipoDaInstrucao('select * from x')).toBe('leitura')
    expect(m.tipoDaInstrucao('PRAGMA busy_timeout')).toBe('leitura')
  })

  it('o tamanho do arquivo do banco é exposto (gatilho de 5 GB do ADR 0006)', async () => {
    expect(valor(await scrape(), 'db_tamanho_bytes')).toBeGreaterThan(0)
  })
})

describe('custo de IA: por plano, e o gasto do dia e do mês lidos do banco', () => {
  it('ia_custo_usd_total soma por plano; plano fora da lista vira `desconhecido`', async () => {
    m.contarCustoPorPlano('pro', 0.25)
    m.contarCustoPorPlano('pro', 0.25)
    m.contarCustoPorPlano('essencial', 0.1)
    m.contarCustoPorPlano('plano-inventado-pelo-cliente', 0.1)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_custo_usd_total{plano="pro"}')).toBeCloseTo(0.5, 6)
    expect(valor(corpo, 'ia_custo_usd_total{plano="essencial"}')).toBeCloseTo(0.1, 6)
    expect(corpo).toContain('ia_custo_usd_total{plano="desconhecido"}')
    expect(corpo).not.toContain('plano-inventado-pelo-cliente')
  })

  it('ia_gasto_usd{periodo} vem de gasto_de_ia; o teto só aparece quando existe', async () => {
    fixar('AUTH_REQUIRED', '1')
    fixar('AI_BUDGET_USD_MONTH', '10')
    fixar('AI_BUDGET_USD_DAY', undefined)
    const orc = await h.load<typeof import('../../server/lib/orcamentoDeIa')>('../../server/lib/orcamentoDeIa')
    await orc.registrarGastoDeIa(0.4, { plano: 'pro' })
    const corpo = await scrape()
    expect(valor(corpo, 'ia_gasto_usd{periodo="dia"}')).toBeCloseTo(0.4, 6)
    expect(valor(corpo, 'ia_gasto_usd{periodo="mes"}')).toBeCloseTo(0.4, 6)
    expect(valor(corpo, 'ia_orcamento_teto_usd{periodo="mes"}')).toBe(10)
    // Sem AI_BUDGET_USD_DAY não há teto diário — e nenhuma série `+Inf` para quebrar a razão.
    expect(corpo).not.toContain('ia_orcamento_teto_usd{periodo="dia"}')
  })
})

describe('estado de agora: disjuntor, uploads, cache', () => {
  it('ia_disjuntores conta por estado, sem o endereço do provedor', async () => {
    const d = await h.load<typeof import('../../server/ai/disjuntor')>('../../server/ai/disjuntor')
    d.esquecerDisjuntores()
    const chave = 'https://provedor.exemplo/v1·modelo-x'
    for (let i = 0; i < d.FALHAS_PARA_ABRIR; i++) d.registrarFalha(chave, 500)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_disjuntores{estado="aberto"}')).toBe(1)
    expect(corpo).not.toContain('provedor.exemplo')
    d.esquecerDisjuntores()
  })

  it('uploads em voo, o teto do processo e as recusas por motivo', async () => {
    const c = await h.load<typeof import('../../server/lib/corposGrandes')>('../../server/lib/corposGrandes')
    const vaga = c.semaforoDeCorposGrandes.adquirir('usuario-a')
    const corpo = await scrape()
    expect(valor(corpo, 'uploads_grandes_em_voo')).toBe(1)
    expect(valor(corpo, 'uploads_grandes_limite')).toBeGreaterThanOrEqual(1)
    if (vaga.ok) vaga.liberar()

    m.contarUploadRecusado('processo')
    expect(valor(await scrape(), 'uploads_grandes_recusados_total{motivo="processo"}')).toBe(1)
  })

  it('cache de tradução: acertos e faltas, e o tamanho', async () => {
    m.contarCacheDeTraducao(true)
    m.contarCacheDeTraducao(false)
    m.contarCacheDeTraducao(false)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_cache_traducao_total{resultado="acerto"}')).toBe(1)
    expect(valor(corpo, 'ia_cache_traducao_total{resultado="falta"}')).toBe(2)
    expect(corpo).toContain('ia_cache_traducao_entradas')
  })

  it('backup: último sucesso, tamanho e falhas', async () => {
    m.observarBackup({ ok: true, bytes: 1234 })
    m.observarBackup({ ok: false })
    const corpo = await scrape()
    expect(valor(corpo, 'backup_ultimo_sucesso_timestamp_segundos')).toBeGreaterThan(1_700_000_000)
    expect(valor(corpo, 'backup_ultimo_tamanho_bytes')).toBe(1234)
    expect(valor(corpo, 'backup_falhas_total')).toBe(1)
  })
})

describe('a porta INTERNA de métricas (o alvo do [metrics] do Fly)', () => {
  it('responde /metrics SEM token — mesmo com METRICS_TOKEN definida — e 404 no resto', async () => {
    fixar('METRICS_TOKEN', 'segredo-que-o-fly-nao-manda')
    const srv = await m.iniciarServidorDeMetricas(0, '127.0.0.1')
    try {
      const addr = srv.address()
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
      const r = await fetch(`${base}/metrics`)
      expect(r.status).toBe(200)
      expect(r.headers.get('x-metrics-processo')).toMatch(/^(primario|worker):\d+$/)
      expect(await r.text()).toContain('# TYPE http_request_duration_seconds histogram')
      expect((await fetch(`${base}/api/health`)).status).toBe(404)
      expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(404)
    } finally {
      await new Promise<void>((r) => srv.close(() => r()))
    }
  })
})
