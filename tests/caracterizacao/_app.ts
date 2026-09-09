/**
 * HARNESS DE CARACTERIZAÇÃO HTTP — o servidor de verdade, montado como o `server.ts` monta.
 *
 * A rede de segurança da rodada de saneamento (Fase 1) precisa gravar o comportamento ATUAL de
 * cada fluxo crítico por HTTP, antes de qualquer remoção ou movimentação. Os testes de integração
 * existentes montam um `express()` com um router de cada vez; aqui a montagem repete a ORDEM do
 * `server.ts` (requestId → json → compression → health público → webhook → rank → auth →
 * limitadores → routers → erroGlobal), porque a ordem é parte do comportamento: um router antes
 * do auth é público, um depois é privado.
 *
 * DUPLICAÇÃO DELIBERADA E TEMPORÁRIA. O `server.ts` não exporta o app (ele chama `listen` no
 * carregamento), então esta função repete a montagem. A change `servidor-app-e-bootstrap`
 * (Fase 3) extrai `criarApp()` e este arquivo passa a chamá-la — o teste
 * `montagem-espelha-o-server.test.ts` cobra que as duas listas de routers não divirjam até lá.
 *
 * Dois modos, como em produção:
 *  - `self-host`: `AUTH_REQUIRED=0`; toda requisição é `LOCAL_OWNER`, sem token.
 *  - `publico`:   `AUTH_REQUIRED=1`; JWT ES256 assinado aqui, verificado pelo `authMiddleware`
 *                 real com a chave injetada (o mesmo caminho do JWKS remoto).
 *
 * UM `subirApp` POR ARQUIVO DE TESTE. O `cleanup` fecha o cliente libsql, e o modulo `server/db/db`
 * fica cacheado no worker do vitest: um segundo `subirApp` no mesmo arquivo encontra o cliente
 * fechado. Dois modos = dois arquivos.
 *
 * Uso:
 *   const s = await subirApp({ modo: 'self-host' })
 *   const r = await s.get('/api/me')
 *   expect(forma(await r.json())).toMatchFileSnapshot('__snapshots__/me.get.json')
 *   await s.encerrar()
 */
import express from 'express'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import type { Server } from 'node:http'
import { SignJWT, generateKeyPair } from 'jose'

type Chave = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

export type Modo = 'self-host' | 'publico'

export interface AppDeTeste {
  h: EphemeralDb
  base: string
  modo: Modo
  /** `fetch` relativo à base, com `Authorization` quando `token` é dado. */
  chamar: (metodo: string, caminho: string, opts?: { body?: unknown; token?: string; headers?: Record<string, string>; raw?: Buffer | string }) => Promise<Response>
  get: (caminho: string, token?: string) => Promise<Response>
  post: (caminho: string, body?: unknown, token?: string) => Promise<Response>
  put: (caminho: string, body?: unknown, token?: string) => Promise<Response>
  patch: (caminho: string, body?: unknown, token?: string) => Promise<Response>
  del: (caminho: string, token?: string) => Promise<Response>
  /** Só no modo público: token ES256 válido para o `sub` dado. */
  token: (sub: string) => Promise<string>
  /** Import dinâmico de um módulo de servidor já ligado ao banco efêmero. */
  load: <T = any>(spec: string) => Promise<T>
  encerrar: () => Promise<void>
}

export const URL_SUPABASE_TESTE = 'https://projeto-caracterizacao.supabase.co'

/** Os routers do `server.ts`, na ordem em que ele os monta. Lista usada também pelo teste-espelho. */
export const ROUTERS_PRIVADOS: Array<[string, string, string]> = [
  ['/api/ai', '../../server/routes/ai', 'aiRouter'],
  ['/api/sessions', '../../server/routes/sessions', 'sessionsRouter'],
  ['/api/import', '../../server/routes/import', 'importRouter'],
  ['/api/vocab', '../../server/routes/vocab', 'vocabRouter'],
  ['/api/anki', '../../server/routes/anki', 'ankiRouter'],
  ['/api/metrics', '../../server/routes/metrics', 'metricsRouter'],
  ['/api/exercises', '../../server/routes/exercises', 'exercisesRouter'],
  ['/api/settings', '../../server/routes/settings', 'settingsRouter'],
  ['/api/images', '../../server/routes/images', 'imagesRouter'],
  ['/api/me', '../../server/routes/me', 'meRouter'],
  ['/api/admin', '../../server/routes/admin', 'adminRouter'],
  ['/api/erros-do-cliente', '../../server/routes/erros', 'errosRouter'],
  ['/api/billing', '../../server/routes/billing', 'billingRouter'],
  /* So no self-host: no modo publico o `server.ts` responde 403 no lugar dele. */
  ['/api/audio', '../../server/audio/loopback', 'audioRouter'],
]

