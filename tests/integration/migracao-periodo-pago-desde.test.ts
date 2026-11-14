/**
 * A MIGRAÇÃO 0019 (`periodo_pago_desde`) contra um banco que JÁ TEM assinaturas do Asaas — o caso da produção.
 *
 * O backfill multiplica dias por milissegundos: em `int4` isso estoura (`370 * 86400000` = 3,2e10 > 2^31) e o
 * Postgres recusa com "integer out of range" — a migração falharia no deploy em qualquer banco com uma linha
 * `active` do Asaas. O teste volta o banco ao estado de antes da 0019 (sem a coluna), semeia uma mensal e uma
 * anual em dia, uma em atraso, uma cancelada e uma de outro provedor, roda o SQL da 0019 COMO ESTÁ NO ARQUIVO e
 * confere o valor de cada uma. Roda no PGlite (Postgres de verdade, compilado) e, com `BANCO_DE_TESTE=postgres` +
 * `TESTE_POSTGRES_URL`, num Postgres real.
 *
 * O par SQLite (0061) não roda mais em lugar nenhum do app; dele, confere-se que a conta é a mesma e que o SQLite
 * (inteiros de 64 bits) não tem o mesmo limite.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000
const FIM = 1_800_000_000_000

let h: EphemeralDb
let client: ReturnType<typeof clienteSql>

const sqlDa = (pasta: string, arquivo: string) =>
  readFileSync(path.resolve('server', 'db', pasta, arquivo), 'utf8')
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter(Boolean)

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  await h.cleanup()
})

describe('0019_periodo_pago_desde', () => {
  it('backfill num banco com assinaturas do Asaas: sem estouro de inteiro, com o início certo', async () => {
    // O banco do harness já passou pela 0019: volta ao estado de antes dela (sem as colunas e os índices).
    for (const desfazer of [
      'DROP INDEX IF EXISTS "idx_billing_events_user_event"',
      'DROP INDEX IF EXISTS "idx_billing_events_provider_ref"',
      'ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "periodo_pago_desde"',
      'ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "ciclo_da_cobranca"',
    ])
      await client.execute(desfazer)
    const linha = (id: string, status: string, ciclo: string, provider: string | null) =>
      client.execute({
        sql: `INSERT INTO subscriptions (id, created_at, updated_at, user_id, plan, status, current_period_end, provider, ciclo)
              VALUES (?, 1, 1, ?, 'plus', ?, ?, ?, ?)`,
        args: [id, `u-${id}`, status, FIM, provider, ciclo],
      })
    await linha('mensal', 'active', 'mensal', 'asaas')
    await linha('anual', 'active', 'anual', 'asaas')
    await linha('atraso', 'past_due', 'mensal', 'asaas')
    await linha('cancelada', 'canceled', 'mensal', 'asaas')
    await linha('admin', 'active', 'mensal', null)

    for (const comando of sqlDa('migrations-pg', '0019_periodo_pago_desde.sql')) await client.execute(comando)

    const r = await client.execute(
      "SELECT id, periodo_pago_desde FROM subscriptions WHERE id IN ('mensal', 'anual', 'atraso', 'cancelada', 'admin')",
    )
    const por = Object.fromEntries(
      r.rows.map((x: any) => [x.id, x.periodo_pago_desde == null ? null : Number(x.periodo_pago_desde)]),
    )
    expect(por).toEqual({
      mensal: FIM - 35 * DIA,
      anual: FIM - 370 * DIA,
      atraso: FIM - 35 * DIA,
      cancelada: null,
      admin: null,
    })
  })

  it('os índices de billing_events existem depois da 0019', async () => {
    const r = await client.execute(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'billing_events' AND indexname LIKE 'idx_billing_events_%'",
    )
    expect(r.rows.map((x: any) => x.indexname).sort()).toEqual([
      'idx_billing_events_provider_ref',
      'idx_billing_events_user_event',
    ])
  })

  it('o par SQLite 0061 traz as mesmas colunas, índices e conta', () => {
    const sqlite = sqlDa('migrations-sqlite', '0061_periodo_pago_desde.sql').join('\n')
    expect(sqlite).toMatch(/ADD `periodo_pago_desde` integer/)
    expect(sqlite).toMatch(/ADD `ciclo_da_cobranca` text/)
    expect(sqlite).toMatch(/CREATE INDEX `idx_billing_events_user_event` ON `billing_events` \(`user_id`,`event`\)/)
    expect(sqlite).toMatch(/CREATE INDEX `idx_billing_events_provider_ref` ON `billing_events` \(`provider_ref`\)/)
    expect(sqlite).toMatch(/370 ELSE 35 END\) \* 86400000/)
  })
})
