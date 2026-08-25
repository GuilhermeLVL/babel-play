import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../schema'
import type { UserId } from '../../lib/authContext'

export type User = typeof users.$inferSelect
export type Role = 'user' | 'admin' | 'support'
export type UserStatus = 'active' | 'suspended'

/**
 * CONTA de usuário (SaaS Fatia 2 — RBAC). `users.id` É o próprio `UserId` (o `sub` do Supabase, ou
 * `LOCAL_OWNER`). Eixo `role` (quem você é) separado do plano (`subscriptions`, o que você pagou).
 * Fail-safe de MENOR PRIVILÉGIO: sem linha provisionada, `getRole` devolve 'user' e `isSuspended` false.
 */
export const usersRepo = {
  async get(userId: UserId): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    return rows[0]
  },

  /** Lista contas (uso ADMIN/support), mais recentes primeiro. */
  async list(limit = 200): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt)).limit(limit)
  },

  /**
   * Provisiona a conta no 1º acesso (idempotente). Atualiza o e-mail se vier e tiver mudado.
   *
   * P1-1: era get-then-insert contra a PRIMARY KEY — com duas réplicas, metade dos primeiros
   * acessos estourava constraint e virava HTTP 500, ou seja, o CADASTRO quebrava. Agora o
   * INSERT é a própria checagem: quem perde a corrida cai no DO NOTHING e lê a linha do vencedor.
   *
   * O `DO NOTHING` (em vez de `DO UPDATE`) é deliberado: um 2º acesso não pode rebaixar
   * `role`/`status` de uma conta já provisionada — seria escalada às avessas (admin viraria user).
   */
  async ensure(userId: UserId, email?: string | null): Promise<User> {
    const now = Date.now()
    await db
      .insert(users)
      .values({ id: userId, createdAt: now, updatedAt: now, email: email ?? null, role: 'user', status: 'active' })
      .onConflictDoNothing({ target: users.id })

    const current = await this.get(userId)
    if (!current) throw new Error('falha ao provisionar usuário')

    // E-mail é o único campo que o login pode atualizar depois — role/status são do admin.
    if (email && email !== current.email) {
      await db.update(users).set({ email, updatedAt: now }).where(eq(users.id, userId))
      const updated = await this.get(userId)
      if (!updated) throw new Error('falha ao atualizar usuário')
      return updated
    }
    return current
  },

  /** Papel do usuário; 'user' se a conta ainda não foi provisionada (fail-safe: menor privilégio). */
  async getRole(userId: UserId): Promise<Role> {
    const u = await this.get(userId)
    return (u?.role as Role) ?? 'user'
  },

  /** Conta suspensa? (revogação — Fatia 4). False se não provisionada. */
  async isSuspended(userId: UserId): Promise<boolean> {
    return (await this.get(userId))?.status === 'suspended'
  },

  /** Ops de ADMIN (endpoints admin da Fatia 2). Garante a linha antes de alterar. */
  async setRole(userId: UserId, role: Role): Promise<void> {
    await this.ensure(userId)
    await db.update(users).set({ role, updatedAt: Date.now() }).where(eq(users.id, userId))
  },
  async setStatus(userId: UserId, status: UserStatus): Promise<void> {
    await this.ensure(userId)
    await db.update(users).set({ status, updatedAt: Date.now() }).where(eq(users.id, userId))
  },
}
