/**
 * Backfill de tenancy (Marco 1 — Commit 2).
 *
 * Carimba as linhas legadas (`user_id` NULL) com um dono, para que os dados do usuário local atual
 * continuem visíveis quando o scoping por usuário entrar (Commits 3-9). Idempotente: uma segunda
 * execução afeta 0 linhas. Modelado no `vocabRepo.migrarLeitner` (conta o que tocou).
 *
 * Exceções:
 *  - `profiles` fica de FORA: tem linhas builtin/compartilhadas (referenciadas por
 *    settings.activeProfileId); carimbá-las esconderia os perfis globais dos futuros usuários.
 *    Perfis ficam `user_id` NULL = global.
 *  - `secrets` fica de FORA mesmo tendo ganhado `user_id` (F3-04): o dono dela é o da credencial
 *    que a referencia, e a migração 0012 já o deduziu. Carimbar aqui atribuiria ao owner local um
 *    segredo que pode ser de outra credencial.
 *
 * Segurança em produção: se por acaso restar uma linha NULL num banco multi-tenant, ela vai para
 * LOCAL_OWNER — um id que ninguém autentica (o `sub` vem do Supabase). Ou seja, fica invisível a
 * todos (fail-closed), nunca exposta a outro usuário.
 */
import { isNull } from 'drizzle-orm'
import { db } from '../db'
import {
  sessions, utterances, vocabCards, reviewLogs, exerciseResults,
  seedSpends, analyses, providerCredentials, settings,
} from '../schema'
import type { UserId } from '../../lib/authContext'

// Todas as tabelas com `user_id`, EXCETO profiles (global) e secrets (sem a coluna).
const TABELAS: any[] = [
  sessions, utterances, vocabCards, reviewLogs, exerciseResults,
  seedSpends, analyses, providerCredentials, settings,
]

export async function backfillNullOwner(ownerId: UserId): Promise<number> {
  let total = 0
  for (const t of TABELAS) {
    // Conta as linhas NULL ANTES (independente do driver) e só então atualiza.
    const pendentes = await db.select({ id: t.id }).from(t).where(isNull(t.userId))
    if (pendentes.length === 0) continue
    await db.update(t).set({ userId: ownerId }).where(isNull(t.userId))
    total += pendentes.length
  }
  return total
}
