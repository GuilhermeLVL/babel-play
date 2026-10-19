/**
 * AS SEMENTES DE `flags` DA MIGRAÇÃO DO POSTGRES (`server/db/migrations-pg/0001_triggers_e_flags.sql`).
 *
 * No SQLite cada flag nascia (e mudava de texto) numa migração própria — 0039, 0041, 0045, 0049… —, e
 * os testes reaplicavam aquele arquivo para provar que a semente é idempotente e não sobrescreve o que
 * o operador mudou. No Postgres a cadeia virou o ESTADO FINAL, semeado por `INSERT … ON CONFLICT
 * (chave) DO NOTHING` na 0001. A propriedade é a mesma, e é sobre estes comandos que ela se prova.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const MIGRACAO = path.resolve(process.cwd(), 'server', 'db', 'migrations-pg', '0001_triggers_e_flags.sql')

/** Os `INSERT INTO flags …` da 0001, um por item, sem comentários. Lança se não achar nenhum. */
export function sementesDeFlags(): string[] {
  const comandos = readFileSync(MIGRACAO, 'utf8')
    .split(/-->\s*statement-breakpoint/)
    .map((c) => c.replace(/^\s*--[^\n]*$/gm, '').trim())
    .filter((c) => /^INSERT INTO flags\b/i.test(c))
  // Lista vazia faria todo "reaplicar não sobrescreve" passar sem reaplicar nada.
  if (comandos.length === 0) throw new Error(`sementesDeFlags: nenhum INSERT INTO flags em ${MIGRACAO}`)
  return comandos
}
