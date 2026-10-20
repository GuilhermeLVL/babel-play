/**
 * MIGRAÇÃO DE DADOS SQLite → Postgres (Fase 1, Tarefa 8), com prova de que nada se perdeu.
 *
 * Copia TODAS as tabelas do schema (`server/db/schema.ts`) de um SQLite migrado pela cadeia legada para
 * um Postgres já migrado pela cadeia nova, e devolve um relatório com contagem e checksum de cada tabela
 * dos dois lados (`paridade.ts`). O relatório só é `ok` se todas baterem.
 *
 * Decisões:
 *  - A lista de tabelas vem do schema, não de uma lista à mão: tabela nova entra sozinha. A ORDEM é a das
 *    FOREIGN KEYs declaradas (pais antes de filhos), a mesma que `TABELAS_DO_TITULAR` de
 *    `repositories/conta.ts` segue ao contrário para apagar, mas cobrindo também as tabelas globais.
 *  - Tudo numa transação só: ou o destino recebe a carga inteira, ou nada (inclusive o estado dos
 *    gatilhos, que volta junto com o ROLLBACK).
 *  - Os gatilhos de usuário são DESLIGADOS durante a carga (`DISABLE TRIGGER USER`): as tabelas derivadas
 *    (`versoes_de_dados`, `agregados_diarios`, `estado_por_item`, `estado_dos_agregados`) vêm prontas da
 *    origem e não podem ser recalculadas por cima. `USER`, e não `ALL`: `ALL` desligaria também os
 *    gatilhos internos das FOREIGN KEYs, o que exige superusuário (o Supabase recusa) e deixaria entrar
 *    linha órfã. Sem ser dono da tabela, o `ALTER` falha e a carga não acontece — nunca carrega com
 *    gatilho ligado.
 *  - Idempotente: `ON CONFLICT (<chave primária>) DO NOTHING`. O alvo é a PK, e só ela: colisão num índice
 *    único SECUNDÁRIO (`uq_settings_user`, `uq_vocab_user_norm`…) é dado que não cabe no destino, e tem de
 *    derrubar a carga com o nome da tabela em vez de a linha sumir em silêncio. Exceção: `flags`, onde a
 *    ORIGEM VENCE (`DO UPDATE`) — a migração do Postgres semeia as flags, e a escolha do operador no banco
 *    antigo tem de sobreviver. Pelo mesmo motivo a paridade de `flags` é origem ⊆ destino: as chaves que só
 *    a semente do Postgres tem saem em `extrasNoDestino`, sem derrubar o `ok`.
 *  - Coluna gerada (`vocab_cards.src_lang_base`) não é inserida, mas entra no checksum dos dois lados:
 *    prova que o Postgres calcula o mesmo que o SQLite calculava.
 *  - Tabela ou coluna da origem sem lugar no schema aborta antes de copiar (seria perda silenciosa).
 *  - A origem só é lida (SELECT), mas o `@libsql/client` não aceita `?mode=ro`: o arquivo é conferido com
 *    `existsSync` antes (senão o libsql criaria um banco vazio) e o recomendado é rodar sobre uma CÓPIA.
 *    A leitura não é um snapshot: o servidor antigo tem de estar parado.
 *
 * CLI: `npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db [--continuar]`.
 * O destino é a `DATABASE_URL` (as migrations do Postgres são aplicadas antes). Recusa rodar se o destino
 * já tiver usuários, a menos que venha `--continuar` (reexecução idempotente). Sai com 1 se não estiver ok.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { type Client, createClient } from '@libsql/client';
import { getTableColumns, is, sql } from 'drizzle-orm';
import { getTableConfig, type PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DB } from '../../server/db/db';
import * as schema from '../../server/db/schema';
import { checksumDaTabela } from './paridade';

export interface Relatorio {
  tabelas: Array<{
    nome: string;
    linhasOrigem: number;
    linhasDestino: number;
    checksumOrigem: string;
    checksumDestino: string;
    ok: boolean;
    /** Só em `flags`: chaves que o destino tem e a origem não (a semente do Postgres). Informativo. */
    extrasNoDestino?: string[];
  }>;
  ok: boolean;
}

