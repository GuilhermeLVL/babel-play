/**
 * Autenticação (Marco 1). Dois modos, uma flag:
 *
 *  - AUTH_REQUIRED desligada (padrão self-host/local): sem token, sem tela — todo request vira
 *    LOCAL_OWNER. O app local roda exatamente como antes.
 *  - AUTH_REQUIRED=1 (SaaS público): exige um JWT do Supabase válido; senão 401. req.userId = sub.
 *
 * Em produção (NODE_ENV=production) a auth é exigida por PADRÃO (salvo AUTH_REQUIRED=0 explícito),
 * para nunca subir "aberto" por esquecimento.
 *
 * O JWT é verificado LOCALMENTE (sem ida à rede por request):
 *  - primário: JWKS assimétrico do Supabase (ES256/RS256). `createRemoteJWKSet` cacheia o key set
 *    e só refaz fetch em `kid` novo.
 *  - fallback: segredo compartilhado HS256 (SUPABASE_JWT_SECRET), para projeto legado.
 * O verificador aceita uma CHAVE INJETÁVEL, então os testes assinam/verificam offline.
 */
import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Request, Response, NextFunction } from 'express'
import { asUserId, LOCAL_OWNER, type UserId } from './authContext'
import { log } from './logger'

/** A auth é exigida? `=1` liga, `=0` desliga; sem valor, liga só em produção. */
export function authRequired(): boolean {
  const flag = process.env.AUTH_REQUIRED
  if (flag === '1') return true
  if (flag === '0') return false
  return process.env.NODE_ENV === 'production'
}

type VerifyKey = Parameters<typeof jwtVerify>[1]

export interface VerifierOptions {
  supabaseUrl?: string
  jwtSecret?: string
  /** Resolver de chave injetável (testes passam uma public key gerada localmente). */
  key?: VerifyKey
}

/**
 * Cria um verificador `(token) => Promise<UserId>` que lança em token inválido/ausente de `sub`.
 * Valida `aud=authenticated` e, quando há SUPABASE_URL, o `iss`.
 */
/** Qual mecanismo o verificador vai usar. Exposto para o boot poder DIZER qual está ativo. */
export type MecanismoDeVerificacao = 'jwks-assimetrico' | 'hs256-compartilhado' | 'chave-injetada' | 'nao-configurado'

/**
 * Algoritmos aceitos, DECLARADOS — achado F15-01.
 *
 * `jwtVerify` era chamado sem a opção `algorithms`, e então aceitava qualquer algoritmo compatível
 * com o material de chave. Medido pela sonda: com o segredo compartilhado, HS256, HS384 e HS512
 * passavam igualmente. Não era vulnerabilidade — a `jose` amarra o algoritmo ao TIPO da chave e
 * recusou os oito vetores de ataque da sonda, inclusive confusão de algoritmo. Mas "seguro por
 * acidente da biblioteca" e "seguro por declaração" são coisas diferentes, e o ASVS V9 pede a
 * segunda: a lista explícita é o que impede uma troca futura de biblioteca de ampliar a superfície
 * sem ninguém perceber.
 */
const ALGORITMOS_JWKS = ['ES256', 'RS256'] as const
const ALGORITMOS_HS = ['HS256'] as const

