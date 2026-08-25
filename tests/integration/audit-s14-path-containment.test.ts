/**
 * REGRESSÃO — S-14: path traversal latente nas rotas de áudio. `resolveInAudioDir` contém o nome
 * dentro de AUDIO_DIR e recusa `../`. (server/routes/sessions.ts)
 *
 * Via harness efêmero: importar sessions.ts puxa o banco no load, então setamos DATABASE_URL antes
 * (o teste não toca o babel.db real).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let resolveInAudioDir: (name: string) => string
let AUDIO_DIR: string

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ resolveInAudioDir, AUDIO_DIR } = await h.load<{
    resolveInAudioDir: (name: string) => string; AUDIO_DIR: string
  }>('../../server/routes/sessions'))
})
afterAll(async () => { await h.cleanup() })

describe('S-14 — contenção de caminho de áudio', () => {
  it('resolve um nome normal dentro de AUDIO_DIR', () => {
    const p = resolveInAudioDir('abc-123.webm')
    expect(p).toBe(path.resolve(AUDIO_DIR, 'abc-123.webm'))
    expect(p.startsWith(path.resolve(AUDIO_DIR))).toBe(true)
  })
  it('recusa nomes que escapam do diretório (../ ou absoluto)', () => {
    expect(() => resolveInAudioDir('../../etc/passwd')).toThrow()
    expect(() => resolveInAudioDir('../secret.key')).toThrow()
    expect(() => resolveInAudioDir('/absolute/evil')).toThrow()
  })
})
