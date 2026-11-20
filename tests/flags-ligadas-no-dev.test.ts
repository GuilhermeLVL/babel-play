/**
 * `FLAGS_LIGADAS_NO_DEV`: o jeito de o dono ver as IAs do leitor no `npm run dev:local`. A prova que importa é a
 * NEGATIVA: em produção, com login exigido e no Worker, a variável não muda nada.
 */
import { describe, expect, it } from 'vitest'

import { flagsLigadasNoDev } from '../server/lib/flags'

const LISTA = 'ia_de_estudo,parceiro_de_leitura'
const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv

describe('flagsLigadasNoDev', () => {
  it('sem login e fora de produção: as flags da lista', () => {
    const r = flagsLigadasNoDev(env({ NODE_ENV: 'development', AUTH_REQUIRED: '0', FLAGS_LIGADAS_NO_DEV: LISTA }))
    expect([...r].sort()).toEqual(['ia_de_estudo', 'parceiro_de_leitura'])
  })

  it('sem a variável (o caso de produção, staging e CI): vazio', () => {
    expect(flagsLigadasNoDev(env({ NODE_ENV: 'development', AUTH_REQUIRED: '0' })).size).toBe(0)
    expect(flagsLigadasNoDev(env({ NODE_ENV: 'development', AUTH_REQUIRED: '0', FLAGS_LIGADAS_NO_DEV: '' })).size).toBe(
      0,
    )
  })

  it('NODE_ENV=production: vazio, mesmo com a variável e sem login', () => {
    expect(
      flagsLigadasNoDev(
        env({ NODE_ENV: 'production', AUTH_REQUIRED: '0', SELF_HOST: '1', FLAGS_LIGADAS_NO_DEV: LISTA }),
      ).size,
    ).toBe(0)
  })

  it('login exigido (staging e produção): vazio, em qualquer NODE_ENV', () => {
    expect(
      flagsLigadasNoDev(env({ NODE_ENV: 'development', AUTH_REQUIRED: '1', FLAGS_LIGADAS_NO_DEV: LISTA })).size,
    ).toBe(0)
    expect(flagsLigadasNoDev(env({ NODE_ENV: 'staging', AUTH_REQUIRED: '1', FLAGS_LIGADAS_NO_DEV: LISTA })).size).toBe(
      0,
    )
  })

  it('AUTH_REQUIRED ausente em produção vale como exigido', () => {
    expect(flagsLigadasNoDev(env({ NODE_ENV: 'production', FLAGS_LIGADAS_NO_DEV: LISTA })).size).toBe(0)
  })

  it('ignora chave fora do formato e espaços', () => {
    const r = flagsLigadasNoDev(
      env({ NODE_ENV: 'development', AUTH_REQUIRED: '0', FLAGS_LIGADAS_NO_DEV: ' ia_de_estudo , X-ruim,, 1abc' }),
    )
    expect([...r]).toEqual(['ia_de_estudo'])
  })
})
