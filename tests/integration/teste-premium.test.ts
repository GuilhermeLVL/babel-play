/**
 * O TESTE DE 14 DIAS DO PREMIUM, SEM CARTÃO (C6 da change `planos-v2`).
 *
 * Os contratos presos aqui, pelo app inteiro (`criarApp()`, JWT ES256 de verdade):
 * 1. Começa com UM toque (`POST /api/billing/teste`), dura 14 dias e NUNCA fala com o Asaas — não há
 *    cartão, cobrança nem renovação. O segundo toque não recomeça nada.
 * 2. O teste dá os entitlements do Premium, mas entra na admissão da nuvem como GRÁTIS: quem ainda não
 *    paga não disputa a capacidade de quem paga.
 * 3. Vence sozinho: no fim, a conta volta ao Grátis e o teste não recomeça.
 * 4. Apagar a conta e criar outra com o mesmo e-mail NÃO renova o teste: `marcas_de_teste` guarda só
 *    o HMAC do e-mail normalizado (com o segredo do servidor), sem ligação com a conta — e sobrevive à
 *    exclusão, por 730 dias.
 * 5. Perfil protegido (menor, ou sem idade declarada) não inicia sozinho: "peça ao seu responsável". O
 *    responsável vinculado ativa pelo menor, pelo mesmo `paraUsuario` do checkout.
 * 6. Nenhum dado pessoal no log.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const DIA = 86_400_000
let s: AppDeTeste

async function tk(sub: string, email: string | null = `${sub}@exemplo.com`): Promise<string> {
  return s.token(sub, email ? { email } : {})
}
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * DIA)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}
async function declarar(sub: string, anos: number, email?: string) {
  const r = await s.put('/api/me/idade', { nascimento: nascidoHa(anos) }, await tk(sub, email))
  expect(r.status).toBe(200)
}
async function testar(sub: string, email?: string | null, corpo: Record<string, unknown> = {}) {
  const r = await s.post('/api/billing/teste', corpo, await tk(sub, email))
  return { status: r.status, corpo: await r.json() }
}
async function entitlements(sub: string) {
  return (await s.get('/api/me/entitlements', await tk(sub))).json()
}
async function statusDoTeste(sub: string, email?: string) {
  return (await (await s.get('/api/billing/status', await tk(sub, email))).json()).teste
}

/** Toda chamada que sairia para o Asaas é registrada — o teste não pode fazer nenhuma. */
function vigiarAsaas() {
  const real = globalThis.fetch
  const chamadas: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    if (url.includes('asaas')) {
      chamadas.push(url)
      return new Response('{}', { status: 500 })
    }
    return real(input, init)
  })
  return chamadas
}

beforeAll(async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.CONVITE_LINK_NA_TELA = '1'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.ASAAS_API_KEY
  delete process.env.CONVITE_LINK_NA_TELA
  await s.encerrar()
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CHECKOUT_ENABLED
})

