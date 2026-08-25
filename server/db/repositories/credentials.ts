import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { providerCredentials, secrets } from '../schema'
import { decryptSecretEx, encryptSecret } from '../../crypto'
import type { UserId } from '../../lib/authContext'
import { log } from '../../lib/logger'

export type Credential = typeof providerCredentials.$inferSelect

export interface NewCredential {
  label?: string
  kind?: string
  baseUrl?: string
  defaultModel?: string
  /** Segredo em CLARO na entrada; é cifrado e guardado na tabela `secrets`.
   *  NUNCA é persistido em `provider_credentials` nem devolvido a rotas de leitura. */
  secret?: string
}

/**
 * Credenciais de provider. O segredo vive cifrado em `secrets` (write-only); a
 * tabela `provider_credentials` guarda só metadados + uma `secretRef`. `list()`
 * é seguro para o cliente (sem chave). `getSecret()` é SERVER-ONLY (o proxy usa).
 */
export const credentialsRepo = {
  async list(userId: UserId): Promise<Credential[]> {
    return db.select().from(providerCredentials)
      .where(and(eq(providerCredentials.userId, userId), isNull(providerCredentials.deletedAt)))
  },

  async create(userId: UserId, input: NewCredential): Promise<Credential> {
    const now = Date.now()
    const id = randomUUID()
    let secretRef: string | null = null
    if (input.secret) {
      secretRef = 'cred_' + id
      await db.insert(secrets).values({
        ref: secretRef,
        valueEncrypted: encryptSecret(input.secret),
        createdAt: now,
        updatedAt: now,
        userId,
      })
    }
    const values: typeof providerCredentials.$inferInsert = {
      id,
      createdAt: now,
      updatedAt: now,
      userId,
      label: input.label ?? null,
      kind: input.kind ?? null,
      baseUrl: input.baseUrl ?? null,
      defaultModel: input.defaultModel ?? null,
      secretRef,
    }
    await db.insert(providerCredentials).values(values)
    const rows = await db.select().from(providerCredentials).where(eq(providerCredentials.id, id)).limit(1)
    return rows[0]
  },

  /**
   * P2-N4: devolve se afetou linha — a rota vira 404 quando a credencial não é do usuário.
   *
   * F3-04: o soft delete agora PROPAGA para `secrets`, que ganhou `deleted_at`. Antes a chave
   * cifrada seguia viva e resolvível indefinidamente depois de o usuário remover a credencial.
   * Os dois UPDATEs vão num `batch` — remover a credencial e deixar o segredo ativo seria o pior
   * dos dois estados.
   */
  async remove(userId: UserId, id: string): Promise<boolean> {
    const now = Date.now()
    const alvo = await db
      .select({ secretRef: providerCredentials.secretRef })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, id), eq(providerCredentials.userId, userId), isNull(providerCredentials.deletedAt)))
      .limit(1)
    if (!alvo.length) return false

    const apagarCredencial = db
      .update(providerCredentials)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(providerCredentials.id, id), eq(providerCredentials.userId, userId), isNull(providerCredentials.deletedAt)))
    const ref = alvo[0].secretRef
    if (!ref) {
      const r = await apagarCredencial
      return Number((r as { rowsAffected?: number }).rowsAffected ?? 0) > 0
    }
    await db.batch([
      apagarCredencial,
      db.update(secrets).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(secrets.ref, ref), isNull(secrets.deletedAt))),
    ])
    return true
  },

  /**
   * SERVER-ONLY: resolve o segredo em claro p/ o proxy injetar. O `AND user_id` é o controle
   * CRÍTICO: o proxy aceita o `x-credential-id` do cliente; sem o escopo, o usuário B poderia
   * mandar o credentialId do A e fazer a chave do A ser usada (exfiltração-por-referência).
   * `secrets` agora TEM `user_id` (F3-04), mas o controle continua sendo o escopo da credencial:
   * a coluna serve à exclusão/exportação por titular, não à autorização. O `deleted_at` do segredo
   * é respeitado — segredo de credencial removida não volta a ser resolvido.
   */
  async getSecret(userId: UserId, credentialId: string): Promise<{
    baseUrl: string | null
    defaultModel: string | null
    kind: string | null
    secret: string | null
  }> {
    const rows = await db
      .select()
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, credentialId), eq(providerCredentials.userId, userId)))
      .limit(1)
    const cred = rows[0]
    if (!cred) throw new Error('credencial não encontrada')
    let secret: string | null = null
    if (cred.secretRef) {
      const s = await db.select().from(secrets)
        .where(and(eq(secrets.ref, cred.secretRef), isNull(secrets.deletedAt))).limit(1)
      if (s[0]) {
        const { value, migratedBlob } = decryptSecretEx(s[0].valueEncrypted)
        secret = value
        // S-11: segredo estava cifrado com a chave legada → re-grava com a chave atual (migração no 1º uso).
        if (migratedBlob) {
          await db.update(secrets)
            .set({ valueEncrypted: migratedBlob, updatedAt: Date.now() })
            .where(eq(secrets.ref, cred.secretRef))
          log('info', { event: 'segredo_recifrado_chave_atual' })
        }
      }
    }
    return { baseUrl: cred.baseUrl, defaultModel: cred.defaultModel, kind: cred.kind, secret }
  },
}
