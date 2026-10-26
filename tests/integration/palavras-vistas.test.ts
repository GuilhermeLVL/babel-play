/**
 * O ÍNDICE DAS PALAVRAS VISTAS (etiquetas de palavras, migração PG 0012) acompanha as falas.
 *
 * Toda escrita em falas mexe no índice no MESMO lote (`palavrasVistasRepo`): criar a sessão com falas,
 * retomar a captura, o lote da captura longa (idempotente: repetir não dobra), a edição de uma fala, a
 * reetiquetagem de idioma, a troca do idioma da sessão e a remoção. A exclusão de conta e a limpeza diária
 * (CASCADE) levam o resto; `palavras reindexar` reconstrói o legado e é idempotente.
 *
 * O desempenho é contado em INSTRUÇÕES (o observador de consultas de produção, nos dois drivers), não em
 * relógio: o lote da captura longa custa no máximo 2 instruções no índice (1 upsert + 1 DELETE). Roda no
 * PGlite e, com `TESTE_POSTGRES_URL`, num Postgres real.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let db: any
let sql: any
let linhas: any
let sessionsRepo: any
let utterancesRepo: any
let palavrasVistasRepo: any
let contaRepo: any
let vocabRepo: any
let reindexarPalavrasVistas: any
let repararIdiomasNoBanco: any
let limparBanco: any
let registrar: (fn: ((o: { instrucoes: string[] }) => void) | undefined) => void

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  ;({ db, linhas } = await h.load('../../server/db/db'))
  ;({ sql } = await import('drizzle-orm'))
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ utterancesRepo } = await h.load('../../server/db/repositories/utterances'))
  ;({ palavrasVistasRepo } = await h.load('../../server/db/repositories/palavrasVistas'))
  ;({ contaRepo } = await h.load('../../server/db/repositories/conta'))
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ reindexarPalavrasVistas } = await h.load('../../server/operacao/palavras'))
  ;({ repararIdiomasNoBanco } = await h.load('../../server/operacao/reparoDeIdioma'))
  ;({ limparBanco } = await h.load('../../server/lib/limpezaDiaria'))
  ;({ registrarObservadorDeConsultas: registrar } = await h.load('../../server/db/observadorDeConsultas'))
}, 60_000)

afterAll(async () => {
  registrar?.(undefined)
  await h?.cleanup()
})

const novoUsuario = () => `pv-${randomUUID()}` as never

/** O índice inteiro de uma sessão, como `{ 'lang|chave': vezes }`. */
async function indice(userId: string, sessionId: string): Promise<Record<string, number>> {
  const r = linhas(
    await db.execute(
      sql`SELECT lang, chave, vezes FROM palavras_vistas WHERE user_id = ${userId} AND session_id = ${sessionId}`,
    ),
  ) as Array<{ lang: string; chave: string; vezes: number }>
  return Object.fromEntries(r.map((l) => [`${l.lang}|${l.chave}`, Number(l.vezes)]))
}

async function linhasDoUsuario(userId: string): Promise<number> {
  const [r] = linhas(
    await db.execute(sql`SELECT count(*)::int AS n FROM palavras_vistas WHERE user_id = ${userId}`),
  ) as Array<{ n: number }>
  return Number(r.n)
}

const versaoDasPalavras = async (userId: string) => {
  const [r] = linhas(await db.execute(sql`SELECT palavras FROM versoes_de_dados WHERE user_id = ${userId}`)) as Array<{
    palavras: number
  }>
  return Number(r?.palavras ?? 0)
}

