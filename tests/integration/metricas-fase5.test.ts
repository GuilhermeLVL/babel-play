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

import { clienteSql } from '../harness/clienteSql'
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

describe('banco: escritas e leituras contadas no driver', () => {
  it('um INSERT conta em db_escritas_total; um SELECT em db_leituras_total; com duração por tipo', async () => {
    const mod = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { sql } = await import('drizzle-orm')
    const client = clienteSql(mod)
    const antes = await scrape()
    const escritas0 = valor(antes, 'db_escritas_total') ?? 0
    const leituras0 = valor(antes, 'db_leituras_total') ?? 0

    /* O segundo INSERT e o `SELECT 1` vão num LOTE de verdade (`emLote`, o que era o `client.batch` do
       SQLite): as instruções de dentro da transação contam como as avulsas (ver `db.ts`). */
    await client.execute('CREATE TABLE IF NOT EXISTS _medir (x INTEGER)')
    await client.execute({ sql: 'INSERT INTO _medir (x) VALUES (?)', args: [1] })
    await mod.emLote((tx) => [
      () => tx.execute(sql`INSERT INTO _medir (x) VALUES (${2})`),
      () => tx.execute(sql`SELECT 1`),
    ])
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
    m.contarCustoPorPlano('premium', 0.25)
    m.contarCustoPorPlano('premium', 0.25)
    m.contarCustoPorPlano('convidado', 0.05)
    m.contarCustoPorPlano('plano-inventado-pelo-cliente', 0.1)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_custo_usd_total{plano="premium"}')).toBeCloseTo(0.5, 6)
    expect(valor(corpo, 'ia_custo_usd_total{plano="convidado"}')).toBeCloseTo(0.05, 6)
    expect(corpo).toContain('ia_custo_usd_total{plano="desconhecido"}')
    expect(corpo).not.toContain('plano-inventado-pelo-cliente')
  })

  it('o nome antigo (`pro`) soma no Premium, e não vira série própria', async () => {
    const antes = valor(await scrape(), 'ia_custo_usd_total{plano="premium"}') ?? 0
    m.contarCustoPorPlano('pro', 0.2)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_custo_usd_total{plano="premium"}')).toBeCloseTo(antes + 0.2, 6)
    expect(corpo).not.toContain('ia_custo_usd_total{plano="pro"}')
  })

  /* Matriz v3: o Essencial e o Ao Vivo são planos, e o custo de cada um é a série dele — é ela que
     vai dizer se o plano de R$ 9,90 se paga. */
  it('matriz v3: cada plano pago tem a sua série de custo', async () => {
    const premiumAntes = valor(await scrape(), 'ia_custo_usd_total{plano="premium"}') ?? 0
    m.contarCustoPorPlano('essencial', 0.1)
    m.contarCustoPorPlano('aovivo', 0.4)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_custo_usd_total{plano="essencial"}')).toBeCloseTo(0.1, 6)
    expect(valor(corpo, 'ia_custo_usd_total{plano="aovivo"}')).toBeCloseTo(0.4, 6)
    expect(valor(corpo, 'ia_custo_usd_total{plano="premium"}')).toBeCloseTo(premiumAntes, 6)
  })

  it('ia_gasto_usd{periodo} vem de gasto_de_ia; o teto só aparece quando existe', async () => {
    fixar('AUTH_REQUIRED', '1')
    fixar('AI_BUDGET_USD_MONTH', '10')
    fixar('AI_BUDGET_USD_DAY', undefined)
    const orc = await h.load<typeof import('../../server/lib/orcamentoDeIa')>('../../server/lib/orcamentoDeIa')
    await orc.registrarGastoDeIa(0.4, { plano: 'premium' })
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
    const vaga = c.semaforoDeCorposGrandes().adquirir('usuario-a')
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

  it('cache de tradução por nível: L1 (memória) e L2 (SQLite), acertos e faltas', async () => {
    m.contarNivelDoCacheDeTraducao('l1', false)
    m.contarNivelDoCacheDeTraducao('l2', true)
    m.contarNivelDoCacheDeTraducao('l2', false)
    m.contarNivelDoCacheDeTraducao('l2', false)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_cache_traducao_nivel_total{nivel="l1",resultado="falta"}')).toBe(1)
    expect(valor(corpo, 'ia_cache_traducao_nivel_total{nivel="l2",resultado="acerto"}')).toBe(1)
    expect(valor(corpo, 'ia_cache_traducao_nivel_total{nivel="l2",resultado="falta"}')).toBe(2)
  })
})

describe('qualidade da IA (Fase B do plano da IA paga): resposta inválida, cache de prompt e feedback', () => {
  it('resposta_invalida por função e modelo; modelo fora do registro vira `outro` (cardinalidade fechada)', async () => {
    m.contarRespostaInvalida('explicacao', 'modelo/que-ninguem-declarou')
    m.contarRespostaInvalida('explicacao', undefined)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_resposta_invalida_total{funcao="explicacao",modelo="outro"}')).toBe(2)
    expect(corpo).not.toContain('modelo/que-ninguem-declarou')
  })

  it('tokens de entrada e em cache por função: a razão dá a taxa de cache do prompt', async () => {
    m.contarTokensDeEntrada('resumo', 1000, 600)
    m.contarTokensDeEntrada('resumo', 500, 0)
    m.contarTokensDeEntrada('resumo', Number.NaN, -1) // lixo não soma
    const corpo = await scrape()
    expect(valor(corpo, 'ia_tokens_entrada_total{funcao="resumo"}')).toBe(1500)
    expect(valor(corpo, 'ia_tokens_em_cache_total{funcao="resumo"}')).toBe(600)
  })

  it('feedback por função, nota e motivo; sem motivo é `nenhum`', async () => {
    m.contarFeedbackDeIa('tutor', 'down', 'errado')
    m.contarFeedbackDeIa('tutor', 'up', undefined)
    const corpo = await scrape()
    expect(valor(corpo, 'ia_feedback_total{funcao="tutor",nota="down",motivo="errado"}')).toBe(1)
    expect(valor(corpo, 'ia_feedback_total{funcao="tutor",nota="up",motivo="nenhum"}')).toBe(1)
  })
})

describe('a porta INTERNA de métricas (aposentada na Task 10 da Fase 2)', () => {
  it('o listener próprio não existe mais: o scrape é o GET /metrics do app, com token em produção', () => {
    expect('iniciarServidorDeMetricas' in m).toBe(false)
  })
})
