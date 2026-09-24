/**
 * GAP-003 (auditoria 2026-09-13). `AUTH_REQUIRED=0` era honrado mesmo em produção: o único efeito
 * era um warning, e a imagem Docker faz bind em 0.0.0.0. Um erro de env deixava o app inteiro
 * acessível como "dono local". Em produção, auth desligada tem de ABORTAR o boot (fail-closed).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { erroDeAuthEmProducao } from '../server/lib/auth'

const orig = { node: process.env.NODE_ENV, auth: process.env.AUTH_REQUIRED, self: process.env.SELF_HOST }
afterEach(() => {
  process.env.NODE_ENV = orig.node
  if (orig.auth === undefined) delete process.env.AUTH_REQUIRED
  else process.env.AUTH_REQUIRED = orig.auth
  if (orig.self === undefined) delete process.env.SELF_HOST
  else process.env.SELF_HOST = orig.self
})

describe('GAP-003 — auth fail-closed em produção', () => {
  it('produção + AUTH_REQUIRED=0 → aborta', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_REQUIRED = '0'
    expect(erroDeAuthEmProducao()).toMatch(/AUTH_REQUIRED/)
  })

  it('produção + AUTH_REQUIRED ausente → ok (ausente em prod já liga a auth)', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.AUTH_REQUIRED
    expect(erroDeAuthEmProducao()).toBeNull()
  })

  it('produção + AUTH_REQUIRED=1 → ok', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_REQUIRED = '1'
    expect(erroDeAuthEmProducao()).toBeNull()
  })

  it('self-host (NODE_ENV≠production) + AUTH_REQUIRED=0 → ok', () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_REQUIRED = '0'
    expect(erroDeAuthEmProducao()).toBeNull()
  })

  /* A instalação pessoal SEM login também roda o build de produção (a imagem Docker fixa
     NODE_ENV=production). Ela continua possível, mas só com DUAS escolhas explícitas: um
     `AUTH_REQUIRED=0` esquecido sozinho ainda aborta — que é o erro que o GAP-003 fecha. */
  it('produção + AUTH_REQUIRED=0 + SELF_HOST=1 → ok (instalação pessoal declarada)', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_REQUIRED = '0'
    process.env.SELF_HOST = '1'
    expect(erroDeAuthEmProducao()).toBeNull()
  })

  it('produção + AUTH_REQUIRED=0 + SELF_HOST com outro valor → aborta', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_REQUIRED = '0'
    process.env.SELF_HOST = 'true'
    expect(erroDeAuthEmProducao()).toMatch(/SELF_HOST=1/)
  })
})
