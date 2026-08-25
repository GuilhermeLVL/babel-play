/**
 * F11-02 — a resposta de erro não pode carregar o schema do banco.
 *
 * O achado foi MEDIDO, não inferido: um erro real do drizzle passado por `erroDeRota` devolvia
 * `Failed query: insert into "sessions" ("id", "created_at", …` — tabela mais 12 das 15 colunas.
 * E o truncamento em 200 caracteres descartava justamente a causa (`no such table`), que fica no
 * fim da mensagem. Ver `audit/evidence/fase-11/vazamento-de-erro.json`.
 *
 * Este teste exercita o caminho REAL — erro genuíno do driver, função real, rota Express com o
 * mesmo padrão dos ~20 handlers — e afirma as duas metades do conserto:
 *   1. o cliente não recebe schema;
 *   2. o servidor não PERDE a causa (senão o conserto seria só cegar quem opera).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'f11-02-'))
process.env.DATABASE_URL = 'file:' + path.join(dir, 'vazamento.db').split(path.sep).join('/')

const { db } = await import('../../server/db/db')
const { sessions } = await import('../../server/db/schema')
const { erroDeRota } = await import('../../server/lib/erroDeRota')

/** As colunas reais de `sessions` — server/db/schema.ts:31-43 mais o bloco `meta`. */
const COLUNAS = [
  'id', 'created_at', 'updated_at', 'user_id', 'deleted_at', 'title', 'kind',
  'started_at', 'ended_at', 'source_lang', 'target_lang', 'duration_ms',
  'word_count', 'status', 'meta',
]

let erroReal: unknown = null
let corpo = ''
let statusHttp = 0
let fechar: () => Promise<unknown>

beforeAll(async () => {
  // Nenhuma migration é aplicada de propósito: a tabela não existe e o insert falha NO DRIVER.
  // Um `new Error('Failed query: …')` fabricado mediria a nossa imitação da mensagem, não ela.
  try {
    await db.insert(sessions).values({
      id: 'f11-02', createdAt: Date.now(), updatedAt: Date.now(), title: 't', kind: 'live',
    })
  } catch (e) {
    erroReal = e
  }

  const app = express()
  // O padrão EXATO dos handlers: sessions.ts:109,130 · vocab.ts:33 · import.ts:65 · me.ts:34
  app.post('/api/sessions', (_req, res) => {
    res.status(500).json({
      error: erroDeRota(erroReal, { event: 'teste_f11_02', route: 'POST /api/sessions', requestId: 'req-teste' }),
    })
  })
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((r) => servidor.once('listening', r))
  const { port } = servidor.address() as AddressInfo
  const resp = await fetch(`http://127.0.0.1:${port}/api/sessions`, { method: 'POST' })
  statusHttp = resp.status
  corpo = await resp.text()
  fechar = () => new Promise((r) => servidor.close(r))
}, 30_000)

afterAll(async () => {
  await fechar?.()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})

/** O que o cliente lê depois de desserializar — é sobre isto que as asserções decidem. */
const entregue = (): string => {
  try { return String(JSON.parse(corpo)?.error ?? '') } catch { return corpo }
}

describe('F11-02 · o corpo da resposta', () => {
  it('o erro do drizzle aconteceu de verdade (senão o teste não mede nada)', () => {
    expect(erroReal).not.toBeNull()
    expect(String(erroReal)).toMatch(/Failed query/i)
    expect(statusHttp).toBe(500)
  })

  it('não contém o nome da tabela', () => {
    expect(entregue()).not.toMatch(/"?sessions"?/)
  })

  it('não contém NENHUMA das 15 colunas', () => {
    const vazadas = COLUNAS.filter((c) => entregue().includes(`"${c}"`))
    expect(vazadas, `colunas vazadas: ${vazadas.join(', ')}`).toEqual([])
  })

  it('não contém o SQL nem os parâmetros', () => {
    expect(entregue()).not.toMatch(/Failed query|insert into|values \(|params:/i)
  })

  it('traz o requestId, que é o elo com o log', () => {
    expect(entregue()).toContain('req-teste')
  })
})

describe('F11-02 · o outro lado do conserto — o servidor não perde a causa', () => {
  it('a causa completa vai para o console, com a cadeia e o stack', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      erroDeRota(erroReal, { event: 'teste_f11_02_log', route: 'POST /api/sessions' })
      const texto = espiao.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
      // É o que faltava ANTES do P1-6: o servidor guardar o que o cliente não pode ver.
      expect(texto).toMatch(/no such table|SQLITE/i)
      expect(texto).toMatch(/Failed query/i)
    } finally {
      espiao.mockRestore()
    }
  })
})
