#!/usr/bin/env node
/**
 * CHAVES ESTRANGEIRAS SEM ÍNDICE NO LADO FILHO (auditoria de performance do backend, 26/09/2026).
 *
 *   node scripts/perf/consultas/fks-sem-indice.mjs --db=<banco.db>
 *
 * No Postgres, cada linha APAGADA (ou com a chave atualizada) na tabela pai dispara uma checagem de
 * integridade no filho (`SELECT 1 FROM ONLY filho WHERE coluna = $1 FOR KEY SHARE`). Sem um índice cuja
 * PRIMEIRA coluna seja a coluna filha, essa checagem é uma varredura da tabela filha inteira — POR LINHA
 * apagada (medido no banco semeado da suíte, com 453.000 ocorrências: apagar as 100 falas de uma sessão
 * levava 15,5 s). O Postgres não faz skip-scan: um índice composto que comece por OUTRA coluna (ex.:
 * `(user_id, card_id)`) só ajuda varrendo o índice inteiro, e vem listado aqui como "coluna fora da frente".
 * `--db` é o diretório do PGlite (servidor parado) ou uma URL `postgres://`.
 *
 * Sai 1 se houver FK sem índice nenhum que contenha a coluna.
 */
import { abrirAlvo } from '../contar-linhas.mjs'

const banco = process.argv.find((x) => x.startsWith('--db='))?.slice(5)
if (!banco) {
  console.error('uso: node scripts/perf/consultas/fks-sem-indice.mjs --db=<diretório do pglite | postgres://…>')
  process.exit(2)
}
const db = await abrirAlvo(banco)
const fks = await db.consultar(`
  SELECT filho.relname AS tabela, pai.relname AS pai, a.attname AS coluna, pa.attname AS coluna_pai
    FROM pg_constraint con
    JOIN pg_class filho ON filho.oid = con.conrelid
    JOIN pg_class pai ON pai.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = filho.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(n, pn)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n
    JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.pn
   WHERE con.contype = 'f' AND ns.nspname = 'public'
   ORDER BY filho.relname, con.conname`)
const indices = await db.consultar(`
  SELECT t.relname AS tabela, i.relname AS nome,
         ARRAY(SELECT a.attname FROM unnest(x.indkey::int2[]) WITH ORDINALITY k(n, ord)
               JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.n ORDER BY k.ord) AS colunas
    FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
   WHERE ns.nspname = 'public'`)
let semIndice = 0
console.log('| tabela filha | linhas | coluna | referencia | índice |')
console.log('|---|---:|---|---|---|')
const contagens = new Map()
for (const fk of fks) {
  if (!contagens.has(fk.tabela))
    contagens.set(fk.tabela, (await db.consultar(`select count(*)::int as n from "${fk.tabela}"`))[0].n)
  const doFilho = indices.filter((x) => x.tabela === fk.tabela)
  const lider = doFilho.find((x) => x.colunas[0] === fk.coluna)
  const contem = doFilho.filter((x) => x.colunas.includes(fk.coluna))
  let veredito
  if (lider) veredito = `ok (${lider.nome})`
  else if (contem.length)
    veredito = `coluna fora da frente (${contem.map((x) => `${x.nome}: ${x.colunas.join(',')}`).join('; ')})`
  else {
    veredito = '**SEM ÍNDICE**'
    semIndice++
  }
  console.log(
    `| ${fk.tabela} | ${contagens.get(fk.tabela)} | ${fk.coluna} | ${fk.pai}.${fk.coluna_pai} | ${veredito} |`,
  )
}
await db.fechar()
process.exit(semIndice ? 1 : 0)
