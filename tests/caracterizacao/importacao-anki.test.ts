/**
 * CARACTERIZAÇÃO — importação de baralho Anki em TEXTO e o acervo (`/api/import/anki`, `/api/anki`),
 * por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1). Um `expect` aqui que pareça
 * estranho está marcado com `// caracterizacao:` — o teste existe para detectar MUDANÇA, e a
 * correção, quando couber, pertence a outra fase.
 *
 * O formato é `.txt` separado por tabulação porque o parser de texto devolve o mesmo `LeituraAnki`
 * que o `.apkg`, sem precisar montar um SQLite dentro de um zip. O `.apkg` e o teto de tamanho já
 * têm cobertura em `tests/integration/anki-bomba.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { subirApp, resposta, type AppDeTeste } from './_app'

let s: AppDeTeste
beforeAll(async () => { s = await subirApp({ modo: 'self-host' }) })
afterAll(async () => { await s.encerrar() })

function enviarTexto(linhas: string[], nome?: string) {
  const headers: Record<string, string> = { 'content-type': 'text/plain', 'x-src-lang': 'en', 'x-tgt-lang': 'pt' }
  if (nome) headers['x-filename'] = nome
  return s.chamar('POST', '/api/import/anki', { raw: Buffer.from(linhas.join('\n'), 'utf8'), headers })
}

describe('fluxo feliz: importar, listar, ativar, jogar', () => {
  let deckId: string
  let importId: string

  it('POST /api/import/anki com um .txt de 3 linhas → 200 com resumo e amostra', async () => {
    const r = await enviarTexto(['apple\tmaçã', 'house\tcasa', 'water\tágua'], 'frutas.txt')
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    deckId = corpo.deckId
    importId = corpo.importId
    expect(deckId).toBeTruthy()
    expect(corpo.resumo.notas).toBe(3)
    expect(corpo.resumo.novas).toBe(3)
    expect(corpo.formato).toBe('texto (separado por tabulação)')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.import.anki.json')
  })

  it('GET /api/anki/decks lista o baralho com contagens', async () => {
    const r = await s.get('/api/anki/decks')
    expect(r.status).toBe(200)
    const decks = await r.clone().json() as Array<{ id: string; nome: string }>
    expect(decks.find((d) => d.id === deckId)?.nome).toBe('frutas')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.api.anki.decks.json')
  })

  it('GET /api/anki/decks/:id/notas?limite=50 devolve as 3 notas', async () => {
    const r = await s.get(`/api/anki/decks/${deckId}/notas?limite=50`)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.total).toBe(3)
    expect(corpo.itens.map((n: { frente: string }) => n.frente).sort()).toEqual(['apple', 'house', 'water'])
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.api.anki.decks.id.notas.json')
  })

  it('GET /api/anki/imports/:id devolve o ledger do import concluído', async () => {
    const r = await s.get(`/api/anki/imports/${importId}`)
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    expect(corpo.estado).toBe('concluido')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.api.anki.imports.id.json')
  })

  it('POST /api/anki/decks/:id/ativar → GET /api/vocab contém as palavras', async () => {
    const r = await s.post(`/api/anki/decks/${deckId}/ativar`, {})
    expect(r.status).toBe(200)
    // caracterizacao: comportamento atual — o import já ativa o primeiro lote sozinho, então este `ativar` não encontra nada novo e responde `ativadas: 0`
    expect((await r.clone().json()).ativadas).toBe(0)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.anki.decks.id.ativar.json')

    const vocab = await s.get('/api/vocab')
    expect(vocab.status).toBe(200)
    const palavras = (await vocab.json() as Array<{ word: string }>).map((c) => c.word)
    expect(palavras).toEqual(expect.arrayContaining(['apple', 'house', 'water']))
  })

  it('DELETE /api/anki/decks/:id sem `confirmar: true` → 400 e nada é apagado', async () => {
    const r = await s.chamar('DELETE', `/api/anki/decks/${deckId}`, { body: {} })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/delete.api.anki.decks.id.sem-confirmacao.json')
    expect((await s.get(`/api/anki/decks/${deckId}/notas`)).status).toBe(200)
  })

  it('DELETE /api/anki/decks/:id com `confirmar: true` → 200, e as notas passam a responder 404', async () => {
    const r = await s.chamar('DELETE', `/api/anki/decks/${deckId}`, { body: { confirmar: true } })
    expect(r.status).toBe(200)
    expect(await r.clone().json()).toEqual({ ok: true, notasApagadas: 3 })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/delete.api.anki.decks.id.json')

    const depois = await s.get(`/api/anki/decks/${deckId}/notas`)
    expect(depois.status).toBe(404)
    await expect(JSON.stringify(await resposta(depois), null, 2)).toMatchFileSnapshot('__snapshots__/get.api.anki.decks.id.notas.404.json')
  })
})

describe('campos hostis: o que fica gravado na nota', () => {
  it('HTML, entidades e [sound:] são limpos antes de gravar — e o bruto NÃO é preservado no .txt', async () => {
    const r = await enviarTexto([
      '<script>alert(1)</script>\tum',
      'dois\t<img src=x onerror=alert(1)> legenda',
      '&lt;b&gt; negrito\tbold',
      'casa [sound:x.mp3]\thouse',
      'apple\t[sound:x.mp3]',
    ], 'hostil.txt')
    expect(r.status).toBe(200)
    const corpo = await r.clone().json()
    // caracterizacao: comportamento atual, nao desejado — a 5a linha (verso só com `[sound:]`) some no parser de texto e o resumo diz `notas: 4`, sem contar a linha descartada em lugar nenhum da resposta
    expect(corpo.resumo.notas).toBe(4)

    const notas = await (await s.get(`/api/anki/decks/${corpo.deckId}/notas?limite=50`)).json()
    const gravado = (notas.itens as Array<{ frente: string; verso: string; camposBrutos: string }>)
      .map((n) => ({ frente: n.frente, verso: n.verso }))
      .sort((a, b) => a.frente.localeCompare(b.frente))
    /* caracterizacao: comportamento atual —
       - `<script>...</script>` perde só as tags: o conteúdo `alert(1)` fica como "palavra";
       - `<img ...>` inteiro vira espaço e some (o `onerror` vai junto);
       - `&lt;b&gt;` é DECODIFICADO depois da remoção de tags, então a nota guarda `<b>` literal;
       - `[sound:x.mp3]` vira espaço e some. */
    expect(gravado).toEqual([
      { frente: '<b> negrito', verso: 'bold' },
      { frente: 'alert(1)', verso: 'um' },
      { frente: 'casa', verso: 'house' },
      { frente: 'dois', verso: 'legenda' },
    ])
    // caracterizacao: comportamento atual, nao desejado — no formato texto `camposBrutos` não guarda o campo original: só `{ campos: {}, ... }`, então o HTML/mídia de origem não é recuperável depois
    for (const n of notas.itens as Array<{ camposBrutos: string }>) {
      expect(JSON.parse(n.camposBrutos).campos).toEqual({})
    }
  })
})