describe('o índice acompanha as escritas nas falas', () => {
  it('criar a sessão indexa as falas, por idioma base, sem funcionais', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { title: 'Aula', sourceLang: 'en-US' }, [
      { sourceText: 'The dog and the cat.', idx: 0 },
      { sourceText: 'Dog again!', idx: 1 },
      { sourceText: 'El perro', idx: 2, sourceLang: 'es' },
    ])
    expect(await indice(u, s.id)).toEqual({ 'en|dog': 2, 'en|cat': 1, 'en|again': 1, 'es|perro': 1 })
    const vistas = await palavrasVistasRepo.chavesVistas(u, 'en-GB')
    expect(vistas).toEqual({ lang: 'en', chaves: ['dog', 'again', 'cat'], truncado: false })
  })

  it('o lote da captura longa ajusta pela diferença, e repetir o lote não dobra', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const lote = [
      { sourceText: 'banana apple', idx: 1 },
      { sourceText: 'cherry', idx: 2 },
    ]
    await sessionsRepo.appendUtterances(u, s.id, lote)
    await sessionsRepo.appendUtterances(u, s.id, lote)
    expect(await indice(u, s.id)).toEqual({ 'en|apple': 2, 'en|banana': 1, 'en|cherry': 1 })
    // O mesmo trecho reenviado com outro texto: o que saiu desce, o que zerou some.
    await sessionsRepo.appendUtterances(u, s.id, [
      { sourceText: 'banana', idx: 1 },
      { sourceText: 'durian', idx: 2 },
    ])
    expect(await indice(u, s.id)).toEqual({ 'en|apple': 1, 'en|banana': 1, 'en|durian': 1 })
  })

  it('retomar a captura reconstrói a sessão', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple pear', idx: 0 }])
    await sessionsRepo.replaceUtterances(u, s.id, [{ sourceText: 'grape grape', idx: 0 }])
    expect(await indice(u, s.id)).toEqual({ 'en|grape': 2 })
  })

  it('a edição de uma fala aplica a diferença velha → nova', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [
      { sourceText: 'apple pear', idx: 0 },
      { sourceText: 'apple', idx: 1 },
    ])
    const [f0] = await utterancesRepo.listBySession(u, s.id)
    await utterancesRepo.update(u, f0.id, { sourceText: 'plum pear' })
    expect(await indice(u, s.id)).toEqual({ 'en|apple': 1, 'en|pear': 1, 'en|plum': 1 })
    // Só a tradução mudou: o índice não mexe.
    await utterancesRepo.update(u, f0.id, { translatedText: 'ameixa pera' })
    expect(await indice(u, s.id)).toEqual({ 'en|apple': 1, 'en|pear': 1, 'en|plum': 1 })
  })

  it('reetiquetar o idioma das falas e trocar o idioma da sessão reconstroem', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [
      { sourceText: 'casa grande', idx: 0 },
      { sourceText: 'mesa', idx: 1 },
    ])
    const falas = await utterancesRepo.listBySession(u, s.id)
    await utterancesRepo.relabel(u, [{ id: falas[0].id, sourceLang: 'pt', targetLang: 'en' }])
    expect(await indice(u, s.id)).toEqual({ 'pt|casa': 1, 'pt|grande': 1, 'en|mesa': 1 })
    await sessionsRepo.update(u, s.id, { sourceLang: 'es' })
    expect(await indice(u, s.id)).toEqual({ 'pt|casa': 1, 'pt|grande': 1, 'es|mesa': 1 })
  })

  it('reetiquetar falas de duas sessões reindexa as duas (no mesmo lote da reetiquetagem) e conta só as falas', async () => {
    const u = novoUsuario()
    const a = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'casa', idx: 0 }])
    const b = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'mesa', idx: 0 }])
    const [fa] = await utterancesRepo.listBySession(u, a.id)
    const [fb] = await utterancesRepo.listBySession(u, b.id)
    expect(
      await utterancesRepo.relabel(u, [
        { id: fa.id, sourceLang: 'pt', targetLang: 'en' },
        { id: fb.id, sourceLang: 'pt', targetLang: 'en' },
      ]),
    ).toBe(2)
    expect(await indice(u, a.id)).toEqual({ 'pt|casa': 1 })
    expect(await indice(u, b.id)).toEqual({ 'pt|mesa': 1 })
  })

  it('remover a sessão apaga as linhas dela no mesmo lote', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const outra = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'pear', idx: 0 }])
    expect(await sessionsRepo.remove(u, s.id)).toBe(true)
    expect(await indice(u, s.id)).toEqual({})
    expect(await indice(u, outra.id)).toEqual({ 'en|pear': 1 })
    expect((await palavrasVistasRepo.chavesVistas(u, 'en')).chaves).toEqual(['pear'])
  })

  it('a limpeza diária apaga a sessão de vez e o CASCADE leva o que sobrou', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    await sessionsRepo.remove(u, s.id)
    // Uma linha que sobrou de um índice torto (escrita fora do repositório): só o CASCADE a tira.
    await db.execute(sql`INSERT INTO palavras_vistas (user_id, session_id, lang, chave, vezes, primeira_em, ultima_em)
      VALUES (${u}, ${s.id}, 'en', 'apple', 1, 0, 0)`)
    await limparBanco({ agora: Date.now() + 400 * 86_400_000, dias: 30 })
    expect(await linhasDoUsuario(u)).toBe(0)
  })

  it('a exclusão de conta apaga o índice e a exportação o inclui', async () => {
    const u = novoUsuario()
    await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const exportacao = await contaRepo.exportar(u)
    expect(exportacao.dados.palavrasVistas).toHaveLength(1)
    await contaRepo.excluir(u)
    expect(await linhasDoUsuario(u)).toBe(0)
  })

  it('outra conta nunca vê o índice de ninguém', async () => {
    const dono = novoUsuario()
    const outro = novoUsuario()
    await sessionsRepo.createWithUtterances(dono, { sourceLang: 'en' }, [{ sourceText: 'secretword', idx: 0 }])
    expect((await palavrasVistasRepo.chavesVistas(outro, 'en')).chaves).toEqual([])
    const h2 = await palavrasVistasRepo.historico(outro, 'en', 'secretword')
    expect(h2.vistas.vezes).toBe(0)
    expect(h2.onde).toEqual([])
  })
})