/** Teto de parâmetros por instrução, abaixo dos 65.535 do protocolo do Postgres. */
const TETO_DE_PARAMETROS = 60_000;

/** Tabelas que a cadeia legada do SQLite cria e que não são dado (o diário das migrations). */
const TABELAS_DE_CONTROLE = new Set(['__drizzle_migrations']);

/**
 * Tabelas do schema que só existem no Postgres e não guardam dado a migrar: `travas` (as travas de linha de
 * `travarUsuario`/`travarGlobal`, que nascem sob demanda). O SQLite nunca as teve; ficam fora da cópia.
 */
export const TABELAS_SO_DO_POSTGRES: ReadonlySet<string> = new Set(['travas']);

interface Tabela {
  nome: string;
  tabela: PgTable;
  /** Todas as colunas (nome SQL), inclusive a gerada: é o que entra no checksum. */
  colunas: string[];
  /** Nome SQL → propriedade do Drizzle, só das colunas inseríveis (sem a gerada). */
  inseriveis: Array<{ nome: string; chave: string; booleana: boolean }>;
  chavePrimaria: string[];
  /** As colunas da PK como objetos do Drizzle: o alvo do `ON CONFLICT`. */
  alvo: PgColumn[];
}

/** A tabela onde a origem vence e a paridade é origem ⊆ destino (ver o cabeçalho). */
const TABELA_DE_FLAGS = 'flags';

/**
 * As tabelas do schema, pais antes de filhos (FOREIGN KEY). Dentro de uma mesma onda, a ordem é a de
 * `Object.values` do namespace ESM do schema — alfabética pelo nome EXPORTADO (`agregadosDiarios`,
 * `ankiDecks`…), não a ordem de declaração no arquivo.
 */
function tabelasEmOrdem(): Tabela[] {
  const todas = (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .filter((tabela) => !TABELAS_SO_DO_POSTGRES.has(getTableConfig(tabela).name))
    .map((tabela) => {
      const cfg = getTableConfig(tabela);
      const chaves = Object.entries(getTableColumns(tabela));
      const pais = new Set(cfg.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name));
      pais.delete(cfg.name);
      const pk = cfg.primaryKeys[0]?.columns ?? cfg.columns.filter((c) => c.primary);
      if (pk.length === 0) throw new Error(`migração: ${cfg.name} não tem chave primária no schema`);
      return {
        pais,
        t: {
          nome: cfg.name,
          tabela,
          colunas: cfg.columns.map((c) => c.name),
          inseriveis: chaves
            .filter(([, c]) => !c.generated)
            .map(([chave, c]) => ({ nome: c.name, chave, booleana: c.columnType === 'PgBoolean' })),
          chavePrimaria: pk.map((c) => c.name),
          alvo: pk,
        } satisfies Tabela,
      };
    });
  const ordem: Tabela[] = [];
  const postas = new Set<string>();
  while (ordem.length < todas.length) {
    const prontas = todas.filter((x) => !postas.has(x.t.nome) && [...x.pais].every((p) => postas.has(p)));
    if (prontas.length === 0) throw new Error('migração: ciclo de FOREIGN KEY no schema');
    for (const x of prontas) {
      ordem.push(x.t);
      postas.add(x.t.nome);
    }
  }
  return ordem;
}

const aspas = (nome: string) => `"${nome.replace(/"/g, '""')}"`;
const motivo = (err: unknown) => {
  const e = err as { cause?: { message?: string }; message?: string };
  // A causa do driver, e não a mensagem do Drizzle: aquela traz a instrução com os parâmetros (dado pessoal).
  return String(e?.cause?.message ?? e?.message ?? err);
};

