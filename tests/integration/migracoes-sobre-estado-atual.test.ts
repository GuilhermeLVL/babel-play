/**
 * As migrations sobre o ESTADO ATUAL do banco — nao sobre um banco nascido vazio.
 *
 * `migrations-no-boot.test.ts` prova que a sequencia se aplica do zero. Isto nao prova que ela se
 * aplica por cima do que o banco real carrega: tabelas rebuildadas com dado dentro, indices criados
 * sobre linhas que ja existiam, colunas retiradas de tabelas cheias. A fixture
 * `tests/fixtures/banco-estado-atual.db` e a foto anonimizada desse estado (gerada por
 * `scripts/db/fixture-anonimizada.mjs`), e este arquivo passa por cima dela o mesmo caminho que
 * `startServer()` percorre: `dbReady`, `aplicarMigrations`, Leitner->FSRS, backfill de tenancy,
 * `bootStatus`.
 *
 * Os dois ultimos casos sao CARACTERIZACAO: apagam linhas do diario `__drizzle_migrations` e
 * registram o que o migrador faz de verdade ao reencontrar uma migration ja aplicada.
 *
 * UM banco por arquivo, de proposito: `server/db/db.ts` exporta uma instancia unica ligada ao
 * `DATABASE_URL` lido no PRIMEIRO import (ver `migrations-no-boot.test.ts`).
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const FIXTURE = path.resolve(process.cwd(), 'tests', 'fixtures', 'banco-estado-atual.db')
const JOURNAL = path.resolve(process.cwd(), 'server', 'db', 'migrations', 'meta', '_journal.json')

// Definido ANTES de qualquer import de `server/db/db` — e o que a instancia unica le.
const dir = mkdtempSync(path.join(tmpdir(), 'babel-estado-'))
const file = path.join(dir, 'estado-atual.db')
copyFileSync(FIXTURE, file)
process.env.DATABASE_URL = 'file:' + file.split(path.sep).join('/')
process.env.MIGRATIONS_DIR = path.resolve(process.cwd(), 'server', 'db', 'migrations')

let client: any
let dbReady: Promise<void>
let aplicarMigrations: () => Promise<void>
let migrarLeitnerParaFsrs: () => Promise<number>
let entradasDoJournal: number

beforeAll(async () => {
  const mod = await import('../../server/db/db') as any
  client = mod.client
  dbReady = mod.dbReady
  ;({ aplicarMigrations, migrarLeitnerParaFsrs } = await import('../../server/db/manutencao'))
  entradasDoJournal = (JSON.parse(readFileSync(JOURNAL, 'utf8')) as { entries: unknown[] }).entries.length
})
afterAll(() => {
  try { client?.close?.() } catch { /* ja fechado */ }
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})

