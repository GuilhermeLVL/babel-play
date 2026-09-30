/**
 * A MIGRAÇÃO 0041 (matriz v2, change `planos-v2`, ADR 0011): o Essencial e o Pro viram Premium no
 * BANCO — `subscriptions.plan`, `flags.regras.planos` e `flags.payload.gatilhos[].planos` — e a
 * assinatura ganha `ciclo`, `meio` e `provider_installment_id` para o anual e o 12x do C5.
 *
 * O banco nasce vazio (a 0041 já roda por cima da semente da 0039, que ainda dizia `essencial`), e as
 * linhas antigas são escritas DEPOIS, à mão, para reaplicar os UPDATEs da 0041 sobre elas — é assim
 * que o banco de produção estará no dia do deploy. Reaplicar é idempotente.
 *
 * O QUE ESTÁ SENDO PROVADO, além da troca de nome:
 *   - nenhuma lista fica com `premium` repetido (o schema das regras limita a lista ao tamanho de
 *     `PLANOS_DA_FLAG`, e uma repetição desligaria a flag inteira);
 *   - nos gatilhos de OFERTA o nome antigo SAI, em vez de virar `premium`: eram gatilhos de venda do
 *     Pro, e o Premium não tem para onde subir. Lista que ficaria vazia vira `["premium"]`;
 *   - o payload continua passando no schema de ofertas.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

type Cliente = {
  execute: (q: string | { sql: string; args: unknown[] }) => Promise<{ rows: Array<Record<string, unknown>> }>
}

const MIGRACAO = path.join('server', 'db', 'migrations', '0041_planos_v2.sql')
/** Só os UPDATEs: o `ALTER TABLE ... ADD` não é reexecutável, e é o dado que interessa aqui. */
const updatesDaMigracao = () =>
  readFileSync(MIGRACAO, 'utf8')
    .split(/-->\s*statement-breakpoint/)
    .map((c) => c.replace(/--[^\n]*/g, '').trim())
    .filter((c) => /^UPDATE\b/i.test(c))

let h: EphemeralDb
let client: Cliente

beforeAll(async () => {
  h = await setupEphemeralDb()
  client = ((await h.load('../../server/db/db')) as { client: Cliente }).client
})
afterAll(async () => {
  await h.cleanup()
})

const reaplicar = async () => {
  for (const c of updatesDaMigracao()) await client.execute(c)
}

