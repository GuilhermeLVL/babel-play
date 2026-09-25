/**
 * FASE 6b — `operacao.cjs flags …` (`server/operacao/flags.ts`) contra o banco efêmero.
 * Listar, ligar, desligar e definir com a MESMA validação da rota admin; uso errado sai com 2.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let comando: typeof import('../../server/operacao/flags').comandoDeFlags

beforeAll(async () => {
  h = await setupEphemeralDb()
  comando = (await h.load<typeof import('../../server/operacao/flags')>('../../server/operacao/flags')).comandoDeFlags
})
afterAll(async () => {
  await h.cleanup()
})

async function rodar(...args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const codigo = await comando(args, { out: (l) => out.push(l), err: (l) => err.push(l) })
  return { codigo, out: out.join('\n'), err: err.join('\n') }
}

describe('flags pela CLI', () => {
  it('listar mostra as sementes', async () => {
    const r = await rodar('listar')
    expect(r.codigo).toBe(0)
    expect(r.out).toMatch(/desligada\s+modo_convidado/)
    expect(r.out).toMatch(/LIGADA\s+vender_planos/)
  })

  it('ligar e desligar gravam com atualizado_por=cli', async () => {
    expect((await rodar('ligar', 'modo_convidado')).out).toMatch(/LIGADA\s+modo_convidado/)
    const { flagsRepo } = await h.load<typeof import('../../server/db/repositories/flags')>(
      '../../server/db/repositories/flags',
    )
    expect((await flagsRepo.ler('modo_convidado'))!.atualizadoPor).toBe('cli')
    expect((await rodar('desligar', 'modo_convidado')).out).toMatch(/desligada\s+modo_convidado/)
  })

  it('definir valida regras e payload como a rota admin', async () => {
    const ok = await rodar('definir', 'nova_cli', '{"descricao":"da cli","habilitada":true,"regras":{"percentual":10}}')
    expect(ok.codigo).toBe(0)
    expect(ok.out).toContain('"percentual":10')
    const ruim = await rodar('definir', 'oferta_planos', '{"payload":{"gatilhos":[{"id":"x"}]}}')
    expect(ruim.codigo).toBe(1)
    expect(ruim.err).toMatch(/payload inválido/)
  })

  it('uso errado sai com 2', async () => {
    expect((await rodar()).codigo).toBe(2)
    expect((await rodar('ligar')).codigo).toBe(2)
    expect((await rodar('definir', 'x_y', '{nao json')).codigo).toBe(2)
    expect((await rodar('definir', 'x_y', '{"inventado":1}')).codigo).toBe(2)
  })
})
