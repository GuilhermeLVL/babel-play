/**
 * GERA O SNAPSHOT DO DRIZZLE DA ÚLTIMA MIGRATION A PARTIR DO `schema.ts` — com o próprio drizzle-kit.
 *
 * Por que existe (auditoria de prontidão, Fase 6): as migrations 0023 e 0025–0030 foram escritas à
 * mão (SQL comentado, `IF NOT EXISTS`) e entraram no `_journal.json` sem o `meta/NNNN_snapshot.json`
 * que o `drizzle-kit generate` grava. O `generate` compara o `schema.ts` com o ÚLTIMO snapshot da
 * pasta — que era o 0024 — e por isso via sete migrations de diferença que já estavam aplicadas:
 * propunha tabela nova, recriação da `rank` e um prompt interativo de renomeação que trava no CI.
 *
 * O que este script faz, e só isto: pega o `schema.ts` atual, pede ao drizzle-kit o snapshot dele
 * (`generateSQLiteDrizzleJson`, a mesma função que o `generate` usa por dentro), encadeia `prevId`
 * no último snapshot existente e grava com o nome da última entrada do journal. Não escreve JSON à
 * mão e não inventa snapshot intermediário (0023, 0025–0029): o estado do schema naqueles pontos não
 * é reconstituível pelo drizzle-kit sem o `schema.ts` de cada época, e o `generate` só precisa do
 * último. O que garante que o `schema.ts` de hoje É o banco que as migrations produzem é o teste
 * `tests/integration/schema-igual-ao-banco.test.ts` — rode-o antes de confiar no snapshot.
 *
 *   npx tsx scripts/migracoes/snapshot-do-schema.ts            # grava se faltar
 *   npx tsx scripts/migracoes/snapshot-do-schema.ts --forcar   # regrava o da última migration
 *
 * Quando usar de novo: depois de escrever uma migration À MÃO (o caminho normal, `npm run
 * db:generate`, já grava o snapshot sozinho).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateSQLiteDrizzleJson } from 'drizzle-kit/api';

import * as schema from '../../server/db/schema';

const META = path.resolve(import.meta.dirname, '..', '..', 'server', 'db', 'migrations', 'meta');

interface Journal {
  entries: { idx: number; tag: string }[];
}

const journal = JSON.parse(readFileSync(path.join(META, '_journal.json'), 'utf8')) as Journal;
const ultima = journal.entries[journal.entries.length - 1];
const numero = ultima.tag.slice(0, 4);
const alvo = path.join(META, `${numero}_snapshot.json`);

if (existsSync(alvo) && !process.argv.includes('--forcar')) {
  console.log(`${path.basename(alvo)} já existe — nada a fazer (use --forcar para regravar)`);
  process.exit(0);
}

// O anterior é o maior snapshot que NÃO é o alvo: o encadeamento `prevId` é o que o drizzle-kit
// confere (`drizzle-kit check`) para detectar duas migrations geradas em paralelo.
const anteriores = readdirSync(META)
  .filter((n) => /^\d{4}_snapshot\.json$/.test(n) && n !== path.basename(alvo))
  .sort();
const anterior = JSON.parse(readFileSync(path.join(META, anteriores[anteriores.length - 1]), 'utf8')) as {
  id: string;
};

const snapshot = await generateSQLiteDrizzleJson(schema as Record<string, unknown>, anterior.id);
writeFileSync(alvo, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`gravado ${path.basename(alvo)} (prevId = ${anterior.id}, de ${anteriores[anteriores.length - 1]})`);
