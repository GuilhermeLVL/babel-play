/**
 * F5-03 — LGPD: exportação e exclusão de conta.
 *
 * Não existia rota nenhuma para nenhuma das duas coisas. O que este arquivo amarra é justamente o
 * que uma implementação parcial deixaria passar sem ninguém notar:
 *
 *  1. a exportação alcança TODAS as tabelas com dado do titular (uma esquecida = dado invisível
 *     para quem pediu os próprios dados);
 *  2. a exportação NÃO carrega valor de segredo — nem cifrado, nem decifrado;
 *  3. a exclusão não deixa NENHUMA linha em NENHUMA tabela, inclusive `vocab_occurrences` e
 *     `secrets` — que só na F3-04 ganharam `deleted_at` (e `secrets`, também `user_id`), e cujo
 *     apagamento continua sendo FÍSICO, não soft;
 *  4. excluir A não encosta em B — nem nas linhas, nem no segredo, nem no áudio no disco;
 *  5. falha ao apagar o arquivo de mídia é REPORTADA, não engolida (mesmo contrato do P1-9).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId, type UserId } from '../../server/lib/authContext'

const SEGREDO = (id: string) => `sk-CHAVE-DO-${id}-nunca-real-00000`

/** As tabelas que a exclusão precisa alcançar, com a coluna que liga a linha ao titular. */
const TABELAS: [string, string][] = [
  ['sessions', 'userId'], ['utterances', 'userId'], ['vocabCards', 'userId'],
  ['vocabOccurrences', 'userId'], ['reviewLogs', 'userId'], ['exerciseResults', 'userId'],
  ['analyses', 'userId'], ['settings', 'userId'],
  ['profiles', 'userId'], ['userInterests', 'userId'], ['providerCredentials', 'userId'],
  ['seedSpends', 'userId'], ['subscriptions', 'userId'], ['usageCounters', 'userId'],
]

let h: EphemeralDb
let audioDir: string
let db: any
let schema: any
let eq: any
let router: any
let sessionsRepo: any
let credentialsRepo: any
let perfilRepo: any
let settingsRepo: any
let subscriptionsRepo: any
let usersRepo: any

interface Semeado { u: UserId; sessaoId: string; arquivo: string; credId: string }
const semeados: Record<string, Semeado> = {}

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-lgpd-'))
  process.env.AUDIO_DIR = audioDir
  h = await setupEphemeralDb()
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
  ;({ eq } = await h.load('drizzle-orm'))
  ;({ meRouter: router } = await h.load('../../server/routes/me'))
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ credentialsRepo } = await h.load('../../server/db/repositories/credentials'))
  ;({ perfilRepo } = await h.load('../../server/db/repositories/perfil'))
  ;({ settingsRepo } = await h.load('../../server/db/repositories/settings'))
  ;({ subscriptionsRepo } = await h.load('../../server/db/repositories/subscriptions'))
  ;({ usersRepo } = await h.load('../../server/db/repositories/users'))

  // Perfil BUILTIN (user_id NULL, compartilhado): a exclusão de um titular não pode levá-lo junto.
  await db.insert(schema.profiles).values({
    id: 'perfil-builtin', createdAt: 1, updatedAt: 1, userId: null, name: 'global', builtin: 1,
  })

  for (const id of ['A', 'B', 'C']) semeados[id] = await semear(id)
})

afterAll(async () => {
  delete process.env.AUDIO_DIR
  await h.cleanup()
})