async function lerOrigem(origem: Client, t: Tabela): Promise<Record<string, unknown>[]> {
  try {
    const r = await origem.execute(`SELECT ${t.colunas.map(aspas).join(', ')} FROM ${aspas(t.nome)}`);
    return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
  } catch (err) {
    throw new Error(`migração: falha ao ler ${t.nome} da origem: ${motivo(err)}`, { cause: err });
  }
}

/** Aborta se a origem tiver tabela ou coluna que o schema não conhece: copiar sem ela perderia dado. */
async function conferirOrigem(origem: Client, tabelas: Tabela[]): Promise<void> {
  const conhecidas = new Map(tabelas.map((t) => [t.nome, new Set(t.colunas)]));
  const r = await origem.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const problemas: string[] = [];
  for (const row of r.rows) {
    const nome = String(row[0]);
    if (TABELAS_DE_CONTROLE.has(nome)) continue;
    const colunas = conhecidas.get(nome);
    if (!colunas) {
      problemas.push(`tabela ${nome}`);
      continue;
    }
    const cols = await origem.execute({ sql: 'SELECT name FROM pragma_table_xinfo(?)', args: [nome] });
    for (const c of cols.rows) if (!colunas.has(String(c[0]))) problemas.push(`${nome}.${String(c[0])}`);
  }
  if (problemas.length) {
    throw new Error(`migração: a origem tem dado sem lugar no schema do Postgres: ${problemas.join(', ')}`);
  }
}

function paraInsercao(t: Tabela, linha: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of t.inseriveis) {
    let v = linha[c.nome];
    if (c.booleana && v !== null) {
      if (v !== 0 && v !== 1) throw new Error(`migração: ${t.nome}.${c.nome} não é 0/1 na origem (${String(v)})`);
      v = v === 1;
    }
    out[c.chave] = v;
  }
  return out;
}

async function inserir(tx: DB, t: Tabela, linhasDaOrigem: Record<string, unknown>[], tamanhoDoLote: number) {
  const lote = Math.max(1, Math.min(tamanhoDoLote, Math.floor(TETO_DE_PARAMETROS / t.inseriveis.length)));
  for (let i = 0; i < linhasDaOrigem.length; i += lote) {
    const valores = linhasDaOrigem.slice(i, i + lote).map((l) => paraInsercao(t, l));
    const insercao = tx.insert(t.tabela).values(valores);
    try {
      if (t.nome === TABELA_DE_FLAGS) {
        const set = Object.fromEntries(
          t.inseriveis
            .filter((c) => !t.chavePrimaria.includes(c.nome))
            .map((c) => [c.chave, sql.raw(`excluded.${aspas(c.nome)}`)]),
        );
        await insercao.onConflictDoUpdate({ target: t.alvo, set });
      } else {
        await insercao.onConflictDoNothing({ target: t.alvo });
      }
    } catch (err) {
      throw new Error(`migração: falha ao inserir em ${t.nome} (lote a partir da linha ${i}): ${motivo(err)}`, {
        cause: err,
      });
    }
  }
}

