import { and, eq, isNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { users, userInterests } from '../schema'
import { usersRepo } from './users'
import { saneiaInteresses, MAX_INTERESSES } from '../../../src/core/learning/interesses'
import type { UserId } from '../../lib/authContext'

/**
 * PERFIL DO USUÁRIO — quem é a pessoa, e não o que ela pagou nem o que pode fazer.
 *
 * Os três eixos da conta são separados de propósito e continuam assim:
 *  - `role` (RBAC) — quem você é para o sistema. Só admin muda.
 *  - `subscriptions` — o que você pagou. Só o billing escreve.
 *  - PERFIL (aqui) — quem você é para você. Só você muda.
 *
 * É por isso que `atualizar` abaixo aceita um objeto FECHADO de campos em vez de repassar o corpo
 * do request: um `set(patch)` cru deixaria `role: 'admin'` chegar ao banco vindo do cliente. O
 * mesmo raciocínio que fez `entitlements` ignorar `settings.ui.plan`.
 */

export interface PerfilDoUsuario {
  id: string
  role: string
  status: string
  email: string | null
  displayName: string | null
  locale: string | null
  bio: string | null
  goal: string | null
  onboardedAt: number | null
  interests: string[]
}

/** Limites de tamanho. Aplicados aqui, e não só no zod, porque o banco é a última fronteira. */
const MAX_NOME = 60
const MAX_BIO = 280
const MAX_GOAL = 120
const MAX_LOCALE = 16

/** `''` vira `null`: string vazia e ausência são a mesma coisa aqui, e duas representações do mesmo estado sempre divergem. */
function textoOuNulo(v: string | null | undefined, max: number): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const limpo = v.trim().slice(0, max)
  return limpo === '' ? null : limpo
}

export interface PatchDePerfil {
  displayName?: string | null
  locale?: string | null
  bio?: string | null
  goal?: string | null
  interests?: string[]
}

export const perfilRepo = {
  /** Os interesses ativos, na ordem canônica de `INTERESSES`. */
  async interesses(userId: UserId): Promise<string[]> {
    const linhas = await db
      .select({ slug: userInterests.slug })
      .from(userInterests)
      .where(and(eq(userInterests.userId, userId), isNull(userInterests.deletedAt)))
    return saneiaInteresses(linhas.map(l => l.slug))
  },

  /** O perfil completo. Provisiona a conta se for o primeiro acesso — idempotente. */
  async ler(userId: UserId): Promise<PerfilDoUsuario> {
    const u = await usersRepo.ensure(userId)
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      locale: u.locale ?? null,
      bio: u.bio ?? null,
      goal: u.goal ?? null,
      onboardedAt: u.onboardedAt ?? null,
      interests: await this.interesses(userId),
    }
  },

  /**
   * Grava o perfil. Só os campos presentes no patch são tocados.
   *
   * `onboarded_at` é carimbado na PRIMEIRA gravação e nunca mais: ele responde "quando esta pessoa
   * se apresentou", e reescrevê-lo a cada edição transformaria a resposta em "quando ela mexeu no
   * perfil pela última vez" — que é o que `updated_at` já diz.
   */
  async atualizar(userId: UserId, patch: PatchDePerfil): Promise<PerfilDoUsuario> {
    const atual = await usersRepo.ensure(userId)
    const now = Date.now()

    const campos: Partial<typeof users.$inferInsert> = { updatedAt: now }
    const nome = textoOuNulo(patch.displayName, MAX_NOME)
    const locale = textoOuNulo(patch.locale, MAX_LOCALE)
    const bio = textoOuNulo(patch.bio, MAX_BIO)
    const goal = textoOuNulo(patch.goal, MAX_GOAL)
    if (nome !== undefined) campos.displayName = nome
    if (locale !== undefined) campos.locale = locale
    if (bio !== undefined) campos.bio = bio
    if (goal !== undefined) campos.goal = goal
    if (!atual.onboardedAt) campos.onboardedAt = now

    await db.update(users).set(campos).where(eq(users.id, userId))

    if (patch.interests) await this.definirInteresses(userId, patch.interests)

    return this.ler(userId)
  },

  /**
   * Substitui o CONJUNTO de interesses.
   *
   * Substituição, e não adição: a tela é uma lista de marcar/desmarcar, e mandar só o que mudou
   * exigiria que cliente e servidor concordassem sobre o estado anterior. O conjunto inteiro é
   * autoexplicativo e não tem esse acoplamento.
   *
   * REMOVER É SOFT DELETE, para o índice único parcial poder aceitar o mesmo slug de volta depois —
   * o mesmo motivo pelo qual o índice é parcial. E os inserts usam `onConflictDoNothing`: dois
   * cliques rápidos no mesmo chip não podem virar HTTP 500.
   */
  async definirInteresses(userId: UserId, slugs: readonly string[]): Promise<string[]> {
    const desejados = saneiaInteresses(slugs).slice(0, MAX_INTERESSES)
    const atuais = await this.interesses(userId)
    const now = Date.now()

    const paraRemover = atuais.filter(s => !desejados.includes(s))
    const paraAdicionar = desejados.filter(s => !atuais.includes(s))

    for (const slug of paraRemover) {
      await db
        .update(userInterests)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(userInterests.userId, userId), eq(userInterests.slug, slug), isNull(userInterests.deletedAt)))
    }

    for (const slug of paraAdicionar) {
      await db
        .insert(userInterests)
        .values({ id: randomUUID(), createdAt: now, updatedAt: now, userId, slug })
        .onConflictDoNothing()
    }

    return this.interesses(userId)
  },
}
