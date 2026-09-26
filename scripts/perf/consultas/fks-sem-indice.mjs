#!/usr/bin/env node
/**
 * CHAVES ESTRANGEIRAS SEM ÍNDICE NO LADO FILHO (auditoria de performance do backend, 26/09/2026).
 *
 *   node scripts/perf/consultas/fks-sem-indice.mjs --db=<banco.db>
 *
 * Com `PRAGMA foreign_keys=ON` (ligado em `server/db/db.ts`), cada linha APAGADA na tabela pai obriga o
 * SQLite a procurar filhos que ainda a referenciem. Sem um índice cuja PRIMEIRA coluna seja a coluna
 * filha, essa procura é uma varredura da tabela filha inteira — POR LINHA apagada. Medido no banco
 * semeado da suíte (453.000 ocorrências): apagar as 100 falas de uma sessão levava 15,5 s com o event
 * loop preso. Um índice composto que comece por OUTRA coluna (ex.: `(user_id, card_id)`) só serve por
 * skip-scan, uma busca por usuário distinto — também listado aqui como "só skip-scan".
 *
 * Sai 1 se houver FK sem índice nenhum que contenha a coluna.
 */
import Database from 'libsql'

const banco = process.argv.find((x) => x.startsWith('--db='))?.slice(5)
if (!banco) {
  console.error('uso: node scripts/perf/consultas/fks-sem-indice.mjs --db=<banco.db>')
  process.exit(2)
}
const db = new Database(banco, { readonly: true })
const tabelas = db
  .prepare(`select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '\\_\\_%' escape '\\'`)
  .all()
  .map((r) => r.name)
let semIndice = 0
console.log('| tabela filha | linhas | coluna | referencia | índice |')
console.log('|---|---:|---|---|---|')
for (const t of tabelas) {
  const n = db.prepare(`select count(*) n from "${t}"`).get().n
  const indices = db
    .prepare('select name from pragma_index_list(?)')
    .all(t)
    .map((i) => ({
      nome: i.name,
      colunas: db
        .prepare('select name from pragma_index_info(?) order by seqno')
        .all(i.name)
        .map((c) => c.name),
    }))
  for (const fk of db.prepare('select * from pragma_foreign_key_list(?)').all(t)) {
    const lider = indices.find((x) => x.colunas[0] === fk.from)
    const contem = indices.filter((x) => x.colunas.includes(fk.from))
    let veredito
    if (lider) veredito = `ok (${lider.nome})`
    else if (contem.length) veredito = `só skip-scan (${contem.map((x) => `${x.nome}: ${x.colunas.join(',')}`).join('; ')})`
    else {
      veredito = '**SEM ÍNDICE**'
      semIndice++
    }
    console.log(`| ${t} | ${n} | ${fk.from} | ${fk.table}.${fk.to} | ${veredito} |`)
  }
}
db.close()
process.exit(semIndice ? 1 : 0)