const linhas = async (sql: string, args: any[] = []) => (await client.execute({ sql, args })).rows as Record<string, unknown>[]
const contar = async (t: string) => Number(Object.values((await linhas(`SELECT COUNT(*) AS n FROM "${t}"`))[0])[0])
const hashesDoDiario = async () => (await linhas('SELECT hash FROM __drizzle_migrations ORDER BY created_at')).map((r) => String(r.hash))
const colunas = async (t: string) => (await linhas(`PRAGMA table_info("${t}")`)).map((r) => String(r.name))
const temTabela = async (t: string) =>
  (await linhas("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [t])).length > 0

describe('migrations sobre o estado atual — caminho do boot', () => {
  it('a fixture chega com o diario completo', async () => {
    expect(await contar('__drizzle_migrations')).toBe(entradasDoJournal)
  })

  it('aplicarMigrations num banco ja no estado atual nao reaplica nada e nao lanca', async () => {
    const antes = await hashesDoDiario()
    await expect(aplicarMigrations()).resolves.not.toThrow()
    expect(await hashesDoDiario()).toEqual(antes)
    expect(antes).toHaveLength(entradasDoJournal)
  })

  it('foreign_key_check vazio e integrity_check ok sobre o dado real', async () => {
    await client.execute('PRAGMA foreign_keys = ON')
    expect(await linhas('PRAGMA foreign_key_check')).toEqual([])
    expect((await linhas('PRAGMA integrity_check'))[0]).toEqual({ integrity_check: 'ok' })
  })

  it('o resto do boot passa: dbReady, Leitner->FSRS, backfill de tenancy, e bootStatus responde ok', async () => {
    await expect(dbReady).resolves.toBeUndefined()
    // `dbReady` liga o WAL na copia — e o que o processo real faz com o arquivo de producao.
    expect(String(Object.values((await linhas('PRAGMA journal_mode'))[0])[0]).toLowerCase()).toBe('wal')

    const migrados = await migrarLeitnerParaFsrs()
    expect(migrados).toBeGreaterThanOrEqual(0)

    const { backfillNullOwner } = await import('../../server/db/repositories/tenancy')
    const { LOCAL_OWNER } = await import('../../server/lib/authContext')
    const carimbados = await backfillNullOwner(LOCAL_OWNER)
    expect(carimbados).toBeGreaterThanOrEqual(0)

    const { bootStatus } = await import('../../server/lib/bootStatus')
    expect(await bootStatus()).toEqual({ ok: true, erros: [] })

    // Nada do que o boot faz pode deixar a rede furada.
    expect(await linhas('PRAGMA foreign_key_check')).toEqual([])
  })
})

describe('migrations sobre o estado atual — caracterizacao do diario', () => {
  it('apagar a linha da ULTIMA migration e reaplicar: idempotente, porque a 0027 e toda IF NOT EXISTS', async () => {
    const total = await contar('__drizzle_migrations')
    const rankAntes = await contar('rank')
    const ultima = (await linhas('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'))[0]

    await client.execute({ sql: 'DELETE FROM __drizzle_migrations WHERE created_at = ?', args: [ultima.created_at] })
    expect(await contar('__drizzle_migrations')).toBe(total - 1)

    await expect(aplicarMigrations()).resolves.not.toThrow()

    // A linha voltou com o mesmo hash, e o dado que a tabela ja tinha nao foi tocado.
    expect(await contar('__drizzle_migrations')).toBe(total)
    const reposta = (await linhas('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'))[0]
    expect(reposta).toEqual(ultima)
    expect(await contar('rank')).toBe(rankAntes)

    // caracterizacao: `id SERIAL PRIMARY KEY` nao e tipo do SQLite — vira afinidade NUMERIC sem
    // autoincremento, e TODA linha do diario nasce com id NULL, inclusive a reposta agora. O
    // migrador ordena por created_at e nunca le o id, entao nada quebra; mas o diario nao tem chave.
    expect(await contar('__drizzle_migrations')).toBe(
      Number(Object.values((await linhas('SELECT COUNT(*) AS n FROM __drizzle_migrations WHERE id IS NULL'))[0])[0]),
    )
  })

  it('apagar as linhas das DUAS ultimas e reaplicar: a 0026 (DROP COLUMN) nao e reexecutavel, o lote volta atras e o boot SEGUE', async () => {
    const total = await contar('__drizzle_migrations')
    const duasUltimas = await linhas('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 2')
    for (const r of duasUltimas) {
      await client.execute({ sql: 'DELETE FROM __drizzle_migrations WHERE created_at = ?', args: [r.created_at] })
    }
    expect(await contar('__drizzle_migrations')).toBe(total - 2)

    // `mockRestore()` do vitest tambem zera `mock.calls`; as asserções sobre o aviso ficam ANTES.
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // caracterizacao: `ALTER TABLE vocab_cards DROP COLUMN frequency` falha na segunda vez ("no such
      // column"), o @libsql/client roda o lote inteiro numa transacao e faz ROLLBACK — a 0027 nem
      // chega a rodar. `aplicarMigrations` ve o schema presente (`sessions` existe) e ENGOLE o erro
      // com console.warn (P1-N1). O processo sobe, o diario fica dois passos atras, e cada boot
      // seguinte repete a falha em silencio. Nao e "falha alto": e "segue como se nada".
      await expect(aplicarMigrations()).resolves.not.toThrow()
      expect(aviso).toHaveBeenCalledTimes(1)
      expect(String(aviso.mock.calls[0][0])).toMatch(/migrations não aplicadas .*no such column.*schema já está presente/)
    } finally {
      aviso.mockRestore()
    }

    // O diario nao andou e o schema ficou como estava: rank continua, frequency continua ausente.
    expect(await contar('__drizzle_migrations')).toBe(total - 2)
    expect(await temTabela('rank')).toBe(true)
    expect(await colunas('vocab_cards')).not.toContain('frequency')
    expect((await linhas('PRAGMA integrity_check'))[0]).toEqual({ integrity_check: 'ok' })
  })
})
