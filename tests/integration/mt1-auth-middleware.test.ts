/**
 * Marco 1 — Commit 1: middleware de auth + flag de modo + verificação de JWT.
 *
 * Prova o motor de identidade SEM UI: modo aberto injeta LOCAL_OWNER (sem token); modo público
 * exige um JWT válido (HS256 e, via chave injetável, ES256). Tokens são assinados/verificados
 * localmente com jose — nenhuma rede, nenhum Supabase real.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SignJWT, generateKeyPair } from 'jose'
import { makeAuthMiddleware, createVerifier, authRequired, authMiddleware } from '../../server/lib/auth'
import { LOCAL_OWNER } from '../../server/lib/authContext'

const SECRET = 'segredo-de-teste-hs256-marco1-nunca-real'
const encSecret = new TextEncoder().encode(SECRET)
/*
 * A ORIGEM passou a ser obrigatoria quando a verificacao usa segredo compartilhado em modo publico
 * (F15-01). Medido pela sonda `audit/scripts/sonda-jwt.ts`: sem ela, `jwtVerify` nao recebia
 * restricao de `iss` e um token de QUALQUER emissor que usasse o mesmo segredo era aceito — e o
 * segredo compartilhado e justamente o material mais facil de vazar.
 *
 * Os casos abaixo passaram a declarar a origem porque representam um deploy BEM configurado. O
 * caso mal configurado ganhou teste proprio, no fim do arquivo, em vez de sumir.
 */
const URL_SUPABASE = 'https://projeto-de-teste.supabase.co'
const ISS = `${URL_SUPABASE}/auth/v1`

async function signHS(opts: { sub?: string | null; aud?: string; exp?: string } = {}): Promise<string> {
  let t = new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
  if (opts.sub !== null) t = t.setSubject(opts.sub ?? 'user-A')
  t = t.setAudience(opts.aud ?? 'authenticated').setIssuer(ISS).setExpirationTime(opts.exp ?? '1h')
  return t.sign(encSecret)
}

function mkReq(authHeader?: string): any {
  return { header: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader : undefined) }
}
function mkRes(): any {
  const r: any = { statusCode: 200, _json: null }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (o: unknown) => { r._json = o; return r }
  return r
}
async function run(mw: any, req: any, res: any): Promise<boolean> {
  let nexted = false
  await mw(req, res, () => { nexted = true })
  return nexted
}

// Ambiente de auth isolado por teste (a flag e a URL do Supabase vêm de env).
let savedAuth: string | undefined
let savedUrl: string | undefined
let savedEnv: string | undefined
beforeEach(() => {
  savedAuth = process.env.AUTH_REQUIRED
  savedUrl = process.env.SUPABASE_URL
  savedEnv = process.env.NODE_ENV
  delete process.env.AUTH_REQUIRED
  delete process.env.SUPABASE_URL
})
afterEach(() => {
  process.env.AUTH_REQUIRED = savedAuth as string
  process.env.SUPABASE_URL = savedUrl as string
  process.env.NODE_ENV = savedEnv as string
  if (savedAuth === undefined) delete process.env.AUTH_REQUIRED
  if (savedUrl === undefined) delete process.env.SUPABASE_URL
})

describe('authRequired() — a flag de modo', () => {
  it('desligada por padrão fora de produção', () => {
    process.env.NODE_ENV = 'test'
    expect(authRequired()).toBe(false)
  })
  it('=1 liga, =0 desliga', () => {
    process.env.AUTH_REQUIRED = '1'; expect(authRequired()).toBe(true)
    process.env.AUTH_REQUIRED = '0'; expect(authRequired()).toBe(false)
  })
  it('em produção liga por padrão (evita subir aberto)', () => {
    process.env.NODE_ENV = 'production'
    expect(authRequired()).toBe(true)
  })
})

describe('modo aberto (self-host) — sem token, vira LOCAL_OWNER', () => {
  it('atribui LOCAL_OWNER e chama next(), sem exigir token', async () => {
    const mw = makeAuthMiddleware(async () => { throw new Error('não deve verificar em modo aberto') })
    const req = mkReq()
    const nexted = await run(mw, req, mkRes())
    expect(nexted).toBe(true)
    expect(req.userId).toBe(LOCAL_OWNER)
  })
})

describe('modo público (AUTH_REQUIRED=1)', () => {
  beforeEach(() => { process.env.AUTH_REQUIRED = '1' })
  // Deploy BEM configurado: segredo compartilhado E origem declarada.
  const verifier = () => createVerifier({ jwtSecret: SECRET, supabaseUrl: URL_SUPABASE })

  it('sem token → 401, não chama next()', async () => {
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(verifier()), mkReq(), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('header malformado → 401', async () => {
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(verifier()), mkReq('Basic zzz'), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('token HS256 válido → req.userId = sub e next()', async () => {
    const token = await signHS({ sub: 'user-A' })
    const req = mkReq(`Bearer ${token}`)
    const nexted = await run(makeAuthMiddleware(verifier()), req, mkRes())
    expect(nexted).toBe(true)
    expect(req.userId).toBe('user-A')
  })

  /*
   * O caso que motivou a mudanca (F15-01). Antes, esta configuracao — segredo compartilhado SEM
   * origem, em modo publico — funcionava e aceitava token de qualquer emissor. Agora ela e
   * recusada na verificacao, e o middleware devolve 401 em vez de autenticar.
   *
   * Este teste existe para a mudanca nao poder ser desfeita sem que alguem veja.
   */
  it('segredo compartilhado SEM SUPABASE_URL → recusa (o `iss` ficaria sem validacao)', async () => {
    const inseguro = createVerifier({ jwtSecret: SECRET, supabaseUrl: '' })
    const token = await signHS({ sub: 'user-A' })
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(inseguro), mkReq(`Bearer ${token}`), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('token expirado → 401', async () => {
    const token = await signHS({ sub: 'user-A', exp: '-1h' })
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(verifier()), mkReq(`Bearer ${token}`), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('audience errada → 401', async () => {
    const token = await signHS({ sub: 'user-A', aud: 'anon' })
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(verifier()), mkReq(`Bearer ${token}`), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('token sem sub → 401', async () => {
    const token = await signHS({ sub: null })
    const res = mkRes()
    const nexted = await run(makeAuthMiddleware(verifier()), mkReq(`Bearer ${token}`), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('chave ASSIMÉTRICA injetável (ES256) verifica offline', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256')
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-ES').setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey)
    const verify = createVerifier({ key: publicKey, supabaseUrl: '' })
    expect(await verify(token)).toBe('user-ES')
  })
})

describe('instância padrão de produção (authMiddleware exportado)', () => {
  it('modo aberto → LOCAL_OWNER', async () => {
    delete process.env.AUTH_REQUIRED
    process.env.NODE_ENV = 'test'
    const req = mkReq()
    const nexted = await run(authMiddleware, req, mkRes())
    expect(nexted).toBe(true)
    expect(req.userId).toBe(LOCAL_OWNER)
  })
  it('modo público sem token → 401', async () => {
    process.env.AUTH_REQUIRED = '1'
    const res = mkRes()
    const nexted = await run(authMiddleware, mkReq(), res)
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(401)
  })
})
