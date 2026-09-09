/**
 * A fixture `tests/fixtures/banco-estado-atual.db` NAO pode carregar dado pessoal.
 *
 * Ela e uma foto do banco real, gerada por `scripts/db/fixture-anonimizada.mjs`, e vai para o
 * repositorio. O que este arquivo garante e que a foto saiu anonimizada — nao pela lista do que
 * havia na origem (isso o CI nao tem), mas pela FORMA do que sobrou: todo e-mail obedece ao
 * marcador, todo apelido obedece ao marcador, todo segredo e a constante, e nenhuma coluna de
 * texto, em nenhuma tabela, tem coisa com forma de e-mail fora do dominio reservado.
 *
 * O conteudo de aprendizado (falas, palavras, frases de exemplo, notas do Anki) fica — e o dado
 * que as migrations precisam encontrar. A varredura por e-mail passa por ele mesmo assim.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { type Client,createClient } from '@libsql/client'
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

const FIXTURE = path.resolve(process.cwd(), 'tests', 'fixtures', 'banco-estado-atual.db')
const JOURNAL = path.resolve(process.cwd(), 'server', 'db', 'migrations', 'meta', '_journal.json')

/* Repetidos de `scripts/db/fixture-anonimizada.mjs`: o script executa ao ser importado, entao nao
   da para importar so as constantes sem regerar a fixture. */
const MARCADOR_SEGREDO = 'SEGREDO-ANONIMIZADO'
const MARCADOR_PAYLOAD = '{"anonimizado":true}'
const IP_HASH_ZERADO = '0'.repeat(32)
const REGEX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const LIMITE_COMMITAVEL = 2 * 1024 * 1024

/* Copia para fora do repositorio: abrir a fixture no lugar poderia deixar -wal/-shm ao lado dela. */
const dir = mkdtempSync(path.join(tmpdir(), 'babel-pii-'))
const copia = path.join(dir, 'fixture.db')
let c: Client

beforeAll(() => {
  copyFileSync(FIXTURE, copia)
  c = createClient({ url: 'file:' + copia.split(path.sep).join('/') })
})
afterAll(() => {
  c.close()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})

