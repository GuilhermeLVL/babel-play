/**
 * A MIGRAÇÃO 0049 (matriz v3, change `planos-v3-e-rota-inteligente`, ADR 0013): as flags e as ofertas
 * que citam NOMES de plano — `flags.regras.planos` e `flags.payload.gatilhos[].planos` — passam a
 * conhecer o Ao Vivo.
 *
 * A REGRA É UMA SÓ: toda lista que cita `premium` ganha `aovivo`. O Ao Vivo contém o Premium (a escada
 * da matriz, cobrada em `planos-matriz.test.ts`), então o que foi liberado ou dito ao assinante do
 * Premium vale para o do Ao Vivo — é assim que a `voz_natural`, semeada para `premium` e `selfhost`,
 * passa a valer para os planos com voz neural. O `essencial` NÃO entra em lista nenhuma: ele tem
 * menos que o Premium, e uma regra escrita para o plano de cima não é dele por omissão.
 *
 * Como em `planos-v2-migracao`: o banco nasce migrado, as linhas "antigas" são escritas DEPOIS, à mão,
 * e os UPDATEs da migração são reaplicados sobre elas. Reaplicar é idempotente.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

type Cliente = {
  execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Array<Record<string, unknown>> }>
}

const MIGRACAO = path.join('server', 'db', 'migrations', '0049_planos_v3.sql')
const updatesDaMigracao = () =>
  readFileSync(MIGRACAO, 'utf8')
    .split(/-->\s*statement-breakpoint/)
    .map((c) => c.replace(/--[^\n]*/g, '').trim())
    .filter((c) => /^UPDATE\b/i.test(c))

let h: EphemeralDb
let client: Cliente

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = ((await h.load('../../server/db/db')) as { client: Cliente }).client
})
afterAll(async () => {
  await h.cleanup()
})

const reaplicar = async () => {
  for (const c of updatesDaMigracao()) await client.execute(c)
}

async function flag(chave: string, regras: unknown, payload: unknown = null) {
  await client.execute({
    sql: `INSERT OR REPLACE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por)
          VALUES (?, 'teste', 1, ?, ?, 1, 'teste')`,
    args: [chave, JSON.stringify(regras), payload === null ? null : JSON.stringify(payload)],
  })
}

const lerFlag = async (chave: string) => {
  const l = (await client.execute({ sql: 'SELECT regras, payload FROM flags WHERE chave = ?', args: [chave] })).rows[0]
  return { regras: JSON.parse(String(l.regras)), payload: l.payload === null ? null : JSON.parse(String(l.payload)) }
}

describe('a migração', () => {
  it('é só de dado: dois UPDATEs, nenhum esquema', () => {
    const sql = readFileSync(MIGRACAO, 'utf8').replace(/--[^\n]*/g, '')
    expect(updatesDaMigracao()).toHaveLength(2)
    expect(sql).not.toMatch(/\b(ALTER|CREATE|DROP|DELETE|INSERT\s+INTO)\b/i)
  })

  it('traz a reversão escrita', () => {
    expect(readFileSync(MIGRACAO, 'utf8')).toMatch(/^-- REVERS[AÃ]O:/m)
  })
})

describe('as sementes, depois da migração', () => {
  it('`voz_natural` vale para os planos com voz neural: premium, selfhost e, agora, aovivo', async () => {
    const { regras } = await lerFlag('voz_natural')
    expect([...regras.planos].sort()).toEqual(['aovivo', 'premium', 'selfhost'])
    // E são exatamente os planos com `vozNatural` na matriz.
    const { PLAN_MATRIX, PLANOS_DE_ASSINATURA } = await import('../../src/core/planos')
    expect([...regras.planos].sort()).toEqual(
      PLANOS_DE_ASSINATURA.filter((p) => PLAN_MATRIX[p].entitlements.vozNatural).sort(),
    )
  })

  it('a nuvem de alívio continua só do Grátis, e as chaves da venda continuam sem regra de plano', async () => {
    expect((await lerFlag('nuvem_gratuita_alivio')).regras).toEqual({ planos: ['free'] })
    expect((await lerFlag('venda_planos_v3')).regras).toEqual({})
    expect((await lerFlag('stt_ao_vivo')).regras).toEqual({})
  })

  it('as ofertas semeadas não mudam: a venda segue só para o Grátis, e o payload passa no schema', async () => {
    const { payload } = await lerFlag('oferta_planos')
    const planos: string[] = payload.gatilhos.flatMap((g: { planos: string[] }) => g.planos)
    expect([...new Set(planos)].sort()).toEqual(['convidado', 'free'])
    const { ofertasSchema } = (await h.load('../../server/lib/ofertas')) as typeof import('../../server/lib/ofertas')
    const r = ofertasSchema.safeParse(payload)
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
  })
})

