/**
 * P0-7b — a VERSÃO do app: uma regra só, usada pelo build do cliente e pelo servidor.
 *
 * Cliente e servidor precisam dizer a MESMA string, senão o aviso de "nova versão" apareceria em
 * toda página. Por isso o servidor em produção lê o `versao.json` que o build do cliente gravou,
 * em vez de recalcular com um ambiente que pode ser outro.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lerVersaoDoBuild, montarVersao } from '../server/lib/versao'

describe('montarVersao', () => {
  it('sem commit conhecido, é só a versão do package.json', () => {
    expect(montarVersao('0.1.0', {})).toBe('0.1.0')
  })

  it('com GIT_SHA, acrescenta o sha curto (7) como metadado de build do semver', () => {
    expect(montarVersao('0.1.0', { GIT_SHA: '35bc2d6aa1b2c3d4e5f60718293a4b5c6d7e8f90' })).toBe('0.1.0+35bc2d6')
  })

  it('sem GIT_SHA, usa o SENTRY_RELEASE (o Dockerfile o preenche com o commit)', () => {
    expect(montarVersao('0.1.0', { SENTRY_RELEASE: 'e5c1ed9ffff' })).toBe('0.1.0+e5c1ed9')
  })

  it('GIT_SHA tem precedência sobre SENTRY_RELEASE', () => {
    expect(montarVersao('0.1.0', { GIT_SHA: 'aaaaaaa1', SENTRY_RELEASE: 'bbbbbbb2' })).toBe('0.1.0+aaaaaaa')
  })

  it('valor que não é sha (ex.: "babel-play@1.2") é ignorado em vez de ir parar na versão', () => {
    expect(montarVersao('0.1.0', { SENTRY_RELEASE: 'babel-play@1.2' })).toBe('0.1.0')
    expect(montarVersao('0.1.0', { GIT_SHA: '  ' })).toBe('0.1.0')
  })
})

describe('lerVersaoDoBuild', () => {
  it('lê o versao.json que o build do cliente gravou em dist/', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'versao-'))
    try {
      writeFileSync(path.join(dist, 'versao.json'), JSON.stringify({ versao: '9.9.9+abcdef1' }))
      expect(lerVersaoDoBuild(dist)).toBe('9.9.9+abcdef1')
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })

  it('sem arquivo, ou com arquivo inválido, devolve null (quem chama recalcula)', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'versao-'))
    try {
      expect(lerVersaoDoBuild(dist)).toBeNull()
      writeFileSync(path.join(dist, 'versao.json'), '{ quebrado')
      expect(lerVersaoDoBuild(dist)).toBeNull()
      writeFileSync(path.join(dist, 'versao.json'), JSON.stringify({ versao: 42 }))
      expect(lerVersaoDoBuild(dist)).toBeNull()
    } finally {
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