describe('concorrência: a leitura vai dentro da transação, com a trava do usuário', () => {
  it('dois lotes iguais ao mesmo tempo não dobram a contagem nem o wordCount', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const lote = [{ sourceText: 'banana cherry', idx: 1 }]
    await Promise.all([
      sessionsRepo.appendUtterances(u, s.id, lote),
      sessionsRepo.appendUtterances(u, s.id, lote),
      sessionsRepo.appendUtterances(u, s.id, lote),
    ])
    expect(await indice(u, s.id)).toEqual({ 'en|apple': 1, 'en|banana': 1, 'en|cherry': 1 })
    expect((await sessionsRepo.get(u, s.id)).wordCount).toBe(3)
  })

  it('duas edições da mesma fala ao mesmo tempo: o índice fica com o texto que ganhou', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const [f] = await utterancesRepo.listBySession(u, s.id)
    await Promise.all([
      utterancesRepo.update(u, f.id, { sourceText: 'plum' }),
      utterancesRepo.update(u, f.id, { sourceText: 'plum' }),
    ])
    expect(await indice(u, s.id)).toEqual({ 'en|plum': 1 })
  })

  it('a troca de idioma da sessão concorrente com um lote: o índice bate com as falas', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'casa', idx: 0 }])
    await Promise.all([
      sessionsRepo.update(u, s.id, { sourceLang: 'pt' }),
      sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'mesa', idx: 1 }]),
    ])
    await reindexarPalavrasVistas({ usuario: u })
    const reconstruido = await indice(u, s.id)
    expect(reconstruido).toEqual({ 'pt|casa': 1, 'pt|mesa': 1 })
  })

  it('o que só perde ocorrência não fica com a fala que saiu como exemplo', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'fig', idx: 0 }])
    await sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'fig melon', idx: 1 }])
    const exemplo = async () => {
      const [l] = linhas(
        await db.execute(
          sql`SELECT exemplo_idx FROM palavras_vistas WHERE user_id = ${u} AND session_id = ${s.id} AND chave = 'fig'`,
        ),
      ) as Array<{ exemplo_idx: number | null }>
      return l.exemplo_idx == null ? null : Number(l.exemplo_idx)
    }
    expect(await exemplo()).toBe(1)
    // A fala 1 perde "fig": o exemplo apontava para ela e sai (nulo), em vez de forçar a varredura.
    await sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'melon', idx: 1 }])
    expect(await indice(u, s.id)).toEqual({ 'en|fig': 1, 'en|melon': 1 })
    expect(await exemplo()).toBeNull()
    const h = await palavrasVistasRepo.historico(u, 'en', 'fig')
    expect(h.onde).toEqual([{ sessaoId: s.id, titulo: null, quando: expect.any(String), frase: null }])
    // A reconstrução devolve um exemplo válido.
    await reindexarPalavrasVistas({ usuario: u })
    expect(await exemplo()).toBe(0)
  })
})

