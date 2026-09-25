/**
 * `scripts/release.mjs` — sobe a versão, data o CHANGELOG e só IMPRIME os comandos de tag.
 * A parte de ponta a ponta roda a CLI de verdade num diretório temporário (nunca no repositório).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { moverUnreleased, proximaVersao } from '../scripts/release.mjs'

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'release.mjs')

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- Coisa nova.

## [0.1.0] — 2026-08-25

First public release.
`

describe('proximaVersao', () => {
  it.each([
    ['0.1.0', 'patch', '0.1.1'],
    ['0.1.9', 'minor', '0.2.0'],
    ['0.9.3', 'major', '1.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
  ])('%s + %s = %s', (atual, tipo, esperado) => {
    expect(proximaVersao(atual, tipo)).toBe(esperado)
  })
  it('recusa versão que não é X.Y.Z e tipo desconhecido', () => {
    expect(() => proximaVersao('1.0', 'patch')).toThrow(/semver/)
    expect(() => proximaVersao('1.0.0-beta.1', 'patch')).toThrow(/semver/)
    expect(() => proximaVersao('1.0.0', 'grande')).toThrow(/inválido/)
  })
})

describe('moverUnreleased', () => {
  it('leva o bloco para a versão datada e deixa [Unreleased] vazio no topo', () => {
    const novo = moverUnreleased(CHANGELOG, '0.2.0', '2026-09-25')
    expect(novo).toContain('## [Unreleased]\n\n## [0.2.0] — 2026-09-25\n\n### Added\n\n- Coisa nova.\n\n## [0.1.0]')
    expect(novo.indexOf('## [Unreleased]')).toBeLessThan(novo.indexOf('## [0.2.0]'))
    expect(novo).toContain('First public release.')
  })
  it('recusa [Unreleased] vazio, ausente, ou versão repetida', () => {
    const vazio = moverUnreleased(CHANGELOG, '0.2.0', '2026-09-25')
    expect(() => moverUnreleased(vazio, '0.3.0', '2026-09-26')).toThrow(/vazio/)
    expect(() => moverUnreleased('# Changelog\n', '0.2.0', '2026-09-25')).toThrow(/Unreleased/)
    expect(() => moverUnreleased(CHANGELOG, '0.1.0', '2026-09-25')).toThrow(/já tem/)
  })
})

describe('CLI num diretório temporário', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'release-'))
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2))
    writeFileSync(
      path.join(dir, 'package-lock.json'),
      JSON.stringify({ name: 'x', version: '0.1.0', packages: { '': { name: 'x', version: '0.1.0' } } }, null, 2),
    )
    writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const rodar = (...args: string[]) =>
    execFileSync(process.execPath, [SCRIPT, ...args, `--raiz=${dir}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  it('minor: atualiza package.json, lock e CHANGELOG, e só imprime os comandos de tag', () => {
    const saida = rodar('minor', '--data=2026-09-25')
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version).toBe('0.2.0')
    const lock = JSON.parse(readFileSync(path.join(dir, 'package-lock.json'), 'utf8'))
    expect([lock.version, lock.packages[''].version]).toEqual(['0.2.0', '0.2.0'])
    expect(readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')).toContain('## [0.2.0] — 2026-09-25')
    expect(saida).toContain('git tag -a v0.2.0 -m "v0.2.0"')
    expect(saida).toContain('Nada foi commitado nem marcado')
  })

  it('recusa sem mexer em nada quando o [Unreleased] está vazio', () => {
    rodar('patch', '--data=2026-09-25')
    const antes = readFileSync(path.join(dir, 'package.json'), 'utf8')
    let codigo = 0
    try {
      rodar('patch', '--data=2026-09-26')
    } catch (e) {
      codigo = (e as { status: number }).status
    }
    expect(codigo).toBe(1)
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe(antes)
  })

  it('uso errado sai com 2', () => {
    let codigo = 0
    try {
      rodar('grande')
    } catch (e) {
      codigo = (e as { status: number }).status
    }
    expect(codigo).toBe(2)
  })
})
