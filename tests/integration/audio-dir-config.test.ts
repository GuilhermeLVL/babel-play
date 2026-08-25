/**
 * Áudio de sessão — diretório CONFIGURÁVEL (correção do P0-3 da auditoria).
 *
 * `AUDIO_DIR` era derivado de `process.cwd()` sem nenhum override, então o arquivo ficava
 * preso ao disco local da réplica que recebeu o upload. Medido: réplica em outro disco
 * respondia `404 arquivo ausente` (docs/audit/04-scalability.md §4).
 *
 * Com override por env, todas as réplicas podem apontar para o MESMO volume compartilhado.
 * A contenção de path (S-14) tem de continuar valendo sobre o diretório configurado.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import path from 'node:path'
import { resolverAudioDir } from '../../server/routes/sessions'

const ORIG = process.env.AUDIO_DIR

afterEach(() => {
  if (ORIG === undefined) delete process.env.AUDIO_DIR
  else process.env.AUDIO_DIR = ORIG
})

/**
 * Recarrega o módulo para reavaliar o env. Continua existindo porque UM caso ainda precisa dele
 * (`resolveInAudioDir` fecha sobre a const de módulo), mas os dois casos da REGRA passaram a usar
 * a função pura `resolverAudioDir` — que é o conserto da instabilidade descrita nela.
 */
async function carregar() {
  vi.resetModules()
  return await import('../../server/routes/sessions') as any
}

describe('AUDIO_DIR', () => {
  it('sem env: cai no diretório local de sempre (compatibilidade do self-host)', () => {
    expect(resolverAudioDir({} as NodeJS.ProcessEnv)).toBe(path.join(process.cwd(), 'data', 'audio'))
  })

  it('com env: honra o caminho configurado (volume compartilhado entre réplicas)', () => {
    const alvo = path.join(path.sep, 'mnt', 'compartilhado', 'audio')
    expect(resolverAudioDir({ AUDIO_DIR: alvo } as NodeJS.ProcessEnv)).toBe(path.resolve(alvo))
  })

  it('a contenção de path continua valendo sobre o diretório configurado', async () => {
    process.env.AUDIO_DIR = path.join(path.sep, 'mnt', 'compartilhado', 'audio')
    const { resolveInAudioDir, AUDIO_DIR } = await carregar()

    expect(resolveInAudioDir('abc.webm')).toBe(path.join(AUDIO_DIR, 'abc.webm'))
    expect(() => resolveInAudioDir('../fora.webm')).toThrow()
    expect(() => resolveInAudioDir('../../etc/passwd')).toThrow()
  })
})
