/**
 * 2FA DE VERDADE NO SERVIDOR (Fase 6 do lançamento) — AAL2 nas rotas sensíveis.
 *
 * O Supabase escreve no JWT o nível de garantia da sessão: `aal: 'aal1'` depois de senha ou login
 * social, `aal: 'aal2'` depois de o segundo fator (TOTP) ser verificado. Até aqui o servidor não
 * lia esse claim, então o 2FA protegia a TELA e mais nada: com a senha de uma conta que ativou 2FA,
 * um token `aal1` assinava e cancelava plano, excluía e exportava a conta e guardava chave de API.
 *
 * A regra: se a conta tem ao menos um fator VERIFICADO, as rotas de `ehRotaSensivel` exigem `aal2`.
 * Conta sem 2FA segue como antes — exigir `aal2` de quem não tem segundo fator trancaria a pessoa
 * fora da própria conta.
 *
 * "A conta tem fator verificado?" não está no JWT; vem da Admin API do Supabase
 * (`GET /auth/v1/admin/users/:id`, campo `factors`), consultada SÓ quando o token é `aal1` e a rota
 * é sensível, com cache curto por usuário. Falha da consulta é falha FECHADA (503): liberar a rota
 * sensível porque o provedor de identidade não respondeu é exatamente o buraco que isto fecha.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { authRequired } from './auth'
import { adminDoSupabase } from './config'
import { log } from './logger'
import { envelopeDeErro } from './respostaDeErro'

/**
 * As rotas que mexem com DINHEIRO, com a EXISTÊNCIA da conta ou com SEGREDO de terceiro.
 *
 * - `/api/billing/*` que escreve (assinar, cancelar, comprar créditos);
 * - `DELETE /api/me` (exclusão) e `GET /api/me/exportar` (a conta inteira num arquivo);
 * - `/api/ai/credentials` que escreve (guardar/remover chave de API BYOK);
 * - `/api/admin/*` inteiro (operações entre contas).
 */
export function ehRotaSensivel(metodo: string, caminho: string): boolean {
  const escreve = metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS'
  if (caminho.startsWith('/api/billing/') && !caminho.startsWith('/api/billing/webhook/')) return escreve
  if (caminho === '/api/me' || caminho === '/api/me/') return metodo === 'DELETE'
  if (caminho === '/api/me/exportar') return true
  if (caminho === '/api/ai/credentials' || caminho.startsWith('/api/ai/credentials/')) return escreve
  if (caminho === '/api/admin' || caminho.startsWith('/api/admin/')) return true
  return false
}

/** Resposta da pergunta "a conta tem 2FA?" — injetável para o teste. */
export type ConsultaDeFatores = (userId: string) => Promise<boolean | 'desconhecido'>

const VALIDADE_MS = 60_000
const MAX_CACHE = 5_000
const cache = new Map<string, { tem: boolean; ate: number }>()
let avisouSemAdmin = false

/**
 * Consulta a Admin API. `'desconhecido'` quando não há `SUPABASE_SERVICE_ROLE_KEY` — aí não há
 * como saber, e o middleware registra o aviso e segue (o inventário de configuração já acusa a
 * variável ausente no boot). Lança quando a API responde erro: quem chama falha fechado.
 */
export const consultarFatoresNoSupabase: ConsultaDeFatores = async (userId) => {
  const admin = adminDoSupabase()
  if (!admin) return 'desconhecido'
  const guardado = cache.get(userId)
  if (guardado && guardado.ate > Date.now()) return guardado.tem

  const r = await fetch(`${admin.base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: admin.chave, authorization: `Bearer ${admin.chave}` },
    signal: AbortSignal.timeout(5_000),
  })
  if (!r.ok) throw new Error(`admin users ${r.status}`)
  const corpo = (await r.json()) as { factors?: Array<{ status?: string }> | null }
  const tem = Array.isArray(corpo.factors) && corpo.factors.some((f) => f?.status === 'verified')

  if (cache.size >= MAX_CACHE) cache.clear()
  cache.set(userId, { tem, ate: Date.now() + VALIDADE_MS })
  return tem
}

/**
 * O middleware, montado DEPOIS do `authMiddleware` (precisa de `req.userId` e `req.aal`).
 * Fora do modo público não faz nada: no self-host não há Supabase nem segundo fator.
 */
export function exigirAal2SeTiver2fa(consultar: ConsultaDeFatores = consultarFatoresNoSupabase): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!authRequired() || !ehRotaSensivel(req.method, req.baseUrl + req.path)) {
      next()
      return
    }
    if (req.aal === 'aal2') {
      next()
      return
    }
    let tem: boolean | 'desconhecido'
    try {
      tem = await consultar(req.userId)
    } catch (err) {
      log('error', {
        event: 'aal_consulta_de_fatores_falhou',
        route: req.path,
        status: 503,
        error: String((err as Error)?.message || err).slice(0, 120),
        requestId: req.requestId,
      })
      res
        .status(503)
        .json(envelopeDeErro('não foi possível confirmar a verificação em duas etapas agora', 'aal_indisponivel'))
      return
    }
    if (tem === 'desconhecido') {
      if (!avisouSemAdmin) {
        avisouSemAdmin = true
        log('warn', {
          event: 'aal_sem_admin_do_supabase',
          error: 'SUPABASE_SERVICE_ROLE_KEY ausente: o servidor não consegue exigir AAL2 de quem ativou 2FA',
        })
      }
      next()
      return
    }
    if (tem) {
      res
        .status(403)
        .json(envelopeDeErro('confirme o código da verificação em duas etapas para continuar', 'aal2_requerido'))
      return
    }
    next()
  }
}