const salvo: Record<string, string | undefined> = {}
function fixarEnv(nome: string, valor: string | undefined) {
  if (!(nome in salvo)) salvo[nome] = process.env[nome]
  if (valor === undefined) delete process.env[nome]
  else process.env[nome] = valor
}
function restaurarEnv() {
  for (const [k, v] of Object.entries(salvo)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

export async function subirApp(opts: { modo: Modo } = { modo: 'self-host' }): Promise<AppDeTeste> {
  const h = await setupEphemeralDb()
  fixarEnv('AUTH_REQUIRED', opts.modo === 'publico' ? '1' : '0')
  fixarEnv('SUPABASE_URL', opts.modo === 'publico' ? URL_SUPABASE_TESTE : undefined)
  fixarEnv('NODE_ENV', 'test')

  let chavePrivada: Chave | undefined
  let chavePublica: Chave | undefined
  if (opts.modo === 'publico') {
    const par = await generateKeyPair('ES256')
    chavePrivada = par.privateKey
    chavePublica = par.publicKey
  }

  const load = <T = any>(spec: string) => h.load<T>(spec)
  const { requestIdMiddleware } = await load('../../server/lib/requestId')
  const { healthHandler } = await load('../../server/routes/health')
  const { asaasWebhookRouter } = await load('../../server/routes/billing')
  const { rankRouter } = await load('../../server/routes/rank')
  const { makeAuthMiddleware, createVerifier, authMiddleware, authRequired } = await load('../../server/lib/auth')
  const { createDbRateLimitStore, chaveDoRequest, METRIC_RATELIMIT_CARO, METRIC_RATELIMIT_ESCRITA } = await load('../../server/lib/rateLimitStore')
  const { erroGlobal, capturarAssincrono } = await load('../../server/lib/erroGlobal')

  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json({ limit: '5mb' }))
  app.use(compression())
  app.get('/api/health', healthHandler)

  const expensiveLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, keyGenerator: chaveDoRequest, store: createDbRateLimitStore(METRIC_RATELIMIT_CARO) })
  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: chaveDoRequest, store: createDbRateLimitStore(METRIC_RATELIMIT_ESCRITA), skip: (req: express.Request) => req.method === 'GET' || req.method === 'HEAD' })

  if (authRequired()) app.use('/api/billing/webhook/asaas', writeLimiter)
  app.use('/api/billing/webhook/asaas', capturarAssincrono(asaasWebhookRouter))
  if (authRequired()) app.use('/api/rank', writeLimiter)
  app.use('/api/rank', capturarAssincrono(rankRouter))

  const { usersRepo } = await load('../../server/db/repositories/users')
  app.use('/api', opts.modo === 'publico'
    ? makeAuthMiddleware(createVerifier({ key: chavePublica, supabaseUrl: URL_SUPABASE_TESTE }), (u: string) => usersRepo.isSuspended(u))
    : authMiddleware)

  app.use(['/api/ai', '/api/import', '/api/gemini'], expensiveLimiter)
  if (authRequired()) {
    app.use(['/api/sessions', '/api/vocab', '/api/settings', '/api/exercises', '/api/metrics', '/api/images', '/api/me', '/api/erros-do-cliente', '/api/billing', '/api/anki'], writeLimiter)
  }
  if (authRequired()) {
    app.post('/api/import/youtube', (_req, res) => res.status(403).json({ error: 'importação de YouTube indisponível no modo hospedado' }))
  }
  for (const [caminho, modulo, nome] of ROUTERS_PRIVADOS) {
    if (caminho === '/api/audio' && authRequired()) {
      app.use('/api/audio', (_req, res) => res.status(403).json({ error: 'captura de áudio do sistema indisponível no modo hospedado' }))
      continue
    }
    const mod = await load(modulo)
    app.use(caminho, capturarAssincrono(mod[nome]))
  }
  app.use(erroGlobal)

  const server: Server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)) })
  const addr = server.address()
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`

  const chamar: AppDeTeste['chamar'] = async (metodo, caminho, o = {}) => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) }
    if (o.token) headers.authorization = `Bearer ${o.token}`
    let body: BodyInit | undefined
    if (o.raw !== undefined) body = o.raw as BodyInit
    else if (o.body !== undefined) { headers['content-type'] = headers['content-type'] ?? 'application/json'; body = JSON.stringify(o.body) }
    return fetch(base + caminho, { method: metodo, headers, body })
  }

  return {
    h, base, modo: opts.modo, chamar, load,
    get: (c, t) => chamar('GET', c, { token: t }),
    post: (c, b, t) => chamar('POST', c, { body: b, token: t }),
    put: (c, b, t) => chamar('PUT', c, { body: b, token: t }),
    patch: (c, b, t) => chamar('PATCH', c, { body: b, token: t }),
    del: (c, t) => chamar('DELETE', c, { token: t }),
    token: async (sub) => {
      if (!chavePrivada) throw new Error('token() só existe no modo publico')
      return new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject(sub)
        .setAudience('authenticated').setIssuer(`${URL_SUPABASE_TESTE}/auth/v1`).setIssuedAt().setExpirationTime('1h').sign(chavePrivada)
    },
    encerrar: async () => {
      await new Promise<void>((r) => server.close(() => r()))
      restaurarEnv()
      await h.cleanup()
    },
  }
}

/**
 * FORMA de um valor JSON: chaves e tipos, nunca valores. É o que os snapshots de contrato
 * congelam — um id novo a cada execução não pode quebrar o teste, uma chave que sumiu precisa.
 * Arrays viram a UNIÃO das formas dos elementos (um array vazio vira `[]`).
 */
export function forma(v: unknown): unknown {
  if (v === null) return 'null'
  if (Array.isArray(v)) {
    if (v.length === 0) return []
    let acumulado: unknown
    for (const e of v) acumulado = acumulado === undefined ? forma(e) : mesclar(acumulado, forma(e))
    return [acumulado]
  }
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, forma(x)]))
  }
  return typeof v
}

/**
 * UNIÃO de duas formas: `'string'` + `'null'` vira `'null|string'` (ordenado, então determinístico);
 * objetos mesclam chave a chave; uma chave que só existe num dos lados vira `'<tipo>|ausente'`.
 * Sem isto a forma de um array dependia da ORDEM dos elementos — o primeiro snapshot de
 * `GET /api/vocab/pagina` oscilava entre `cefrLevel: string` e `cefrLevel: null`.
 */
function mesclar(a: unknown, b: unknown): unknown {
  if (typeof a === 'string' && typeof b === 'string') return [...new Set([...a.split('|'), ...b.split('|')])].sort().join('|')
  if (Array.isArray(a) && Array.isArray(b)) {
    if (!a.length) return b
    if (!b.length) return a
    return [mesclar(a[0], b[0])]
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const oa = a as Record<string, unknown>
    const ob = b as Record<string, unknown>
    const chaves = [...new Set([...Object.keys(oa), ...Object.keys(ob)])].sort()
    return Object.fromEntries(chaves.map((k) => {
      if (!(k in oa)) return [k, mesclar('ausente', ob[k])]
      if (!(k in ob)) return [k, mesclar(oa[k], 'ausente')]
      return [k, mesclar(oa[k], ob[k])]
    }))
  }
  // tipos de natureza diferente (objeto x primitivo): registra os dois lados
  return `${typeof a === 'string' ? a : 'objeto'}|${typeof b === 'string' ? b : 'objeto'}`.split('|').sort().join('|')
}

/** Corpo JSON + status, no formato que os snapshots usam. */
export async function resposta(r: Response): Promise<{ status: number; forma: unknown }> {
  const texto = await r.text()
  let corpo: unknown = texto
  try { corpo = JSON.parse(texto) } catch { /* texto cru */ }
  return { status: r.status, forma: forma(corpo) }
}

/** Semeadura mínima de um usuário: cartões, uma sessão com falas, uma rodada. */
export async function semear(s: AppDeTeste, userId: string) {
  const { asUserId } = await s.load('../../server/lib/authContext')
  const U = asUserId(userId)
  const { vocabRepo } = await s.load('../../server/db/repositories/vocab')
  const { sessionsRepo } = await s.load('../../server/db/repositories/sessions')
  const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
  const { settingsRepo } = await s.load('../../server/db/repositories/settings')
  await settingsRepo.ensure(U)
  await vocabRepo.bulkAdd(U, [
    { word: 'harvest', srcLang: 'en', back: 'colheita', sentence: 'The harvest was good.' },
    { word: 'water', srcLang: 'en', back: 'água', sentence: 'Drink water.' },
    { word: 'garden', srcLang: 'en', back: 'jardim', sentence: 'A small garden.' },
    { word: 'bridge', srcLang: 'en', back: 'ponte', sentence: 'Cross the bridge.' },
  ])
  const cartoes = await vocabRepo.list(U)
  const sessao = await sessionsRepo.createWithUtterances(U, { title: 'Sessão semeada', kind: 'live', sourceLang: 'en', targetLang: 'pt', status: 'done', durationMs: 60_000 }, [
    { idx: 0, source: 'mic', speakerName: 'A', sourceLang: 'en', sourceText: 'The harvest was good.', targetLang: 'pt', translatedText: 'A colheita foi boa.', tStartMs: 0, tEndMs: 1500 },
    { idx: 1, source: 'mic', speakerName: 'B', sourceLang: 'en', sourceText: 'Drink water.', targetLang: 'pt', translatedText: 'Beba água.', tStartMs: 1500, tEndMs: 2500 },
  ])
  await exerciseResultsRepo.addRodada(U, {
    roundId: 'semente-1', exerciseKind: 'memory', origem: 'baralho', sessionId: sessao.id, score: 80, melhorSequencia: 2,
    itens: cartoes.slice(0, 2).map((c: any) => ({ cardId: c.id, itemRef: c.word, correct: 1, attempts: 1, ms: 900, hinted: 0, kind: 'srs' })),
  })
  return { U, cartoes, sessao }
}