describe('um toque, 14 dias, sem cartão', () => {
  it('começa na hora, dá o Premium por 14 dias e não fala com o Asaas', async () => {
    await declarar('t-adulta', 30)
    const asaas = vigiarAsaas()
    const r = await testar('t-adulta')
    expect(r.status).toBe(200)
    expect(r.corpo.teste.terminaEm - r.corpo.teste.iniciadoEm).toBe(14 * DIA)
    expect(asaas, 'sem cartão, sem cobrança: nada vai ao Asaas').toEqual([])

    const e = await entitlements('t-adulta')
    expect(e.plan).toBe('premium')
    expect(e.managedCloudStt).toBe(true)
    expect(e.teste).toEqual({ terminaEm: r.corpo.teste.terminaEm })
    expect((await statusDoTeste('t-adulta')).estado).toBe('ativo')

    // O teste NÃO é uma assinatura: nenhuma linha em `subscriptions` (o `trialing` continua sendo
    // "checkout iniciado", outra coisa).
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    expect(await subscriptionsRepo.getActive('t-adulta')).toBeNull()
  })

  it('o segundo toque não recomeça o teste', async () => {
    const antes = await statusDoTeste('t-adulta')
    const r = await testar('t-adulta')
    expect(r.status).toBe(200)
    expect(r.corpo.teste.iniciadoEm).toBe(antes.iniciadoEm)
    expect(r.corpo.jaEstavaAtivo).toBe(true)
  })

  it('o teste tem os entitlements do Premium, mas entra na admissão como grátis', async () => {
    const { resolverPlano } = await s.load('../../server/lib/entitlements')
    const { planoDeAdmissao } = await s.load('../../server/ai/admissao')
    const { abrirPortaGratuita } = await s.load('../../server/lib/convidado')
    const r = await resolverPlano('t-adulta')
    expect(r.plano).toBe('premium')
    expect(r.teste).not.toBeNull()
    const porta = await abrirPortaGratuita(
      { userId: 't-adulta', path: '/api/ai/stt', header: () => undefined, ip: '127.0.0.1' },
      { status: () => ({ json: () => undefined }), setHeader: () => undefined },
      'stt',
    )
    expect(porta.teste).toBe(true)
    expect(planoDeAdmissao(porta.plano, false, porta.teste)).toBe('gratis')
    // E quem PAGA continua na faixa de quem paga.
    expect(planoDeAdmissao('premium', false, false)).toBe('premium')
  })

  it('nenhum dado pessoal no log', async () => {
    await declarar('t-log', 30, 'segredo.do.log@exemplo.com')
    const linhas: string[] = []
    for (const m of ['log', 'warn', 'error'] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void linhas.push(a.join(' ')))
    const r = await testar('t-log', 'segredo.do.log@exemplo.com')
    expect(r.status).toBe(200)
    expect(linhas.join('\n')).not.toMatch(/segredo\.do\.log/)
  })
})

describe('vence sozinho e não renova', () => {
  it('no fim, a conta volta ao Grátis, sem cobrança, e o teste não recomeça', async () => {
    await declarar('t-vence', 30)
    expect((await testar('t-vence')).status).toBe(200)
    // O relógio anda: o teste terminou ontem.
    const { db } = await s.load('../../server/db/db')
    const { testesPremium } = await s.load('../../server/db/schema')
    const { eq } = await import('drizzle-orm')
    await db
      .update(testesPremium)
      .set({ terminaEm: Date.now() - DIA })
      .where(eq(testesPremium.userId, 't-vence'))

    const asaas = vigiarAsaas()
    const e = await entitlements('t-vence')
    expect(e.plan).toBe('free')
    expect(e.teste).toBeNull()
    expect((await statusDoTeste('t-vence')).estado).toBe('usado')
    const de_novo = await testar('t-vence')
    expect(de_novo.status).toBe(409)
    expect(de_novo.corpo.code).toBe('teste_ja_usado')
    expect(asaas).toEqual([])
  })

  it('apagar a conta e criar outra com o mesmo e-mail (outra caixa, +etiqueta, pontos do Gmail) não renova', async () => {
    await declarar('t-apaga', 30, 'Fu.La.No@gmail.com')
    expect((await testar('t-apaga', 'Fu.La.No@gmail.com')).status).toBe(200)

    const { contaRepo } = await s.load('../../server/db/repositories/conta')
    await contaRepo.excluir('t-apaga')
    const { db } = await s.load('../../server/db/db')
    const { testesPremium, marcasDeTeste } = await s.load('../../server/db/schema')
    const { eq } = await import('drizzle-orm')
    expect(
      await db.select().from(testesPremium).where(eq(testesPremium.userId, 't-apaga')),
      'o teste sai com a conta (dado do titular)',
    ).toEqual([])

    for (const [sub, email] of [
      ['t-recria-1', 'fulano@gmail.com'],
      ['t-recria-2', 'FULANO+teste@googlemail.com'],
      ['t-recria-3', ' fu.lano@Gmail.com '],
    ] as const) {
      await declarar(sub, 30, email.trim())
      const r = await testar(sub, email)
      expect(r.status, email).toBe(409)
      expect(r.corpo.code).toBe('teste_ja_usado')
      expect((await statusDoTeste(sub, email)).estado).toBe('indisponivel')
    }

    // A marca não é o e-mail: é um HMAC, sem coluna que ligue à conta.
    const marcas = await db.select().from(marcasDeTeste)
    expect(marcas.length).toBeGreaterThan(0)
    for (const m of marcas) {
      expect(m.marca).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(m).sort()).toEqual(['criadoEm', 'marca'])
    }
  })

  it('outro e-mail de verdade pode testar', async () => {
    await declarar('t-outra-pessoa', 30, 'outra.pessoa@exemplo.com')
    expect((await testar('t-outra-pessoa', 'outra.pessoa@exemplo.com')).status).toBe(200)
  })
})

