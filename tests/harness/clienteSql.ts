/**
 * PONTE PARA OS TESTES QUE FALAVAM COM O CLIENTE libsql (`client.execute({ sql, args })`).
 *
 * O `server/db/db.ts` não exporta mais `client`. Esta ponte devolve um objeto com o mesmo formato,
 * por cima do `db` (Drizzle/Postgres): troca cada `?` pelo parâmetro correspondente e devolve
 * `{ rows, rowsAffected }`. Só para SQL de teste simples: o texto tem de ser SQL válido no Postgres
 * e não pode ter `?` literal fora dos parâmetros.
 */
import { type SQL, sql } from 'drizzle-orm'

type Consulta = string | { sql: string; args?: unknown[] }

export interface ClienteSql {
  execute: (q: Consulta) => Promise<{ rows: any[]; rowsAffected: number }>
}

/** `mod` é o módulo `server/db/db` já carregado pelo harness (o mesmo `db` do servidor). */
export function clienteSql(mod: { db: any; linhas: (r: unknown) => any[]; linhasAfetadas: (r: unknown) => number }) {
  return {
    async execute(q: Consulta) {
      const { sql: texto, args = [] } = typeof q === 'string' ? { sql: q } : q
      const partes = texto.split('?')
      if (partes.length - 1 !== args.length) {
        throw new Error(`clienteSql: ${partes.length - 1} '?' para ${args.length} argumentos`)
      }
      let consulta: SQL = sql.raw(partes[0])
      for (let i = 0; i < args.length; i++) consulta = sql`${consulta}${args[i]}${sql.raw(partes[i + 1])}`
      const r = await mod.db.execute(consulta)
      return { rows: mod.linhas(r), rowsAffected: mod.linhasAfetadas(r) }
    },
  } satisfies ClienteSql
}
