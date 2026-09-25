/**
 * O CONVIDADO NO CONTEXTO DO REQUEST (Fase 7 — modo convidado).
 *
 * O Supabase marca o usuário ANÔNIMO (`signInAnonymously`) com a claim `is_anonymous: true` no JWT.
 * Só o `authMiddleware` vê o token; quem decide o plano (`getPlanForUser(userId)`) recebe só o id, e
 * é chamado fundo na pilha (cotas, flags, admissão) — passar um booleano por todas essas assinaturas
 * espalharia a mudança por uma dúzia de arquivos. Em vez disso, o middleware abre um contexto
 * assíncrono (`AsyncLocalStorage`) para o resto do request, e `getPlanForUser` pergunta a ele.
 *
 * FALHA PARA O LADO SEGURO: se o contexto se perder (um callback de stream que não o propaga), o
 * convidado é resolvido como `free` — que não tem nuvem nenhuma. Nunca como um plano pago.
 *
 * A CONVERSÃO MANTÉM O ID: `updateUser({ email })`/`linkIdentity` no Supabase transformam o anônimo
 * em conta sem trocar o `sub`. O próximo token vem com `is_anonymous: false`, e daí em diante o
 * mesmo id resolve pelo caminho normal (assinatura → free). Os contadores seguem com ele.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { decodeJwt } from 'jose'

import type { UserId } from './authContext'

const contexto = new AsyncLocalStorage<{ userId: UserId; convidado: boolean }>()

/** O token (JÁ VERIFICADO) é de um usuário anônimo do Supabase? */
export function ehTokenAnonimo(token: string): boolean {
  try {
    return decodeJwt(token).is_anonymous === true
  } catch {
    return false
  }
}

/** Roda `fn` (o resto do request) dentro do contexto de identidade. */
export function comIdentidade<T>(userId: UserId, convidado: boolean, fn: () => T): T {
  return contexto.run({ userId, convidado }, fn)
}

/** Este id é o convidado do request em curso? Fora de request (jobs, testes de unidade), `false`. */
export function ehConvidadoNoContexto(userId: UserId): boolean {
  const c = contexto.getStore()
  return !!c && c.convidado && c.userId === userId
}
