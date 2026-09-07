/**
 * MANUTENÇÃO GLOBAL de boot — operações que atravessam TODOS os tenants.
 *
 * P3-1: `migrarLeitner` morava em `vocabRepo`, exportado pelo barrel `repositories/index.ts`.
 * Todo método daquele objeto é escopado por `UserId`; este não é — faz `UPDATE` sobre a base
 * inteira. Ficar ao lado dos outros convidava uma rota futura a chamá-lo por engano, e um
 * único `await vocabRepo.migrarLeitner()` num handler mexeria no dado de todos os usuários.
 *
 * Aqui o contrato fica explícito no nome do arquivo: NADA daqui é chamável por rota.
 * Chamado apenas por `startServer()` (server.ts).
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { client, db } from './db'
import { vocabCards } from './schema'
import { toState } from './repositories/vocab'
import { migrateLeitnerToFsrs } from '../../src/core/learning/scheduler'

/**
 * Aplica as migrations do Drizzle. Idempotente.
 *
 * Existe porque um deploy LIMPO não subia: o container começava com o banco vazio e
 * `seedIfEmpty()` estourava com `no such table: sessions`, entrando em crash-loop. As
 * migrations moravam só no `npm run db:migrate` — um CLI em TypeScript, que não existe
 * na imagem de produção. Agora o próprio boot as aplica.
 *
 * A pasta é resolvível por env (`MIGRATIONS_DIR`) porque o caminho relativo depende de
 * onde o processo roda: `server/db/migrations` a partir do repo em dev, e o mesmo caminho
 * copiado para dentro da imagem em produção.
 */
export async function aplicarMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'
  if (url.startsWith('file:')) {
    // O libsql não cria o diretório do arquivo; num volume novo ele não existe.
    mkdirSync(dirname(url.replace(/^file:/, '')), { recursive: true })
  }
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? join(process.cwd(), 'server', 'db', 'migrations')

  try {
    await migrate(db, { migrationsFolder })
  } catch (err) {
    // P1-N1: "não CONSIGO migrar" e "não PRECISO migrar" eram tratados igual, e o boot
    // matava o processo nos dois casos. Uma réplica apontada para um banco já migrado, sem
    // a pasta no disco, entrava em crash-loop — justamente a topologia "um nó migra, os
    // outros servem". Se o schema já está lá, seguir é o certo; só falhar se não estiver.
    if (await schemaPresente()) {
      console.warn(
        `[db] migrations não aplicadas (${String((err as Error)?.message || err).slice(0, 120)}), ` +
        'mas o schema já está presente — seguindo. Defina MIGRATIONS_DIR se esta instância deve migrar.',
      )
      return
    }
    throw err
  }
}

/** O schema já existe neste banco? Usado para decidir se a falha de migração é fatal. */
export async function schemaPresente(): Promise<boolean> {
  try {
    const r = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions' LIMIT 1",
    )
    return r.rows.length > 0
  } catch {
    return false // banco inacessível: não dá para afirmar que está pronto
  }
}

/**
 * M-04: migra cartões Leitner (sem estado FSRS, `box > 1`) para FSRS. Idempotente e
 * NÃO-destrutivo: preserva `box`/`dueAt` e só ADICIONA stability/difficulty/reps/lapses/
 * lastReview. `box <= 1` (cartas novas) ficam intactas — o FSRS define o estado na 1ª nota.
 * @returns quantos cartões migraram.
 *
 * O TETO DE 5.000 é o que impede a varredura de crescer sem fim (auditoria de 2026-09-07, achado
 * A53). Ela roda a CADA boot e lê toda linha de `vocab_cards` sem estado FSRS — o que inclui
 * permanentemente as cartas novas (`box <= 1`), que nunca migram por desenho. Num acervo grande e
 * com o cluster, isso é a mesma leitura repetida por processo, a cada restart, para migrar zero.
 *
 * Migração idempotente é para acabar: quando restar um lote, ele migra e a consulta seguinte não
 * acha mais nada. O teto só garante que o boot não fique refém do tamanho do acervo; o que sobrar
 * entra no próximo restart, e o log diz que sobrou.
 */
const TETO_DA_MIGRACAO_LEITNER = 5_000

export async function migrarLeitnerParaFsrs(): Promise<number> {
  const now = Date.now()
  const candidatos = await db
    .select()
    .from(vocabCards)
    /* `box > 1` na CONSULTA, e não só no laço: as cartas novas são a maioria de um acervo em
       crescimento e eram lidas inteiras a cada boot para serem descartadas linha a linha. */
    .where(and(isNull(vocabCards.deletedAt), isNull(vocabCards.stability), gt(vocabCards.box, 1)))
    .limit(TETO_DA_MIGRACAO_LEITNER)
  let migrados = 0
  for (const card of candidatos) {
    const antes = toState(card)
    const depois = migrateLeitnerToFsrs(antes, now)
    if (depois.stability === antes.stability) continue // box<=1: nada a migrar
    await db
      .update(vocabCards)
      .set({
        stability: depois.stability ?? null,
        difficulty: depois.difficulty ?? null,
        reps: depois.reps ?? null,
        lapses: depois.lapses ?? null,
        lastReview: depois.lastReview ?? null,
        updatedAt: now,
      })
      .where(eq(vocabCards.id, card.id))
    migrados++
  }
  return migrados
}