/** Uma linha do titular em CADA tabela + um arquivo de áudio real no disco. */
async function semear(id: string): Promise<Semeado> {
  const u = asUserId(`user-${id}`)
  const now = Date.now()
  const meta = { createdAt: now, updatedAt: now, userId: `user-${id}` }

  const sessao = await sessionsRepo.createWithUtterances(u, { title: `sess-${id}` }, [
    { idx: 0, sourceText: `fala de ${id}`, sourceLang: 'pt', targetLang: 'en' },
  ])
  const arquivo = `${sessao.id}.webm`
  writeFileSync(path.join(audioDir, arquivo), Buffer.alloc(8, 7))
  await sessionsRepo.setAudio(u, sessao.id, arquivo, 'audio/webm')

  await usersRepo.ensure(u, `${id}@exemplo.test`)
  await perfilRepo.atualizar(u, { displayName: `nome-${id}`, interests: ['musica', 'jogos'] })
  await settingsRepo.update(u, { targetLanguage: 'en' })
  await subscriptionsRepo.upsert(u, { plan: 'pro', status: 'active' })
  const cred = await credentialsRepo.create(u, { label: `cred-${id}`, kind: 'openai', secret: SEGREDO(id) })

  await db.insert(schema.vocabCards).values({ id: `card-${id}`, ...meta, word: `palavra-${id}`, normKey: `en|palavra-${id}`, occurrences: 1 })
  await db.insert(schema.vocabOccurrences).values({ id: `occ-${id}`, ...meta, cardId: `card-${id}`, occurredAt: now, originKind: 'sessao', originRef: sessao.id })
  await db.insert(schema.reviewLogs).values({ id: `rev-${id}`, ...meta, cardId: `card-${id}`, reviewedAt: now, grade: 3 })
  await db.insert(schema.exerciseResults).values({ id: `ex-${id}`, ...meta, kind: 'quiz', correct: 1, exerciseKind: 'blitz' })
  await db.insert(schema.analyses).values({ id: `an-${id}`, ...meta, sessionId: sessao.id, analysis: '{}' })
  await db.insert(schema.profiles).values({ id: `prof-${id}`, ...meta, name: `perfil-${id}` })
  await db.insert(schema.seedSpends).values({ id: `sp-${id}`, ...meta, spendId: `sp-${id}`, amount: 5, reason: 'pular-rodada' })
  await db.insert(schema.usageCounters).values({ id: `uc-${id}`, ...meta, metric: 'llm_tokens', window: '2026-08', count: 10 })

  return { u, sessaoId: sessao.id, arquivo, credId: cred.id }
}

/** Invoca o handler registrado no router, sem subir servidor (padrão de delete-sessao-audio). */
function handler(metodo: 'get' | 'delete', caminho: string) {
  const layer = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  if (!layer) throw new Error(`rota ${metodo.toUpperCase()} ${caminho} não registrada`)
  return layer.route.stack[0].handle
}
function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  r.setHeader = () => r
  return r
}
async function chamar(metodo: 'get' | 'delete', caminho: string, req: any) {
  const res = fakeRes()
  await handler(metodo, caminho)({ path: caminho, body: {}, ...req } as any, res)
  return res
}

/** Quantas linhas VIVAS OU MORTAS o titular ainda tem em cada tabela. */
async function linhasDe(userId: UserId): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const [nome] of TABELAS) {
    const t = schema[nome]
    out[nome] = (await db.select({ id: t.id }).from(t).where(eq(t.userId, userId))).length
  }
  out.users = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId))).length
  return out
}

async function segredoExiste(ref: string): Promise<boolean> {
  return (await db.select({ ref: schema.secrets.ref }).from(schema.secrets).where(eq(schema.secrets.ref, ref))).length > 0
}

describe('F5-03 — GET /api/me/exportar', () => {
  it('traz dado de TODAS as tabelas do titular', async () => {
    const res = await chamar('get', '/exportar', { userId: semeados.A.u })
    expect(res.statusCode).toBe(200)

    for (const [nome] of TABELAS) {
      expect(res.body.dados[nome], `tabela ausente ou vazia na exportação: ${nome}`).not.toHaveLength(0)
    }
    expect(res.body.dados.secrets).toHaveLength(1)
    expect(res.body.usuario.id).toBe('user-A')
    expect(res.body.usuario.displayName).toBe('nome-A')
    expect(res.body.arquivosDeMidia).toEqual([semeados.A.arquivo])
  })

  it('não traz dado de OUTRO usuário', async () => {
    const res = await chamar('get', '/exportar', { userId: semeados.A.u })
    const bruto = JSON.stringify(res.body)
    expect(bruto).not.toContain('user-B')
    expect(bruto).not.toContain('fala de B')
    // O perfil builtin (user_id NULL) é global, não do titular.
    expect(bruto).not.toContain('perfil-builtin')
  })

  it('NUNCA traz o valor do segredo — nem cifrado, nem decifrado', async () => {
    const res = await chamar('get', '/exportar', { userId: semeados.A.u })
    const bruto = JSON.stringify(res.body)

    expect(bruto).not.toContain(SEGREDO('A'))
    expect(bruto).not.toContain('valueEncrypted')
    expect(bruto).not.toContain('value_encrypted')
    // Confere contra o que está REALMENTE no banco (o cifrado muda a cada execução).
    const [linha] = await db.select().from(schema.secrets)
    expect(linha.valueEncrypted.length).toBeGreaterThan(0)
    expect(bruto).not.toContain(linha.valueEncrypted)

    // O metadado, sim: dá para saber que a credencial existe e que ela tem um segredo.
    expect(res.body.dados.providerCredentials[0]).toMatchObject({ label: 'cred-A', kind: 'openai', temSegredo: true })
    expect(res.body.dados.providerCredentials[0].secretRef).toBeUndefined()
    expect(res.body.dados.secrets[0]).toMatchObject({ temValor: true })
  })
})

