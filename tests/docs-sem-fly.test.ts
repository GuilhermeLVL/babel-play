import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

// A documentação viva descreve o sistema real (Worker da Cloudflare + Postgres do Supabase + self-host
// por Docker). O Fly nunca recebeu deploy; ele só aparece nos registros históricos (ADRs, auditorias).
const raiz = join(__dirname, '..')
const PROIBIDO = /litestream|flyctl|fly\.toml|fly\.dev|\bFly\.io\b/i
const HISTORICO = ['auditoria', 'historico', 'specs', 'superpowers', 'prototipos', 'pesquisa', 'adr']

function markdowns(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) markdowns(caminho, acc)
    else if (nome.endsWith('.md')) acc.push(caminho)
  }
  return acc
}

const docs = readdirSync(join(raiz, 'docs'))
  .filter((n) => !HISTORICO.includes(n))
  .flatMap((n) => {
    const caminho = join(raiz, 'docs', n)
    return statSync(caminho).isDirectory() ? markdowns(caminho) : n.endsWith('.md') ? [caminho] : []
  })
const readmes = readdirSync(raiz)
  .filter((n) => /^README.*\.md$/.test(n))
  .map((n) => join(raiz, n))
const arquivos = [...docs, ...readmes].map((c) => relative(raiz, c))

describe('documentação sem Fly nem Litestream', () => {
  it.each(arquivos)('%s', (arquivo) => {
    expect(readFileSync(join(raiz, arquivo), 'utf8')).not.toMatch(PROIBIDO)
  })
})
