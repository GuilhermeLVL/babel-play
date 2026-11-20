/**
 * Os migradores do Drizzle no Worker: as migrações rodam no deploy (`npm run db:migrate`), nunca no isolate,
 * e o migrador lê a pasta das migrações do disco (`node:fs`). O Worker só confere `schemaPresente()`.
 */
import { funcaoSoNoNode } from './soNoNode'

export const migrate = funcaoSoNoNode('drizzle-orm/*/migrator')
