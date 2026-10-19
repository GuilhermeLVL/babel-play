/**
 * Monta o comando do `pg_dump` SEM a senha no argv: argv aparece em `ps` e em logs do host, o
 * ambiente do processo filho não. As credenciais seguem pelas variáveis `PG*` do libpq.
 */
export function montarPgDump(urlBanco, arquivo, ambienteBase = process.env) {
  let u
  try {
    u = new URL(urlBanco)
  } catch {
    // Mensagem fixa: o `ERR_INVALID_URL` do Node carrega a URL inteira (com a senha) em `input` e no stack.
    throw new Error('DATABASE_URL não é uma URL válida (esperado postgres://usuario:senha@host:porta/banco)')
  }
  const env = { ...ambienteBase }
  // Limpa o que o ambiente do pai poderia misturar com o destino pedido.
  for (const k of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE']) delete env[k]
  // IPv6 vem entre colchetes (`[::1]`) em esquemas não especiais; o libpq quer o endereço puro.
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname).replace(/^\[(.*)\]$/, '$1')
  if (u.port) env.PGPORT = u.port
  if (u.username) env.PGUSER = decodeURIComponent(u.username)
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password)
  const banco = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (banco) env.PGDATABASE = banco
  const sslmode = u.searchParams.get('sslmode')
  if (sslmode) env.PGSSLMODE = sslmode
  return { programa: 'pg_dump', args: ['--format=custom', `--file=${arquivo}`], env }
}
