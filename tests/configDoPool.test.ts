/**
 * Os prazos e o tamanho do `pg.Pool` vindos do ambiente (revisão final da Fase 1, I3). Função pura:
 * nenhum banco aberto.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { configDoPool, PRAZOS_PADRAO_MS } from '../server/db/configDoPool'

describe('configDoPool', () => {
  it('sem variável: os padrões (5 conexões, 5 s para conectar, 30 s ociosa, 30/10/60 s no servidor)', () => {
    expect(configDoPool({})).toEqual({
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      options: '-c statement_timeout=30000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=60000',
    })
  })

  it('cada variável sobrescreve o seu prazo (com espaços em volta tolerados)', () => {
    const c = configDoPool({
      DB_POOL_MAX: '12',
      DB_CONNECT_TIMEOUT_MS: ' 800 ',
      DB_STATEMENT_TIMEOUT_MS: '15000',
      DB_LOCK_TIMEOUT_MS: '500',
      DB_IDLE_TX_TIMEOUT_MS: '20000',
    })
    expect(c.max).toBe(12)
    expect(c.connectionTimeoutMillis).toBe(800)
    expect(c.options).toBe(
      '-c statement_timeout=15000 -c lock_timeout=500 -c idle_in_transaction_session_timeout=20000',
    )
  })

  it('vazia vale como ausente', () => {
    expect(configDoPool({ DB_POOL_MAX: '  ' }).max).toBe(5)
  })

  it.each([
    ['DB_POOL_MAX', 'cinco'],
    ['DB_POOL_MAX', '0'],
    ['DB_CONNECT_TIMEOUT_MS', '-1'],
    ['DB_STATEMENT_TIMEOUT_MS', '1.5'],
    ['DB_LOCK_TIMEOUT_MS', '10s'],
    ['DB_IDLE_TX_TIMEOUT_MS', '1e3'],
  ])('%s=%s é recusada com o nome da variável (não cai no padrão em silêncio)', (nome, valor) => {
    expect(() => configDoPool({ [nome]: valor })).toThrow(new RegExp(`${nome} deve ser um inteiro positivo`))
  })

  it('o valor não entra na opção do servidor sem passar pela validação (nada de injeção em -c)', () => {
    expect(() => configDoPool({ DB_LOCK_TIMEOUT_MS: '500 -c search_path=x' })).toThrow(/DB_LOCK_TIMEOUT_MS/)
  })

  describe('DB_SESSION_OPTIONS', () => {
    it('ausente ou 1: envia options', () => {
      expect(configDoPool({}).options).toBeTypeOf('string')
      expect(configDoPool({ DB_SESSION_OPTIONS: '1' }).options).toBeTypeOf('string')
    })

    it('0: não envia options (pooler e Hyperdrive ignoram; vale o papel do banco)', () => {
      const c = configDoPool({ DB_SESSION_OPTIONS: '0' })
      expect('options' in c).toBe(false)
      expect(c.max).toBe(5)
    })

    it.each(['2', 'nao', 'true', '-1'])('%s é recusada com o nome da variável', (valor) => {
      expect(() => configDoPool({ DB_SESSION_OPTIONS: valor })).toThrow(/DB_SESSION_OPTIONS deve ser 0 ou 1/)
    })
  })

  it('a migration 0004 grava no papel os mesmos prazos padrão do pool (uma fonte de verdade)', () => {
    const sql = readFileSync('server/db/migrations-pg/0004_prazos_do_papel.sql', 'utf8')
    const s = (ms: number) => `''${ms / 1000}s''` // aspas dobradas: dentro do format()
    expect(sql).toContain(`SET statement_timeout = ${s(PRAZOS_PADRAO_MS.statement)}`)
    expect(sql).toContain(`SET lock_timeout = ${s(PRAZOS_PADRAO_MS.lock)}`)
    expect(sql).toContain(`SET idle_in_transaction_session_timeout = ${s(PRAZOS_PADRAO_MS.ociosaEmTx)}`)
  })

  it('a migration 0004 repete o ALTER ROLE em `tuple concurrently updated` (dois bancos do mesmo cluster, mesmo papel)', () => {
    const sql = readFileSync('server/db/migrations-pg/0004_prazos_do_papel.sql', 'utf8')
    expect(sql).toMatch(/FOR i IN 1\.\.10 LOOP/)
    expect(sql).toContain(`WHEN SQLSTATE 'XX000' THEN`)
    expect(sql).toContain(`SQLERRM LIKE '%tuple concurrently updated%' AND i < 10`)
    expect(sql).toMatch(/PERFORM pg_sleep\(0\.05 \* i\)/)
    expect(sql).toContain('WHEN insufficient_privilege THEN') // o caso sem privilégio continua avisando e seguindo
  })
})
