/**
 * Peças do banco preguiçoso (Fase 2, Task 5 — rodada de correção 1): a recusa de pooler em modo transação
 * para as migrations e o `db` que não aceita atribuição.
 */
import { describe, expect, it } from 'vitest'

import { db } from '../server/db/db'
import { recusaDeUrlDeMigracao } from '../server/db/tipoDoBanco'

describe('recusaDeUrlDeMigracao', () => {
  it('conexão direta passa', () => {
    expect(recusaDeUrlDeMigracao('postgres://u:p@db.abc.supabase.co:5432/postgres')).toBeNull()
  })
  it('pooler do Supabase na 5432 (modo sessão) passa', () => {
    expect(recusaDeUrlDeMigracao('postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')).toBeNull()
  })
  it('pooler na 6543 (modo transação) é recusado', () => {
    expect(recusaDeUrlDeMigracao('postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')).toMatch(
      /migrations exigem conexão direta ou pooler em modo sessão/,
    )
  })
})

describe('db preguiçoso', () => {
  it('atribuir no db lança, em vez de cair em silêncio', () => {
    expect(() => Object.assign(db, { select: () => null })).toThrow(/db é só leitura/)
  })
})
