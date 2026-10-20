/**
 * `.secrets.example.json` (modelo do `wrangler secret bulk`) lista só NOMES e precisa bater com o que
 * `server/lib/config.ts` declara como obrigatório (`producao`/`modo-publico`) ou `impede-servico`.
 * E o `scripts/cloudflare/secrets.ts` recusa chave com valor vazio (o wrangler a recusaria no meio do envio).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { nomesDosSecretsObrigatorios } from '../server/lib/config'

describe('.secrets.example.json', () => {
  it('lista exatamente as variáveis que config.ts marca como produção/modo-publico/impede-servico', () => {
    const exemplo = JSON.parse(readFileSync('.secrets.example.json', 'utf8')) as Record<string, string>
    expect(Object.keys(exemplo).sort()).toEqual(nomesDosSecretsObrigatorios())
    expect(Object.values(exemplo).every((v) => v === '')).toBe(true)
  })
})

describe('scripts/cloudflare/secrets.ts', () => {
  it('valor vazio é recusado (exit 1, com o nome), não enviado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secrets-'))
    try {
      const arquivo = join(dir, 'secrets.json')
      const dados = Object.fromEntries(nomesDosSecretsObrigatorios().map((n) => [n, 'VALOR-SECRETO-XYZ']))
      writeFileSync(arquivo, JSON.stringify({ ...dados, RESEND_API_KEY: '  ' }))
      const r = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/cloudflare/secrets.ts', 'staging', '--dry-run', '--arquivo', arquivo],
        { encoding: 'utf8' },
      )
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('RESEND_API_KEY')
      expect(r.stdout + r.stderr).not.toContain('VALOR-SECRETO-XYZ')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
