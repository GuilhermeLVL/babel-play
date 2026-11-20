/**
 * Rotas do acervo Anki (`openspec/changes/motor-anki-acervo`, tasks 5.2–5.7): ativar, purgar, escopo por
 * usuário e progresso.
 *
 * Invoca os handlers registrados nos routers diretamente (sem subir servidor), padrão de
 * `lgpd-conta.test.ts`. O acervo é semeado pelo PROTOCOLO EM LOTES (`/api/anki/imports`: abrir → notas →
 * fechar), o único caminho de importação que existe; o protocolo em si (gravar, reimportar, S11, tetos) é
 * coberto por `anki-importacao-em-lotes.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId, type UserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const U = asUserId('anki-rotas-user')
const OUTRO = asUserId('anki-rotas-outro')

let h: EphemeralDb
let ankiImportsRouter: any
let ankiRouter: any
let ankiRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ ankiImportsRouter } = await h.load('../../server/routes/ankiImports'))
  ;({ ankiRouter } = await h.load('../../server/routes/anki'))
  ;({ ankiRepo } = await h.load('../../server/db/repositories/anki'))
})
afterAll(async () => {
  await h?.cleanup?.()
})

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
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  r.setHeader = () => r
  return r
}

async function chamar(router: any, metodo: 'get' | 'post' | 'delete', caminho: string, req: any) {
  const res = fakeRes()
  await handler(
    router,
    metodo,
    caminho,
  )({ path: caminho, body: {}, params: {}, query: {}, headers: {}, ...req } as any, res)
  return res
}

type Linha = [string, string, string?]

/** Uma nota como o leitor do navegador a monta (o servidor reaplica limpeza, guid e régua). */
function notaDoFio([frente, verso, exemplo]: Linha) {
  return {
    notetype: 'Basic',
    campos: ['Front', 'Back'],
    camposBrutos: { Front: frente, Back: verso },
    frente,
    verso,
    ...(exemplo ? { exemplo } : {}),
    tags: [],
  }
}

/** Abrir → um lote com as notas → fechar. Devolve a resposta do `fechar` (`importId`, `deckId`, `resumo`). */
async function semearPeloProtocolo(userId: UserId, nome: string, linhas: Linha[]) {
  const notas = linhas.map(notaDoFio)
  const aberto = await chamar(ankiImportsRouter, 'post', '/imports', {
    userId,
    body: {
      arquivo: nome,
      bytes: 100,
      formato: 'texto (separado por tabulação)',
      nomeNoArquivo: null,
      campos: ['Front', 'Back'],
      totalNoArquivo: notas.length,
      truncado: false,
      idiomaOrigem: 'en',
      idiomaAlvo: 'pt',
      amostra: notas.map((n) => ({ frente: n.frente, verso: n.verso })),
    },
  })
  expect(aberto.statusCode).toBe(200)
  const { importId } = aberto.body
  const lote = await chamar(ankiImportsRouter, 'post', '/imports/:id/notas', {
    userId,
    params: { id: importId },
    body: { notas },
  })
  expect(lote.statusCode).toBe(200)
  const fim = await chamar(ankiImportsRouter, 'post', '/imports/:id/fechar', {
    userId,
    params: { id: importId },
    body: {},
  })
  expect(fim.statusCode).toBe(200)
  return fim
}

const importar = semearPeloProtocolo

describe('POST /api/anki/decks/:id/ativar — projeta o lote (5.2)', () => {
  it('ativa as notas que servem e é idempotente numa segunda chamada', async () => {
    const imp = await importar(U, 'ativar.txt', [
      ['ledger', 'livro-razão', 'The company keeps a ledger.'],
      ['churn', 'evasão de clientes', 'High churn hurts revenue.'],
    ])
    const deckId = imp.body.deckId

    // O import já entrega um lote ativado (senão a tela de jogar continuava vazia depois de
    // importar — G0, defeito 2). O que a rota garante aqui é o RESTO e a idempotência.
    expect(imp.body.resumo.ativadas).toBeGreaterThan(0)

    const r1 = await chamar(ankiRouter, 'post', '/decks/:id/ativar', { userId: U, params: { id: deckId }, body: {} })
    expect(r1.statusCode).toBe(200)

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

    const res = await chamar(ankiRouter, 'delete', '/decks/:id', {
      userId: U,
      params: { id: deckId },
      body: { confirmar: true },
    })
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
    const res = await chamar(ankiRouter, 'get', '/decks/:id/notas', {
      userId: OUTRO,
      params: { id: imp.body.deckId },
      query: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /decks/:id/ativar de baralho alheio responde 404 e não projeta nada', async () => {
    const imp = await importar(U, 'privado2.txt', [['secret', 'segredo', '']])
    const res = await chamar(ankiRouter, 'post', '/decks/:id/ativar', {
      userId: OUTRO,
      params: { id: imp.body.deckId },
      body: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE de baralho alheio responde 404, mesmo com confirmar:true', async () => {
    const imp = await importar(U, 'privado3.txt', [['secret', 'segredo', '']])
    const res = await chamar(ankiRouter, 'delete', '/decks/:id', {
      userId: OUTRO,
      params: { id: imp.body.deckId },
      body: { confirmar: true },
    })
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