describe('a versão do conjunto de palavras (ETag de /vistas)', () => {
  it('sobe quando nasce ou some uma chave; não sobe quando só soma ocorrência ou muda a tradução', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [{ sourceText: 'apple', idx: 0 }])
    const v0 = await versaoDasPalavras(u)
    expect(v0).toBeGreaterThan(0)
    await sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'apple apple', idx: 1 }])
    expect(await versaoDasPalavras(u)).toBe(v0)
    const [f0] = await utterancesRepo.listBySession(u, s.id)
    await utterancesRepo.update(u, f0.id, { translatedText: 'maçã' })
    await sessionsRepo.update(u, s.id, { title: 'renomeada' })
    expect(await versaoDasPalavras(u)).toBe(v0)
    await sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'apple pear', idx: 1 }])
    const v1 = await versaoDasPalavras(u)
    expect(v1).toBeGreaterThan(v0)
    await sessionsRepo.appendUtterances(u, s.id, [{ sourceText: 'apple', idx: 1 }])
    expect(await versaoDasPalavras(u)).toBeGreaterThan(v1)
  })
})

describe('reconstrução (palavras reindexar)', () => {
  it('indexa o legado e é idempotente (duas passadas, o mesmo estado)', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [
      { sourceText: 'apple apple', idx: 0 },
      { sourceText: 'pear', idx: 1 },
    ])
    // O legado: sessão de antes da migração, sem nenhuma linha no índice.
    await db.execute(sql`DELETE FROM palavras_vistas WHERE user_id = ${u}`)
    const antes = await versaoDasPalavras(u)
    const r1 = await reindexarPalavrasVistas({ usuario: u })
    expect(r1).toEqual({ sessoes: 1, usuarios: 1 })
    const depois1 = await indice(u, s.id)
    expect(depois1).toEqual({ 'en|apple': 2, 'en|pear': 1 })
    expect(await versaoDasPalavras(u)).toBeGreaterThan(antes)
    await reindexarPalavrasVistas({ usuario: u })
    expect(await indice(u, s.id)).toEqual(depois1)
  })

  it('o reparo de idioma reconstrói as sessões que tocou', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en', targetLang: 'pt' }, [
      { sourceText: 'Eu não sei o que fazer com essa situação complicada hoje', idx: 0, sourceLang: 'en' },
      { sourceText: 'Ela foi para a escola de manhã e voltou para casa tarde', idx: 1, sourceLang: 'en' },
    ])
    expect(Object.keys(await indice(u, s.id)).every((k) => k.startsWith('en|'))).toBe(true)
    const r = await repararIdiomasNoBanco({ aplicar: true })
    expect(r.falas).toBeGreaterThan(0)
    const depois = await indice(u, s.id)
    expect(Object.keys(depois).some((k) => k.startsWith('pt|'))).toBe(true)
  })
})

