/**
 * O PREMIADO FORJADO POR SCRIPT (revisão de segurança de 15/11/2026).
 *
 * Sem a verificação servidor a servidor (SSV) da rede de anúncios, um script chama `iniciar`, espera 15 s e
 * chama `concluir` sem anúncio nenhum. As portas por CONTA (5 por dia, conta com 3 dias, 3 pendentes) não
 * seguram uma fazenda de contas, e ela esgotaria o `TETO_GLOBAL_DE_PREMIADOS_POR_DIA` de quem assiste de verdade.
 * O que se prova aqui (o resto do fluxo está em `anuncios-premiado.test.ts`):
 *  - o `exibicaoId` é o nonce do servidor, de uso único, preso à conta e ao espaço: concluir de novo não credita
 *    nem gasta o teto do IP; o de outra conta é 404; cedo demais (409) e tarde demais (410) não creditam;
 *  - TETO POR IP E POR REDE (/24 no IPv4, /48 no IPv6) no dia UTC, com o IP pseudonimizado (HMAC do servidor e
 *    do dia) e a reserva atômica de `usage_counters`: sob concorrência, passam exatamente os do teto (429
 *    `teto_do_ip`), e a recusa não gasta o teto da conta;
 *  - o `nuvem-30` (nuvem de verdade, custo nosso) só para conta com 30 dias ou mais (403 `conta_nova`);
 *  - o fluxo legítimo continua creditando.
 *
 * `TRUST_PROXY=1` para o `X-Forwarded-For` virar o `req.ip` (sem ele todos os casos chegariam como 127.0.0.1).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { clienteSql } from '../harness/clienteSql'

let s: AppDeTeste
let trustProxyAnterior: string | undefined
let flags: any
let economia: any
let planos: any
let rota: any
let premiado: any
let porIp: any
let contadores: any
let client: { execute: (q: string | { sql: string; args?: unknown[] }) => Promise<{ rows: any[] }> }

const DIA_MS = 86_400_000

async function contaCriadaHa(sub: string, dias: number): Promise<void> {
  const em = Date.now() - dias * DIA_MS
  await client.execute({
    sql: `INSERT INTO users (id, created_at, updated_at, role, status) VALUES (?, ?, ?, 'user', 'active')
          ON CONFLICT (id) DO UPDATE SET created_at = excluded.created_at`,
    args: [sub, em, em],
  })
}

async function tokenAdulto(sub: string, diasDeConta = 4): Promise<string> {
  const t = await s.tokenAdulto(sub)
  await contaCriadaHa(sub, diasDeConta)
  return t
}

const doIp = (ip: string, token: string) => ({ authorization: `Bearer ${token}`, 'x-forwarded-for': ip })
const iniciar = (token: string, espaco: string, ip = '203.0.113.10') =>
  s.chamar('POST', '/api/anuncios/premiado/iniciar', { body: { espaco }, headers: doIp(ip, token) })
const concluir = (token: string, exibicaoId: string, ip = '203.0.113.10') =>
  s.chamar('POST', '/api/anuncios/premiado/concluir', { body: { exibicaoId }, headers: doIp(ip, token) })

async function recuar(exibicaoId: string, ms: number): Promise<void> {
  await client.execute({
    sql: 'UPDATE anuncios_premiados SET iniciado_em = iniciado_em - ? WHERE exibicao_id = ?',
    args: [ms, exibicaoId],
  })
}

/** Abre uma exibição pelo `iniciar` e a dá por assistida (16 s atrás). */
async function exibicao(token: string, espaco = 'fim-premiado', ip?: string): Promise<string> {
  const r = await iniciar(token, espaco, ip)
  expect(r.status).toBe(200)
  const { exibicaoId } = await r.json()
  await recuar(exibicaoId, 16_000)
  return exibicaoId
}

/** Grava direto uma exibição pendente assistida (fura o teto de 3 pendentes do `iniciar`, para a rajada). */
async function pendenteDireta(sub: string, n: number): Promise<string> {
  const id = `${n.toString(16).padStart(8, '0')}${'a'.repeat(24)}`
  await client.execute({
    sql: `INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
          VALUES (?, ?, 'fim-premiado', NULL, ?, NULL)`,
    args: [sub, id, Date.now() - 16_000],
  })
  return id
}