describe('flags.regras', () => {
  it('a lista que cita premium ganha aovivo, uma vez, e o resto da regra fica', async () => {
    await flag('teste_regras', { planos: ['free', 'premium'], percentual: 50, idiomas: ['pt'] })
    await reaplicar()
    const { regras } = await lerFlag('teste_regras')
    expect(regras).toEqual({ planos: ['free', 'premium', 'aovivo'], percentual: 50, idiomas: ['pt'] })
  })

  it('lista que já tem aovivo, lista sem premium e regra sem lista ficam intactas', async () => {
    await flag('teste_ja_tem', { planos: ['aovivo', 'premium'] })
    await flag('teste_sem_premium', { planos: ['free', 'essencial'] })
    await flag('teste_sem_lista', { percentual: 10 })
    await flag('teste_lista_vazia', { planos: [] })
    await reaplicar()
    expect((await lerFlag('teste_ja_tem')).regras).toEqual({ planos: ['aovivo', 'premium'] })
    expect((await lerFlag('teste_sem_premium')).regras).toEqual({ planos: ['free', 'essencial'] })
    expect((await lerFlag('teste_sem_lista')).regras).toEqual({ percentual: 10 })
    expect((await lerFlag('teste_lista_vazia')).regras).toEqual({ planos: [] })
  })

  it('o essencial não entra em lista nenhuma por omissão', async () => {
    const linhas = (await client.execute('SELECT chave, regras FROM flags')).rows
    for (const l of linhas) {
      if (l.chave === 'teste_sem_premium') continue
      expect(String(l.regras), String(l.chave)).not.toContain('essencial')
    }
  })

  it('a regra continua válida no schema do servidor, e o plano novo passa na avaliação', async () => {
    const { regrasSchema } = (await h.load('../../server/lib/flags')) as typeof import('../../server/lib/flags')
    const { regras } = await lerFlag('teste_regras')
    expect(regrasSchema.safeParse(regras).success).toBe(true)
    const { avaliarFlag } = await import('../../src/core/flags')
    const def = { chave: 'teste_regras', habilitada: true, regras: { planos: regras.planos } }
    expect(avaliarFlag(def, { plano: 'aovivo' })).toBe(true)
    expect(avaliarFlag(def, { plano: 'essencial' })).toBe(false)
  })
})

describe('flags.payload (gatilhos de oferta)', () => {
  it('o gatilho que cita premium ganha aovivo; os outros, a ordem e os demais campos ficam', async () => {
    await flag(
      'teste_payload',
      {},
      {
        gatilhos: [
          { id: 'a', planos: ['free', 'premium'], maxPorDia: 1 },
          { id: 'b', planos: ['free'] },
          { id: 'c', planos: ['premium', 'aovivo'] },
          { id: 'd', planos: ['convidado'] },
          { id: 'e', planos: ['premium'], titulo: { pt: 'Olá' } },
        ],
        outro: 7,
      },
    )
    await reaplicar()
    const { payload } = await lerFlag('teste_payload')
    expect(payload).toEqual({
      gatilhos: [
        { id: 'a', planos: ['free', 'premium', 'aovivo'], maxPorDia: 1 },
        { id: 'b', planos: ['free'] },
        { id: 'c', planos: ['premium', 'aovivo'] },
        { id: 'd', planos: ['convidado'] },
        { id: 'e', planos: ['premium', 'aovivo'], titulo: { pt: 'Olá' } },
      ],
      outro: 7,
    })
  })

  it('payload sem gatilhos, gatilho sem lista e payload de outra forma não são tocados', async () => {
    await flag('teste_sem_gatilhos', {}, { cor: 'premium' })
    await flag('teste_gatilho_sem_lista', {}, { gatilhos: [{ id: 'x' }] })
    await flag('teste_gatilhos_estranhos', {}, { gatilhos: ['premium', 3, null] })
    await reaplicar()
    expect((await lerFlag('teste_sem_gatilhos')).payload).toEqual({ cor: 'premium' })
    expect((await lerFlag('teste_gatilho_sem_lista')).payload).toEqual({ gatilhos: [{ id: 'x' }] })
    expect((await lerFlag('teste_gatilhos_estranhos')).payload).toEqual({ gatilhos: ['premium', 3, null] })
  })

  it('regra ou payload que não é JSON válido não derruba a migração nem é tocado', async () => {
    await client.execute(
      `INSERT OR REPLACE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em) VALUES ('teste_quebrada', '', 0, 'premium-nao-json', 'premium-nao-json', 1)`,
    )
    await reaplicar()
    const l = (await client.execute(`SELECT regras, payload FROM flags WHERE chave = 'teste_quebrada'`)).rows[0]
    expect(l).toEqual({ regras: 'premium-nao-json', payload: 'premium-nao-json' })
  })
})

describe('idempotência', () => {
  it('reaplicar não muda nada', async () => {
    const antes = (await client.execute('SELECT chave, regras, payload FROM flags ORDER BY chave')).rows
    await reaplicar()
    await reaplicar()
    expect((await client.execute('SELECT chave, regras, payload FROM flags ORDER BY chave')).rows).toEqual(antes)
  })
})

describe('a reversão escrita desfaz a migração', () => {
  it('rodar os UPDATEs da REVERSÃO tira o aovivo das listas que citam premium', async () => {
    const texto = readFileSync(MIGRACAO, 'utf8')
    // Os comandos da reversão estão entre crases, no bloco de comentário `-- REVERSÃO:`.
    const bloco = texto.slice(texto.search(/^-- REVERS[AÃ]O:/m))
    const comentario = bloco
      .split('\n')
      .filter((l, i, todas) => l.startsWith('--') && todas.slice(0, i).every((a) => a.startsWith('--')))
      .map((l) => l.replace(/^--\s?/, ''))
      .join('\n')
    const comandos = [...comentario.matchAll(/`(UPDATE[\s\S]*?)`/g)].map((m) => m[1])
    expect(comandos).toHaveLength(2)
    for (const c of comandos) await client.execute(c)
    expect((await lerFlag('voz_natural')).regras.planos.sort()).toEqual(['premium', 'selfhost'])
    expect((await lerFlag('teste_regras')).regras).toEqual({
      planos: ['free', 'premium'],
      percentual: 50,
      idiomas: ['pt'],
    })
    expect((await lerFlag('teste_payload')).payload.gatilhos[0]).toEqual({
      id: 'a',
      planos: ['free', 'premium'],
      maxPorDia: 1,
    })
    // E a migração volta a valer por cima (ida e volta).
    await reaplicar()
    expect((await lerFlag('voz_natural')).regras.planos.sort()).toEqual(['aovivo', 'premium', 'selfhost'])
  })
})
