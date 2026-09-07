/**
 * A DIFICULDADE PASSA A SER CALCULADA — porque agora alguém chama (auditoria 07/09, achado A53).
 *
 * `vocabRepo.recalcularDificuldade` estava escrita, correta e coberta por dois arquivos de
 * integração. Faltava o chamador de PRODUÇÃO: nenhuma rota a invocava. O efeito medido no banco
 * real foi `difficulty_score` NULL em 2.818 de 2.818 cartões, e a consequência em cascata:
 * `palavrasDificeis` sempre vazio, o recorte "difíceis" do filtro facetado sem nada para mostrar,
 * a estratégia de composição `em-dificuldade` selecionando zero itens.
 *
 * Uma função correta que ninguém chama entrega o mesmo que uma função que não existe — e é pior,
 * porque os testes dela ficam verdes e dão a impressão contrária. Este arquivo testa a ROTA, não
 * a função: é a rota que a auditoria encontrou vazia.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let exercisesRouter: any
let vocabRepo: any

function handler(caminho: string, metodo = 'post'): (req: any, res: any) => Promise<void> {
  const camada = exercisesRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  if (!camada) throw new Error(`rota ${metodo} ${caminho} não existe`)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ exercisesRouter } = (await h.load('../../server/routes/exercises')) as any)
  ;({ vocabRepo } = (await h.load('../../server/db/repositories/vocab')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('POST /api/exercises/rodada dispara o recálculo', () => {
  it('os cartões jogados saem com difficulty_score; os não jogados continuam intocados', async () => {
    const u = asUserId('u-dificuldade')
    const { cards } = await vocabRepo.bulkAdd(u, [
      { word: 'threshold', back: 'limiar', srcLang: 'en' },
      { word: 'water', back: 'água', srcLang: 'en' },
      { word: 'city', back: 'cidade', srcLang: 'en' },
    ])
    /* Por PALAVRA e não por índice: `bulkAdd` deduplica e pode descartar, então a posição no
       array de entrada não é a posição no de saída. */
    const porPalavra = (w: string) => cards.find((c: any) => c.word === w)
    const jogado = porPalavra('threshold')
    const tambemJogado = porPalavra('water')
    const deFora = porPalavra('city')
    expect(jogado && tambemJogado && deFora, 'as três palavras precisam ter entrado').toBeTruthy()

    /* O estado de partida é o que a auditoria mediu: nenhum cartão tem dificuldade. */
    for (const c of cards) expect(c.difficultyScore ?? null).toBeNull()

    const res = mockRes()
    await handler('/rodada')({
      userId: u, path: '/rodada', requestId: 'r-dif',
      body: {
        roundId: 'dif-1', exerciseKind: 'termo', origem: 'baralho', score: 40,
        itens: [
          { cardId: jogado.id, itemRef: 'threshold', correct: 0, attempts: 3, kind: 'drill' },
          { cardId: tambemJogado.id, itemRef: 'water', correct: 1, attempts: 1, kind: 'drill' },
        ],
      },
    }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ gravados: 2 })

    /* O recálculo roda DEPOIS do `res.json`, para não segurar a confirmação da rodada. Esperar
       aqui é o preço de testar o comportamento real em vez de espiar a chamada. */
    await new Promise((r) => setTimeout(r, 200))

    const depois = await vocabRepo.list(u)
    const comDificuldade = depois.filter((c: any) => c.difficultyScore != null)
    expect(comDificuldade.map((c: any) => c.word).sort()).toEqual(['threshold', 'water'])

    /* SÓ OS CARTÕES DA RODADA. Recalcular o acervo inteiro a cada rodada seria o oposto do
       "preguiçoso por desenho" que a própria função documenta. */
    const forasteiro = depois.find((c: any) => c.id === deFora.id)
    expect(forasteiro.difficultyScore ?? null).toBeNull()
  })

  it('errar sobe a dificuldade acima de quem acertou', async () => {
    const u = asUserId('u-dificuldade-2')
    const { cards } = await vocabRepo.bulkAdd(u, [
      { word: 'ubiquitous', back: 'onipresente', srcLang: 'en' },
      { word: 'house', back: 'casa', srcLang: 'en' },
    ])
    const dificil = cards.find((c: any) => c.word === 'ubiquitous')
    const facil = cards.find((c: any) => c.word === 'house')
    const res = mockRes()
    await handler('/rodada')({
      userId: u, path: '/rodada', requestId: 'r-dif2',
      body: {
        roundId: 'dif-2', exerciseKind: 'termo', origem: 'baralho', score: 10,
        itens: [
          { cardId: dificil.id, itemRef: 'ubiquitous', correct: 0, attempts: 4, kind: 'drill' },
          { cardId: facil.id, itemRef: 'house', correct: 1, attempts: 1, kind: 'drill' },
        ],
      },
    }, res)
    await new Promise((r) => setTimeout(r, 200))

    const depois = await vocabRepo.list(u)
    const errado = depois.find((c: any) => c.word === 'ubiquitous')
    const certo = depois.find((c: any) => c.word === 'house')
    /* Não é sobre o valor exato — a fórmula é de `calcularDificuldade` e tem teste próprio. É
       sobre o número na coluna responder ao desempenho, que é o que a materialização promete. */
    expect(errado.difficultyScore).toBeGreaterThan(certo.difficultyScore)
  })

  it('rodada sem cardId não quebra nem recalcula nada', async () => {
    /* Os cinco jogos de frase (karaokê, ditado, escuta, conectores, embaralhar) jogam sobre falas
       e mandam `itemRef` sem `cardId`. A rodada tem de gravar do mesmo jeito. */
    const u = asUserId('u-dificuldade-3')
    const res = mockRes()
    await handler('/rodada')({
      userId: u, path: '/rodada', requestId: 'r-dif3',
      body: {
        roundId: 'dif-3', exerciseKind: 'karaoke', origem: 'sessao:x', score: 80,
        itens: [{ itemRef: 'uma fala inteira', correct: 1, kind: 'drill' }],
      },
    }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ gravados: 1 })
  })
})
