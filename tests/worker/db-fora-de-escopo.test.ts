/**
 * No Worker não há banco do processo: o `db` só existe dentro do `comExecutor` que o `worker.ts` abre por
 * requisição. Um acesso fora (timer, ouvinte sem escopo) falha alto — 503 `banco_indisponivel` — em vez de
 * abrir um Pool por isolate. O gancho `BABEL_RUNTIME=worker` faz o Node responder como o Worker.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { BancoIndisponivel, db } from '../../server/db/db'

const antes = process.env.BABEL_RUNTIME

afterEach(() => {
  if (antes === undefined) delete process.env.BABEL_RUNTIME
  else process.env.BABEL_RUNTIME = antes
})

describe('db fora de comExecutor no Worker', () => {
  it('lança BancoIndisponivel (503) com o motivo, sem abrir driver nenhum', () => {
    process.env.BABEL_RUNTIME = 'worker'
    let erro: unknown
    try {
      void db.select
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(BancoIndisponivel)
    expect((erro as BancoIndisponivel).status).toBe(503)
    expect((erro as Error).message).toMatch(/db fora de comExecutor/)
  })
})