describe('quem não pode testar sozinho', () => {
  it('menor de 18: 403 "peça ao seu responsável", e nada é criado', async () => {
    await declarar('t-menor', 15)
    const r = await testar('t-menor')
    expect(r.status).toBe(403)
    expect(r.corpo.code).toBe('teste_pelo_responsavel')
    expect(r.corpo.error).toMatch(/respons[aá]vel/i)
    expect((await entitlements('t-menor')).plan).toBe('free')
    expect(await statusDoTeste('t-menor')).toMatchObject({ estado: 'indisponivel', motivo: 'perfil_protegido' })
  })

  it('sem idade declarada: pede a data antes (o protetivo é o padrão)', async () => {
    const r = await testar('t-sem-idade')
    expect(r.status).toBe(403)
    expect(r.corpo.code).toBe('idade_nao_informada')
  })

  it('o responsável vinculado ativa o teste para o menor (um teste por responsável)', async () => {
    await declarar('t-filho', 13)
    const convite = await (
      await s.post('/api/me/responsavel/convite', { email: 'mae.teste@exemplo.com' }, await tk('t-filho'))
    ).json()
    const token = new URL(convite.linkDeTeste, 'http://x').searchParams.get('token')
    await declarar('t-mae', 40, 'mae.teste@exemplo.com')
    const aceite = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Mãe', declaroSerResponsavelLegal: true },
      await tk('t-mae', 'mae.teste@exemplo.com'),
    )
    expect(aceite.status).toBe(200)

    const r = await testar('t-mae', 'mae.teste@exemplo.com', { paraUsuario: 't-filho' })
    expect(r.status).toBe(200)
    expect((await entitlements('t-filho')).plan, 'o teste vale na conta do menor').toBe('premium')
    expect((await entitlements('t-mae')).plan, 'e não na do responsável').toBe('free')
    // A marca do responsável é outra: ativar para o filho não gasta o teste da própria conta.
    expect((await testar('t-mae', 'mae.teste@exemplo.com')).status).toBe(200)

    const estranho = await testar('t-outra-pessoa', 'outra.pessoa@exemplo.com', { paraUsuario: 't-filho' })
    expect(estranho.status).toBe(403)
    expect(estranho.corpo.code).toBe('sem_vinculo')
  })

  it('sem e-mail na conta não há como marcar o teste: 409', async () => {
    await declarar('t-sem-email', 30, undefined)
    const r = await testar('t-sem-email', null)
    expect(r.status).toBe(409)
    expect(r.corpo.code).toBe('teste_sem_email')
  })

  it('quem já assina não testa', async () => {
    await declarar('t-assinante', 30)
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('t-assinante', { plan: 'premium', status: 'active', provider: 'asaas' })
    const r = await testar('t-assinante')
    expect(r.status).toBe(409)
    expect(r.corpo.code).toBe('ja_assinante')
  })

  it('venda pausada pausa o teste também (depois dele não haveria como assinar)', async () => {
    await declarar('t-pausa', 30)
    process.env.CHECKOUT_ENABLED = '0'
    const r = await testar('t-pausa')
    expect(r.status).toBe(503)
    expect(r.corpo.code).toBe('checkout_desligado')
  })
})

describe('retenção da marca (LGPD)', () => {
  it('a marca sai depois de 730 dias; a recente fica', async () => {
    const { db } = await s.load('../../server/db/db')
    const { marcasDeTeste } = await s.load('../../server/db/schema')
    const { podarMarcasDeTeste, DIAS_DE_RETENCAO_DA_MARCA } = await s.load('../../server/lib/testePremium')
    expect(DIAS_DE_RETENCAO_DA_MARCA).toBe(730)
    const agora = Date.now()
    await db.insert(marcasDeTeste).values([
      { marca: 'a'.repeat(64), criadoEm: agora - 731 * DIA },
      { marca: 'b'.repeat(64), criadoEm: agora - 10 * DIA },
    ])
    expect(await podarMarcasDeTeste(agora)).toBe(1)
    const restantes = (await db.select().from(marcasDeTeste)).map((m: { marca: string }) => m.marca)
    expect(restantes).not.toContain('a'.repeat(64))
    expect(restantes).toContain('b'.repeat(64))
  })
})
