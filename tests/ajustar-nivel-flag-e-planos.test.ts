/**
 * A FLAG E AS COTAS DO "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D, tarefas 0.2 (a flag) e D5 (as cotas)):
 * `ia_ajustar_nivel` nasce DESLIGADA, sem regra de plano, por semente idempotente nas duas cadeias; as cotas existem só em
 * `src/core/planos.ts` (0 no Grátis e no convidado, `null` no self-host); o estado da ferramenta segue a régua de motivos.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  estadoDasAcoesDoAjuste,
  estadoDoAjustarNivel,
  type FatosDoAjustarNivel,
} from '../src/core/leitura/ferramentasDeIa'
import {
  AJUSTES_DE_CAPITULO_MES_DOS_PAGOS,
  AJUSTES_DE_NIVEL_MES_DOS_PAGOS,
  FLAG_IA_AJUSTAR_NIVEL,
  PLAN_MATRIX,
  PLANO_CONVIDADO,
} from '../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

function migracao(pasta: string) {
  const dir = path.resolve('server/db', pasta)
  const arquivo = readdirSync(dir).find((n) => n.endsWith('.sql') && n.includes('flag_ia_ajustar_nivel'))
  expect(arquivo, `migração flag_ia_ajustar_nivel em ${pasta}`).toBeTruthy()
  const tag = arquivo!.replace(/\.sql$/, '')
  const num = tag.slice(0, 4)
  const snaps = readdirSync(path.join(dir, 'meta'))
    .filter((n) => n.endsWith('_snapshot.json'))
    .sort()
  const meu = snaps.indexOf(`${num}_snapshot.json`)
  const snap = (n: string) => JSON.parse(readFileSync(path.join(dir, `meta/${n}`), 'utf8'))
  return {
    tag,
    sql: readFileSync(path.join(dir, arquivo!), 'utf8'),
    journal: JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number }[]
    },
    snapshot: snap(snaps[meu]),
    snapshotAnterior: snap(snaps[meu - 1]),
  }
}

describe('migrações da flag ia_ajustar_nivel', () => {
  for (const pasta of ['migrations-pg', 'migrations-sqlite']) {
    it(`${pasta}: registrada no journal, when crescente, snapshot encadeado`, () => {
      const m = migracao(pasta)
      const i = m.journal.entries.findIndex((e) => e.tag === m.tag)
      expect(i).toBeGreaterThan(0)
      expect(m.journal.entries[i].when).toBeGreaterThan(m.journal.entries[i - 1].when)
      expect(m.snapshot.prevId).toBe(m.snapshotAnterior.id)
      expect(m.snapshot.id).not.toBe(m.snapshotAnterior.id)
    })

    it(`${pasta}: semeia a chave desligada, sem regra, sem sobrescrever`, () => {
      const m = migracao(pasta)
      expect(m.sql).toContain(`'${FLAG_IA_AJUSTAR_NIVEL}',`)
      expect(m.sql).toContain(pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'")
      expect(m.sql).toMatch(
        pasta === 'migrations-pg' ? /ON CONFLICT \(chave\) DO NOTHING/ : /INSERT OR IGNORE INTO flags/,
      )
    })
  }

  it('docs/flags.md e o painel (flag sensível) citam a chave', () => {
    expect(readFileSync('docs/flags.md', 'utf8')).toContain('| `ia_ajustar_nivel`')
    expect(readFileSync('src/components/views/admin/PainelFlags.tsx', 'utf8')).toMatch(/'ia_ajustar_nivel',/)
  })
})

describe('a cadeia PG aplicada (PGlite em memória)', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('nasce desligada com regras {}; reaplicar não desliga a que o operador ligou', async () => {
    const { db, linhas } = await h.load<typeof import('../server/db/db')>('../../server/db/db')
    const ler = async () =>
      linhas<{ habilitada: boolean; regras: string }>(
        await db.execute(sql`select habilitada, regras from flags where chave = 'ia_ajustar_nivel'`),
      )
    expect(await ler()).toEqual([{ habilitada: false, regras: '{}' }])
    await db.execute(sql`update flags set habilitada = true where chave = 'ia_ajustar_nivel'`)
    await db.execute(sql.raw(migracao('migrations-pg').sql))
    expect((await ler())[0].habilitada).toBe(true)
  })
})

describe('as cotas do ajuste de nível (só em planos.ts)', () => {
  it('0 no Grátis e no convidado; null no self-host; o teto dos pagos é o provisório da spec', () => {
    expect(PLAN_MATRIX.free.quotas.ajustesDeNivelMes).toBe(0)
    expect(PLAN_MATRIX.free.quotas.ajustesDeCapituloMes).toBe(0)
    expect(PLANO_CONVIDADO.quotas.ajustesDeNivelMes).toBe(0)
    expect(PLANO_CONVIDADO.quotas.ajustesDeCapituloMes).toBe(0)
    expect(PLAN_MATRIX.selfhost.quotas.ajustesDeNivelMes).toBeNull()
    expect(PLAN_MATRIX.selfhost.quotas.ajustesDeCapituloMes).toBeNull()
    expect([AJUSTES_DE_NIVEL_MES_DOS_PAGOS, AJUSTES_DE_CAPITULO_MES_DOS_PAGOS]).toEqual([60, 4])
    for (const plano of Object.values(PLAN_MATRIX)) {
      const { ajustesDeNivelMes: n, ajustesDeCapituloMes: c } = plano.quotas
      for (const v of [n, c]) expect(v === null || (Number.isInteger(v) && v >= 0)).toBe(true)
    }
  })
})

describe('o estado da ferramenta (a régua de motivos)', () => {
  const PAGO: FatosDoAjustarNivel = {
    flagLigada: true,
    temConta: true,
    nuvemRestritaPelaIdade: false,
    ajustesDeNivelMes: 60,
    ajustesDeCapituloMes: 4,
    online: true,
  }
  const com = (p: Partial<FatosDoAjustarNivel>, capitulo = false) => estadoDoAjustarNivel({ ...PAGO, ...p }, capitulo)

  it('a ordem: em-breve, entrar, idade, plano, cota, sem-conexao', () => {
    expect(com({})).toEqual({ disponivel: true })
    expect(com({ flagLigada: false, temConta: false })).toEqual({ disponivel: false, motivo: 'em-breve' })
    expect(com({ temConta: false, nuvemRestritaPelaIdade: true })).toEqual({ disponivel: false, motivo: 'entrar' })
    expect(com({ nuvemRestritaPelaIdade: true, ajustesDeNivelMes: 0 })).toEqual({ disponivel: false, motivo: 'idade' })
    expect(com({ ajustesDeNivelMes: 0, online: false })).toEqual({ disponivel: false, motivo: 'plano' })
    expect(com({ cotaEsgotada: { nivel: 'mes' }, online: false })).toEqual({
      disponivel: false,
      motivo: 'cota',
      janela: 'mes',
    })
    expect(com({ online: false })).toEqual({ disponivel: false, motivo: 'sem-conexao' })
  })

  it('plano 0 sem a capacidade: motivo `plano`, nenhuma chamada seria feita', () => {
    expect(com({ ajustesDeNivelMes: 0 })).toEqual({ disponivel: false, motivo: 'plano' })
    expect(com({ ajustesDeNivelMes: null })).toEqual({ disponivel: true })
  })

  it('o capítulo tem a cota dele, separada', () => {
    expect(com({ ajustesDeCapituloMes: 0 }, true)).toEqual({ disponivel: false, motivo: 'plano' })
    expect(com({ ajustesDeCapituloMes: 0 }, false)).toEqual({ disponivel: true })
    expect(com({ cotaEsgotada: { capitulo: 'mes' } }, true)).toMatchObject({ motivo: 'cota' })
    expect(com({ cotaEsgotada: { capitulo: 'mes' } }, false)).toEqual({ disponivel: true })
  })

  it('todas as ações de 1 toque passam pelo MESMO estado', () => {
    const livre = estadoDasAcoesDoAjuste(PAGO)
    expect(Object.values(livre).every((e) => e.disponivel)).toBe(true)
    const barrado = estadoDasAcoesDoAjuste({ ...PAGO, nuvemRestritaPelaIdade: true })
    expect(Object.keys(barrado).sort()).toEqual(['ajustar', 'elevar', 'exemplo', 'gramatica', 'resumo', 'simplificar'])
    for (const e of Object.values(barrado)) expect(e).toEqual({ disponivel: false, motivo: 'idade' })
  })
})