describe('histórico e nota', () => {
  it('o histórico junta cartão, sessões com frase e nota; a nota salva e limpa', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { title: 'Filme', sourceLang: 'en' }, [
      { sourceText: 'Hello there. The garden is big.', idx: 0 },
      { sourceText: 'garden garden', idx: 1 },
    ])
    const { cards } = await vocabRepo.bulkAdd(u, [{ word: 'Garden', srcLang: 'en', tgtLang: 'pt', back: 'jardim' }])
    const id = cards[0].id
    expect(await vocabRepo.salvarNota(u, id, '  lembrar do jardim da avó  ')).toEqual({
      id,
      nota: 'lembrar do jardim da avó',
    })
    const r = await palavrasVistasRepo.historico(u, 'en-US', 'GARDEN')
    expect(r.chave).toBe('garden')
    expect(r.lang).toBe('en')
    expect(r.cartao).toMatchObject({ id, estado: 'nova', reps: 0, lapses: 0 })
    expect(r.vistas).toMatchObject({ vezes: 3, sessoes: 1 })
    expect(r.onde).toEqual([
      { sessaoId: s.id, titulo: 'Filme', quando: expect.any(String), frase: 'The garden is big.' },
    ])
    expect(r.nota).toBe('lembrar do jardim da avó')
    expect((await vocabRepo.get(u, id)).nota).toBe('lembrar do jardim da avó')

    // A fala de exemplo foi corrigida e não contém mais a palavra: o exemplo sai (nulo), sem varrer a sessão.
    const [f0] = await utterancesRepo.listBySession(u, s.id)
    await utterancesRepo.update(u, f0.id, { sourceText: 'Hello there.' })
    const r2 = await palavrasVistasRepo.historico(u, 'en', 'garden')
    expect(r2.vistas.vezes).toBe(2)
    expect(r2.onde[0].frase).toBeNull()
    // A reconstrução devolve o exemplo que ainda vale.
    await reindexarPalavrasVistas({ usuario: u })
    expect((await palavrasVistasRepo.historico(u, 'en', 'garden')).onde[0].frase).toBe('garden garden')

    expect(await vocabRepo.salvarNota(u, id, '')).toEqual({ id, nota: null })
    expect(await vocabRepo.salvarNota(novoUsuario(), id, 'alheia')).toBeUndefined()
  })
})

describe('desempenho: o lote da captura longa', () => {
  it('600 falas em lotes de 50: no máximo 2 instruções no índice por lote', async () => {
    const u = novoUsuario()
    const s = await sessionsRepo.createWithUtterances(u, { sourceLang: 'en' }, [])
    const palavras = ['river', 'mountain', 'forest', 'ocean', 'desert', 'valley', 'island', 'meadow']
    const fala = (i: number) => ({
      idx: i,
      sourceText: `${palavras[i % 8]} ${palavras[(i * 3) % 8]} word${String.fromCharCode(97 + (i % 26))}x`,
    })
    const noIndice = async (fn: () => Promise<unknown>) => {
      const instrucoes: string[] = []
      registrar(({ instrucoes: i }) => instrucoes.push(...i))
      try {
        await fn()
      } finally {
        registrar(undefined)
      }
      return instrucoes.filter((q) => /palavras_vistas/i.test(q)).length
    }
    const primeira: number[] = []
    const repetida: number[] = []
    for (let de = 0; de < 600; de += 50) {
      const lote = Array.from({ length: 50 }, (_, k) => fala(de + k))
      primeira.push(await noIndice(() => sessionsRepo.appendUtterances(u, s.id, lote)))
      // O cliente reenvia o lote que caiu: a diferença é zero e o índice nem é tocado.
      repetida.push(await noIndice(() => sessionsRepo.appendUtterances(u, s.id, lote)))
    }
    expect(Math.max(...primeira)).toBeLessThanOrEqual(2)
    expect(Math.min(...primeira)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...repetida)).toBe(0)
    const idx = await indice(u, s.id)
    expect(Object.values(idx).reduce((a, b) => a + b, 0)).toBe(600 * 3)
  })
})
