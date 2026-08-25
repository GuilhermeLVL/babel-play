/**
 * `erroDeRota` precisa expor a CAUSA do erro, não só a mensagem de superfície (P0-N1 da v2).
 *
 * O achado P1-6 da v1 existia porque diagnosticar o SQLITE_BUSY foi impossível: a mensagem
 * era cortada em 200 chars. O corte saiu, mas a causa continuou invisível por outro motivo —
 * o drizzle põe a mensagem do SQLite em `err.cause`, e o helper só olhava `message`/`stack`:
 *
 *   err.message = "Failed query: insert into sessions (...)"     ← inútil
 *   err.cause   = "SQLITE_ERROR: no such table: sessions"        ← o que importa
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { erroDeRota } from '../../server/lib/erroDeRota'

afterEach(() => vi.restoreAllMocks())

/** Captura o que foi para o console.error (é onde o operador lê). */
function capturarLog(fn: () => string) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const devolvido = fn()
  const logado = spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
  return { logado, devolvido }
}

describe('erroDeRota — a causa precisa chegar ao log', () => {
  it('erro simples: a mensagem vai para o log', () => {
    const { logado } = capturarLog(() => erroDeRota(new Error('falha simples'), { event: 't' }))
    expect(logado).toContain('falha simples')
  })

  it('erro COM cause: a causa aninhada também vai para o log', () => {
    const causa = new Error('SQLITE_ERROR: no such table: sessions')
    const erro = new Error('Failed query: insert into "sessions" ("id","created_at")')
    ;(erro as Error & { cause?: unknown }).cause = causa

    const { logado } = capturarLog(() => erroDeRota(erro, { event: 't' }))

    expect(logado).toContain('Failed query')          // a superfície
    expect(logado).toContain('no such table: sessions') // ← a causa, o que faltava
  })

  it('percorre a cadeia inteira de causas, não só o primeiro nível', () => {
    const raiz = new Error('SQLITE_BUSY: database is locked')
    const meio = new Error('erro intermediário')
    ;(meio as any).cause = raiz
    const topo = new Error('Failed query: ...')
    ;(topo as any).cause = meio

    const { logado } = capturarLog(() => erroDeRota(topo, { event: 't' }))
    expect(logado).toContain('database is locked')
  })

  it('não entra em laço infinito com cause circular', () => {
    const a = new Error('a')
    const b = new Error('b')
    ;(a as any).cause = b
    ;(b as any).cause = a

    const { logado } = capturarLog(() => erroDeRota(a, { event: 't' }))
    expect(logado).toContain('a')
    expect(logado).toContain('b')
  })

  it('a RESPOSTA ao cliente continua curta (não vaza schema)', () => {
    const causa = new Error('SQLITE_ERROR: no such table: sessions')
    const erro = new Error('Failed query: ' + 'x'.repeat(400))
    ;(erro as any).cause = causa

    const { devolvido } = capturarLog(() => erroDeRota(erro, { event: 't' }))
    expect(devolvido.length).toBeLessThanOrEqual(200)
  })

  it('funciona com valor lançado que não é Error', () => {
    const { logado, devolvido } = capturarLog(() => erroDeRota('string solta', { event: 't' }))
    expect(logado).toContain('string solta')
    expect(typeof devolvido).toBe('string')
  })
})
