/**
 * O TESTE DE 3 DIAS DO PREMIUM, SEM CARTÃO (C6 da change `planos-v2`).
 *
 * Os contratos presos aqui, pelo app inteiro (`criarApp()`, JWT ES256 de verdade):
 * 1. Começa com UM toque (`POST /api/billing/teste`), dura 3 dias e NUNCA fala com o Asaas — não há
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
 * 7. O freio contra a fábrica de contas (change `teste-de-3-dias`): e-mail confirmado no Supabase, sem caixa
 *    descartável, e um teto de testes começados por IP no dia.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'

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
  /* Todo pedido daqui sai do mesmo IP (127.0.0.1): o teto por IP fica desligado, e o describe dele o liga. */
  process.env.TESTES_PREMIUM_POR_IP_DIA = '0'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.ASAAS_API_KEY
  delete process.env.CONVITE_LINK_NA_TELA
  delete process.env.TESTES_PREMIUM_POR_IP_DIA
  await s.encerrar()
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CHECKOUT_ENABLED
})

describe('um toque, 3 dias, sem cartão', () => {
  it('começa na hora, dá o Premium por 3 dias e não fala com o Asaas', async () => {
    await declarar('t-adulta', 30)
    const asaas = vigiarAsaas()
    const r = await testar('t-adulta')
    expect(r.status).toBe(200)
    expect(r.corpo.teste.terminaEm - r.corpo.teste.iniciadoEm).toBe(3 * DIA)
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

describe('o teste tem teto de USO, não só de tempo (a nuvem é uma amostra)', () => {
  it('em teste, /api/me/uso mostra o teto do teste; o assinante do Premium vê o do plano', async () => {
    await declarar('t-uso', 30)
    expect((await testar('t-uso')).status).toBe(200)
    const doTeste = await (await s.get('/api/me/uso', await tk('t-uso'))).json()
    expect(doTeste.segundosDeAudio.teto).toBe(3_600)
    expect(doTeste.tokensDeLlm.teto).toBe(150_000)
    expect(doTeste.chamadas.teto).toBe(1_400)

    await declarar('t-paga', 30)
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('t-paga', { plan: 'premium', status: 'active', provider: 'asaas' })
    const paga = await (await s.get('/api/me/uso', await tk('t-paga'))).json()
    expect(paga.segundosDeAudio.teto).toBe(72_000)
    expect(paga.tokensDeLlm.teto).toBe(3_000_000)
    expect(paga.chamadas.teto).toBe(26_000)
  })

  it('a reserva de STT do teste recusa no teto do teste, e o assinante segue até o do plano', async () => {
    const { reservarSegundosDeStt, estornarSegundosDeStt } = await s.load('../../server/lib/usageQuota')
    /* O uso justo do dia (2 h) fica fora do caminho: aqui só o teto do TESTE (o do mês) está em prova. */
    process.env.PREMIUM_DAILY_STT_SECONDS = '1000000'
    onTestFinished(() => {
      delete process.env.PREMIUM_DAILY_STT_SECONDS
    })
    await declarar('t-reserva', 30)
    expect((await testar('t-reserva')).status).toBe(200)
    // Cabe exatamente a 1 h do teste (3.600 s)...
    expect((await reservarSegundosDeStt('t-reserva', 3_600)).cabe).toBe(true)
    // ...e o próximo segundo já é recusado, no MÊS (402 `quota_exceeded`, que vira a oferta de plano).
    const recusa = await reservarSegundosDeStt('t-reserva', 1)
    expect(recusa).toEqual({ cabe: false, recusa: 'mes' })
    // O estorno devolve ao mesmo contador: a hora que não virou legenda não sai do teste.
    await estornarSegundosDeStt('t-reserva', 600)
    expect((await reservarSegundosDeStt('t-reserva', 600)).cabe).toBe(true)

    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('t-assina', { plan: 'premium', status: 'active', provider: 'asaas' })
    expect((await reservarSegundosDeStt('t-assina', 3_601)).cabe).toBe(true)
  })

  it('a voz natural do teste também tem teto próprio (10.000 caracteres)', async () => {
    const { reservarCaracteresDeVoz } = await s.load('../../server/lib/usageQuota')
    await declarar('t-voz', 30)
    expect((await testar('t-voz')).status).toBe(200)
    expect((await reservarCaracteresDeVoz('t-voz', 10_000)).cabe).toBe(true)
    expect((await reservarCaracteresDeVoz('t-voz', 1)).cabe).toBe(false)
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

describe('o freio contra a fábrica de contas (change teste-de-3-dias)', () => {
  it('e-mail de caixa descartável: 409, e a tela já diz que não dá', async () => {
    await declarar('t-descartavel', 30, 'alguem@mailinator.com')
    expect(await statusDoTeste('t-descartavel', 'alguem@mailinator.com')).toMatchObject({
      estado: 'indisponivel',
      motivo: 'email_descartavel',
    })
    const r = await testar('t-descartavel', 'alguem@mailinator.com')
    expect(r.status).toBe(409)
    expect(r.corpo.code).toBe('teste_email_descartavel')
    expect((await entitlements('t-descartavel')).plan).toBe('free')
  })

  it('e-mail não confirmado no Supabase: 403, nada é gravado e a marca fica livre', async () => {
    const { _definirConsultaDeEmailConfirmado } = await s.load('../../server/lib/testePremium')
    const perguntados: string[] = []
    _definirConsultaDeEmailConfirmado(async (userId: string) => {
      perguntados.push(userId)
      return userId !== 't-nao-confirmou'
    })
    onTestFinished(() => _definirConsultaDeEmailConfirmado(null))

    await declarar('t-nao-confirmou', 30, 'nao.confirmou@exemplo.com')
    const r = await testar('t-nao-confirmou', 'nao.confirmou@exemplo.com')
    expect(r.status).toBe(403)
    expect(r.corpo.code).toBe('teste_email_nao_confirmado')
    expect(perguntados).toEqual(['t-nao-confirmou'])
    expect((await entitlements('t-nao-confirmou')).plan).toBe('free')
    // A marca não foi gasta: confirmado o e-mail (outra conta, o mesmo endereço), o teste começa.
    await declarar('t-confirmou', 30, 'nao.confirmou@exemplo.com')
    expect((await testar('t-confirmou', 'nao.confirmou@exemplo.com')).status).toBe(200)
  })

  it('a consulta da confirmação falhou: 503, fechado (sem confirmação, sem teste)', async () => {
    const { _definirConsultaDeEmailConfirmado } = await s.load('../../server/lib/testePremium')
    _definirConsultaDeEmailConfirmado(async () => {
      throw new Error('admin users 500')
    })
    onTestFinished(() => _definirConsultaDeEmailConfirmado(null))
    await declarar('t-supabase-fora', 30)
    const r = await testar('t-supabase-fora')
    expect(r.status).toBe(503)
    expect(r.corpo.code).toBe('teste_indisponivel_agora')
    expect((await entitlements('t-supabase-fora')).plan).toBe('free')
  })

  it('a marca já usada responde 409 sem perguntar ao Supabase', async () => {
    const { _definirConsultaDeEmailConfirmado } = await s.load('../../server/lib/testePremium')
    const perguntados: string[] = []
    _definirConsultaDeEmailConfirmado(async (userId: string) => {
      perguntados.push(userId)
      return true
    })
    onTestFinished(() => _definirConsultaDeEmailConfirmado(null))
    await declarar('t-mesma-pessoa', 30, 'outra.pessoa+2@exemplo.com')
    // `outra.pessoa@exemplo.com` já testou acima, e a `+etiqueta` sai da marca em qualquer domínio.
    const r = await testar('t-mesma-pessoa', 'outra.pessoa+2@exemplo.com')
    expect(r.status).toBe(409)
    expect(r.corpo.code).toBe('teste_ja_usado')
    expect(perguntados).toEqual([])
  })

  it('o teto por IP: com 2 por dia, o terceiro teste do mesmo IP recebe 429; recusas não contam', async () => {
    process.env.TESTES_PREMIUM_POR_IP_DIA = '2'
    onTestFinished(() => {
      process.env.TESTES_PREMIUM_POR_IP_DIA = '0'
    })
    for (const sub of ['t-ip-1', 't-ip-2', 't-ip-3']) await declarar(sub, 30)
    // Uma recusa antes (sem e-mail) não gasta o teto do IP.
    expect((await testar('t-ip-1', null)).status).toBe(409)
    expect((await testar('t-ip-1')).status).toBe(200)
    // O 2º toque da mesma conta devolve o mesmo teste e não conta de novo.
    expect((await testar('t-ip-1')).corpo.jaEstavaAtivo).toBe(true)
    expect((await testar('t-ip-2')).status).toBe(200)
    const r = await testar('t-ip-3')
    expect(r.status).toBe(429)
    expect(r.corpo.code).toBe('teste_limite_por_ip')
    expect((await entitlements('t-ip-3')).plan).toBe('free')

    // O contador guarda o IP PSEUDONIMIZADO (HMAC com o dia), nunca o IP.
    const { db } = await s.load('../../server/db/db')
    const { usageCounters } = await s.load('../../server/db/schema')
    const { METRIC_TESTES_POR_IP } = await s.load('../../server/lib/testePremium')
    const { eq } = await import('drizzle-orm')
    const linhas = await db.select().from(usageCounters).where(eq(usageCounters.metric, METRIC_TESTES_POR_IP))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].userId).toMatch(/^ip:[0-9a-f]{32}$/)
    expect(linhas[0].count).toBe(2)
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
