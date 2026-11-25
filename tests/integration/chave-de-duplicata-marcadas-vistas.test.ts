/**
 * A REESCRITA DA CHAVE TAMBÉM EM `palavras_marcadas` E `palavras_vistas` (openspec `modelo-do-aluno-e-dados`, 5.3),
 * no PGlite em memória: ensaio sem gravar, ida (v1 → v2), idempotência, volta (v2 → v1) e a chave guardada pela
 * escrita seguinte acompanhando a versão do processo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let db: any
let sql: any
let linhas: any
let op: typeof import('../../server/operacao/chaveDeDuplicata')
let sessionsRepo: any
let palavrasMarcadasRepo: any
let versao: typeof import('../../server/lib/versaoDaChaveDedup')

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db, linhas } = await h.load('../../server/db/db'))
  ;({ sql } = await import('drizzle-orm'))
  op = await h.load('../../server/operacao/chaveDeDuplicata')
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ palavrasMarcadasRepo } = await h.load('../../server/db/repositories/palavrasMarcadas'))
  versao = await h.load('../../server/lib/versaoDaChaveDedup')
}, 60_000)

afterAll(async () => {
  await h?.cleanup?.()
})

const u = asUserId('marc-vistas-v2')

const marcadas = async (): Promise<string[]> =>
  (
    linhas(
      await db.execute(
        sql`SELECT lang, chave, estado FROM palavras_marcadas WHERE user_id = ${u} ORDER BY lang, chave`,
      ),
    ) as Array<{ lang: string; chave: string; estado: string }>
  ).map((r) => `${r.lang}|${r.chave}|${r.estado}`)
const vistas = async (): Promise<string[]> =>
  (
    linhas(
      await db.execute(sql`SELECT DISTINCT lang, chave FROM palavras_vistas WHERE user_id = ${u} ORDER BY lang, chave`),
    ) as Array<{ lang: string; chave: string }>
  )
    .map((r) => `${r.lang}|${r.chave}`)
    .sort()

describe('chave-de-duplicata: marcadas e vistas', () => {
  beforeAll(async () => {
    versao.definirVersaoDaChaveDedup(1)
    await sessionsRepo.createWithUtterances(u, { title: 'Aula', sourceLang: 'es' }, [
      { sourceText: 'Tiene diez años y un perro', idx: 0 },
      { sourceText: 'El año pasado', idx: 1 },
    ])
    await palavrasMarcadasRepo.marcar(u, { lang: 'es', chave: 'ano', estado: 'conhecida' }, 100)
    await palavrasMarcadasRepo.marcar(u, { lang: 'es', chave: 'anos', estado: 'conhecida' }, 100)
    await palavrasMarcadasRepo.marcar(u, { lang: 'es', chave: 'perro', estado: 'ignorada' }, 100)
    await palavrasMarcadasRepo.marcar(u, { lang: 'es', chave: 'nunca', estado: 'conhecida' }, 100)
  })

  it('a escrita em v1 guarda a chave sem marca', async () => {
    expect(await vistas()).toEqual(expect.arrayContaining(['es|anos', 'es|ano', 'es|perro']))
  })

  it('ensaio: conta e não grava', async () => {
    const r = await op.reescreverChavesDeDuplicata({ aplicar: false })
    expect(r).toMatchObject({ marcadasCriam: 2, marcadasMovem: 0, marcadasSemDesdobra: 2, vistasSessoes: 1 })
    expect(await marcadas()).toEqual([
      'es|ano|conhecida',
      'es|anos|conhecida',
      'es|nunca|conhecida',
      'es|perro|ignorada',
    ])
    expect(await vistas()).toContain('es|anos')
  })

  it('ida: reconstrói as vistas em v2 e ACRESCENTA a marcada v2, sem tirar a v1', async () => {
    await op.reescreverChavesDeDuplicata({ aplicar: true, backupFeito: true })
    expect(await vistas()).toEqual(['es|año', 'es|años', 'es|diez', 'es|pasado', 'es|perro'].sort())
    expect(await marcadas()).toEqual([
      'es|ano|conhecida',
      'es|anos|conhecida',
      'es|año|conhecida',
      'es|años|conhecida',
      'es|nunca|conhecida',
      'es|perro|ignorada',
    ])
    expect(versao.versaoDaChaveDedup()).toBe(1) // a versão do processo é restaurada
  })

  it('idempotente: a segunda ida não cria nem muda nada', async () => {
    const r = await op.reescreverChavesDeDuplicata({ aplicar: true, backupFeito: true })
    expect(r.marcadasCriam).toBe(0)
    expect((await marcadas()).length).toBe(6)
    expect(await vistas()).toEqual(['es|año', 'es|años', 'es|diez', 'es|pasado', 'es|perro'].sort())
  })

  it('volta: marcadas v2 caem na v1 (destino existente prevalece) e as vistas voltam', async () => {
    await op.reescreverChavesDeDuplicata({ aplicar: true, para: 1, backupFeito: true })
    expect(await marcadas()).toEqual([
      'es|ano|conhecida',
      'es|anos|conhecida',
      'es|nunca|conhecida',
      'es|perro|ignorada',
    ])
    expect(await vistas()).toEqual(['es|ano', 'es|anos', 'es|diez', 'es|pasado', 'es|perro'].sort())
  })

  it('com a versão 2 no processo, a escrita de uma sessão nova guarda a chave v2', async () => {
    versao.definirVersaoDaChaveDedup(2)
    try {
      const s = await sessionsRepo.createWithUtterances(u, { title: 'Outra', sourceLang: 'de' }, [
        { sourceText: 'schön schön', idx: 0 },
      ])
      const r = linhas(
        await db.execute(sql`SELECT chave, vezes FROM palavras_vistas WHERE session_id = ${s.id}`),
      ) as Array<{
        chave: string
        vezes: number
      }>
      expect(r.map((x) => [x.chave, Number(x.vezes)])).toEqual([['schön', 2]])
    } finally {
      versao.definirVersaoDaChaveDedup(1)
    }
  })
})
