import { describe, expect, it } from 'vitest'

import { montarPgDump } from '../scripts/db/comando-pg-dump.mjs'

describe('montarPgDump', () => {
  const url = 'postgres://babel:p%40ss%2Fw0rd@db.interno:6543/meu%20banco?sslmode=require'

  it('não põe a senha (nem a URL) em nenhum argumento', () => {
    const { args, programa } = montarPgDump(url, '/tmp/x.dump', {})
    expect(programa).toBe('pg_dump')
    const argv = args.join(' ')
    expect(argv).not.toMatch(/p%40ss|p@ss|w0rd|postgres:\/\//)
    expect(args).toContain('--file=/tmp/x.dump')
  })

  it('entrega as credenciais pelo ambiente, decodificadas', () => {
    const { env } = montarPgDump(url, '/tmp/x.dump', { PATH: '/bin', PGUSER: 'outro' })
    expect(env).toMatchObject({
      PATH: '/bin',
      PGHOST: 'db.interno',
      PGPORT: '6543',
      PGUSER: 'babel',
      PGPASSWORD: 'p@ss/w0rd',
      PGDATABASE: 'meu banco',
      PGSSLMODE: 'require',
    })
  })

  it('sem sslmode na URL, não herda o do ambiente do pai', () => {
    const { env } = montarPgDump('postgresql://u:s@h/db', '/tmp/x.dump', { PGSSLMODE: 'disable' })
    expect(env.PGSSLMODE).toBeUndefined()
  })

  it('URL inválida: erro de mensagem fixa, sem a URL (nem a senha)', () => {
    let erro: Error | undefined
    try {
      montarPgDump('postgres://u:senha-secreta@[host-quebrado/db', '/tmp/x.dump', {})
    } catch (e) {
      erro = e as Error
    }
    expect(erro?.message).toMatch(/não é uma URL válida/)
    expect(String(erro?.stack) + String(erro?.message)).not.toContain('senha-secreta')
  })

  it('host IPv6 sai sem colchetes', () => {
    const { env } = montarPgDump('postgres://u:s@[::1]:5433/db', '/tmp/x.dump', {})
    expect(env.PGHOST).toBe('::1')
    expect(env.PGPORT).toBe('5433')
  })

  it('URL sem porta não define PGPORT (nem herda a do pai)', () => {
    const { env } = montarPgDump('postgres://u:s@h/db', '/tmp/x.dump', { PGPORT: '9999' })
    expect(env.PGPORT).toBeUndefined()
  })
})
