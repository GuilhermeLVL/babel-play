/**
 * A TRAVA DE DIRETÓRIO DO PGLITE (`<dir>/.babel-lock`, revisão final da Fase 1, I2).
 *
 * O PGlite não trava o diretório: dois processos no mesmo `pglite:<dir>` subiam os dois e perdiam
 * escritas em silêncio. Aqui: dono vivo → recusa com pid e diretório; dono morto → trava velha,
 * sobrescrita; `fecharBanco()` solta; e um SEGUNDO PROCESSO de verdade (tsx importando `db.ts`)
 * contra o diretório aberto por este falha com o erro da trava.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { ARQUIVO_DA_TRAVA, travarDiretorio } from '../../server/db/travaDoPglite'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const pastas: string[] = []
const filhos: ChildProcess[] = []

function pastaNova(): string {
  const p = mkdtempSync(path.join(tmpdir(), 'pglite-trava-'))
  pastas.push(p)
  return p
}

const trava = (dir: string) => JSON.parse(readFileSync(path.join(dir, ARQUIVO_DA_TRAVA), 'utf8'))

afterAll(() => {
  for (const f of filhos) f.kill('SIGKILL')
  for (const p of pastas) rmSync(p, { recursive: true, force: true })
})

describe('travarDiretorio', () => {
  it('trava com o pid DESTE processo (aberto de novo aqui) → recusa, com pid e diretório na mensagem', () => {
    const dir = pastaNova()
    const soltar = travarDiretorio(dir)
    try {
      expect(trava(dir).pid).toBe(process.pid)
      expect(() => travarDiretorio(dir)).toThrow(`já está aberto pelo processo ${process.pid}`)
      expect(() => travarDiretorio(dir)).toThrow(dir)
    } finally {
      soltar()
    }
    expect(existsSync(path.join(dir, ARQUIVO_DA_TRAVA))).toBe(false)
  })

  it('trava de OUTRO processo vivo → recusa e diz como seguir', () => {
    const dir = pastaNova()
    const vivo = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' })
    filhos.push(vivo)
    writeFileSync(
      path.join(dir, ARQUIVO_DA_TRAVA),
      JSON.stringify({ pid: vivo.pid, host: hostname(), em: new Date().toISOString() }),
    )
    expect(() => travarDiretorio(dir)).toThrow(new RegExp(`processo ${vivo.pid}`))
    expect(() => travarDiretorio(dir)).toThrow(/Pare esse processo.*apague/s)
    expect(trava(dir).pid).toBe(vivo.pid) // não mexeu na trava alheia
    vivo.kill('SIGKILL')
  })

  it('trava de um pid MORTO → trava velha: abre e a reescreve com este processo', () => {
    const dir = pastaNova()
    const morto = spawnSync(process.execPath, ['-e', ''])
    expect(morto.status).toBe(0)
    writeFileSync(path.join(dir, ARQUIVO_DA_TRAVA), JSON.stringify({ pid: morto.pid, host: hostname() }))
    const soltar = travarDiretorio(dir)
    try {
      expect(trava(dir).pid).toBe(process.pid)
      expect(trava(dir).host).toBe(hostname())
      expect(Date.parse(trava(dir).em)).not.toBeNaN()
    } finally {
      soltar()
    }
  })

  it('o MESMO pid de uma encarnação anterior (contêiner reiniciado após SIGKILL) → trava velha', () => {
    const dir = pastaNova()
    writeFileSync(
      path.join(dir, ARQUIVO_DA_TRAVA),
      JSON.stringify({ pid: process.pid, host: hostname(), inicio: '2000-01-01T00:00:00.000Z' }),
    )
    const soltar = travarDiretorio(dir)
    try {
      expect(trava(dir).inicio).not.toBe('2000-01-01T00:00:00.000Z')
    } finally {
      soltar()
    }
  })
})

describe('db.ts com pglite:<dir>', () => {
  it('abre com a trava, um segundo PROCESSO é recusado, e fecharBanco() a solta', async () => {
    const dir = pastaNova()
    process.env.DATABASE_URL = `pglite:${dir}`
    const m = await import('../../server/db/db')
    await m.dbReady()
    expect(trava(dir).pid).toBe(process.pid)

    /* O segundo processo de verdade: tsx importando db.ts sobre o mesmo diretório. */
    const filho = spawnSync(
      process.execPath,
      [
        path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        '-e',
        "import('./server/db/db.ts').then((m) => m.dbReady()).then(() => { console.log('ABRIU'); process.exit(0) })",
      ],
      {
        cwd: RAIZ,
        env: { ...process.env, DATABASE_URL: `pglite:${dir}`, DOTENV_CONFIG_PATH: path.join(dir, 'sem-env') },
        encoding: 'utf8',
        timeout: 60_000,
      },
    )
    const saida = `${filho.stdout}\n${filho.stderr}`
    expect(filho.status).not.toBe(0)
    expect(saida).not.toContain('ABRIU')
    expect(saida).toContain(`já está aberto pelo processo ${process.pid}`)
    expect(saida).toContain(dir)

    await m.fecharBanco()
    expect(existsSync(path.join(dir, ARQUIVO_DA_TRAVA))).toBe(false)
  }, 90_000)
})
