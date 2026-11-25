/**
 * ENSAIO DA REESCRITA DA CHAVE DE DUPLICATA (openspec `modelo-do-aluno-e-dados`, 5.2 e 5.3) no PGlite em memória:
 * ensaio sem gravar, aplicação com contagem igual antes e depois, idempotência, volta (v2 → v1), recusa sem
 * `--backup-feito`, cartão apagado e a captura seguinte sem duplicar. Em Postgres real: `TESTE_POSTGRES_URL` [B].
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let db: any
let schema: any
let op: typeof import('../../server/operacao/chaveDeDuplicata')
let vocabRepo: any
let versao: typeof import('../../server/lib/versaoDaChaveDedup')

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
  op = await h.load('../../server/operacao/chaveDeDuplicata')
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  versao = await h.load('../../server/lib/versaoDaChaveDedup')
}, 60_000)

afterAll(async () => {
  await h?.cleanup?.()
})

const agora = Date.now()
const carta = (id: string, userId: string, extra: Record<string, unknown>) => ({
  id,
  userId,
  createdAt: agora,
  updatedAt: agora,
  ...extra,
})
const chaveDe = async (id: string) =>
  (await db.select().from(schema.vocabCards).where(eq(schema.vocabCards.id, id)))[0].normKey as string
const total = async (u: string) =>
  Number((await db.execute(sql`select count(*)::int as n from vocab_cards where user_id = ${u}`)).rows?.[0]?.n ?? 0)

describe('chave-de-duplicata', () => {
  const u = asUserId('chave-v2')
  beforeAll(async () => {
    await db.insert(schema.vocabCards).values([
      carta('k-ano', u, { word: 'año', srcLang: 'es', tgtLang: 'pt', normKey: 'es|ano' }),
      carta('k-agua', u, { word: 'Água', srcLang: 'pt-BR', tgtLang: 'en', normKey: 'pt|agua' }),
      carta('k-avo', u, {
        word: 'avô',
        srcLang: 'pt',
        tgtLang: 'en',
        normKey: 'pt|avo',
        sentence: 'meu avô e minha avó',
      }),
      carta('k-kana', u, { word: 'がっこう', srcLang: 'ja', tgtLang: 'pt', normKey: 'ja|かっこう' }),
      carta('k-en', u, { word: 'café', srcLang: 'en', tgtLang: 'pt', normKey: 'en|cafe' }),
      carta('k-solto', u, { word: 'xyz', srcLang: 'en', tgtLang: 'pt', normKey: 'chave-estranha' }),
      carta('k-morto', u, { word: 'schön', srcLang: 'de', tgtLang: 'pt', normKey: 'de|schon', deletedAt: agora }),
    ])
    await db.insert(schema.vocabOccurrences).values({
      id: 'o-1',
      userId: u,
      cardId: 'k-ano',
      createdAt: agora,
      updatedAt: agora,
      occurredAt: agora,
      originKind: 'manual',
      sentence: 'Tiene diez años.',
    })
  })

  it('ensaio: conta o que mudaria e não grava nada', async () => {
    const r = await op.reescreverChavesDeDuplicata({ aplicar: false })
    expect(r).toMatchObject({ mudam: 4, iguais: 2, conflitos: 0, foraDoPadrao: 1, cartoes: 7 })
    expect(r.porIdioma).toMatchObject({ es: 1, pt: 1, ja: 1, de: 1 })
    expect(r.comProvaDeFusao).toBe(1) // só o cartão `avô`, cuja frase traz `avó` (mesma chave v1, outra v2)
    expect(await chaveDe('k-ano')).toBe('es|ano')
  })

  it('aplicar sem --backup-feito é recusado e não muda nada', async () => {
    await expect(op.reescreverChavesDeDuplicata({ aplicar: true })).rejects.toThrow(/backup-feito/)
    expect(await chaveDe('k-ano')).toBe('es|ano')
  })

  it('aplica: troca só a chave, não perde cartão nem ocorrência, e a segunda passada não muda nada', async () => {
    const antes = await total(u)
    await op.reescreverChavesDeDuplicata({ aplicar: true, backupFeito: true })
    expect(await total(u)).toBe(antes)
    expect(await chaveDe('k-ano')).toBe('es|año')
    expect(await chaveDe('k-agua')).toBe('pt|agua')
    expect(await chaveDe('k-avo')).toBe('pt|avô')
    expect(await chaveDe('k-kana')).toBe('ja|がっこう')
    expect(await chaveDe('k-en')).toBe('en|cafe')
    expect(await chaveDe('k-morto')).toBe('de|schön')
    expect(await chaveDe('k-solto')).toBe('chave-estranha')
    expect(
      Number((await db.execute(sql`select count(*)::int as n from vocab_occurrences where user_id = ${u}`)).rows[0].n),
    ).toBe(1)

    const segunda = await op.reescreverChavesDeDuplicata({ aplicar: true, backupFeito: true })
    expect(segunda.mudam).toBe(0)
  })

  it('com a versão 2 ligada, capturar `ano` depois de `año` cria um cartão novo; com a 1, repete o existente', async () => {
    versao.definirVersaoDaChaveDedup(2)
    const r2 = await vocabRepo.bulkAdd(u, [{ word: 'ano', back: 'ânus', srcLang: 'es', tgtLang: 'pt' }])
    expect(r2.cards).toHaveLength(1)
    expect(await chaveDe(r2.cards[0].id)).toBe('es|ano')
    const r2b = await vocabRepo.bulkAdd(u, [{ word: 'AÑO', back: 'ano', srcLang: 'es', tgtLang: 'pt' }])
    expect(r2b.cards).toHaveLength(0) // é o `año` que já existe
    versao.definirVersaoDaChaveDedup(1)
  })

  it('volta (v2 → v1): cartão que colide com outro vivo fica como está e é relatado', async () => {
    const r = await op.reescreverChavesDeDuplicata({ aplicar: false, para: 1 })
    // `año` (es|año) voltaria a es|ano, mas o `ano` criado no teste anterior já é dono dela
    expect(r.conflitos).toBe(1)
    await op.reescreverChavesDeDuplicata({ aplicar: true, para: 1, backupFeito: true })
    expect(await chaveDe('k-ano')).toBe('es|año')
    expect(await chaveDe('k-avo')).toBe('pt|avo')
    expect(await chaveDe('k-kana')).toBe('ja|かっこう')
    expect(await chaveDe('k-morto')).toBe('de|schon')
  })
})
