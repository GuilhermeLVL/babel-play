/**
 * FASE 5 — O QUE `GET /api/vocab` MANDA PELA REDE, E O QUE PAROU DE MANDAR.
 *
 * A rota devolve o baralho INTEIRO, e é chamada por cinco telas (busca global, bingo, análise,
 * auditoria de idioma, catálogo). Medida em 2026-09-08, ela era a mais lenta do servidor: p50 991
 * ms, p95 1.576 ms (`openspec/audits/2026-09-08-baseline/latencia.md`).
 *
 * A MEDIÇÃO QUE MUDOU O DIAGNÓSTICO. O `EXPLAIN QUERY PLAN` das cinco consultas do perfil e desta
 * mostrou que **todas usam índice** e que o banco real é pequeno (2.783 cartões vivos, 240 falas,
 * 58 revisões). Não era I/O nem varredura. Sobre o corpo da resposta, com `SELECT *`:
 *
 *   | medida | valor |
 *   |---|---:|
 *   | resposta | 2.002,9 KB |
 *   | só os NOMES DE CHAVE, repetidos linha a linha | 1.084,4 KB (54%) |
 *   | resposta sem as seis colunas internas | 1.636,7 KB |
 *   | redução | 18,3% |
 *
 * Mais da metade do corpo não é dado, são nomes de chave repetidos 2.783 vezes. Cada coluna a
 * menos vale ~65 KB, quase toda ela nome de chave.
 *
 * Este teste trava as duas metades da decisão: as seis que saíram não voltam, e as que PARECIAM
 * não usadas — e são lidas pelo espalhamento `...row`, não por nome — continuam saindo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, semear, subirApp } from '../caracterizacao/_app'

/**
 * As duas primeiras são contabilidade interna e nunca deveriam ter saído: `userId` devolve ao
 * cliente o identificador do dono, que ele já sabe, e `deletedAt` só pode ser `null` nesta rota,
 * porque o `WHERE` já filtra — viajava para dizer sempre a mesma coisa. As outras quatro não têm
 * nenhum leitor em `src/`.
 */
const NAO_SAEM = ['userId', 'deletedAt', 'updatedAt', 'normKey', 'srcLangBase', 'difficultyAt']

/**
 * ESTAS FICAM, e a lista existe porque a primeira versão da mudança ia tirá-las.
 *
 * `rowToVocabCard` (src/data/rotas/vocabulario.ts:60) não as nomeia, então um `grep` por nome de
 * campo diz que ninguém as lê. Elas chegam ao cliente pelo espalhamento `...row` e são lidas em
 * `Play.tsx` (cloze), `ResumoDaRodada.tsx` (`cefrSource`), `CatalogoDePalavras.tsx`
 * (`firstSeenAt`/`lastSeenAt`) e `core/learning/dificuldade.ts` (`lastSeenAt`). Tirar qualquer uma
 * quebra a tela em silêncio: o campo vira `undefined` e o cálculo continua rodando.
 */
const CONTINUAM_SAINDO = ['clozePrompt', 'clozeAnswer', 'cefrSource', 'firstSeenAt', 'lastSeenAt']

describe('as colunas que saem em GET /api/vocab', () => {
  let s: AppDeTeste
  let cartoes: Array<Record<string, unknown>>

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    await semear(s, 'local-owner')
    cartoes = (await (await s.get('/api/vocab')).json()) as Array<Record<string, unknown>>
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
  })

  it('a semeadura produziu cartões — senão as asserções abaixo passariam por vacuidade', () => {
    expect(cartoes.length).toBeGreaterThan(0)
  })

  for (const campo of NAO_SAEM) {
    it(`${campo} não sai`, () => {
      for (const c of cartoes) expect(Object.keys(c), `cartão ${String(c.id)}`).not.toContain(campo)
    })
  }

  for (const campo of CONTINUAM_SAINDO) {
    it(`${campo} continua saindo — é lido pelo espalhamento, não por nome`, () => {
      expect(Object.keys(cartoes[0])).toContain(campo)
    })
  }

  /**
   * A contabilidade interna não pode voltar por outro caminho — nem no corpo, nem serializada
   * dentro de um campo. É a asserção que pega uma reintrodução por `SELECT *` num refatoramento.
   */
  it('o identificador do dono não aparece em lugar nenhum do corpo', () => {
    expect(JSON.stringify(cartoes)).not.toContain('local-owner')
  })
})
