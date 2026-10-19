/**
 * Acesso direto ao banco de TESTE para os semeadores de polimento. Eles escrevem o PASSADO (vencimento,
 * estabilidade, revisões) com o servidor de pé, e o PGlite é de um processo só: por isso `--db` tem de
 * ser uma URL `postgres://` (ex.: o serviço `postgres` do `docker-compose.yml`), e o servidor sobe com
 * a MESMA `DATABASE_URL`.
 */
import pg from 'pg'

/** Recusa o que não é Postgres e o banco de desenvolvimento; devolve `{ consultar, fechar }`. */
export async function abrirBanco(url, uso) {
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    console.error(`${uso}\n--db precisa ser postgres://… (o PGlite não aceita um segundo processo escrevendo)`)
    process.exit(2)
  }
  const cliente = new pg.Client({ connectionString: url })
  await cliente.connect()
  return {
    /** `?` → `$1, $2…` para os SQLs ficarem como estavam. Devolve as linhas. */
    async consultar(sql, params = []) {
      let n = 0
      return (
        await cliente.query(
          sql.replace(/\?/g, () => `$${++n}`),
          params,
        )
      ).rows
    },
    fechar: () => cliente.end(),
  }
}