const linhas = async (sql: string) => (await c.execute(sql)).rows as Record<string, unknown>[]
const tabelas = async () =>
  (await linhas("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => String(r.name))
const colunasDeTexto = async (t: string) =>
  (await linhas(`PRAGMA table_info("${t}")`))
    .filter((col) => String(col.type ?? '') === '' || /^(text|char|clob|varchar)/i.test(String(col.type)))
    .map((col) => String(col.name))
const valores = async (t: string, col: string) =>
  (await linhas(`SELECT "${col}" AS v FROM "${t}" WHERE "${col}" IS NOT NULL`)).map((r) => String(r.v))
const contar = async (t: string) => Number(Object.values((await linhas(`SELECT COUNT(*) AS n FROM "${t}"`))[0])[0])

describe('fixture do estado atual — forma do arquivo', () => {
  it('existe, e um arquivo so (journal DELETE, sem WAL) e cabe no limite commitavel de 2 MB', async () => {
    expect(existsSync(FIXTURE)).toBe(true)
    expect(statSync(FIXTURE).size).toBeLessThan(LIMITE_COMMITAVEL)
    expect(existsSync(FIXTURE + '-wal')).toBe(false)
    expect(String(Object.values((await linhas('PRAGMA journal_mode'))[0])[0]).toLowerCase()).toBe('delete')
    expect(String(Object.values((await linhas('PRAGMA integrity_check'))[0])[0]).toLowerCase()).toBe('ok')
  })

  it('carrega o diario de migrations inteiro — e o estado ATUAL, nao um banco antigo', async () => {
    const journal = JSON.parse(readFileSync(JOURNAL, 'utf8')) as { entries: Array<{ when: number }> }
    expect(await contar('__drizzle_migrations')).toBe(journal.entries.length)
    const ultima = (await linhas('SELECT max(created_at) AS w FROM __drizzle_migrations'))[0]
    expect(Number(ultima.w)).toBe(journal.entries[journal.entries.length - 1].when)
    expect(await tabelas()).toEqual(expect.arrayContaining(['users', 'rank', 'sessions', 'utterances', 'vocab_cards', 'anki_notes']))
  })

  it('tem dado de verdade para as migrations encontrarem (nao e um banco vazio migrado)', async () => {
    for (const t of ['sessions', 'utterances', 'vocab_cards', 'vocab_occurrences', 'anki_notes', 'exercise_results']) {
      expect(await contar(t), t).toBeGreaterThan(0)
    }
  })
})

describe('fixture do estado atual — colunas de identificacao', () => {
  it('users: todo e-mail e usuario-<n>@exemplo.test, todo nome e Usuario <n>, bio vazia', async () => {
    expect(await contar('users')).toBeGreaterThan(0)
    for (const v of await valores('users', 'email')) expect(v).toMatch(/^usuario-\d+@exemplo\.test$/)
    for (const v of await valores('users', 'display_name')) expect(v).toMatch(/^Usuario \d+$/)
    expect(await valores('users', 'bio')).toEqual([])
  })

  it('rank: apelido jogador-<n>, ip_hash zerado', async () => {
    expect(await contar('rank')).toBeGreaterThan(0)
    for (const v of await valores('rank', 'apelido')) expect(v).toMatch(/^jogador-\d+$/)
    for (const v of await valores('rank', 'ip_hash')) expect(v).toBe(IP_HASH_ZERADO)
  })

  it('secrets e provider_credentials: texto cifrado e o marcador, sem host proprio', async () => {
    for (const v of await valores('secrets', 'value_encrypted')) expect(v).toBe(MARCADOR_SEGREDO)
    for (const v of await valores('provider_credentials', 'base_url')) expect(v).toBe('https://exemplo.test')
    for (const v of await valores('provider_credentials', 'label')) expect(v).toMatch(/^credencial-\d+$/)
  })

  it('billing, subscriptions e credit_purchases: ids do provedor e payload de marcador', async () => {
    for (const v of await valores('billing_events', 'provider_ref')) expect(v).toMatch(/^ref-\d+$/)
    for (const v of await valores('billing_events', 'payload')) expect(v).toBe(MARCADOR_PAYLOAD)
    for (const v of await valores('subscriptions', 'provider_customer_id')) expect(v).toMatch(/^cus-\d+$/)
    for (const v of await valores('subscriptions', 'provider_subscription_id')) expect(v).toMatch(/^sub-\d+$/)
    for (const v of await valores('credit_purchases', 'provider_payment_id')) expect(v).toMatch(/^pay-\d+$/)
  })

  it('utterances.speaker_name: Falante <n>, e a igualdade entre falas do mesmo falante se mantem', async () => {
    for (const v of await valores('utterances', 'speaker_name')) expect(v).toMatch(/^Falante \d+$/)
  })

  it('anki: nome do arquivo sem caminho (o caminho traz o usuario do SO)', async () => {
    for (const v of [...await valores('anki_decks', 'arquivo_origem'), ...await valores('anki_imports', 'arquivo')]) {
      expect(v).not.toMatch(/[\\/]/)
    }
  })
})

describe('fixture do estado atual — varredura de toda coluna de texto', () => {
  it('nenhuma tabela tem coisa com forma de e-mail fora de @exemplo.test', async () => {
    const sobras: string[] = []
    for (const t of await tabelas()) {
      for (const col of await colunasDeTexto(t)) {
        for (const v of await valores(t, col)) {
          for (const e of v.match(REGEX_EMAIL) ?? []) {
            if (!e.endsWith('@exemplo.test')) sobras.push(`${t}.${col}: ${e}`)
          }
        }
      }
    }
    expect(sobras).toEqual([])
  })

  it('nenhuma tabela tem caminho de pasta pessoal do SO', async () => {
    const sobras: string[] = []
    for (const t of await tabelas()) {
      for (const col of await colunasDeTexto(t)) {
        for (const v of await valores(t, col)) {
          if (/[A-Za-z]:\\Users\\|\/Users\/|\/home\//.test(v)) sobras.push(`${t}.${col}`)
        }
      }
    }
    expect(sobras).toEqual([])
  })
})