export function mecanismoDe(opts: VerifierOptions = {}): MecanismoDeVerificacao {
  if (opts.key) return 'chave-injetada'
  if ((opts.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim()) return 'jwks-assimetrico'
  if (opts.jwtSecret ?? process.env.SUPABASE_JWT_SECRET) return 'hs256-compartilhado'
  return 'nao-configurado'
}

/**
 * Cria um verificador `(token) => Promise<UserId>` que lança em token inválido/ausente de `sub`.
 * Valida `aud=authenticated` e o `iss`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * PRECEDÊNCIA (F15-01, decidida em 2026-08-26): JWKS ASSIMÉTRICO PRIMEIRO.
 *
 * Até aqui `jwtSecret` era testado ANTES de `supabaseUrl`, e a sonda `audit/scripts/sonda-jwt.ts`
 * mediu a consequência: com as duas variáveis presentes, o JWKS nunca era construído e toda a
 * autenticação dependia de um segredo compartilhado. A inversão ficou em aberto porque projeto
 * Supabase LEGADO emite HS256 — e preferir o JWKS quebraria o login de todos.
 *
 * O projeto de produção é NOVO (chaves assimétricas, ES256), então a ordem certa é a de cima:
 * com `SUPABASE_URL` o verificador é o JWKS; `SUPABASE_JWT_SECRET` só vale quando não há URL
 * (self-host sem projeto, testes). O boot continua anunciando o mecanismo ativo (`mecanismoDe`).
 */
export function createVerifier(opts: VerifierOptions = {}): (token: string) => Promise<UserId> {
  const supabaseUrl = (opts.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  const jwtSecret = opts.jwtSecret ?? process.env.SUPABASE_JWT_SECRET
  const issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : undefined

  let key: VerifyKey | undefined = opts.key
  let algoritmos: readonly string[] = [...ALGORITMOS_JWKS, ...ALGORITMOS_HS]
  if (!key) {
    if (issuer) {
      key = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) // JWKS (primário)
      algoritmos = ALGORITMOS_JWKS
    } else if (jwtSecret) {
      key = new TextEncoder().encode(jwtSecret) // HS256: só sem SUPABASE_URL
      algoritmos = ALGORITMOS_HS
    }
  }

  return async function verify(token: string): Promise<UserId> {
    if (!key) {
      throw new Error('auth não configurada: defina SUPABASE_URL (JWKS) ou SUPABASE_JWT_SECRET (HS256)')
    }
    /*
     * O `iss` era exigido só quando havia SUPABASE_URL. Medido pela sonda: com apenas o segredo
     * configurado, um token com QUALQUER emissor atravessava. Como o segredo compartilhado é o
     * material mais fácil de vazar, um token de outra origem que usasse o mesmo segredo passava.
     *
     * A exigência é ESTREITA de propósito, e a primeira versão dela era larga demais: exigia
     * `SUPABASE_URL` em todo caminho, inclusive com CHAVE INJETADA — onde não há Supabase nenhum
     * envolvido e a origem é decisão de quem injetou. Quebrou dois testes que representam usos
     * legítimos, e quebrar uso legítimo para fechar um buraco que não está ali é trocar um defeito
     * por outro. Agora só alcança o caso medido: segredo compartilhado, sem origem, em modo público.
     */
    if (!issuer && authRequired() && jwtSecret && !opts.key) {
      throw new Error('auth mal configurada: SUPABASE_URL é obrigatória no modo público quando a verificação usa SUPABASE_JWT_SECRET (sem ela o `iss` do token não é validado)')
    }
    const { payload } = await jwtVerify(token, key, {
      audience: 'authenticated',
      algorithms: [...algoritmos],
      ...(issuer ? { issuer } : {}),
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('token sem sub')
    }
    return asUserId(payload.sub)
  }
}

const BEARER = /^Bearer\s+(.+)$/i

/**
 * Fábrica do middleware, parametrizada pelo verificador (injetável nos testes). Em modo aberto,
 * atribui LOCAL_OWNER e segue; em modo público, exige `Authorization: Bearer <jwt>` válido.
 */
export function makeAuthMiddleware(
  verify: (token: string) => Promise<UserId>,
  /** Revogação: a conta está suspensa? Injetável (default no-op) — testes não precisam de banco. */
  isSuspended: (userId: UserId) => Promise<boolean> = async () => false,
) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!authRequired()) {
      req.userId = LOCAL_OWNER
      next()
      return
    }
    const header = req.header('authorization') ?? ''
    const m = BEARER.exec(header)
    if (!m) {
      res.status(401).json({ error: 'não autenticado' })
      return
    }
    let userId: UserId
    try {
      userId = await verify(m[1])
    } catch (err) {
      // Rastreabilidade: sem esta linha, token forjado, JWKS fora do ar e `kid` desconhecido
      // produziam a MESMA resposta muda — não havia sinal algum de falha de auth no processo.
      log('warn', {
        event: 'auth_verify_failed',
        route: req.path,
        status: 401,
        error: String((err as Error)?.message || err).slice(0, 120),
        requestId: req.requestId,
      })
      res.status(401).json({ error: 'token inválido' })
      return
    }
    req.userId = userId
    // Revogação (Fatia 4): conta suspensa é barrada mesmo com JWT válido. Fail-closed: erro ao checar → nega.
    try {
      if (await isSuspended(userId)) {
        res.status(403).json({ error: 'conta suspensa' })
        return
      }
    } catch (err) {
      log('error', {
        event: 'auth_suspension_check_failed',
        route: req.path,
        status: 503,
        error: String((err as Error)?.message || err).slice(0, 120),
        requestId: req.requestId,
      })
      res.status(503).json({ error: 'falha ao verificar status da conta' })
      return
    }
    next()
  }
}

// Verificador padrão de produção — construído preguiçosamente a partir do ambiente (a 1ª chamada
// resolve o JWKS/HS256; JWKS fica cacheado no processo). server.ts monta ESTE middleware.
let lazyVerify: ((token: string) => Promise<UserId>) | null = null
export const authMiddleware = makeAuthMiddleware(
  (token) => (lazyVerify ??= createVerifier())(token),
  // Import dinâmico p/ o auth.ts não puxar o DB no load (e só no modo público, por request).
  async (userId) => (await import('../db/repositories/users')).usersRepo.isSuspended(userId),
)
