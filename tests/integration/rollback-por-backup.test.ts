/**
 * Voltar atras por backup: `scripts/backup.mjs` produz uma copia que RESTAURA o banco.
 *
 * O script ja verifica a copia ao gravar (integrity_check + contagens). O que faltava provar era o
 * outro lado — que, depois de um estrago no banco vivo, copiar o arquivo do backup por cima devolve
 * um banco integro com as contagens de antes. Backup que nunca foi restaurado e uma esperanca.
 *
 * O script e so CLI (nao exporta funcao): e parametrizado por `DATABASE_URL` (env), `--destino=`
 * e `--sem-midia`. Aqui ele roda num processo filho apontado para uma copia da fixture
 * `tests/fixtures/banco-estado-atual.db`, fora do repositorio.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { type Client,createClient } from '@libsql/client'
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const FIXTURE = path.resolve(RAIZ, 'tests', 'fixtures', 'banco-estado-atual.db')
const SCRIPT = path.resolve(RAIZ, 'scripts', 'backup.mjs')
const FORMATO_DA_PASTA = /^\d{8}T\d{6}Z(-\d+)?$/

const dir = mkdtempSync(path.join(tmpdir(), 'babel-rollback-'))
const vivo = path.join(dir, 'vivo.db')
const destino = path.join(dir, 'backups')
const urlVivo = 'file:' + vivo.split(path.sep).join('/')

const abrir = (arquivo = vivo): Client => createClient({ url: 'file:' + arquivo.split(path.sep).join('/') })
const linhas = async (c: Client, sql: string) => (await c.execute(sql)).rows as Record<string, unknown>[]
const integridade = async (c: Client) => String(Object.values((await linhas(c, 'PRAGMA integrity_check'))[0])[0]).toLowerCase()
const contagens = async (c: Client) => {
  const r: Record<string, number> = {}
  const tabelas = (await linhas(c, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((x) => String(x.name))
  for (const t of tabelas) r[t] = Number(Object.values((await linhas(c, `SELECT COUNT(*) AS n FROM "${t}"`))[0])[0])
  return r
}

let original: Record<string, number>
let resultado: ReturnType<typeof spawnSync>
let arquivoDoBackup: string | undefined

beforeAll(async () => {
  copyFileSync(FIXTURE, vivo)
  const c = abrir()
  try { original = await contagens(c) } finally { c.close() }

  resultado = spawnSync(process.execPath, [SCRIPT, '--sem-midia', `--destino=${destino}`, '--manter=3'], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: urlVivo },
    encoding: 'utf8',
    timeout: 120_000,
  })
  const pastas = existsSync(destino) ? readdirSync(destino).filter((n) => FORMATO_DA_PASTA.test(n)) : []
  if (pastas.length) arquivoDoBackup = path.join(destino, pastas[0], 'babel.db')
})
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})

describe('rollback por backup — o script grava uma copia verificada', () => {
  it('scripts/backup.mjs sai com 0 e diz que verificou', () => {
    const saida = `${resultado.stdout ?? ''}\n${resultado.stderr ?? ''}`
    expect(resultado.status, saida).toBe(0)
    expect(saida).toContain('[backup] VACUUM INTO concluído')
    expect(saida).toContain('[backup] verificado: integrity_check ok')
    expect(saida).toContain('[backup] mídia PULADA (--sem-midia)')
  })

  it('a copia fica em <destino>/<carimbo>/babel.db, integra e com as contagens da origem', async () => {
    expect(arquivoDoBackup).toBeDefined()
    expect(existsSync(arquivoDoBackup!)).toBe(true)
    const c = abrir(arquivoDoBackup!)
    try {
      expect(await integridade(c)).toBe('ok')
      expect(await contagens(c)).toEqual(original)
    } finally { c.close() }
  })
})

describe('rollback por backup — estrago e restauracao', () => {
  it('o estrago no banco vivo e real: uma tabela some e metade dos cartoes vai embora', async () => {
    const c = abrir()
    try {
      // As FKs ficam desligadas para o estrago passar — e o que um DELETE por fora do app faria.
      await c.execute('PRAGMA foreign_keys = OFF')
      await c.execute('DROP TABLE vocab_occurrences')
      await c.execute('DELETE FROM vocab_cards WHERE rowid % 2 = 0')
      const depois = await contagens(c)
      expect(depois.vocab_occurrences).toBeUndefined()
      expect(depois.vocab_cards).toBeLessThan(original.vocab_cards)
    } finally { c.close() }
  })

  it('copiar o backup por cima do vivo devolve integrity_check ok, FKs limpas e as contagens originais', async () => {
    // Sob WAL o banco sao tres arquivos; restaurar so o .db com um -wal velho ao lado corrompe.
    // caracterizacao: no Windows, apagar o .db depois de `client.close()` do @libsql/client falha
    // com EPERM — o handle do arquivo sobrevive ao close (medido: ate um SELECT + close basta). E o
    // mesmo motivo do try/catch "OneDrive pode segurar" do harness. Sobrescrever no lugar
    // (`copyFileSync` por cima) funciona, e e o que um operador faria com `cp` de qualquer jeito.
    for (const sufixo of ['-wal', '-shm', '-journal']) {
      try { if (existsSync(vivo + sufixo)) rmSync(vivo + sufixo, { force: true }) } catch { /* ver acima */ }
    }
    copyFileSync(arquivoDoBackup!, vivo)

    const c = abrir()
    try {
      expect(await integridade(c)).toBe('ok')
      await c.execute('PRAGMA foreign_keys = ON')
      expect(await linhas(c, 'PRAGMA foreign_key_check')).toEqual([])
      expect(await contagens(c)).toEqual(original)
    } finally { c.close() }
  })

  it('o arquivo do backup continua la depois do restore (foi copiado, nao movido)', async () => {
    expect(existsSync(arquivoDoBackup!)).toBe(true)
    const c = abrir(arquivoDoBackup!)
    try { expect(await integridade(c)).toBe('ok') } finally { c.close() }
  })
})
