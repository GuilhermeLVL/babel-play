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
