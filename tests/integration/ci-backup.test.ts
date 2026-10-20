/**
 * O PG_DUMP SEMANAL NO R2 (Fase 2, Task 13). O workflow só roda no GitHub; aqui se confere o que dá
 * para conferir sem rodá-lo: que existe, o que pede ao pg_dump, que agenda e que não carrega segredo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const texto = readFileSync(join(__dirname, '../../.github/workflows/backup-pg-dump.yml'), 'utf8')

describe('workflow backup-pg-dump', () => {
  it('agenda toda segunda às 06:00 UTC e aceita disparo manual', () => {
    expect(texto).toContain("cron: '0 6 * * 1'")
    expect(texto).toContain('workflow_dispatch')
  })

  it('despeja só os schemas da aplicação, com TLS verificado, pelo pooler de sessão', () => {
    expect(texto).toContain('--schema=public --schema=drizzle')
    expect(texto).toContain('PGSSLMODE=verify-full')
    expect(texto).toContain('pooler.supabase.com')
    expect(texto).toContain('IPv6')
  })

  it('envia ao bucket frasy-backups em semanal/AAAA-MM-DD.dump e confere com pg_restore --list', () => {
    expect(texto).toContain('frasy-backups')
    expect(texto).toContain('semanal/')
    expect(texto).toContain('pg_restore --list')
  })

  it('só lê credenciais de secrets e não carrega nenhuma em texto', () => {
    for (const s of [
      'SUPABASE_DB_HOST',
      'SUPABASE_DB_USER',
      'SUPABASE_DB_PASSWORD',
      'SUPABASE_DB_NAME',
      'SUPABASE_CA_PEM',
      'R2_S3_ENDPOINT',
      'R2_S3_ACCESS_KEY_ID',
      'R2_S3_SECRET_ACCESS_KEY',
    ])
      expect(texto).toContain(`secrets.${s}`)
    expect(texto).not.toMatch(/postgres(ql)?:\/\/[^\s$]+:[^\s$]+@/)
    expect(texto).not.toMatch(/sb_secret|cfut_/)
  })

  it('não interpola dados do evento dentro de run:', () => {
    expect(texto).not.toMatch(/\$\{\{\s*github\.(event|head_ref)/)
  })
})
