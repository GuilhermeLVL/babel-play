/**
 * Rotas do acervo Anki (`openspec/changes/motor-anki-acervo`, tasks 5.1–5.7).
 *
 * Invoca os handlers registrados nos routers diretamente (sem subir servidor), padrão de
 * `lgpd-conta.test.ts`. `POST /api/import/anki` usa o formato TEXTO (`x-filename: baralho.txt`)
 * em vez de um `.apkg` real — evita montar um SQLite/zip só para o teste, e o parser de texto
 * (`lerTextoAnki`, que não é meu para editar) já devolve exatamente o mesmo `LeituraAnki` que o
 * `.apkg` devolveria.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId, type UserId } from '../../server/lib/authContext'

const U = asUserId('anki-rotas-user')
const OUTRO = asUserId('anki-rotas-outro')

let h: EphemeralDb
let importRouter: any
let ankiRouter: any
let ankiRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ importRouter } = await h.load('../../server/routes/import'))
  ;({ ankiRouter } = await h.load('../../server/routes/anki'))
  ;({ ankiRepo } = await h.load('../../server/db/repositories/anki'))
})
afterAll(async () => { await h?.cleanup?.() })

/** Acha o handler de UMA rota (método+caminho) na pilha do router — mesmo padrão de `lgpd-conta`. */
function handler(router: any, metodo: 'get' | 'post' | 'delete', caminho: string) {
  const layer = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  if (!layer) throw new Error(`rota ${metodo.toUpperCase()} ${caminho} não registrada`)
  // A rota de import tem middlewares antes do handler real (raw(), erroDeTamanho) — o handler da
  // aplicação é sempre o ÚLTIMO da pilha. As rotas do ankiRouter têm um handler só, então o
  // último também é o certo — não precisa de dois caminhos.
  const stack = layer.route.stack
  return stack[stack.length - 1].handle
}

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  r.setHeader = () => r
  return r
}

async function chamar(router: any, metodo: 'get' | 'post' | 'delete', caminho: string, req: any) {
  const res = fakeRes()
  await handler(router, metodo, caminho)({ path: caminho, body: {}, params: {}, query: {}, headers: {}, ...req } as any, res)
  return res
}

/** Corpo de texto TSV que `lerTextoAnki` reconhece — sem cabeçalho, então as duas linhas viram nota. */
function corpoTexto(linhas: Array<[string, string, string?]>) {
  return Buffer.from(linhas.map(([f, v, e]) => [f, v, e ?? ''].join('\t')).join('\n'), 'utf8')
}

async function importar(userId: UserId, nome: string, linhas: Array<[string, string, string?]>) {
  return chamar(importRouter, 'post', '/anki', {
    userId,
    headers: { 'x-filename': nome },
    body: corpoTexto(linhas),
  })
}

describe('POST /api/import/anki — grava o acervo (5.1)', () => {
  it('importar grava o acervo e devolve importId/deckId/resumo', async () => {
    const res = await importar(U, 'core2k.txt', [
      ['ledger', 'livro-razão', 'The company keeps a ledger.'],
      ['churn', 'evasão de clientes', 'High churn hurts revenue.'],
    ])

    expect(res.statusCode).toBe(200)
    expect(res.body.importId).toBeTruthy()
    expect(res.body.deckId).toBeTruthy()
    expect(res.body.resumo.notas).toBe(2)
    expect(res.body.resumo.novas).toBe(2)
    expect(res.body.amostra).toHaveLength(2)
    expect(res.body.amostra[0].frente).toBe('ledger')

    // O import ficou no acervo, consultável — e as notas realmente foram gravadas.
    const imp = await ankiRepo.lerImport(U, res.body.importId)
    expect(imp?.estado).toBe('concluido')
    expect(imp?.notasNovas).toBe(2)

    const notas = await ankiRepo.listarNotas(U, res.body.deckId, {})
    expect(notas.total).toBe(2)
  })

  it('reimportar o MESMO arquivo não duplica (mesmo deck, mesma nota, reportada como "iguais")', async () => {
    /*
     * LIMITAÇÃO DOCUMENTADA (ver `guidSintetico` em `server/routes/import.ts`): `NotaAnki`, o
     * tipo que `lerApkg`/`lerTextoAnki` devolvem (parser que não é meu para editar), não carrega
     * o `guid` estável do Anki — só existe dentro do SQLite interno, que o parser hoje não expõe.
     * A rota sintetiza um guid a partir de `notetype+frente+verso`, então "o MESMO arquivo" aqui é
     * bytes idênticos: o dedupe por guid funciona (não duplica), mas como nada mudou o ledger
     * reporta "iguais", não "atualizadas" — "atualizadas" exigiria um guid estável independente do
     * conteúdo, que o parser atual não fornece.
     */
    const conteudo: Array<[string, string, string?]> = [['orbit', 'órbita', 'The satellite orbit decayed.']]
    const primeiro = await importar(U, 'reimport.txt', conteudo)
    const deckId = primeiro.body.deckId

    const segundo = await importar(U, 'reimport.txt', conteudo)

    // Mesmo baralho (idempotente por arquivo+nome), mesma nota — não uma segunda.
    expect(segundo.body.deckId).toBe(deckId)
    expect(segundo.body.resumo.iguais).toBe(1)
    expect(segundo.body.resumo.novas).toBe(0)

    const notas = await ankiRepo.listarNotas(U, deckId, {})
    expect(notas.total).toBe(1)
  })
})

