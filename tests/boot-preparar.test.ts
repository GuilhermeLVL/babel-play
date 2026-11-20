/**
 * BOOT QUE FALHA DEIXA RASTRO (Fase 2, Task 5 — rodada de correção 1).
 *
 * `prepararDados()` relança a falha das migrations ou do seed (quem encerra o processo é o `server.ts`), mas
 * antes registra `boot_falhou` com o NOME da etapa, pelo `log('error')` — o que chega ao diário e ao Sentry.
 * Dublês: migrations passam, o seed lança. Nada de `process.exit` aqui.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../server/db/manutencao', () => ({ aplicarMigrations: vi.fn(async () => {}) }))
vi.mock('../server/db/seed', () => ({ seedIfEmpty: vi.fn(async () => Promise.reject(new Error('seed quebrou'))) }))
vi.mock('../server/lib/auth', () => ({ authRequired: () => false }))

import { prepararDados } from '../server/boot/preparar'
import { registrarSinkDeErro } from '../server/lib/logger'

const eventos: Array<Record<string, unknown>> = []
const soltar = registrarSinkDeErro((e) => eventos.push(e))
afterEach(() => {
  eventos.length = 0
})

describe('prepararDados com o seed falhando', () => {
  it('rejeita com a causa e registra boot_falhou com a etapa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(prepararDados()).rejects.toThrow('seed quebrou')
    expect(eventos).toContainEqual(expect.objectContaining({ event: 'boot_falhou', etapa: 'seed' }))
    expect(String(eventos.find((e) => e.event === 'boot_falhou')?.error)).toContain('seed quebrou')
    soltar()
  })
})