describe('entradas malformadas', () => {
  it('corpo vazio → 400 "arquivo vazio"', async () => {
    const r = await s.chamar('POST', '/api/import/anki', { headers: { 'x-filename': 'vazio.txt' } })
    expect(r.status).toBe(400)
    expect((await r.clone().json()).error).toBe('arquivo vazio')
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.import.anki.vazio.json')
  })

  it('sem x-filename → 400, mas pela tentativa de abrir o texto como .apkg', async () => {
    const r = await enviarTexto(['apple\tmaçã'])
    // caracterizacao: comportamento atual, nao desejado — `x-filename` é OPCIONAL no schema; sem ele o nome vira "baralho", o arquivo é tratado como .apkg (zip) e o 400 vem do leitor de zip, não da validação do cabeçalho
    expect(r.status).toBe(400)
    const corpo = await r.clone().json()
    expect(corpo.error).not.toMatch(/x-filename/)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.import.anki.sem-nome.json')
  })
})

describe('POST /api/anki/decks/:id/desativar', () => {
  it('desativa o baralho: as palavras somem do deck de jogo e o contrário reativa', async () => {
    const importado = await enviarTexto(['casa	house', 'ponte	bridge', 'rio	river'], 'desativar.txt')
    expect(importado.status).toBe(200)
    const { deckId } = await importado.json() as { deckId: string }
    const antes = await (await s.get('/api/vocab')).json() as unknown[]
    const r = await s.post(`/api/anki/decks/${deckId}/desativar`, {})
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/post.api.anki.decks.id.desativar.json')
    // caracterizacao: comportamento atual — desativar arquiva as NOTAS e marca o baralho, mas os
    // cartões já projetados em `vocab_cards` continuam no deck de jogo (a rota diz "nada é apagado")
    const depois = await (await s.get('/api/vocab')).json() as unknown[]
    expect(depois.length).toBe(antes.length)
    const decks = await (await s.get('/api/anki/decks')).json() as Array<{ id: string; estado?: string }>
    const deck = decks.find((d) => d.id === deckId)
    expect(deck).toBeTruthy()
    expect(deck?.estado).not.toBe('ativo')
    const reativar = await s.post(`/api/anki/decks/${deckId}/ativar`, {})
    expect(reativar.status).toBe(200)
    expect((await s.post('/api/anki/decks/00000000-0000-0000-0000-000000000000/desativar', {})).status).toBe(404)
  })
})

