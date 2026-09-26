/**
 * IDIOMA DA SESSÃO NO SERVIDOR (auditoria 2026-09-26).
 *
 * 1. `vocabRepo.relabel` trocava `src_lang` e deixava `norm_key` (`idioma|palavra`) no idioma
 *    antigo: o cartão reetiquetado para `pt` seguia com a chave `en|…`, e a próxima captura da
 *    mesma palavra em português criava um SEGUNDO cartão.
 * 2. `reparar-idiomas` (CLI de operação) aplica ao banco o mesmo plano do modo sem conta: ensaio
 *    por padrão, idempotente, nunca apaga.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let vocabRepo: any
let repararIdiomasNoBanco: any
let db: any
let schema: any

const FALA_PT = 'Eu não sei se você vai conseguir terminar o trabalho hoje, porque a reunião atrasou muito.'

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ repararIdiomasNoBanco } = await h.load('../../server/operacao/reparoDeIdioma'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
}, 60_000)

afterAll(async () => {
  await h?.cleanup?.()
})

const linha = (id: string, userId: string, extra: Record<string, unknown>) => ({
  id, userId, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
})

describe('relabel acompanha a chave de dedup', () => {
  it('troca norm_key junto e não colide com cartão vivo que já tem a chave nova', async () => {
    const u = asUserId('relabel-chave')
    await db.insert(schema.vocabCards).values([
      linha('rk-1', u, { word: 'reunião', srcLang: 'en', tgtLang: 'pt', normKey: 'en|reuniao' }),
      linha('rk-2', u, { word: 'trabalho', srcLang: 'en', tgtLang: 'pt', normKey: 'en|trabalho' }),
      linha('rk-3', u, { word: 'trabalho', srcLang: 'pt', tgtLang: 'en', normKey: 'pt|trabalho' }),
    ])
    const n = await vocabRepo.relabel(u, [
      { id: 'rk-1', srcLang: 'pt', tgtLang: 'en' },
      { id: 'rk-2', srcLang: 'pt', tgtLang: 'en' },
    ])
    expect(n).toBe(1)
    const [c1] = await db.select().from(schema.vocabCards).where(eq(schema.vocabCards.id, 'rk-1'))
    expect(c1).toMatchObject({ srcLang: 'pt', normKey: 'pt|reuniao' })
    const [c2] = await db.select().from(schema.vocabCards).where(eq(schema.vocabCards.id, 'rk-2'))
    expect(c2).toMatchObject({ srcLang: 'en', normKey: 'en|trabalho' })
  })
})

describe('reparar-idiomas', () => {
  it('ensaia sem gravar, aplica, e a segunda passada não muda nada', async () => {
    const u = asUserId('reparo-idioma')
    await db.insert(schema.sessions).values(linha('rs-1', u, { title: 'pt', kind: 'live', sourceLang: 'pt-BR', targetLang: 'en-US' }))
    await db.insert(schema.utterances).values(linha('ru-1', u, { sessionId: 'rs-1', sourceLang: 'en', sourceText: FALA_PT }))
    await db
      .insert(schema.vocabCards)
      .values(linha('rc-1', u, { word: 'reunião', sentence: FALA_PT, srcLang: 'en-US', tgtLang: 'pt-BR', sessionId: 'rs-1', normKey: 'en|reuniao' }))

    const ensaio = await repararIdiomasNoBanco({ aplicar: false })
    expect(ensaio).toMatchObject({ falas: 1, cartoes: 1 })
    const [antes] = await db.select().from(schema.vocabCards).where(eq(schema.vocabCards.id, 'rc-1'))
    expect(antes.srcLang).toBe('en-US')

    await repararIdiomasNoBanco({ aplicar: true })
    const [depois] = await db.select().from(schema.vocabCards).where(eq(schema.vocabCards.id, 'rc-1'))
    expect(depois).toMatchObject({ srcLang: 'pt', tgtLang: 'en-US', normKey: 'pt|reuniao' })
    const [f] = await db.select().from(schema.utterances).where(eq(schema.utterances.id, 'ru-1'))
    expect(f.sourceLang).toBe('pt')

    const segunda = await repararIdiomasNoBanco({ aplicar: true })
    expect(segunda).toMatchObject({ falas: 0, cartoes: 0, sessoes: 0 })
  })
})
