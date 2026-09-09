/**
 * `GET /metrics` — o endpoint de OPERAÇÃO, exercitado sobre a montagem de verdade.
 *
 * Ele sobe pelo harness de caracterização (`criarApp()` real, ordem real de middlewares) porque as
 * três coisas que este teste precisa provar são todas sobre POSIÇÃO e não sobre a função isolada:
 *
 *   1. a rota está ANTES do `authMiddleware` (um scraper não tem JWT de ninguém);
 *   2. o middleware está antes de TUDO, então ele vê também as respostas que nunca chegam a um
 *      router — é o 401 e o 429 que o operador procura primeiro;
 *   3. a label de rota é o PADRÃO (`/api/sessions/:id`) e nunca o caminho com id. Este é o item
 *      irreversível: uma label com id cria uma série temporal por sessão na base do Prometheus,
 *      para sempre, mesmo depois de a sessão ser apagada.
 *
 * `/api/metrics` (negócio: perfil, seeds) e `/metrics` (operação) coexistem, e o teste cobra isso
 * explicitamente — foi o risco de colisão mais concreto desta entrega.
 *
 * `METRICS_ENABLED` é fixado ANTES do `subirApp` de propósito: `criarApp()` lê a decisão no momento
 * da chamada, e é assim que produção decide também.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const salvos: Record<string, string | undefined> = {}

function fixar(nome: string, valor: string | undefined) {
  if (!(nome in salvos)) salvos[nome] = process.env[nome]
  if (valor === undefined) delete process.env[nome]
  else process.env[nome] = valor
}

beforeAll(async () => {
  fixar('METRICS_ENABLED', '1')
  fixar('METRICS_TOKEN', undefined)
  s = await subirApp({ modo: 'self-host' })
})

afterAll(async () => {
  await s.encerrar()
  const { esquecerMetricas } = await import('../../server/http/metricas')
  esquecerMetricas()
  for (const [k, v] of Object.entries(salvos)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('GET /metrics', () => {
  it('responde no formato de exposição do Prometheus, sem token', async () => {
    const r = await s.get('/metrics')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('text/plain')
    const corpo = await r.text()
    expect(corpo).toContain('# TYPE http_request_duration_seconds histogram')
    expect(corpo).toContain('# TYPE http_errors_total counter')
    // `collectDefaultMetrics`: sem elas, um alerta de memória/event loop precisaria de outro agente.
    expect(corpo).toContain('process_cpu_seconds_total')
  })

  it('diz QUAL processo respondeu — é o que torna o cluster legível no próprio scrape', async () => {
    const r = await s.get('/metrics')
    expect(r.headers.get('x-metrics-processo')).toMatch(/^(primario|worker):\d+$/)
    expect(await r.text()).toContain('processo_info')
  })

  it('fica FORA do authMiddleware: no modo self-host e sem token, 200 direto', async () => {
    // No modo público a garantia é a mesma e vem da ORDEM de montagem, coberta abaixo lendo o
    // `app.ts` — subir um segundo `subirApp` no mesmo arquivo não é possível (ver `_app.ts`).
    expect((await s.get('/metrics')).status).toBe(200)
  })

  it('NÃO colide com /api/metrics, que é rota de NEGÓCIO e continua respondendo JSON', async () => {
    const r = await s.get('/api/metrics/xp')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('application/json')
  })
})

describe('a label de rota é o PADRÃO, nunca o caminho com id', () => {
  it('duas sessões diferentes viram UMA série `/api/sessions/:id`', async () => {
    await s.get('/api/sessions/sessao-inexistente-aaa')
    await s.get('/api/sessions/sessao-inexistente-bbb')
    const corpo = await (await s.get('/metrics')).text()

    expect(corpo).toContain('route="/api/sessions/:id"')
    // O que NÃO pode existir: uma série por id. É este o erro irreversível na base do Prometheus.
    expect(corpo).not.toContain('sessao-inexistente-aaa')
    expect(corpo).not.toContain('sessao-inexistente-bbb')
  })

  it('caminho que não casou rota nenhuma cai num balde só — um scanner não inventa mil séries', async () => {
    await s.get('/isto-nao-existe-1')
    await s.get('/isto-nao-existe-2')
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).toContain('route="desconhecida"')
    expect(corpo).not.toContain('isto-nao-existe-1')
  })

  it('conta erro em `http_errors_total` com o status real', async () => {
    await s.get('/api/sessions/sessao-inexistente-ccc')
    const corpo = await (await s.get('/metrics')).text()
    const linha = corpo.split('\n').find((l) => l.startsWith('http_errors_total{') && l.includes('/api/sessions/:id'))
    expect(linha, 'nenhuma linha de http_errors_total para /api/sessions/:id').toBeTruthy()
    expect(linha).toContain('status="404"')
  })

  it('as rotas de IA ganham contador próprio, medindo o PROXY (não o provedor)', async () => {
    // 501 (provedor não configurado no teste) é resultado legítimo e é justamente o que se quer
    // contar: o proxy respondeu, e respondeu "não dá".
    await s.post('/api/ai/mt', { text: 'oi', source: 'pt', target: 'en' })
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).toContain('ia_chamadas_total{')
    expect(corpo).toContain('route="/api/ai/mt"')
  })
})

describe('a montagem no servidor real', () => {
  const src = () => import('node:fs').then((fs) => fs.readFileSync('server/http/app.ts', 'utf8'))

  it('monta /metrics ANTES do authMiddleware — depois dele, o scraper precisaria de um JWT', async () => {
    const fonte = await src()
    const metrics = fonte.search(/app\.get\(['"`]\/metrics['"`]/)
    const auth = fonte.search(/app\.use\(['"`]\/api['"`],\s*opcoes\.autenticacao/)
    expect(metrics).toBeGreaterThan(-1)
    expect(auth).toBeGreaterThan(-1)
    expect(metrics).toBeLessThan(auth)
  })

  it('monta o middleware ANTES dos routers — senão ele só veria o caminho feliz', async () => {
    const fonte = await src()
    const middleware = fonte.search(/app\.use\(middlewareDeMetricas\(\)\)/)
    const primeiroRouter = fonte.search(/app\.use\(['"`]\/api\/(ai|sessions|vocab)['"`]/)
    expect(middleware).toBeGreaterThan(-1)
    expect(middleware).toBeLessThan(primeiroRouter)
  })

  it('a rota só EXISTE com METRICS_ENABLED=1 — desligada, ela é um 404 como qualquer outra', async () => {
    const fonte = await src()
    // Um 403 numa rota sempre montada confirmaria a um estranho que o servidor é instrumentado.
    expect(fonte).toMatch(/if \(metricasHabilitadas\(\)\) \{[\s\S]*?app\.get\(['"`]\/metrics['"`]/)
  })
})
