/**
 * `lerCompacto` devolve os valores EXATOS do banco (Postgres): o driver entrega `float8` sem passar
 * por JSON, então dízimas, subnormal e 1e300 voltam bit a bit; inteiros (`bigint`) voltam como número
 * e texto com aspas, acento e quebra de linha volta intacto.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const LINHAS: Array<[string, number | null, number | null, string | null, number]> = [
  ['a', 0.1 + 0.2, 1790359645924, 'aspas " e \\ barra', 100],
  ['b', 1 / 3, 42, 'água, ÉCOLE, 中文', 99],
  ['c', 5e-324, null, null, 98],
  ['d', 1e300, -7, '', 97],
  ['e', 2, 0, '12345', 96],
  ['f', null, 3, 'linha\nnova\ttab', 95],
  ['g', -0.8479304590728134, 2 ** 53 - 1, '0.30000000000000004', 94],
]

describe('lerCompacto', () => {
  let h: EphemeralDb

  beforeAll(async () => {
    h = await setupEphemeralDb()
    const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    await db.execute(sql`CREATE TABLE compacta (id text, r double precision, i bigint, t text, ordem bigint)`)
    for (const [id, r, i, t, ordem] of LINHAS) {
      await db.execute(sql`INSERT INTO compacta VALUES (${id}, ${r}, ${i}, ${t}, ${ordem})`)
    }
    await db.execute(sql`INSERT INTO compacta VALUES ('h', 0.5, 1, 'x', ${-1})`)
  })

  afterAll(async () => {
    await h.cleanup()
  })

  it('os mesmos valores, bit a bit, na ordem pedida, com as chaves pedidas', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    const compacto = await lerCompacto(
      [
        ['id', 'id', 'texto'],
        ['real', 'r'],
        ['inteiro', 'i'],
        ['texto', 't', 'texto'],
      ],
      { tabela: 'compacta', onde: sql`ordem > ${0}`, ordem: 'ordem DESC' },
    )
    const esperado = LINHAS.map(([id, r, i, t]) => ({ id, real: r, inteiro: i, texto: t }))
    expect(compacto).toEqual(esperado)
    for (const [k, e] of esperado.entries()) {
      for (const c of ['real', 'inteiro', 'texto'] as const) {
        expect(Object.is((compacto[k] as Record<string, unknown>)[c], e[c]), `${e.id}.${c}`).toBe(true)
      }
    }
    expect(Object.keys(compacto[0] as object)).toEqual(['id', 'real', 'inteiro', 'texto'])
  })

  it('reais extremos (1e300, 5e-324) voltam exatos na mesma consulta', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    expect(await lerCompacto([['real', 'r']], { tabela: 'compacta', onde: sql`id = ${'d'}` })).toEqual([
      { real: 1e300 },
    ])
    const [c] = await lerCompacto<{ real: number }>([['real', 'r']], { tabela: 'compacta', onde: sql`id = ${'c'}` })
    expect(Object.is(c.real, 5e-324)).toBe(true)
  })

  it('DISTINCT recorta repetidos', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    const r = await lerCompacto([['x', 'ordem']], { tabela: 'compacta', onde: sql`ordem < ${0}`, distinta: true })
    expect(r).toEqual([{ x: -1 }])
  })

  it('nenhuma linha é lista vazia', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    expect(await lerCompacto([['id', 'id']], { tabela: 'compacta', onde: sql`ordem < ${-5}` })).toEqual([])
  })

  it('recusa identificador que não seja nome simples (o nome vai cru para o SQL)', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    await expect(lerCompacto([['x', 'id; DROP TABLE compacta']], { tabela: 'compacta', onde: sql`1` })).rejects.toThrow(
      /identificador inválido/,
    )
    await expect(lerCompacto([['x', 'id']], { tabela: 'compacta', onde: sql`1`, ordem: 'id; --' })).rejects.toThrow(
      /ordem inválida/,
    )
  })
})