const seedsDe = async (u: string): Promise<number> => (await economia.totaisCreditados(u)).seedsCreditadas

beforeAll(async () => {
  trustProxyAnterior = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  s = await subirApp({ modo: 'publico' })
  flags = await s.load('../../server/lib/flags')
  ;({ economiaRepo: economia } = await s.load('../../server/db/repositories/economia'))
  planos = await s.load('../../src/core/planos')
  rota = await s.load('../../server/routes/anuncios')
  premiado = await s.load('../../src/core/anuncios/premiado')
  porIp = await s.load('../../server/lib/premiadoPorIp')
  ;({ usageCountersRepo: contadores } = await s.load('../../server/db/repositories/usageCounters'))
  client = clienteSql(await s.load('../../server/db/db'))
}, 60_000)
afterAll(async () => {
  await s.encerrar()
  if (trustProxyAnterior === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = trustProxyAnterior
})
beforeEach(async () => {
  await flags.definirFlag('anuncios', { habilitada: true }, 'teste')
  await flags.definirFlag('nuvem_gratuita_alivio', { habilitada: true }, 'teste')
  rota.definirEspacosAtivosParaTestes(null)
})
afterEach(async () => {
  await client.execute('DELETE FROM anuncios_premiados')
  await client.execute({ sql: 'DELETE FROM usage_counters WHERE metric = ?', args: [porIp.METRIC_PREMIADOS_POR_IP] })
})

describe('os tetos por IP ficam em src/core/planos.ts', () => {
  it('15 por IP e 60 por rede (/24 ou /48) no dia; nuvem-30 só com conta de 30 dias', () => {
    expect(planos.LIMITE_DE_PREMIADOS_POR_IP_POR_DIA).toBe(15)
    expect(planos.LIMITE_DE_PREMIADOS_POR_REDE_POR_DIA).toBe(60)
    expect(planos.IDADE_MINIMA_DA_CONTA_PARA_NUVEM_30_MS).toBe(30 * DIA_MS)
  })
})

describe('a rede do IP', () => {
  it('IPv4 por /24, IPv6 por /48, IPv4 mapeado em IPv6 como IPv4', () => {
    expect(porIp.redeDoIp('203.0.113.77')).toBe('203.0.113.0/24')
    expect(porIp.redeDoIp('::ffff:203.0.113.77')).toBe('203.0.113.0/24')
    expect(porIp.redeDoIp('2001:db8:abcd:12::1')).toBe(porIp.redeDoIp('2001:db8:abcd:ffff::9'))
    expect(porIp.redeDoIp('2001:db8:abcd:12::1')).not.toBe(porIp.redeDoIp('2001:db8:abce:12::1'))
  })
})

describe('o fluxo legítimo', () => {
  it('iniciar, assistir e concluir credita as Seeds e conta 1 no IP e na rede', async () => {
    const t = await tokenAdulto('af-legit')
    const id = await exibicao(t)
    const r = await concluir(t, id)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ jaCreditado: false, recompensa: { tipo: 'seeds', seeds: 10 } })
    expect(await seedsDe('af-legit')).toBe(10)
    const { ip, rede, dia } = await porIp.chavesDoPremiado('203.0.113.10', Date.now())
    expect(await contadores.get(ip, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(1)
    expect(await contadores.get(rede, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(1)
  })
})

describe('o nonce (exibicaoId) é do servidor, de uso único e preso à conta', () => {
  it('concluir de novo (replay) não credita de novo nem gasta o teto do IP', async () => {
    const t = await tokenAdulto('af-replay')
    const id = await exibicao(t)
    expect((await concluir(t, id)).status).toBe(200)
    for (let i = 0; i < 3; i++) {
      const r = await concluir(t, id)
      expect(r.status).toBe(200)
      expect((await r.json()).jaCreditado).toBe(true)
    }
    expect(await seedsDe('af-replay')).toBe(10)
    const { ip, dia } = await porIp.chavesDoPremiado('203.0.113.10', Date.now())
    expect(await contadores.get(ip, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(1)
  })

  it('o nonce de outra conta é 404; cedo demais é 409; tarde demais é 410 — nenhum credita nem gasta o IP', async () => {
    const dono = await tokenAdulto('af-dono')
    const intruso = await tokenAdulto('af-intruso')
    const id = await exibicao(dono)
    expect((await concluir(intruso, id)).status).toBe(404)

    const cedo = await iniciar(dono, 'fim-premiado')
    const idCedo = (await cedo.json()).exibicaoId
    expect((await concluir(dono, idCedo)).status).toBe(409)

    await recuar(id, 11 * 60_000)
    expect((await concluir(dono, id)).status).toBe(410)

    expect(await seedsDe('af-dono')).toBe(0)
    expect(await seedsDe('af-intruso')).toBe(0)
    const { ip, dia } = await porIp.chavesDoPremiado('203.0.113.10', Date.now())
    expect(await contadores.get(ip, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(0)
  })
})

describe('replay com o IP no teto (a resposta se perdeu, ou o crédito falhou)', () => {
  /** Enche o teto do IP do dia (15) por fora, como se outras contas do mesmo IP tivessem concluído. */
  async function encherOIp(ip: string): Promise<void> {
    const { ip: chaveIp, dia } = await porIp.chavesDoPremiado(ip, Date.now())
    while (await contadores.reserve(chaveIp, porIp.METRIC_PREMIADOS_POR_IP, dia, 15));
  }

  it('replay de exibição já concluída, com o IP em 15/15, devolve 200 jaCreditado (e não 429)', async () => {
    const t = await tokenAdulto('af-replay-teto')
    const id = await exibicao(t, 'fim-premiado', '198.51.100.40')
    expect((await concluir(t, id, '198.51.100.40')).status).toBe(200)
    await encherOIp('198.51.100.40')
    const r = await concluir(t, id, '198.51.100.40')
    expect(r.status).toBe(200)
    expect((await r.json()).jaCreditado).toBe(true)
    expect(await seedsDe('af-replay-teto')).toBe(10)
  })

  it('o crédito falhou depois da conclusão (500); a nova tentativa com o IP em 15/15 credita', async () => {
    const t = await tokenAdulto('af-credito-falhou')
    const id = await exibicao(t, 'fim-premiado', '198.51.100.41')
    const original = economia.creditar
    economia.creditar = async () => {
      throw new Error('banco fora (encenado)')
    }
    try {
      expect((await concluir(t, id, '198.51.100.41')).status).toBe(500)
    } finally {
      economia.creditar = original
    }
    expect(await seedsDe('af-credito-falhou')).toBe(0)
    await encherOIp('198.51.100.41')
    const r = await concluir(t, id, '198.51.100.41')
    expect(r.status).toBe(200)
    expect((await r.json()).jaCreditado).toBe(true)
    expect(await seedsDe('af-credito-falhou')).toBe(10)
  })

  it('o replay de uma concluída vale depois dos 10 min do prazo (completa o crédito; não credita de novo)', async () => {
    const t = await tokenAdulto('af-replay-tarde')
    const id = await exibicao(t, 'fim-premiado', '198.51.100.42')
    expect((await concluir(t, id, '198.51.100.42')).status).toBe(200)
    await recuar(id, 60 * 60_000)
    const r = await concluir(t, id, '198.51.100.42')
    expect(r.status).toBe(200)
    expect((await r.json()).jaCreditado).toBe(true)
    expect(await seedsDe('af-replay-tarde')).toBe(10)
  })
})

describe('teto por IP (atômico)', () => {
  it('rajada de 16 conclusões de 4 contas no MESMO IP: passam 15, a outra é 429 teto_do_ip', async () => {
    const pedidos: Promise<Response>[] = []
    const contas: Record<string, string> = {}
    let n = 0
    for (const sub of ['af-ip-1', 'af-ip-2', 'af-ip-3', 'af-ip-4']) contas[sub] = await tokenAdulto(sub)
    const ids: Array<[string, string]> = []
    for (const sub of Object.keys(contas)) for (let i = 0; i < 4; i++) ids.push([sub, await pendenteDireta(sub, n++)])
    for (const [sub, id] of ids) pedidos.push(concluir(contas[sub], id, '198.51.100.20'))
    const respostas = await Promise.all(pedidos)
    const status = respostas.map((r) => r.status)
    expect(status.filter((x) => x === 200)).toHaveLength(15)
    const recusas = respostas.filter((r) => r.status === 429)
    expect(recusas).toHaveLength(1)
    expect((await recusas[0].json()).code).toBe('teto_do_ip')
    /* A recusa não concluiu a exibição: as concluídas no banco são as 15. */
    const { rows } = await client.execute(
      'SELECT count(*)::int AS n FROM anuncios_premiados WHERE concluido_em IS NOT NULL',
    )
    expect(Number(rows[0].n)).toBe(15)
  })

  it('outro IP da mesma /24 divide o teto da REDE; um IP de outra rede, não', async () => {
    const t = await tokenAdulto('af-rede')
    const { rede, dia } = await porIp.chavesDoPremiado('192.0.2.7', Date.now())
    /* A rede já com 59 no dia (de outras contas e IPs). */
    for (let i = 0; i < 59; i++) {
      expect(await contadores.reserve(rede, porIp.METRIC_PREMIADOS_POR_IP, dia, 60)).toBe(true)
    }
    expect((await concluir(t, await exibicao(t, 'fim-premiado', '192.0.2.7'), '192.0.2.7')).status).toBe(200)
    const r = await concluir(t, await exibicao(t, 'fim-premiado', '192.0.2.8'), '192.0.2.8')
    expect(r.status).toBe(429)
    expect((await r.json()).code).toBe('teto_do_ip')
    expect((await concluir(t, await exibicao(t, 'fim-premiado', '192.0.3.8'), '192.0.3.8')).status).toBe(200)
    expect(await seedsDe('af-rede')).toBe(20)
  })
})

describe('o estorno da vaga', () => {
  it('o do IP volta e o da rede falha: chamar de novo estorna só a rede (sem vazar nem estornar duas vezes)', async () => {
    const ip = '198.51.100.60'
    const { ip: chaveIp, rede, dia } = await porIp.chavesDoPremiado(ip, Date.now())
    /* Outra conclusão já contada no IP e na rede: o estorno duplo apareceria como 0. */
    expect(await contadores.reserve(chaveIp, porIp.METRIC_PREMIADOS_POR_IP, dia, 15)).toBe(true)
    expect(await contadores.reserve(rede, porIp.METRIC_PREMIADOS_POR_IP, dia, 60)).toBe(true)
    const vaga = await porIp.reservarConclusaoNoIp(ip)
    const original = contadores.refund
    let falhar = true
    contadores.refund = async (k: string, ...resto: unknown[]) => {
      if (k === rede && falhar) {
        falhar = false
        throw new Error('rede fora (encenado)')
      }
      return original.call(contadores, k, ...resto)
    }
    try {
      await expect(vaga.estornar()).rejects.toThrow('rede fora')
      await vaga.estornar()
      await vaga.estornar()
    } finally {
      contadores.refund = original
    }
    expect(await contadores.get(chaveIp, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(1)
    expect(await contadores.get(rede, porIp.METRIC_PREMIADOS_POR_IP, dia)).toBe(1)
  })
})

describe('nuvem-30 só para conta com 30 dias', () => {
  beforeEach(() => rota.definirEspacosAtivosParaTestes(premiado.ESPACOS_PREMIADOS))

  it('conta de 4 dias: nuvem-30 é 403 conta_nova (Seeds seguem); com 30 dias, começa', async () => {
    const t = await tokenAdulto('af-nuvem', 4)
    const r = await iniciar(t, 'nuvem-30')
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('conta_nova')
    expect((await iniciar(t, 'fim-premiado')).status).toBe(200)
    await contaCriadaHa('af-nuvem', 30)
    expect((await iniciar(t, 'nuvem-30')).status).toBe(200)
  })
})