export async function migrarSqliteParaPostgres(opts: {
  origem: string;
  destino: DB;
  tamanhoDoLote?: number;
}): Promise<Relatorio> {
  const tamanhoDoLote = opts.tamanhoDoLote ?? 500;
  const tabelas = tabelasEmOrdem();
  if (!opts.origem.startsWith('file:')) throw new Error('migração: a origem tem de ser um arquivo (file:…)');
  const arquivo = opts.origem.startsWith('file://') ? fileURLToPath(opts.origem) : opts.origem.slice('file:'.length);
  // Sem isto o libsql criaria um banco VAZIO no caminho errado, e a "cópia" sairia ok com zero linhas.
  if (!existsSync(arquivo)) throw new Error(`migração: a origem não existe: ${arquivo}`);
  const origem = createClient({ url: opts.origem });
  const daOrigem = new Map<string, { linhas: number; checksum: string; chaves?: Set<string> }>();
  try {
    await conferirOrigem(origem, tabelas);
    await opts.destino.transaction(async (tx) => {
      for (const t of tabelas) await tx.execute(sql.raw(`ALTER TABLE ${aspas(t.nome)} DISABLE TRIGGER USER`));
      for (const t of tabelas) {
        const lidas = await lerOrigem(origem, t);
        daOrigem.set(t.nome, {
          linhas: lidas.length,
          checksum: checksumDaTabela(lidas, t.chavePrimaria),
          chaves: t.nome === TABELA_DE_FLAGS ? new Set(lidas.map((l) => String(l[t.chavePrimaria[0]]))) : undefined,
        });
        await inserir(tx as DB, t, lidas, tamanhoDoLote);
      }
      for (const t of tabelas) await tx.execute(sql.raw(`ALTER TABLE ${aspas(t.nome)} ENABLE TRIGGER USER`));
    });
  } finally {
    origem.close();
  }

  // Import tardio: `db.ts` abre a `DATABASE_URL` ao ser carregado, e importar este módulo não deve abrir banco.
  const { linhas } = await import('../../server/db/db');
  const relatorio: Relatorio = { tabelas: [], ok: true };
  for (const t of tabelas) {
    const lidas = linhas<Record<string, unknown>>(
      await opts.destino.execute(sql.raw(`SELECT ${t.colunas.map(aspas).join(', ')} FROM ${aspas(t.nome)}`)),
    );
    const o = daOrigem.get(t.nome)!;
    // `flags`: compara só as chaves que a origem tem; as outras são a semente do Postgres (informativo).
    const chaveDe = (l: Record<string, unknown>) => String(l[t.chavePrimaria[0]]);
    const noDestino = o.chaves ? lidas.filter((l) => o.chaves!.has(chaveDe(l))) : lidas;
    const extras = o.chaves
      ? lidas
          .filter((l) => !o.chaves!.has(chaveDe(l)))
          .map(chaveDe)
          .sort()
      : undefined;
    const checksumDestino = checksumDaTabela(noDestino, t.chavePrimaria);
    const ok = o.linhas === noDestino.length && o.checksum === checksumDestino;
    relatorio.tabelas.push({
      nome: t.nome,
      linhasOrigem: o.linhas,
      linhasDestino: noDestino.length,
      checksumOrigem: o.checksum,
      checksumDestino,
      ok,
      ...(extras ? { extrasNoDestino: extras } : {}),
    });
    relatorio.ok &&= ok;
  }
  return relatorio;
}

async function principal(argv: string[]): Promise<number> {
  const i = argv.indexOf('--origem');
  const origem = i >= 0 ? argv[i + 1] : undefined;
  if (!origem) {
    console.error('uso: npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:./data/babel.db [--continuar]');
    return 2;
  }
  const { db, fecharBanco, linhas } = await import('../../server/db/db');
  const { aplicarMigrations } = await import('../../server/db/manutencao');
  try {
    await aplicarMigrations();
    const usuarios = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from users`))[0].n;
    if (usuarios > 0 && !argv.includes('--continuar')) {
      console.error(
        `[migracao] o destino já tem ${usuarios} usuário(s). Para reexecutar sobre ele (idempotente), passe --continuar.`,
      );
      return 2;
    }
    console.warn(
      '[migracao] a leitura da origem NÃO é um snapshot: o servidor antigo tem de estar PARADO durante a cópia.',
    );
    const r = await migrarSqliteParaPostgres({ origem, destino: db });
    console.table(
      r.tabelas.map((t) => ({
        tabela: t.nome,
        origem: t.linhasOrigem,
        destino: t.linhasDestino,
        checksumOrigem: t.checksumOrigem.slice(0, 12),
        checksumDestino: t.checksumDestino.slice(0, 12),
        ok: t.ok,
      })),
    );
    console.log(`[migracao] ${r.tabelas.length} tabelas, ok: ${r.ok}`);
    return r.ok ? 0 : 1;
  } finally {
    await fecharBanco();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (err) => {
      console.error(String((err as Error)?.message ?? err));
      process.exit(1);
    },
  );
}
