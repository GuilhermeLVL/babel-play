/**
 * CARACTERIZAÇÃO — vocabulário e agendamento FSRS (`/api/vocab`), por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1) do baralho: leitura em lista, seleção
 * para jogo, página do catálogo, revisão FSRS (que move o `dueAt` e grava um `review_logs`),
 * dedup do bulk-add, edição e remoção. Cada resposta de rota crítica vira um snapshot de FORMA.
 * O que parecer errado está marcado com `// caracterizacao:` — o teste detecta mudança; a
 * correção é de outra fase.
 */
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { subirApp, resposta, semear, type AppDeTeste } from './_app'

describe('vocabulario e FSRS (self-host)', () => {
  let s: AppDeTeste
  let semente: Awaited<ReturnType<typeof semear>>
  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    semente = await semear(s, 'local-owner')
  })
  afterAll(async () => { await s.encerrar() })

  async function contarReviewLogs(): Promise<number> {
    const { client } = await s.load('../../server/db/db')
    const r = await client.execute('select count(*) as n from review_logs')
    return Number(r.rows[0].n)
  }

  it('GET /api/vocab lista os 4 cartoes semeados com a forma conhecida', async () => {
    const r = await s.get('/api/vocab')
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toHaveLength(4)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.json')
  })

  it('GET /api/vocab/para-jogo seleciona do baralho com a forma conhecida', async () => {
    const r = await s.get('/api/vocab/para-jogo?fonte=baralho&limite=10&estrategia=equilibrado')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.para-jogo.json')
  })

  it('GET /api/vocab/pagina?limite=10 devolve a pagina do catalogo', async () => {
    const r = await s.get('/api/vocab/pagina?limite=10')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.pagina.json')
  })

  it('GET /api/vocab/inicio-da-contagem devolve o marco da contagem', async () => {
    const r = await s.get('/api/vocab/inicio-da-contagem')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.vocab.inicio-da-contagem.json')
  })

  it('POST /api/vocab/:id/review {grade:3} move o dueAt para a frente e grava um review_log', async () => {
    const cartao = semente.cartoes[0]
    const antes = await contarReviewLogs()
    const r = await s.post(`/api/vocab/${cartao.id}/review`, { grade: 3 })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.id).toBe(cartao.id)
    expect(typeof corpo.dueAt).toBe('number')
    expect(corpo.dueAt).toBeGreaterThan(cartao.dueAt ?? 0)
    expect(corpo.lastReview).toBeGreaterThan(0)
    expect(await contarReviewLogs()).toBe(antes + 1)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.vocab.id.review.json')
  })

  it('review com grade 5 responde 400', async () => {
    const r = await s.post(`/api/vocab/${semente.cartoes[1].id}/review`, { grade: 5 })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.vocab.id.review.400.json')
  })

  it('review sem grade usa o default 3 do schema', async () => {
    const cartao = semente.cartoes[1]
    const antes = await contarReviewLogs()
    const r = await s.post(`/api/vocab/${cartao.id}/review`, {})
    expect(r.status).toBe(200)
    expect(await contarReviewLogs()).toBe(antes + 1)
    const { client } = await s.load('../../server/db/db')
    const log = await client.execute({ sql: 'select grade from review_logs where card_id = ? order by reviewed_at desc limit 1', args: [cartao.id] })
    expect(Number(log.rows[0].grade)).toBe(3)
  })

  it('review de um cartao inexistente (uuid aleatorio) responde 400, nao 404', async () => {
    const r = await s.post(`/api/vocab/${randomUUID()}/review`, { grade: 3 })
    // caracterizacao: comportamento atual, nao desejado — o repositorio lanca `card não encontrado`
    // e a rota traduz toda excecao em 400; o cliente nao distingue "nao existe" de "payload ruim".
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.vocab.id.review.inexistente.json')
  })

  it('POST /api/vocab/bulk-add com palavra repetida nao cria cartao novo', async () => {
    const r = await s.post('/api/vocab/bulk-add', { cards: [{ word: 'harvest', srcLang: 'en', back: 'colheita', sentence: 'Another harvest.' }] })
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.vocab.bulk-add.json')
    expect(await (await s.get('/api/vocab')).json()).toHaveLength(4)
  })

  it('bulk-add com palavra de 1 caractere responde 400', async () => {
    const r = await s.post('/api/vocab/bulk-add', { cards: [{ word: 'a', srcLang: 'en', back: 'x' }] })
    expect(r.status).toBe(400)
    expect(String((await r.json()).error)).toContain('cards.0.word')
  })

  it('PATCH /api/vocab/:id {back} devolve o cartao com procedencia', async () => {
    const cartao = semente.cartoes[2]
    const r = await s.patch(`/api/vocab/${cartao.id}`, { back: 'x' })
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.back).toBe('x')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/patch.vocab.id.json')
  })

  it('DELETE /api/vocab/:id responde {ok:true}, some da lista, e repetir tambem e 200', async () => {
    const cartao = semente.cartoes[3]
    const r = await s.del(`/api/vocab/${cartao.id}`)
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/delete.vocab.id.json')
    const lista = await (await s.get('/api/vocab')).json()
    expect(lista.map((c: { id: string }) => c.id)).not.toContain(cartao.id)
    expect(lista).toHaveLength(3)
    // caracterizacao: comportamento atual, nao desejado — o repositorio devolve `false` quando nao
    // afetou linha, mas a rota ignora o retorno e responde {ok:true} para um cartao ja removido.
    const denovo = await s.del(`/api/vocab/${cartao.id}`)
    expect(denovo.status).toBe(200)
    expect(await denovo.json()).toEqual({ ok: true })
  })
})
