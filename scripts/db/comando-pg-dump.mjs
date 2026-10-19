/**
 * Monta o comando do `pg_dump` SEM a senha no argv: argv aparece em `ps` e em logs do host, o
 * ambiente do processo filho não. As credenciais seguem pelas variáveis `PG*` do libpq.
 */
export function montarPgDump(urlBanco, arquivo, ambienteBase = process.env) {
  const u = new URL(urlBanco)
  const env = { ...ambienteBase }
  // Limpa o que o ambiente do pai poderia misturar com o destino pedido.
  for (const k of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE']) delete env[k]
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname)
  if (u.port) env.PGPORT = u.port
  if (u.username) env.PGUSER = decodeURIComponent(u.username)
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password)
  const banco = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (banco) env.PGDATABASE = banco
  const sslmode = u.searchParams.get('sslmode')
  if (sslmode) env.PGSSLMODE = sslmode
  return { programa: 'pg_dump', args: ['--format=custom', `--file=${arquivo}`], env }
}
