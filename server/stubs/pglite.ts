/** `@electric-sql/pglite` no Worker: o banco é o `Client` da requisição (`clientePorRequisicao.ts`); o WASM não entra. */
import { classeSoNoNode } from './soNoNode'

export const PGlite = classeSoNoNode('@electric-sql/pglite')
/** O driver `drizzle-orm/pglite` lê `types.<OID>` só ao consultar (nunca no Worker). */
export const types = {}
