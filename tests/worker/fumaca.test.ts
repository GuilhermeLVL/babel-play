/**
 * A FUMAÇA DO WORKER (Fase 2, Task 12): o app inteiro dentro do `wrangler dev` (workerd local, Hyperdrive
 * apontado a um Postgres 17 em Docker, R2 e assets simulados pelo Miniflare). As quatro verificações
 * moram em `scripts/worker/fumaca.mjs`: health com `banco: 'postgres'`, JWT ES256 → `/api/me`, upload de
 * 1 MB + leitura com `Range` (206) e um cron disparado por `/cdn-cgi/local/scheduled`.
 *
 * Sobe Docker e workerd e leva perto de um minuto: só roda com `WRANGLER_FUMACA=1`.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..')
const LIGADA = process.env.WRANGLER_FUMACA === '1'

describe('fumaça do Worker em wrangler dev', () => {
  it.skipIf(!LIGADA)(
    'health, JWT, upload com Range e cron passam (WRANGLER_FUMACA=1; precisa de Docker)',
    () => {
      const r = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'worker', 'fumaca.mjs')], {
        cwd: RAIZ,
        encoding: 'utf8',
        timeout: 280_000,
      })
      if (r.status !== 0) console.error(r.stdout, r.stderr)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('fumaça do Worker: 7/7')
    },
    300_000,
  )

  it.skipIf(LIGADA)('pulada: defina WRANGLER_FUMACA=1 (sobe Docker + wrangler dev)', () => {
    expect(LIGADA).toBe(false)
  })
})
