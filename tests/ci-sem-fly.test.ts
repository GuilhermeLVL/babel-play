import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// O Fly nunca chegou à produção (ela é o Worker da Cloudflare + Postgres do Supabase). Este teste
// impede que a infraestrutura do Fly/Litestream volte pelo CI, pelo Dockerfile ou pelo package.json.
const raiz = join(__dirname, '..')
const PROIBIDO = /litestream|flyctl|fly\.toml|registry\.fly\.io|superfly\//i

const aposentados = [
  'fly.toml',
  'fly.staging.toml',
  'litestream.yml',
  'scripts/iniciar-container.sh',
  '.github/workflows/deploy.yml',
  '.github/workflows/implantar-ambiente.yml',
]

const workflows = readdirSync(join(raiz, '.github/workflows'))
  .filter((n) => n.endsWith('.yml'))
  .map((n) => `.github/workflows/${n}`)

describe('Fly e Litestream aposentados', () => {
  it.each(aposentados)('%s não existe mais', (arquivo) => {
    expect(existsSync(join(raiz, arquivo))).toBe(false)
  })

  it.each([...workflows, 'Dockerfile', 'package.json'])('%s não menciona Fly nem Litestream', (arquivo) => {
    expect(readFileSync(join(raiz, arquivo), 'utf8')).not.toMatch(PROIBIDO)
  })
})
