/**
 * A RECOMPENSA DO PREMIADO É DO SERVIDOR (spec `anuncios-no-gratis`, "O premiado é sempre escolha") — por
 * HTTP, no modo público, com a montagem de produção (`criarApp()`).
 *
 * Na web não há verificação servidor a servidor da rede de anúncios (R32): a recompensa é um aperto de mão em
 * dois passos. `POST /api/anuncios/premiado/iniciar { espaco }` confere o que o servidor enxerga (flag, perfil,
 * tetos) e devolve um `exibicaoId`; a página do anúncio avisa o app do fim, e o app chama
 * `POST /api/anuncios/premiado/concluir { exibicaoId }`, que credita UMA vez. O que se prova:
 *  - idempotência: concluir duas vezes (inclusive ao mesmo tempo) credita uma só;
 *  - prazo: exibição iniciada há mais de 10 min não credita (410);
 *  - tetos do dia UTC, contados no `concluido_em`: 5 por pessoa e 2.000 no total → 429 `teto_do_dia`;
 *    o dia de ontem não conta;
 *  - perfil protegido (menor ou idade não declarada) → 403 `perfil_protegido`, nas duas pontas;
 *  - flag `anuncios` desligada → 404 `anuncios_desligados`, nas duas pontas;
 *  - `exibicaoId` desconhecido ou de outra conta → 404;
 *  - `nuvem-30` soma 30 min à franquia de nuvem do mês: aparece em `GET /api/me/uso` e vale na reserva.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { clienteSql } from '../harness/clienteSql'

let s: AppDeTeste
let flags: any
let economia: any
let quota: any
let planos: any
let client: { execute: (q: string | { sql: string; args?: unknown[] }) => Promise<{ rows: any[] }> }

const hoje = () => new Date().toISOString().slice(0, 10)
const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

/** `AAAA-MM-DD` de alguém com `anos` completos hoje (aniversário há ~40 dias). */
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}

const iniciar = (token: string, espaco: string) => s.post('/api/anuncios/premiado/iniciar', { espaco }, token)
const concluir = (token: string, exibicaoId: string) => s.post('/api/anuncios/premiado/concluir', { exibicaoId }, token)

async function exibicao(token: string, espaco: string): Promise<string> {
  const r = await iniciar(token, espaco)
  expect(r.status).toBe(200)
  const { exibicaoId } = await r.json()
  expect(exibicaoId).toMatch(/^[0-9a-f]{32}$/)
  return exibicaoId
}

async function ligarAnuncios(ligada: boolean): Promise<void> {
  await flags.definirFlag('anuncios', { habilitada: ligada }, 'teste')
}

const seedsDe = async (u: string): Promise<number> => (await economia.totaisCreditados(u)).seedsCreditadas

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
  flags = await s.load('../../server/lib/flags')
  ;({ economiaRepo: economia } = await s.load('../../server/db/repositories/economia'))
  quota = await s.load('../../server/lib/usageQuota')
  planos = await s.load('../../src/core/planos')
  client = clienteSql(await s.load('../../server/db/db'))
})
afterAll(async () => {
  await s.encerrar()
})
beforeEach(async () => {
  await ligarAnuncios(true)
})
afterEach(async () => {
  /* O teto global é do app inteiro: cada caso começa do zero. */
  await client.execute('DELETE FROM anuncios_premiados')
})

describe('os tetos ficam em src/core/planos.ts', () => {
  it('5 por pessoa e 2.000 no total, por dia', () => {
    expect(planos.LIMITE_DE_PREMIADOS_POR_DIA).toBe(5)
    expect(planos.TETO_GLOBAL_DE_PREMIADOS_POR_DIA).toBe(2000)
  })
})

describe('flag anuncios desligada', () => {
  it('iniciar e concluir respondem 404 anuncios_desligados, e nada é gravado', async () => {
    const t = await s.tokenAdulto('ad-flag-off')
    const id = await exibicao(t, 'loja-seeds')
    await ligarAnuncios(false)
    const r = await iniciar(t, 'loja-seeds')
    expect(r.status).toBe(404)
    expect((await r.json()).code).toBe('anuncios_desligados')
    const r2 = await concluir(t, id)
    expect(r2.status).toBe(404)
    expect((await r2.json()).code).toBe('anuncios_desligados')
    expect(await seedsDe('ad-flag-off')).toBe(0)
  })
})