describe('POST /api/anki/decks/:id/ativar — projeta o lote (5.2)', () => {
  it('ativa as notas que servem e é idempotente numa segunda chamada', async () => {
    const imp = await importar(U, 'ativar.txt', [
      ['ledger', 'livro-razão', 'The company keeps a ledger.'],
      ['churn', 'evasão de clientes', 'High churn hurts revenue.'],
    ])
    const deckId = imp.body.deckId

    const r1 = await chamar(ankiRouter, 'post', '/decks/:id/ativar', { userId: U, params: { id: deckId }, body: {} })
    expect(r1.statusCode).toBe(200)
    expect(r1.body.ativadas).toBeGreaterThan(0)

    const r2 = await chamar(ankiRouter, 'post', '/decks/:id/ativar', { userId: U, params: { id: deckId }, body: {} })
    expect(r2.statusCode).toBe(200)
    expect(r2.body.ativadas).toBe(0)
    expect(r2.body.restantes).toBe(0)
  })
})

describe('DELETE /api/anki/decks/:id — purga exige confirmação (5.5)', () => {
  it('sem `confirmar: true` responde 400 e não apaga nada', async () => {
    const imp = await importar(U, 'purgar.txt', [['solvent', 'solvente', '']])
    const deckId = imp.body.deckId

    const res = await chamar(ankiRouter, 'delete', '/decks/:id', { userId: U, params: { id: deckId }, body: {} })
    expect(res.statusCode).toBe(400)

    const notas = await ankiRepo.listarNotas(U, deckId, {})
    expect(notas.total).toBe(1)
  })

  it('com `confirmar: true` apaga notas e deck', async () => {
    const imp = await importar(U, 'purgar2.txt', [['solvent', 'solvente', '']])
    const deckId = imp.body.deckId

    const res = await chamar(ankiRouter, 'delete', '/decks/:id', { userId: U, params: { id: deckId }, body: { confirmar: true } })
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.notasApagadas).toBe(1)

    const decks = await ankiRepo.listarBaralhos(U)
    expect(decks.find((d: any) => d.id === deckId)).toBeUndefined()
  })
})

describe('Escopo por userId — baralho de outro usuário nunca aparece (5.7)', () => {
  it('GET /decks/:id/notas de baralho alheio responde 404', async () => {
    const imp = await importar(U, 'privado.txt', [['secret', 'segredo', '']])
    const res = await chamar(ankiRouter, 'get', '/decks/:id/notas', { userId: OUTRO, params: { id: imp.body.deckId }, query: {} })
    expect(res.statusCode).toBe(404)
  })

  it('POST /decks/:id/ativar de baralho alheio responde 404 e não projeta nada', async () => {
    const imp = await importar(U, 'privado2.txt', [['secret', 'segredo', '']])
    const res = await chamar(ankiRouter, 'post', '/decks/:id/ativar', { userId: OUTRO, params: { id: imp.body.deckId }, body: {} })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE de baralho alheio responde 404, mesmo com confirmar:true', async () => {
    const imp = await importar(U, 'privado3.txt', [['secret', 'segredo', '']])
    const res = await chamar(ankiRouter, 'delete', '/decks/:id', { userId: OUTRO, params: { id: imp.body.deckId }, body: { confirmar: true } })
    expect(res.statusCode).toBe(404)

    const notas = await ankiRepo.listarNotas(U, imp.body.deckId, {})
    expect(notas.total).toBe(1)
  })
})

describe('GET /api/anki/imports/:id — progresso (5.3)', () => {
  it('devolve o estado e os contadores do import', async () => {
    const imp = await importar(U, 'progresso.txt', [
      ['ledger', 'livro-razão', ''],
      ['churn', 'evasão', ''],
    ])
    const res = await chamar(ankiRouter, 'get', '/imports/:id', { userId: U, params: { id: imp.body.importId } })
    expect(res.statusCode).toBe(200)
    expect(res.body.estado).toBe('concluido')
    expect(res.body.notasNovas).toBe(2)
  })

  it('import alheio responde 404', async () => {
    const imp = await importar(U, 'progresso2.txt', [['ledger', 'livro-razão', '']])
    const res = await chamar(ankiRouter, 'get', '/imports/:id', { userId: OUTRO, params: { id: imp.body.importId } })
    expect(res.statusCode).toBe(404)
  })
})
