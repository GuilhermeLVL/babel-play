/**
 * ALERTAS, PAINEL E COLETA COMO CÓDIGO — e o que impede os três de mentir (Fase 5 de prontidão).
 *
 * Regra de alerta e painel apontam para métricas por NOME, em texto. Renomear uma métrica em
 * `server/http/metricas.ts` não quebra nada em tempo de compilação: o alerta simplesmente para de
 * disparar para sempre, em silêncio — que é pior que não ter alerta, porque alguém acredita nele.
 * Este teste fecha essa porta: toda métrica citada em `ops/alertas/regras.yml` e em
 * `ops/dashboards/babel-play.json` tem de existir em `metricas.ts`, nas métricas padrão do
 * prom-client, ou na lista (explícita) das embutidas do Fly.
 *
 * E o `fly.toml`: o `[metrics]` raspa uma porta SEM token (o raspador do Fly não manda header). Isso
 * só é seguro enquanto essa porta não for publicada — o teste cobra que ela não esteja em
 * `[http_service]` nem em `[[services]]`, e que o app realmente sirva as métricas nela.
 */
import { readFileSync } from 'node:fs'

import yaml from 'js-yaml'
import { collectDefaultMetrics, Registry } from 'prom-client'
import { beforeAll, describe, expect, it } from 'vitest'

/** As embutidas do Fly citadas aqui (fly.io/docs/monitoring/metrics, "Built-in metrics"). */
const EMBUTIDAS_DO_FLY = new Set([
  'fly_instance_cpu_throttle',
  'fly_instance_cpu_balance',
  'fly_instance_cpu_baseline',
  'fly_instance_memory_mem_total',
  'fly_instance_memory_mem_available',
  'fly_volume_used_pct',
])

/** Palavras do PromQL/MetricsQL que não são métrica. */
const PALAVRAS_DO_PROMQL = new Set([
  'sum',
  'max',
  'min',
  'avg',
  'count',
  'rate',
  'increase',
  'irate',
  'delta',
  'deriv',
  'histogram_quantile',
  'clamp_min',
  'clamp_max',
  'absent',
  'time',
  'and',
  'or',
  'unless',
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'bool',
  'offset',
  'max_over_time',
  'min_over_time',
  'avg_over_time',
  'topk',
  'bottomk',
])

let conhecidas: Set<string>

beforeAll(async () => {
  const fonte = readFileSync('server/http/metricas.ts', 'utf8')
  const doCodigo = [...fonte.matchAll(/name: '([a-z_:][a-z0-9_:]*)'/g)].map((m) => m[1])
  const r = new Registry()
  collectDefaultMetrics({ register: r })
  const padrao = (await r.getMetricsAsJSON()).map((m) => m.name)
  conhecidas = new Set([...doCodigo, ...padrao, ...EMBUTIDAS_DO_FLY])
})

/** Os nomes de métrica de uma expressão: tira strings, seletores, janelas e agrupamentos. */
function metricasDa(expr: string): string[] {
  const limpa = expr
    .replace(/"[^"]*"/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(by|without|on|ignoring)\s*\([^)]*\)/g, '')
  return [...new Set(limpa.match(/[a-zA-Z_:][a-zA-Z0-9_:]*/g) ?? [])].filter((t) => !PALAVRAS_DO_PROMQL.has(t))
}

function existe(nome: string): boolean {
  return conhecidas.has(nome) || conhecidas.has(nome.replace(/_(bucket|sum|count)$/, ''))
}

interface Regra {
  alert: string
  expr: string
  for?: string
  labels: { severity: string }
  annotations: { summary: string; description: string; runbook_url: string }
}

const regras = (): Regra[] => {
  const doc = yaml.load(readFileSync('ops/alertas/regras.yml', 'utf8')) as {
    groups: Array<{ name: string; rules: Regra[] }>
  }
  return doc.groups.flatMap((g) => g.rules)
}

describe('ops/alertas/regras.yml', () => {
  it('é YAML válido no formato de regras do Prometheus (groups → rules com alert/expr)', () => {
    const doc = yaml.load(readFileSync('ops/alertas/regras.yml', 'utf8')) as { groups: unknown[] }
    expect(Array.isArray(doc.groups)).toBe(true)
    for (const r of regras()) {
      expect(typeof r.alert, JSON.stringify(r)).toBe('string')
      expect(r.expr.trim().length).toBeGreaterThan(0)
    }
  })

  it('cobre os alertas pedidos pela Fase 5', () => {
    const nomes = new Set(regras().map((r) => r.alert))
    for (const n of [
      'BabelErros5xxAltos',
      'BabelLatenciaP95Alta',
      'BabelEventLoopTravado',
      'BabelProvedorIaLimitando',
      'BabelAdmissaoRecusando',
      'BabelGastoDiarioAlto',
      'BabelGastoAnomaloUsuario',
      'BabelDisjuntorAberto',
      'BabelUploadsNoTeto',
      'BabelReadyDegradado',
    ])
      expect(nomes, n).toContain(n)
  })

  it('toda métrica citada nas regras EXISTE (renomear sem mexer aqui quebra este teste)', () => {
    const faltando = regras().flatMap((r) =>
      metricasDa(r.expr)
        .filter((n) => !existe(n))
        .map((n) => `${r.alert}: ${n}`),
    )
    expect(faltando).toEqual([])
  })

  it('nomes únicos, severidade conhecida, summary e description preenchidos', () => {
    const vistas = new Set<string>()
    for (const r of regras()) {
      expect(vistas.has(r.alert), `duplicada: ${r.alert}`).toBe(false)
      vistas.add(r.alert)
      expect(['pagina', 'aviso', 'planejamento']).toContain(r.labels?.severity)
      expect(r.annotations?.summary?.length, r.alert).toBeGreaterThan(10)
      expect(r.annotations?.description?.length, r.alert).toBeGreaterThan(10)
    }
  })

  it('todo runbook_url aponta para uma âncora que EXISTE no docs/runbook.md', () => {
    const runbook = readFileSync('docs/runbook.md', 'utf8')
    for (const r of regras()) {
      const m = /docs\/runbook\.md#([a-z0-9-]+)$/.exec(r.annotations.runbook_url)
      expect(m, `${r.alert}: runbook_url sem âncora do runbook`).toBeTruthy()
      expect(runbook, `${r.alert}: âncora #${m![1]} não existe no runbook`).toContain(`id="${m![1]}"`)
    }
  })
})