describe('perfil protegido nunca chega à recompensa', () => {
  it('idade não declarada: 403 perfil_protegido', async () => {
    const t = await s.token('ad-sem-idade')
    const r = await iniciar(t, 'fim-premiado')
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('perfil_protegido')
  })

  it('menor declarado: 403 perfil_protegido, e nenhuma linha nasce', async () => {
    const t = await s.token('ad-menor')
    expect((await s.put('/api/me/idade', { nascimento: nascidoHa(16) }, t)).status).toBe(200)
    const r = await iniciar(t, 'fim-premiado')
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('perfil_protegido')
    const { rows } = await client.execute(
      `SELECT count(*)::int AS n FROM anuncios_premiados WHERE user_id = 'ad-menor'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('concluir também confere: uma exibição de quem virou protegido não credita', async () => {
    const t = await s.tokenAdulto('ad-virou-menor')
    const id = await exibicao(t, 'loja-seeds')
    await client.execute(`DELETE FROM idades_declaradas WHERE user_id = 'ad-virou-menor'`)
    const r = await concluir(t, id)
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('perfil_protegido')
    expect(await seedsDe('ad-virou-menor')).toBe(0)
  })
})

describe('o pedido', () => {
  it('espaço que não é premiado (ou inexistente) é 400', async () => {
    const t = await s.tokenAdulto('ad-espaco')
    expect((await iniciar(t, 'inicio-nativo')).status).toBe(400)
    expect((await iniciar(t, 'nao-existe')).status).toBe(400)
  })

  it('exibicaoId desconhecido ou de outra conta é 404, e nada é creditado', async () => {
    const a = await s.tokenAdulto('ad-dono')
    const b = await s.tokenAdulto('ad-outro')
    const id = await exibicao(a, 'loja-seeds')
    const r = await concluir(b, id)
    expect(r.status).toBe(404)
    expect((await r.json()).code).toBe('exibicao_desconhecida')
    expect((await concluir(b, 'f'.repeat(32))).status).toBe(404)
    expect(await seedsDe('ad-outro')).toBe(0)
    /* O dono continua podendo concluir a dele. */
    expect((await concluir(a, id)).status).toBe(200)
  })
})

describe('idempotência', () => {
  it('Seeds: a primeira conclusão credita, a segunda responde jaCreditado sem creditar de novo', async () => {
    const t = await s.tokenAdulto('ad-seeds')
    const id = await exibicao(t, 'loja-seeds')
    const r = await concluir(t, id)
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ jaCreditado: false, espaco: 'loja-seeds', recompensa: { tipo: 'seeds', seeds: 15 } })
    expect(await seedsDe('ad-seeds')).toBe(15)

    const r2 = await concluir(t, id)
    expect(r2.status).toBe(200)
    expect(await r2.json()).toMatchObject({ jaCreditado: true, recompensa: { tipo: 'seeds', seeds: 15 } })
    expect(await seedsDe('ad-seeds')).toBe(15)
  })

  it('duas conclusões AO MESMO TEMPO creditam uma vez só', async () => {
    const t = await s.tokenAdulto('ad-corrida')
    const id = await exibicao(t, 'fim-premiado')
    const rs = await Promise.all([concluir(t, id), concluir(t, id), concluir(t, id)])
    const corpos = await Promise.all(rs.map((r) => r.json()))
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200])
    expect(corpos.filter((c) => c.jaCreditado === false)).toHaveLength(1)
    expect(await seedsDe('ad-corrida')).toBe(10)
  })

  it('tema-24h devolve a liberação com o fim; ajuda-premiada, a ajuda da rodada (sem Seeds)', async () => {
    const t = await s.tokenAdulto('ad-tema')
    const antes = Date.now()
    const r = await concluir(t, await exibicao(t, 'tema-24h'))
    const corpo = await r.json()
    expect(corpo.recompensa.tipo).toBe('tema-24h')
    expect(corpo.recompensa.ateEm).toBeGreaterThanOrEqual(antes + 24 * 3600_000)
    const r2 = await concluir(t, await exibicao(t, 'ajuda-premiada'))
    expect((await r2.json()).recompensa).toEqual({ tipo: 'ajuda' })
    expect(await seedsDe('ad-tema')).toBe(0)
  })
})

describe('prazo de 10 minutos', () => {
  it('exibição iniciada há mais de 10 min não credita (410), e continua não creditando', async () => {
    const t = await s.tokenAdulto('ad-prazo')
    const id = await exibicao(t, 'loja-seeds')
    await client.execute({
      sql: 'UPDATE anuncios_premiados SET iniciado_em = ? WHERE exibicao_id = ?',
      args: [Date.now() - 10 * 60_000 - 1000, id],
    })
    const r = await concluir(t, id)
    expect(r.status).toBe(410)
    expect((await r.json()).code).toBe('exibicao_expirada')
    expect((await concluir(t, id)).status).toBe(410)
    expect(await seedsDe('ad-prazo')).toBe(0)
  })

  it('dentro do prazo (9 min) credita', async () => {
    const t = await s.tokenAdulto('ad-prazo-ok')
    const id = await exibicao(t, 'loja-seeds')
    await client.execute({
      sql: 'UPDATE anuncios_premiados SET iniciado_em = ? WHERE exibicao_id = ?',
      args: [Date.now() - 9 * 60_000, id],
    })
    expect((await concluir(t, id)).status).toBe(200)
    expect(await seedsDe('ad-prazo-ok')).toBe(15)
  })
})

describe('teto por pessoa (5 por dia UTC, contado na conclusão)', () => {
  it('a sexta exibição não começa: 429 teto_do_dia', async () => {
    const t = await s.tokenAdulto('ad-teto')
    for (let i = 0; i < 5; i++) expect((await concluir(t, await exibicao(t, 'fim-premiado'))).status).toBe(200)
    const r = await iniciar(t, 'fim-premiado')
    expect(r.status).toBe(429)
    expect((await r.json()).code).toBe('teto_do_dia')
    expect(await seedsDe('ad-teto')).toBe(50)
    /* O teto é da pessoa: outra conta continua. */
    const outra = await s.tokenAdulto('ad-teto-outra')
    expect((await iniciar(outra, 'fim-premiado')).status).toBe(200)
  })

  it('iniciadas antes do teto não furam: a conclusão também confere', async () => {
    const t = await s.tokenAdulto('ad-teto-pendentes')
    const ids: string[] = []
    for (let i = 0; i < 7; i++) ids.push(await exibicao(t, 'fim-premiado'))
    const rs = await Promise.all(ids.map((id) => concluir(t, id)))
    const status = rs.map((r) => r.status)
    expect(status.filter((x) => x === 200)).toHaveLength(5)
    expect(status.filter((x) => x === 429)).toHaveLength(2)
    expect(await seedsDe('ad-teto-pendentes')).toBe(50)
  })

  it('o dia de ontem não conta no teto de hoje', async () => {
    const t = await s.tokenAdulto('ad-ontem')
    for (let i = 0; i < 5; i++) await concluir(t, await exibicao(t, 'fim-premiado'))
    expect((await iniciar(t, 'fim-premiado')).status).toBe(429)
    await client.execute({
      sql: `UPDATE anuncios_premiados SET dia = ?, concluido_em = concluido_em - 86400000 WHERE user_id = 'ad-ontem'`,
      args: [ontem()],
    })
    expect((await iniciar(t, 'fim-premiado')).status).toBe(200)
  })
})

describe('teto global (2.000 por dia UTC)', () => {
  it('com o teto do dia cheio, ninguém começa: 429 teto_do_dia', async () => {
    const agora = Date.now()
    await client.execute({
      sql: `INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
            SELECT 'massa-' || (g % 500), md5(g::text), 'fim-premiado', ?, ?, ?
            FROM generate_series(1, 2000) AS g`,
      args: [hoje(), agora, agora],
    })
    const t = await s.tokenAdulto('ad-global')
    const r = await iniciar(t, 'loja-seeds')
    expect(r.status).toBe(429)
    expect((await r.json()).code).toBe('teto_do_dia')
  })

  it('uma pendente iniciada antes do teto cheio não credita depois dele', async () => {
    const t = await s.tokenAdulto('ad-global-pendente')
    const id = await exibicao(t, 'loja-seeds')
    const agora = Date.now()
    await client.execute({
      sql: `INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
            SELECT 'massa-' || (g % 500), md5(g::text), 'fim-premiado', ?, ?, ?
            FROM generate_series(1, 2000) AS g`,
      args: [hoje(), agora, agora],
    })
    const r = await concluir(t, id)
    expect(r.status).toBe(429)
    expect(await seedsDe('ad-global-pendente')).toBe(0)
  })
})

describe('nuvem-30: 30 min de nuvem somados à franquia do mês', () => {
  it('aparece em GET /api/me/uso e vale na reserva de segundos', async () => {
    const t = await s.tokenAdulto('ad-nuvem')
    const uso0 = await (await s.get('/api/me/uso', t)).json()
    const teto0 = uso0.alivio.segundosDeAudio.teto
    expect(teto0).toBe(planos.FRANQUIA_DE_ALIVIO.sttSegundosMes)
    /* Antes: a franquia inteira + 1 s não cabe numa reserva. */
    expect((await quota.reservarSegundosDeStt('ad-nuvem', teto0 + 1, 'alivio')).cabe).toBe(false)

    const r = await concluir(t, await exibicao(t, 'nuvem-30'))
    expect(await r.json()).toMatchObject({ jaCreditado: false, recompensa: { tipo: 'nuvem', segundos: 1800 } })
    const uso1 = await (await s.get('/api/me/uso', t)).json()
    expect(uso1.alivio.segundosDeAudio.teto).toBe(teto0 + 1800)
    expect((await quota.reservarSegundosDeStt('ad-nuvem', teto0 + 1, 'alivio')).cabe).toBe(true)

    /* Repetir a conclusão não soma de novo. */
    await concluir(
      t,
      (await client.execute(`SELECT exibicao_id FROM anuncios_premiados WHERE user_id = 'ad-nuvem'`)).rows[0]
        .exibicao_id,
    )
    const uso2 = await (await s.get('/api/me/uso', t)).json()
    expect(uso2.alivio.segundosDeAudio.teto).toBe(teto0 + 1800)
  })

  it('exibição de nuvem iniciada e não concluída não soma nada', async () => {
    const t = await s.tokenAdulto('ad-nuvem-pendente')
    await exibicao(t, 'nuvem-30')
    const uso = await (await s.get('/api/me/uso', t)).json()
    expect(uso.alivio.segundosDeAudio.teto).toBe(planos.FRANQUIA_DE_ALIVIO.sttSegundosMes)
  })
})

describe('limpeza diária', () => {
  it('poda pendentes de mais de um dia e concluídas antes do mês anterior; o resto fica', async () => {
    const { limparBanco } = await s.load('../../server/lib/limpezaDiaria')
    const agora = Date.UTC(2026, 9, 21, 12) // 21/10/2026
    const dia = 86_400_000
    const linha = (id: string, d: string | null, iniciado: number, concluido: number | null) =>
      client.execute({
        sql: `INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
              VALUES ('ad-poda', ?, 'nuvem-30', ?, ?, ?)`,
        args: [id, d, iniciado, concluido],
      })
    await linha('pendente-velha', null, agora - 2 * dia, null)
    await linha('pendente-nova', null, agora - 60_000, null)
    await linha('agosto', '2026-08-31', Date.UTC(2026, 7, 31), Date.UTC(2026, 7, 31))
    await linha('setembro', '2026-09-01', Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 1))
    await linha('outubro', '2026-10-20', agora - dia, agora - dia)

    const r = await limparBanco({ agora })
    expect(r.premiadosPodados).toBe(2)
    const { rows } = await client.execute(
      `SELECT exibicao_id FROM anuncios_premiados WHERE user_id = 'ad-poda' ORDER BY exibicao_id`,
    )
    expect(rows.map((x) => x.exibicao_id)).toEqual(['outubro', 'pendente-nova', 'setembro'])
  })
})