describe('F5-03 — DELETE /api/me', () => {
  it('sem `confirmar: true` → 400 e nada é apagado', async () => {
    const res = await chamar('delete', '/', { userId: semeados.A.u, body: {} })
    expect(res.statusCode).toBe(400)
    const restante = await linhasDe(semeados.A.u)
    for (const [nome, n] of Object.entries(restante)) expect(n, nome).toBeGreaterThan(0)
  })

  it('apaga o áudio, reporta por tabela e responde ok', async () => {
    const res = await chamar('delete', '/', { userId: semeados.A.u, body: { confirmar: true } })

    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.arquivos).toEqual({ apagados: 1, falhas: [] })
    expect(existsSync(path.join(audioDir, semeados.A.arquivo))).toBe(false)
    // O relatório cobre as duas tabelas sem soft delete, que são o ponto do achado.
    expect(res.body.linhasPorTabela.vocabOccurrences).toBe(1)
    expect(res.body.linhasPorTabela.secrets).toBe(1)
    expect(res.body.linhasPorTabela.users).toBe(1)
    expect(res.body.totalDeLinhas).toBeGreaterThan(15)
  })

  it('não sobra NENHUMA linha do titular em NENHUMA tabela', async () => {
    const restante = await linhasDe(semeados.A.u)
    for (const [nome, n] of Object.entries(restante)) expect(n, `sobrou linha em ${nome}`).toBe(0)
    // `secrets` não tem user_id: só se chega a ela pela secret_ref da credencial já apagada.
    expect(await segredoExiste(`cred_${semeados.A.credId}`)).toBe(false)
  })

  it('a exclusão de A não tocou no dado de B', async () => {
    const restante = await linhasDe(semeados.B.u)
    for (const [nome, n] of Object.entries(restante)) expect(n, `B perdeu linha em ${nome}`).toBeGreaterThan(0)

    expect(await segredoExiste(`cred_${semeados.B.credId}`)).toBe(true)
    expect((await credentialsRepo.getSecret(semeados.B.u, semeados.B.credId)).secret).toBe(SEGREDO('B'))
    expect(existsSync(path.join(audioDir, semeados.B.arquivo))).toBe(true)
    expect(await sessionsRepo.get(semeados.B.u, semeados.B.sessaoId)).toBeDefined()
  })

  it('nem no perfil builtin, que é compartilhado (user_id NULL)', async () => {
    const globais = await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'perfil-builtin'))
    expect(globais).toHaveLength(1)
  })

  /**
   * Falha REAL, sem mock: `rm` sem `recursive` sobre um DIRETÓRIO lança ERR_FS_EISDIR — o mesmo
   * truque de `delete-sessao-audio.test.ts` (espiar `node:fs/promises` não funcionaria, `rm` é
   * import nomeado ESM, ligado no load).
   */
  it('falha ao apagar mídia é reportada, mas as linhas SEMPRE saem', async () => {
    const preso = `${semeados.C.sessaoId}-preso.webm`
    mkdirSync(path.join(audioDir, preso))
    await sessionsRepo.setAudio(semeados.C.u, semeados.C.sessaoId, preso, 'audio/webm')

    const res = await chamar('delete', '/', { userId: semeados.C.u, body: { confirmar: true } })

    expect(res.statusCode).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.arquivos.falhas).toHaveLength(1)
    expect(res.body.arquivos.falhas[0].arquivo).toBe(preso)
    expect(String(res.body.error)).toMatch(/mídia/i)

    const restante = await linhasDe(semeados.C.u)
    for (const [nome, n] of Object.entries(restante)) expect(n, `sobrou linha em ${nome}`).toBe(0)
  })
})
