/**
 * A CONTAGEM `comCartao` DO LOTE DE MARCADAS EM v2 (openspec `modelo-do-aluno-e-dados`, 5.3/5.4): `marcarEmLote` compara
 * `lang|chave` com `vocab_cards.norm_key`; as duas já vêm na versão da flag, então a palavra com til/circunflexo que já
 * tem cartão é vista como tal (e a sem marca, que agora é OUTRA palavra, não é).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { chaveDaPalavraNaVersao, chaveDedup } from '../../src/core/texto/palavra'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let db: any
let schema: any
let palavrasMarcadasRepo: any
let versao: typeof import('../../server/lib/versaoDaChaveDedup')

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
  ;({ palavrasMarcadasRepo } = await h.load('../../server/db/repositories/palavrasMarcadas'))
  versao = await h.load('../../server/lib/versaoDaChaveDedup')
}, 60_000)

afterAll(async () => {
  versao?.definirVersaoDaChaveDedup(1)
  await h?.cleanup?.()
})

const agora = Date.now()
/** O cartão como o servidor o grava: a chave é a da versão ativa (`chaveDedup` do repositório de vocabulário). */
const cartao = (id: string, userId: string, word: string, srcLang: string) => ({
  id,
  userId,
  word,
  srcLang,
  tgtLang: 'en',
  normKey: chaveDedup(word, srcLang, versao.versaoDaChaveDedup()),
  createdAt: agora,
  updatedAt: agora,
})

/** As chaves do lote como a rota as monta (`chaveDaPalavraNaVersao` na versão do processo). */
const chavesDoLote = (lang: string, palavras: string[]) => [
  ...new Set(palavras.map((p) => chaveDaPalavraNaVersao(p, lang, versao.versaoDaChaveDedup()))),
]

describe('comCartao com a chave v2', () => {
  it('v2: cartão `año` e `avô` contam; `ano` e `avó` (outras palavras) entram como novas', async () => {
    versao.definirVersaoDaChaveDedup(2)
    const u = asUserId('com-cartao-v2')
    await db.insert(schema.vocabCards).values([cartao('c-ano', u, 'año', 'es'), cartao('c-avo', u, 'avô', 'pt')])
    const es = await palavrasMarcadasRepo.marcarEmLote(u, 'es', chavesDoLote('es', ['Año', 'ano']), 100)
    expect(es).toMatchObject({ ok: true, comCartao: 1, criadas: ['ano'] })
    const pt = await palavrasMarcadasRepo.marcarEmLote(u, 'pt', chavesDoLote('pt', ['avô', 'avó']), 100)
    expect(pt).toMatchObject({ ok: true, comCartao: 1, criadas: ['avo'] })
  })

  it('v1: nada mudou, `año` e `ano` são a mesma palavra e a contagem os junta', async () => {
    versao.definirVersaoDaChaveDedup(1)
    const u = asUserId('com-cartao-v1')
    await db.insert(schema.vocabCards).values([cartao('d-ano', u, 'año', 'es')])
    const r = await palavrasMarcadasRepo.marcarEmLote(u, 'es', chavesDoLote('es', ['Año', 'ano']), 100)
    expect(r).toMatchObject({ ok: true, comCartao: 1, criadas: [] })
  })
})
