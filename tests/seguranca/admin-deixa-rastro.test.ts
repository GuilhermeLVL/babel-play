/**
 * Mudar papel, situação ou plano de uma conta deixa rastro no log: QUEM mexeu em QUEM e o que mudou. Os dois ids saem
 * pseudonimizados (`u_…`), nunca o id real da conta (o logger não guarda dado de usuário).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const linhas: string[] = []

beforeAll(async () => {
  s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
  const { usersRepo } = await s.load('../../server/db/repositories/users')
  await usersRepo.ensure('rastro-admin')
  await usersRepo.setRole('rastro-admin', 'admin')
  await usersRepo.ensure('rastro-alvo')
  const original = console.log.bind(console)
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    linhas.push(String(a[0]))
    original(...a)
  })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await s.encerrar()
})

describe('rastro das ações de operador', () => {
  it('PATCH /users/:id e /users/:id/plan registram ator e alvo pseudonimizados', async () => {
    const t = await s.token('rastro-admin')
    expect((await s.patch('/api/admin/users/rastro-alvo', { status: 'suspended' }, t)).status).toBe(200)
    expect((await s.patch('/api/admin/users/rastro-alvo/plan', { plan: 'premium' }, t)).status).toBe(200)

    const eventos = linhas
      .map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
    const usuario = eventos.find((e) => e.event === 'admin_usuario_alterado')
    const plano = eventos.find((e) => e.event === 'admin_plano_concedido')
    expect(usuario).toMatchObject({ situacao: 'suspended' })
    expect(plano).toMatchObject({ plano: 'premium' })
    for (const e of [usuario, plano]) {
      expect(e.usuario).toMatch(/^u_/)
      expect(e.alvo).toMatch(/^u_/)
      expect(e.usuario).not.toBe(e.alvo)
    }
    expect(linhas.join('\n')).not.toContain('rastro-alvo')
  })
})
