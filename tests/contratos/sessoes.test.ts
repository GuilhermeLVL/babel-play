// @vitest-environment jsdom
/**
 * O MESMO PEDIDO, AS DUAS PONTAS, A MESMA FORMA (auditoria de 2026-09-07, achados A23 e A25).
 *
 * O cliente fala com dois servidores: o Express (com conta) e o servidor efêmero em IndexedDB
 * (modo anônimo, `src/data/efemero/servidor.ts`). Nada no repositório prendia os dois, e eles
 * divergiram em silêncio — a mesma chamada, com o mesmo corpo, devolvia formas diferentes conforme
 * o modo. Quem paga por isso é a tela, que só tem um código para os dois.
 *
 * A divergência que este arquivo trava primeiro: `POST /api/sessions` com `origemLocalId`. No
 * Express a coluna tem índice único e reenviar devolve `jaExistia: true`; no efêmero o campo era
 * ignorado, então a migração de anônimo para conta, interrompida e repetida, duplicava tudo do
 * lado de cá — e é justamente na migração que a repetição é esperada.
 *
 * O método é comparar FORMAS (chaves e tipos), não valores: ids e carimbos de tempo são de cada
 * lado por natureza. O que precisa ser igual é o contrato.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore } from '../../src/data/efemero/store'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let sessionsRouter: any

const U = asUserId('contrato-u1')

/** A forma de um valor: chaves e tipos, recursivo um nível. Valores não entram na comparação. */
function forma(valor: unknown): unknown {
  if (valor === null) return 'null'
  if (Array.isArray(valor)) return valor.length ? [forma(valor[0])] : []
  if (typeof valor === 'object') {
    const fora: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
      fora[k] = forma(v)
    }
    return fora
  }
  return typeof valor
}

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

/** Invoca o handler do Express registrado para (método, caminho), sem subir servidor. */
async function noExpress(metodo: string, caminho: string, corpo?: unknown) {
  const camada = sessionsRouter.stack.find(
    (l: any) => l.route?.path === caminho && l.route?.methods?.[metodo.toLowerCase()],
  )
  if (!camada) throw new Error(`rota ${metodo} ${caminho} não existe no Express`)
  const req: any = { userId: U, path: caminho, query: {}, params: {}, body: corpo ?? {} }
  const res = fakeRes()
  await camada.route.stack[0].handle(req, res, () => {})
  return { status: res.statusCode, body: res.body }
}

async function noEfemero(metodo: string, caminho: string, corpo?: unknown) {
  const res = await servidorEfemero(caminho, {
    method: metodo,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRouter } = (await h.load('../../server/routes/sessions')) as any)
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

const SESSAO = {
  title: 'Contrato',
  kind: 'audio',
  sourceLang: 'en',
  targetLang: 'pt',
  status: 'done',
  durationMs: 1000,
  utterances: [
    { idx: 0, source: 'mic', sourceLang: 'en', sourceText: 'hello there', targetLang: 'pt', translatedText: 'olá' },
  ],
}

describe('POST /api/sessions — as duas pontas', () => {
  it('a criação devolve a mesma forma nos dois servidores', async () => {
    /* `origemLocalId` tem mínimo de 8 caracteres no schema do Express (`createSessionSchema`) e
       nenhum mínimo no efêmero. É uma diferença de FRONTEIRA, não de contrato: o efêmero aceita
       um superconjunto, e quem gera o id é a migração, que usa uuid. */
    const express = await noExpress('POST', '/', { ...SESSAO, origemLocalId: 'local-0000001' })
    const efemero = await noEfemero('POST', '/api/sessions', { ...SESSAO, origemLocalId: 'efem-00000001' })

    expect(express.status).toBe(200)
    expect(efemero.status).toBe(200)

    /* Chaves em comum precisam ter o mesmo TIPO. Cada lado pode ter campos próprios (o Express
       carrega colunas que o IndexedDB não tem), mas onde os dois falam, precisam falar igual. */
    const a = forma(express.body) as Record<string, string>
    const b = forma(efemero.body) as Record<string, string>
    for (const chave of Object.keys(a)) {
      if (!(chave in b)) continue
      expect(b[chave], `campo "${chave}" tem tipos diferentes entre Express e efêmero`).toEqual(a[chave])
    }
    for (const obrigatoria of ['id', 'title', 'kind', 'sourceLang', 'targetLang', 'status', 'createdAt']) {
      expect(Object.keys(a), `Express não devolve "${obrigatoria}"`).toContain(obrigatoria)
      expect(Object.keys(b), `efêmero não devolve "${obrigatoria}"`).toContain(obrigatoria)
    }
  })

  it('reenviar com o mesmo origemLocalId NÃO duplica, nos dois', async () => {
    const corpoExpress = { ...SESSAO, origemLocalId: 'repetido-express' }
    const corpoEfemero = { ...SESSAO, origemLocalId: 'repetido-efemero' }

    const e1 = await noExpress('POST', '/', corpoExpress)
    const e2 = await noExpress('POST', '/', corpoExpress)
    expect(e2.body.jaExistia, 'Express: a segunda criação precisa ser reconhecida').toBe(true)
    expect(e2.body.id).toBe(e1.body.id)

    const f1 = await noEfemero('POST', '/api/sessions', corpoEfemero)
    const f2 = await noEfemero('POST', '/api/sessions', corpoEfemero)
    /* O DEFEITO QUE ISTO TRAVA: aqui o campo era ignorado e a segunda chamada criava outra sessão.
       A migração de anônimo para conta é exatamente o caminho que repete a chamada. */
    expect(f2.body.jaExistia, 'efêmero: a segunda criação precisa ser reconhecida').toBe(true)
    expect(f2.body.id).toBe(f1.body.id)
  })

  it('sem origemLocalId, cada chamada é uma sessão nova nos dois lados', async () => {
    const e1 = await noExpress('POST', '/', SESSAO)
    const e2 = await noExpress('POST', '/', SESSAO)
    expect(e2.body.id).not.toBe(e1.body.id)

    const f1 = await noEfemero('POST', '/api/sessions', SESSAO)
    const f2 = await noEfemero('POST', '/api/sessions', SESSAO)
    expect(f2.body.id).not.toBe(f1.body.id)
  })
})
