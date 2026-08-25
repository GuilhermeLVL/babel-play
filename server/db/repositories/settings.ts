import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../schema'
import type { UserId } from '../../lib/authContext'

export type Settings = typeof settings.$inferSelect

/**
 * Configurações POR USUÁRIO (Marco 1). Antes era uma linha única global (`id='app'`); agora a chave
 * de tenancy é `user_id`. A linha 'app' legada continua válida: o backfill do boot a atribuiu ao
 * LOCAL_OWNER, então `get(LOCAL_OWNER)` a encontra (o `id` segue 'app', inofensivo) — o onboarding,
 * o plano, o tema e a persona do usuário local são preservados. Usuários novos ganham linha própria
 * com `id` aleatório.
 */
export const settingsRepo = {
  async get(userId: UserId): Promise<Settings | undefined> {
    const rows = await db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), isNull(settings.deletedAt)))
      .limit(1)
    return rows[0]
  },

  /**
   * Garante que a linha do usuário exista (cria com defaults se ausente).
   *
   * P1-4: era get-then-insert numa tabela SEM `unique(user_id)` — sob concorrência duplicava
   * linha em silêncio, e `get()` (com `limit(1)` sem `ORDER BY`) passava a devolver qualquer
   * uma delas, fazendo as preferências do usuário oscilarem. Agora o INSERT é a checagem, e
   * `uq_settings_user` (migração 0005) é o backstop no banco.
   */
  async ensure(userId: UserId): Promise<Settings> {
    const now = Date.now()
    // SQL cru pelo mesmo motivo do `seedSpends.debitar`: `uq_settings_user` é índice PARCIAL
    // e o builder do drizzle 0.45 põe o predicado depois do `do nothing`, gerando SQL inválido.
    await db.run(sql`
      INSERT INTO ${settings} (id, created_at, updated_at, user_id)
      VALUES (${randomUUID()}, ${now}, ${now}, ${userId})
      ON CONFLICT (user_id) WHERE deleted_at IS NULL DO NOTHING
    `)
    const created = await this.get(userId)
    if (!created) throw new Error('falha ao criar settings')
    return created
  },

  /** Atualiza campos parciais da linha do usuário (cria antes se ausente). */
  async update(userId: UserId, patch: SettingsPatch): Promise<Settings> {
    await this.ensure(userId)
    const now = Date.now()
    const set: Partial<typeof settings.$inferInsert> = { updatedAt: now }
    if (patch.activeProfileId !== undefined) set.activeProfileId = patch.activeProfileId
    if (patch.targetLanguage !== undefined) set.targetLanguage = patch.targetLanguage
    if (patch.ui !== undefined) set.ui = patch.ui === null ? null : JSON.stringify(patch.ui)
    await db.update(settings).set(set).where(and(eq(settings.userId, userId), isNull(settings.deletedAt)))
    const updated = await this.get(userId)
    if (!updated) throw new Error('falha ao atualizar settings')
    return updated
  },
}

export interface SettingsPatch {
  activeProfileId?: string | null
  targetLanguage?: string | null
  /** Objeto serializável de preferências de UI (persistido como JSON). */
  ui?: unknown
}
