/**
 * O PAYLOAD V2 DAS OFERTAS (C8, migração 0045) — os textos da matriz v2 no banco.
 *
 * A semente da 0039 vendia "os planos pagos" e a IA de nuvem "mais precisa que a do aparelho"
 * (vender qualidade pega mal — decisão do dono), e a 0041 só tirou o `essencial` das listas. A 0045
 * troca os textos pelos do Premium: a Tradução Nuance, a nuvem, o aparelho que continua sem limite.
 *
 * 1. O payload do banco migrado passa no schema, cobre os seis momentos e nenhum texto fala de
 *    qualidade, de precisão, de `%` ou dos planos antigos; "sem limite no dia a dia" nunca aparece sem
 *    o uso justo ao lado (CDC).
 * 2. Promocional só para o Grátis (e a conta para o convidado): o Premium nunca é alvo.
 * 3. A variante `v2` separa, nas métricas do funil, a conversão dos textos novos da dos antigos.
 * 4. Só a linha da SEMENTE muda: o que o operador editou fica; reaplicar é idempotente.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ConfigDeOfertas, TextoRemoto } from '../src/core/ofertas'
import { clienteSql } from './harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'
import { sementesDeFlags } from './harness/sementesPg'

/* A 0045 do SQLite virou parte do estado final semeado pela 0001 do Postgres (`sementesPg.ts`):
   reaplicar é rodar de novo aquelas sementes. */
const reaplicar = async () => {
  for (const c of sementesDeFlags()) await client.execute(c)
}

let h: EphemeralDb
let client: ReturnType<typeof clienteSql>

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  await h.cleanup()
})

const linha = async () =>
  (await client.execute(`SELECT habilitada, payload, atualizado_por FROM flags WHERE chave = 'oferta_planos'`)).rows[0]

const textos = (t: TextoRemoto): string[] => (typeof t === 'string' ? [t] : Object.values(t))

describe('o payload v2 no banco migrado', () => {
  let config: ConfigDeOfertas

  it('passa no schema e cobre os seis momentos', async () => {
    const { ofertasSchema } = (await h.load('../../server/lib/ofertas')) as typeof import('../server/lib/ofertas')
    const l = await linha()
    const r = ofertasSchema.safeParse(JSON.parse(String(l.payload)))
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    config = r.data as ConfigDeOfertas
    expect(new Set(config.gatilhos.map((g) => g.momento))).toEqual(
      new Set(['fim_de_sessao', 'conquista', 'modelo_premium', 'fim_de_cota', 'cota_proxima', 'convidado_para_conta']),
    )
    expect(Number(l.habilitada)).toBe(1)
  })

  it('nenhum texto vende qualidade, precisão, porcentagem ou os planos antigos', () => {
    for (const g of config.gatilhos) {
      for (const x of [...textos(g.titulo), ...textos(g.texto), ...textos(g.cta)]) {
        expect(x, g.id).not.toMatch(/qualidade|quality|calidad|precis|accura|%/i)
        expect(x, g.id).not.toMatch(/planos pagos|paid plans|planes de pago|Essencial|\bPro\b/i)
        if (/sem limite no dia a dia/i.test(x)) expect(x, g.id).toMatch(/uso justo/i)
      }
    }
  })

  it('os textos em português falam do Premium e da Tradução Nuance, e o aparelho segue sem limite', () => {
    const pt = config.gatilhos.flatMap((g) => [g.titulo, g.texto, g.cta]).map((t) => (typeof t === 'string' ? t : t.pt))
    expect(pt.join(' ')).toMatch(/Premium/)
    expect(pt.join(' ')).toMatch(/Tradução Nuance/)
    expect(pt.join(' ')).toMatch(/no seu aparelho, sem limite/)
  })

  it('promocional só para o Grátis e a conta só para o convidado: o Premium nunca é alvo', () => {
    for (const g of config.gatilhos) {
      expect(g.planos, g.id).not.toContain('premium')
      if (g.momento === 'convidado_para_conta') expect(g.planos).toEqual(['convidado'])
      else expect(g.planos).toEqual(['free'])
    }
  })

  it('a variante v2 marca os textos novos nas métricas do funil', () => {
    for (const g of config.gatilhos) expect(g.variante, g.id).toBe('v2')
  })
})

describe('a migração', () => {
  it('reaplicar é idempotente e NÃO sobrescreve o que o operador mudou', async () => {
    const antes = await linha()
    await reaplicar()
    expect(await linha()).toEqual(antes)

    await client.execute(
      `UPDATE flags SET payload = '{"gatilhos":[]}', atualizado_por = 'admin-1' WHERE chave = 'oferta_planos'`,
    )
    await reaplicar()
    const depois = await linha()
    expect(depois.payload).toBe('{"gatilhos":[]}')
    expect(depois.atualizado_por).toBe('admin-1')
  })
})
