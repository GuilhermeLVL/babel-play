/**
 * Os prazos e o tamanho do `pg.Pool` vindos do ambiente (revisão final da Fase 1, I3). Função pura:
 * nenhum banco aberto.
 */
import { describe, expect, it } from 'vitest'

import { configDoPool } from '../server/db/configDoPool'

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
})
