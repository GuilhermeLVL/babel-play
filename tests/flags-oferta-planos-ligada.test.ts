/**
 * A FLAG `oferta_planos` NASCE LIGADA (migração 0039 do SQLite, hoje semente da 0001 do Postgres;
 * decisão do dono de 29/09): banco novo e banco existente terminam iguais — flag ligada, com gatilhos para os seis momentos — e o convidado segue
 * desligado (`modo_convidado`, `nuvem_convidado`). O que o operador já mexeu não é sobrescrito.
 *
 * E o motor, com o payload SEMEADO (não um de teste): o Grátis que esbarra num recurso de nuvem
 * (402 com `entitlement`) vê `modelo_premium`, e as regras antichateação continuam valendo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ConfigDeOfertas } from '../src/core/ofertas'
import { momentoDaRecusa } from '../src/lib/ofertas/eventos'
import { decidirOferta, type EntradaDoMotor, HISTORICO_VAZIO, INICIO_SEM_OFERTA_MS } from '../src/lib/ofertas/motor'
import { clienteSql } from './harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'
import { sementesDeFlags } from './harness/sementesPg'

/* No Postgres a cadeia 0039 → 0041 → 0045 virou o estado final semeado pela 0001 (`sementesPg.ts`):
   reaplicar é rodar de novo aquelas sementes. */
const reaplicar = async () => {
  for (const c of sementesDeFlags()) await client.execute(c)
}

let h: EphemeralDb
let client: ReturnType<typeof clienteSql>
let config: ConfigDeOfertas

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  await h.cleanup()
})

const linha = async (chave: string) =>
  (await client.execute(`SELECT habilitada, payload, atualizado_por FROM flags WHERE chave = '${chave}'`)).rows[0]

describe('a semente no banco', () => {
  it('oferta_planos ligada, com gatilhos para os seis momentos, e o payload passa no schema', async () => {
    const l = await linha('oferta_planos')
    expect(l.habilitada).toBe(true)
    const { ofertasSchema } = (await h.load('../../server/lib/ofertas')) as typeof import('../server/lib/ofertas')
    const r = ofertasSchema.safeParse(JSON.parse(String(l.payload)))
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    config = r.data as ConfigDeOfertas
    expect(new Set(config.gatilhos.map((g) => g.momento))).toEqual(
      new Set(['fim_de_sessao', 'conquista', 'modelo_premium', 'fim_de_cota', 'cota_proxima', 'convidado_para_conta']),
    )
  })

  it('o convidado segue desligado', async () => {
    expect((await linha('modo_convidado')).habilitada).toBe(false)
    expect((await linha('nuvem_convidado')).habilitada).toBe(false)
  })

  it('a avaliação entrega a flag ligada, com payload, ao Grátis', async () => {
    const { avaliarParaContexto } = (await h.load('../../server/lib/flags')) as typeof import('../server/lib/flags')
    const f = (await avaliarParaContexto({ plano: 'free' })).oferta_planos
    expect(f.ligada).toBe(true)
    expect((f as { payload?: ConfigDeOfertas }).payload?.gatilhos.length).toBeGreaterThanOrEqual(6)
  })

  it('reaplicar é idempotente e NÃO sobrescreve o que o operador mudou', async () => {
    const antes = await linha('oferta_planos')
    await reaplicar()
    expect(await linha('oferta_planos')).toEqual(antes)

    await client.execute(
      `UPDATE flags SET habilitada = false, payload = '{"gatilhos":[]}', atualizado_por = 'admin-1' WHERE chave = 'oferta_planos'`,
    )
    await reaplicar()
    const depois = await linha('oferta_planos')
    expect(depois.habilitada).toBe(false)
    expect(depois.payload).toBe('{"gatilhos":[]}')
    expect(depois.atualizado_por).toBe('admin-1')
  })
})

describe('o motor com o payload semeado', () => {
  const AGORA = 1_800_000_000_000
  const entrada = (p: Partial<EntradaDoMotor>): EntradaDoMotor => ({
    momento: 'modelo_premium',
    flagLigada: true,
    config,
    plano: 'free',
    historico: HISTORICO_VAZIO,
    sessao: { inicio: AGORA - INICIO_SEM_OFERTA_MS - 1, promocionais: 0 },
    tela: { capturaAtiva: false, jogoAtivo: false, dialogoAberto: false },
    agora: AGORA,
    ...p,
  })

  it('Grátis com 402 de entitlement → modelo_premium aparece', () => {
    const momento = momentoDaRecusa(402, { error: 'x', entitlement: 'managedCloudLlm' })
    expect(momento).toBe('modelo_premium')
    const d = decidirOferta(entrada({ momento: momento! }))
    expect(d.mostrar).toBe(true)
  })

  it('fim de sessão e conquista têm gatilho (não caem em sem_gatilho)', () => {
    expect(decidirOferta(entrada({ momento: 'fim_de_sessao' })).mostrar).toBe(true)
    expect(decidirOferta(entrada({ momento: 'conquista' })).mostrar).toBe(true)
  })

  it('as regras antichateação continuam valendo', () => {
    const recusa = (p: Partial<EntradaDoMotor>) => {
      const d = decidirOferta(entrada(p))
      return d.mostrar === false ? d.motivo : null
    }
    expect(recusa({ sessao: { inicio: AGORA - 60_000, promocionais: 0 } })).toBe('inicio_da_sessao')
    expect(recusa({ sessao: { inicio: 0, promocionais: 1 } })).toBe('teto_da_sessao')
    expect(recusa({ historico: { ...HISTORICO_VAZIO, ultimaExibicao: AGORA - 60_000 } })).toBe('intervalo_global')
    expect(recusa({ tela: { capturaAtiva: true, jogoAtivo: false, dialogoAberto: false } })).toBe('ocupado')
    expect(recusa({ tela: { capturaAtiva: false, jogoAtivo: true, dialogoAberto: false } })).toBe('ocupado')
    expect(recusa({ plano: 'premium' })).toBe('plano_alvo')
    expect(recusa({ plano: 'convidado' })).toBe('convidado_primeiro_conta')
  })
})
