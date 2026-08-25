/**
 * ISOLAMENTO DO BANCO NOS TESTES — roda ANTES de qualquer import de `server/db/db`.
 *
 * Por que existe: `.env` não define `DATABASE_URL`, então `server/db/db.ts` cai no default
 * `file:./data/babel.db` — O BANCO REAL DO DESENVOLVEDOR. Qualquer teste que importe `db`
 * sem o harness efêmero ter definido a variável antes acerta os dados de verdade.
 *
 * Não é hipótese: aconteceu. Um teste de migração chamou `aplicarMigrations()` sobre uma
 * instância de `db` já ligada ao caminho default e aplicou a migração 0006 no banco real.
 * Não houve perda (a migração só recria índices), mas podia ter havido.
 *
 * Este setup aponta o default para um arquivo descartável. O harness efêmero continua
 * criando o seu próprio por teste; isto é a rede embaixo — se alguém esquecer o harness,
 * o estrago fica num diretório temporário em vez do banco do usuário.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'

const dir = mkdtempSync(path.join(tmpdir(), 'babel-vitest-'))
process.env.DATABASE_URL = 'file:' + path.join(dir, 'isolado.db').split(path.sep).join('/')

// Migrations também: sem isto um teste poderia migrar a partir de um caminho inesperado.
process.env.MIGRATIONS_DIR ??= path.resolve(process.cwd(), 'server', 'db', 'migrations')

afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})
