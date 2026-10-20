/**
 * QUAL BANCO A `DATABASE_URL` DESCREVE — regra pura, sem abrir nada.
 *
 * Mora fora de `db.ts` porque importar `db.ts` ABRE o banco, e quem precisa só da resposta (as
 * travas de boot de `server/lib/diretorios.ts`, que rodam antes) não pode pagar isso.
 */

/** Sem `DATABASE_URL`: o PGlite em `./data/pg` (dev e self-host). */
export const URL_PADRAO_DO_BANCO = 'pglite:./data/pg'

/** Banco embutido (PGlite), em diretório ou em memória. */
export const ehBancoEmbutido = (url: string): boolean => url.startsWith('pglite:')

/* `pglite:memory` (sem `//`) também é memória: do contrário criaria um diretório chamado "memory". */
export const ehBancoEmMemoria = (url: string): boolean => url === 'pglite://memory' || url === 'pglite:memory'

/**
 * MIGRATIONS EXIGEM SESSÃO DE VERDADE. A conexão das migrations roda `SET statement_timeout = 0` fora de
 * transação (`comConexaoDeMigracao`, em `db.ts`), e um pooler em modo TRANSAÇÃO (Supavisor na porta 6543)
 * devolve a conexão ao pool a cada instrução: o `SET` não sobrevive e a migração longa estoura no prazo do
 * papel. Recusa a porta 6543 e o pooler do Supabase fora da 5432 (modo sessão). Devolve o motivo, ou `null`.
 */
export function recusaDeUrlDeMigracao(url: string): string | null {
  let alvo: URL
  try {
    alvo = new URL(url)
  } catch {
    return null
  }
  const porta = alvo.port || '5432'
  const poolerDoSupabase = alvo.hostname.endsWith('pooler.supabase.com')
  if (porta === '6543' || (poolerDoSupabase && porta !== '5432')) {
    return `migrations exigem conexão direta ou pooler em modo sessão (porta 5432); a URL aponta para ${alvo.hostname}:${porta}, um pooler em modo transação`
  }
  return null
}
