/**
 * `lerCompacto` devolve EXATAMENTE o que o driver devolveria (fix/rotas-caras).
 *
 * O JSON do SQLite escreve ponto flutuante com 15 algarismos; o double precisa de até 17. Este teste
 * põe na mesa os valores que quebrariam uma leitura ingênua — dízimas, subnormal, inteiro guardado em
 * coluna REAL, fração guardada em coluna INTEGER, texto com aspas e acento — e compara com a leitura
 * linha a linha do driver, valor a valor.
 */
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

describe('lerCompacto', () => {
  let h: EphemeralDb

  beforeAll(async () => {
    h = await setupEphemeralDb()
    const { client } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    await client.execute('CREATE TABLE compacta (id TEXT, r REAL, i INTEGER, t TEXT, ordem INTEGER)')
    const valores: Array<[string, unknown, unknown, unknown]> = [
      ['a', 0.1 + 0.2, 1790359645924, 'aspas " e \\ barra'],
      ['b', 1 / 3, 1790359645924.123, 'água, ÉCOLE, 中文'],
      ['c', 5e-324, null, null],
      ['d', 1e300, -7, ''],
      ['e', 2, 0, '12345'],
      ['f', null, 3.5, 'linha\nnova\ttab'],
      ['g', -0.8479304590728134, 2 ** 53 - 1, '0.30000000000000004'],
    ]
    for (const [k, [id, r, i, t]] of valores.entries()) {
      await client.execute({
        sql: 'INSERT INTO compacta VALUES (?, ?, ?, ?, ?)',
        args: [id, r, i, t, 100 - k] as never,
      })
    }
    // Texto numa coluna REAL (a afinidade não consegue converter): tem de continuar texto.
    await client.execute("INSERT INTO compacta VALUES ('h', 'abc', 1, 'x', 50)")
  })

  afterAll(async () => {
    await h.cleanup()
  })

  it('os mesmos valores, na mesma ordem, que a leitura linha a linha', async () => {
    const { client } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    const crus = (await client.execute('SELECT id, r, i, t FROM compacta WHERE ordem > 0 ORDER BY ordem DESC')).rows
    const esperado = crus.map((l) => ({ id: l.id, real: l.r, inteiro: l.i, texto: l.t }))
    const compacto = await lerCompacto(
      [
        ['id', 'id'],
        ['real', 'r'],
        ['inteiro', 'i'],
        ['texto', 't'],
      ],
      { tabela: 'compacta', onde: sql`ordem > ${0}`, ordem: 'ordem DESC' },
    )
    expect(compacto).toEqual(esperado)
    for (let k = 0; k < esperado.length; k++) {
      for (const c of ['real', 'inteiro', 'texto'] as const) {
        expect(Object.is((compacto[k] as Record<string, unknown>)[c], esperado[k][c]), `${esperado[k].id}.${c}`).toBe(
          true,
        )
      }
    }
  })

  it('com todos os reais na faixa conferida, é UMA consulta; um real fora dela (1e300, 5e-324) cai no driver', async () => {
    const { client } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    const execute = client.execute.bind(client)
    let n = 0
    client.execute = ((...a: Parameters<typeof execute>) => {
      n++
      return execute(...a)
    }) as typeof client.execute
    try {
      const semExtremo = await lerCompacto([['real', 'r']], {
        tabela: 'compacta',
        onde: sql`id NOT IN (${'c'}, ${'d'})`,
      })
      expect(n).toBe(1)
      expect(semExtremo).toHaveLength(6)
      n = 0
      const comExtremo = await lerCompacto([['real', 'r']], { tabela: 'compacta', onde: sql`id = ${'d'}` })
      expect(n).toBe(2)
      expect(comExtremo).toEqual([{ real: 1e300 }])
    } finally {
      client.execute = execute
    }
  })

  it('nenhuma linha é lista vazia', async () => {
    const { lerCompacto } = await h.load<typeof import('../../server/db/leituraCompacta')>(
      '../../server/db/leituraCompacta',
    )
    expect(await lerCompacto([['id', 'id']], { tabela: 'compacta', onde: sql`ordem < ${0}` })).toEqual([])
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