async function assinatura(id: string, plan: string, extra: { provider?: string; sub?: string } = {}) {
  const agora = Date.now()
  await client.execute({
    sql: `INSERT INTO subscriptions (id, created_at, updated_at, user_id, plan, status, provider, provider_subscription_id)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    args: [`s-${id}`, agora, agora, id, plan, extra.provider ?? null, extra.sub ?? null],
  })
}

const planoDe = async (id: string) =>
  (
    await client.execute({
      sql: 'SELECT plan, ciclo, meio, provider_installment_id FROM subscriptions WHERE user_id = ?',
      args: [id],
    })
  ).rows[0]

async function flag(chave: string, regras: unknown, payload: unknown = null) {
  await client.execute({
    sql: `INSERT OR REPLACE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por)
          VALUES (?, 'teste', 1, ?, ?, 1, 'teste')`,
    args: [chave, JSON.stringify(regras), payload === null ? null : JSON.stringify(payload)],
  })
}

const lerFlag = async (chave: string) => {
  const l = (await client.execute({ sql: 'SELECT regras, payload FROM flags WHERE chave = ?', args: [chave] })).rows[0]
  return { regras: JSON.parse(String(l.regras)), payload: l.payload === null ? null : JSON.parse(String(l.payload)) }
}

describe('subscriptions', () => {
  it('as colunas novas existem, com o mensal como padrão', async () => {
    await assinatura('u-novo', 'premium')
    expect(await planoDe('u-novo')).toEqual({
      plan: 'premium',
      ciclo: 'mensal',
      meio: null,
      provider_installment_id: null,
    })
  })

  it('essencial e pro viram premium; o resto não muda', async () => {
    await assinatura('u-ess', 'essencial', { provider: 'asaas', sub: 'sub_1' })
    await assinatura('u-pro', 'pro', { provider: 'asaas', sub: 'sub_2' })
    await assinatura('u-free', 'free')
    await assinatura('u-self', 'selfhost')
    await reaplicar()
    expect((await planoDe('u-ess')).plan).toBe('premium')
    expect((await planoDe('u-pro')).plan).toBe('premium')
    expect((await planoDe('u-free')).plan).toBe('free')
    expect((await planoDe('u-self')).plan).toBe('selfhost')
  })

  it('a assinatura do Asaas passa a dizer o meio; a concedida pelo admin fica sem meio', async () => {
    expect((await planoDe('u-pro')).meio).toBe('assinatura')
    expect((await planoDe('u-free')).meio).toBeNull()
  })
})

describe('flags.regras', () => {
  it('essencial e pro viram UM premium, sem repetir', async () => {
    await flag('teste_regras', { planos: ['free', 'essencial', 'pro', 'selfhost'], percentual: 50 })
    await reaplicar()
    const { regras } = await lerFlag('teste_regras')
    expect([...regras.planos].sort()).toEqual(['free', 'premium', 'selfhost'])
    expect(regras.percentual).toBe(50)
  })

  it('regra sem plano antigo e regra sem lista ficam intactas', async () => {
    await flag('teste_sem_antigo', { planos: ['free'] })
    await flag('teste_sem_lista', { percentual: 10 })
    await reaplicar()
    expect((await lerFlag('teste_sem_antigo')).regras).toEqual({ planos: ['free'] })
    expect((await lerFlag('teste_sem_lista')).regras).toEqual({ percentual: 10 })
  })

  it('a regra continua válida no schema do servidor', async () => {
    const { regrasSchema } = (await h.load('../../server/lib/flags')) as typeof import('../../server/lib/flags')
    expect(regrasSchema.safeParse((await lerFlag('teste_regras')).regras).success).toBe(true)
  })
})

describe('flags.payload (gatilhos de oferta)', () => {
  it('a semente da 0039 já sai sem essencial, e o payload passa no schema de ofertas', async () => {
    const { payload } = await lerFlag('oferta_planos')
    const planos = payload.gatilhos.flatMap((g: { planos: string[] }) => g.planos)
    expect(planos).not.toContain('essencial')
    expect(planos).not.toContain('pro')
    const { ofertasSchema } = (await h.load('../../server/lib/ofertas')) as typeof import('../../server/lib/ofertas')
    const r = ofertasSchema.safeParse(payload)
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    // Os gatilhos de venda continuam do Grátis — e nenhum passou a mirar quem já paga o Premium.
    const cotaAcabou = payload.gatilhos.find((g: { id: string }) => g.id === 'cota_acabou')
    expect(cotaAcabou.planos).toEqual(['free'])
  })

  it('o nome antigo SAI da lista; lista que ficaria vazia vira ["premium"]; a ordem dos gatilhos fica', async () => {
    await flag(
      'teste_payload',
      {},
      {
        gatilhos: [
          { id: 'a', planos: ['free', 'essencial'] },
          { id: 'b', planos: ['pro'] },
          { id: 'c', planos: ['convidado'] },
          { id: 'd', planos: ['essencial', 'pro'] },
        ],
      },
    )
    await reaplicar()
    const { payload } = await lerFlag('teste_payload')
    expect(payload.gatilhos).toEqual([
      { id: 'a', planos: ['free'] },
      { id: 'b', planos: ['premium'] },
      { id: 'c', planos: ['convidado'] },
      { id: 'd', planos: ['premium'] },
    ])
  })

  it('payload que não é JSON válido não derruba a migração nem é tocado', async () => {
    await client.execute(
      `INSERT OR REPLACE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em) VALUES ('teste_quebrada', '', 0, 'nao-json', 'nao-json', 1)`,
    )
    await reaplicar()
    const l = (await client.execute(`SELECT regras, payload FROM flags WHERE chave = 'teste_quebrada'`)).rows[0]
    expect(l).toEqual({ regras: 'nao-json', payload: 'nao-json' })
  })
})

describe('idempotência', () => {
  it('reaplicar não muda nada', async () => {
    const antes = (await client.execute('SELECT chave, regras, payload FROM flags ORDER BY chave')).rows
    const subsAntes = (await client.execute('SELECT user_id, plan, meio FROM subscriptions ORDER BY user_id')).rows
    await reaplicar()
    expect((await client.execute('SELECT chave, regras, payload FROM flags ORDER BY chave')).rows).toEqual(antes)
    expect((await client.execute('SELECT user_id, plan, meio FROM subscriptions ORDER BY user_id')).rows).toEqual(
      subsAntes,
    )
  })
})