describe('ops/dashboards/babel-play.json', () => {
  const painel = () =>
    JSON.parse(readFileSync('ops/dashboards/babel-play.json', 'utf8')) as {
      uid: string
      panels: Array<{ type: string; title: string; targets?: Array<{ expr: string }> }>
    }

  it('é JSON de painel do Grafana com uid fixo e fonte de dados parametrizada', () => {
    const p = painel()
    expect(p.uid).toBe('babel-play-prod')
    expect(JSON.stringify(p)).toContain('${datasource}')
  })

  it('toda métrica citada nos painéis EXISTE', () => {
    const faltando = painel().panels.flatMap((p) =>
      (p.targets ?? []).flatMap((t) =>
        metricasDa(t.expr)
          .filter((n) => !existe(n))
          .map((n) => `${p.title}: ${n}`),
      ),
    )
    expect(faltando).toEqual([])
  })

  it('tem os painéis pedidos: req/s, latência por rota, erros, event loop, memória/CPU, IA, custo, uploads, backup', () => {
    const exprs = painel()
      .panels.flatMap((p) => p.targets ?? [])
      .map((t) => t.expr)
      .join('\n')
    for (const m of [
      'http_request_duration_seconds_count',
      'http_request_duration_seconds_bucket',
      'http_errors_total',
      'event_loop_atraso_segundos_bucket',
      'process_resident_memory_bytes',
      'process_cpu_seconds_total',
      'ia_chamadas_total',
      'ia_provedor_latencia_ms_bucket',
      'ia_provedor_limite_total',
      'ia_admissao_recusada_total',
      'ia_admissao_saldo',
      'ia_gasto_usd',
      'ia_custo_usd_total',
      'uploads_grandes_em_voo',
      'backup_ultimo_sucesso_timestamp_segundos',
    ])
      expect(exprs, m).toContain(m)
  })
})

describe('fly.toml — a coleta gerenciada do Fly', () => {
  const toml = () => readFileSync('fly.toml', 'utf8').replace(/#.*$/gm, '')

  /** O corpo de uma seção `[nome]` até a próxima seção. */
  const secao = (fonte: string, cabecalho: RegExp): string | undefined => {
    const m = cabecalho.exec(fonte)
    if (!m) return undefined
    const resto = fonte.slice(m.index + m[0].length)
    const fim = resto.search(/^\s*\[/m)
    return fim === -1 ? resto : resto.slice(0, fim)
  }

  it('tem [metrics] em /metrics numa porta que o app serve (METRICS_PORTA_INTERNA) com METRICS_ENABLED=1', () => {
    const fonte = toml()
    const metrics = secao(fonte, /^\[metrics\]\s*$/m)
    expect(metrics, 'sem bloco [metrics]').toBeDefined()
    const porta = /port\s*=\s*(\d+)/.exec(metrics!)?.[1]
    expect(/path\s*=\s*"\/metrics"/.test(metrics!)).toBe(true)
    const env = secao(fonte, /^\[env\]\s*$/m)!
    expect(env).toMatch(new RegExp(`METRICS_PORTA_INTERNA\\s*=\\s*"${porta}"`))
    expect(env).toMatch(/METRICS_ENABLED\s*=\s*"1"/)
  })

  it('a porta de métricas NÃO está publicada (nem no [http_service], nem em [[services]])', () => {
    const fonte = toml()
    const porta = /port\s*=\s*(\d+)/.exec(secao(fonte, /^\[metrics\]\s*$/m)!)?.[1]
    const http = secao(fonte, /^\[http_service\]\s*$/m)!
    expect(/internal_port\s*=\s*(\d+)/.exec(http)?.[1]).not.toBe(porta)
    for (const m of fonte.matchAll(/^\[\[services\]\]\s*$/gm)) {
      const corpo = fonte.slice(m.index! + m[0].length).split(/^\s*\[\[?(?!services\.)/m)[0]
      expect(/internal_port\s*=\s*(\d+)/.exec(corpo)?.[1], 'a porta de métricas publicada num [[services]]').not.toBe(
        porta,
      )
    }
  })
})
