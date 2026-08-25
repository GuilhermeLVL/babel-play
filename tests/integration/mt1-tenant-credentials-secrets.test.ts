/**
 * Marco 1 — Commit 8: isolamento de provider_credentials + secrets.
 *
 * O controle mais afiado: o proxy de IA aceita o `x-credential-id` do cliente. Sem escopo, o
 * usuário B poderia mandar o credentialId do A e fazer a chave do A ser usada (exfiltração-por-
 * referência). `secrets` não tem user_id, mas só é alcançável via provider_credentials — então
 * escopar a credencial isola o segredo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')
const SECRET_A = 'sk-CHAVE-DO-A-nunca-real-00000'

let h: EphemeralDb
let repo: any
let credA: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ credentialsRepo: repo } = await h.load('../../server/db/repositories/credentials'))
  credA = await repo.create(A, { label: 'a', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', secret: SECRET_A })
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento credentials/secrets', () => {
  it('list só devolve as credenciais do próprio usuário', async () => {
    expect((await repo.list(A)).map((c: any) => c.id)).toEqual([credA.id])
    expect(await repo.list(B)).toHaveLength(0)
  })

  it('CRÍTICO: getSecret(B, credDoA) lança — B nunca resolve a chave de A por referência', async () => {
    await expect(repo.getSecret(B, credA.id)).rejects.toThrow()
    // o dono legítimo resolve normalmente
    expect((await repo.getSecret(A, credA.id)).secret).toBe(SECRET_A)
  })

  it('remove(B, credDoA) é no-op — B não apaga a credencial de A', async () => {
    await repo.remove(B, credA.id)
    expect((await repo.list(A)).map((c: any) => c.id)).toEqual([credA.id])
  })
})
