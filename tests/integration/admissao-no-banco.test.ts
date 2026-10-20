/**
 * ADMISSÃO DE IA NO BANCO (Fase 2, tarefa 8). Os baldes por provedor e modelo (minuto e dia, pedidos e
 * tokens) e as vagas em voo por usuário saem da memória do processo e vão para a tabela `admissao_de_ia`:
 * num Worker cada isolate teria a própria cópia, e a soma passaria do limite da conta no provedor.
 *
 * A reserva é UMA instrução (`INSERT … ON CONFLICT DO UPDATE … WHERE usado + custo <= teto`): duas
 * conexões disputando a mesma janela nunca passam do teto. O minuto é token bucket com reabastecimento
 * contínuo na própria instrução; o dia, janela fixa UTC. A prova de concorrência de verdade só vale
 * num Postgres (`TESTE_POSTGRES_URL`): o PGlite tem uma conexão só e serializa de qualquer jeito. O
 * resto (forma, janelas, vaga em voo, 429, poda, contagem de instruções) roda nos dois.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import { contarConsultas } from '../harness/contadorDeConsultas'
import type { EphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL
const MIN = 60_000
const T0 = Date.UTC(2026, 9, 19, 12, 0, 0)

let h: EphemeralDb
let m: typeof import('../../server/db/db')
let repo: typeof import('../../server/db/repositories/admissaoDeIa')
let adm: typeof import('../../server/ai/admissao')
let sql: typeof import('drizzle-orm').sql

beforeAll(async () => {
  h = await abrirBancoDeTeste({ env: { DB_POOL_MAX: '10' } })
  m = await h.load('../../server/db/db')
  repo = await h.load('../../server/db/repositories/admissaoDeIa')
  adm = await h.load('../../server/ai/admissao')
  ;({ sql } = await h.load('drizzle-orm'))
}, 60_000)

afterAll(async () => {
  delete process.env.DB_POOL_MAX
  await h?.cleanup()
})

beforeEach(async () => {
  await adm.esquecerAdmissao()
  for (const e of ['IA_ADMISSAO_STT_RPM', 'IA_ADMISSAO_STT_RPD', 'IA_EM_VOO_STT', 'IA_EM_VOO_LLM']) process.env[e] = ''
  process.env.IA_ADMISSAO_STT_RPM = '20' // o padrão, explícito: os casos contam com ele
})

async function linha(chave: string, janela: string) {
  const r = await m.db.execute(
    sql`SELECT usado, em_voo, bloqueado_ate, atualizado_em FROM admissao_de_ia WHERE chave = ${chave} AND janela = ${janela}`,
  )
  return m.linhas<{ usado: number; em_voo: number; bloqueado_ate: number; atualizado_em: number }>(r)[0]
}

describe('repositório admissao_de_ia', () => {
  it('reservar: soma até o teto e recusa o que passaria dele; a linha nova também respeita o teto', async () => {
    const pedidos = Array.from({ length: 11 }, () => ({ chave: 'k1', janela: 'w', custo: 10, teto: 100, agora: T0 }))
    const r: boolean[] = []
    for (const p of pedidos) r.push(await repo.admissaoDeIaRepo.reservar(p))
    expect(r.filter(Boolean)).toHaveLength(10)
    expect(r[10]).toBe(false)
    expect((await linha('k1', 'w')).usado).toBe(100)

    // Linha que ainda não existe e custo maior que o teto: nem nasce.
    expect(await repo.admissaoDeIaRepo.reservar({ chave: 'k2', janela: 'w', custo: 200, teto: 100, agora: T0 })).toBe(
      false,
    )
    expect(await linha('k2', 'w')).toBeUndefined()
  })

  it('20 reservas de 10 em paralelo contra teto 100 → exatamente 10 passam', async () => {
    const r = await Promise.all(
      Array.from({ length: 20 }, () =>
        repo.admissaoDeIaRepo.reservar({ chave: 'par', janela: 'w', custo: 10, teto: 100, agora: T0 }),
      ),
    )
    expect(r.filter(Boolean)).toHaveLength(10)
    expect((await linha('par', 'w')).usado).toBe(100)
  })

  it.runIf(URL_PG)('dois executores (duas conexões) disputando a mesma janela não passam do teto', async () => {
    const { abrirClienteDoHyperdrive } = await h.load<typeof import('../../server/db/clientePorRequisicao')>(
      '../../server/db/clientePorRequisicao',
    )
    const { comExecutor } = await h.load<typeof import('../../server/db/executor')>('../../server/db/executor')
    const url = m.urlDoBanco()
    const a = await abrirClienteDoHyperdrive(url)
    const b = await abrirClienteDoHyperdrive(url)
    try {
      const rodada = (e: typeof a) =>
        comExecutor(e, () =>
          Promise.all(
            Array.from({ length: 10 }, () =>
              repo.admissaoDeIaRepo.reservar({ chave: 'dois', janela: 'w', custo: 10, teto: 100, agora: T0 }),
            ),
          ),
        )
      // Cinco rodadas: a disputa da primeira linha (INSERT x INSERT) e das seguintes (UPDATE x UPDATE).
      for (let i = 0; i < 5; i++) {
        await m.db.execute(sql`DELETE FROM admissao_de_ia WHERE chave = 'dois'`)
        const [ra, rb] = await Promise.all([rodada(a), rodada(b)])
        expect([...ra, ...rb].filter(Boolean)).toHaveLength(10)
        expect((await linha('dois', 'w')).usado).toBe(100)
      }
    } finally {
      await a.fechar()
      await b.fechar()
    }
  })

  it('reservas juntas (minuto e dia) em paralelo: tudo ou nada, sem sobra no minuto', async () => {
    const itens = [
      { chave: 'junta', janela: 'min', custo: 10, teto: 100 },
      { chave: 'junta', janela: 'dia', custo: 10, teto: 50 },
    ]
    const r = await Promise.all(
      Array.from({ length: 40 }, () => repo.admissaoDeIaRepo.reservarJuntas(itens, { agora: T0 })),
    )
    expect(r.filter((x) => x.ok)).toHaveLength(5)
    // O dia fechou primeiro: o minuto tem só as 5 admitidas (as parciais de uma corrida foram desfeitas).
    expect((await linha('junta', 'dia')).usado).toBe(50)
    expect((await linha('junta', 'min')).usado).toBe(50)
  })

  it.runIf(URL_PG)('reserva parcial numa corrida é desfeita (determinístico, conexão B segura o dia)', async () => {
    const { Client } = await import('pg')
    await repo.admissaoDeIaRepo.reservar({ chave: 'parc', janela: 'min', custo: 10, teto: 100, agora: T0 })
    await repo.admissaoDeIaRepo.reservar({ chave: 'parc', janela: 'dia', custo: 40, teto: 50, agora: T0 })
    const b = new Client({ connectionString: m.urlDoBanco() })
    await b.connect()
    try {
      await b.query('BEGIN')
      await b.query("UPDATE admissao_de_ia SET usado = 50 WHERE chave = 'parc' AND janela = 'dia'")
      // A conferência prévia ainda vê o dia em 40 (B não confirmou): o minuto é reservado e o dia espera B.
      let resolvida = false
      const reserva = repo.admissaoDeIaRepo
        .reservarJuntas(
          [
            { chave: 'parc', janela: 'min', custo: 10, teto: 100 },
            { chave: 'parc', janela: 'dia', custo: 10, teto: 50 },
          ],
          { agora: T0 },
        )
        .finally(() => (resolvida = true))
      await new Promise((r) => setTimeout(r, 300))
      expect(resolvida).toBe(false)
      await b.query('COMMIT')
      const r = await reserva
      expect(r.ok).toBe(false)
      if (r.ok === false) expect(r.recusadas).toEqual([1])
      expect((await linha('parc', 'min')).usado).toBe(10) // desfeita: volta ao valor anterior
      expect((await linha('parc', 'dia')).usado).toBe(50)
    } finally {
      await b.end()
    }
  })

  it('podar apaga as janelas antigas e mantém as recentes', async () => {
    await repo.admissaoDeIaRepo.reservar({
      chave: 'velha',
      janela: 'w',
      custo: 1,
      teto: 10,
      agora: T0 - 3 * 86_400_000,
    })
    await repo.admissaoDeIaRepo.reservar({ chave: 'nova', janela: 'w', custo: 1, teto: 10, agora: T0 })
    expect(await repo.admissaoDeIaRepo.podar(T0 - 2 * 86_400_000)).toBe(1)
    expect(await linha('velha', 'w')).toBeUndefined()
    expect(await linha('nova', 'w')).toBeDefined()
  })

  it('a limpeza diária poda a admissão com mais de 2 dias', async () => {
    const { limparBanco } = await h.load<typeof import('../../server/lib/limpezaDiaria')>(
      '../../server/lib/limpezaDiaria',
    )
    await repo.admissaoDeIaRepo.reservar({
      chave: 'velha',
      janela: 'w',
      custo: 1,
      teto: 10,
      agora: T0 - 3 * 86_400_000,
    })
    const r = await limparBanco({ agora: T0 })
    expect(r.admissaoPodada).toBe(1)
    expect(await linha('velha', 'w')).toBeUndefined()
  })
})

describe('admissão sobre o banco', () => {
  const stt = (agora: number, plano: 'premium' | 'gratis' = 'premium') =>
    adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'm', plano, agora })

  it('reabastece no meio do minuto: 15 s depois de esvaziar, cabem 5 de 20', async () => {
    for (let i = 0; i < 20; i++) expect((await stt(T0)).ok).toBe(true)
    let n = 0
    while ((await stt(T0 + 15_000)).ok) n++
    expect(n).toBe(5)
  })

  it('sem pico de 2× na virada do minuto: esvaziado às :59, às :00,5 ainda não cabe nenhum', async () => {
    const t = T0 + 59_000
    for (let i = 0; i < 20; i++) expect((await stt(t)).ok).toBe(true)
    const r = await stt(T0 + MIN + 500)
    expect(r.ok === false && r.recusa).toEqual({ motivo: 'minuto', retryAfterS: 2 }) // 1,5 s escorreu; falta 1,5 s
  })

  it('o balde do minuto e a janela do dia são independentes (e a recusa do dia não ocupa o minuto)', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '2'
    process.env.IA_ADMISSAO_STT_RPD = '3'
    expect((await stt(T0)).ok).toBe(true)
    expect((await stt(T0 + 1_000)).ok).toBe(true)
    const doMinuto = await stt(T0 + 2_000)
    expect(doMinuto.ok === false && doMinuto.recusa.motivo).toBe('minuto')
    // 2 rpm = 1 pedido a cada 30 s; 2 s já escorreram de um balde cheio desde o 1º pedido.
    expect(doMinuto.ok === false && doMinuto.recusa.retryAfterS).toBe(28)

    expect((await stt(T0 + MIN)).ok).toBe(true) // o balde do minuto escorreu; 3º do dia
    const minutoAntes = await linha('bucket:groq:m:stt', 'min')
    const doDia = await stt(T0 + MIN + 2_000)
    expect(doDia.ok === false && doDia.recusa.motivo).toBe('dia')
    // A recusa do dia não reserva nada no minuto.
    expect(await linha('bucket:groq:m:stt', 'min')).toEqual(minutoAntes)
    expect((await linha('bucket:groq:m:stt', '2026-10-19')).usado).toBe(3)
  })

  it('o 429 do provedor fecha o balde no BANCO até o Retry-After', async () => {
    expect(await adm.registrarLimiteNaAdmissao('stt', 'groq', 'm', 7, T0)).toBe(7)
    expect((await linha('bucket:groq:m:stt', 'bloqueio')).bloqueado_ate).toBe(T0 + 7_000)
    const r = await stt(T0 + 1_000)
    expect(r.ok === false && r.recusa).toEqual({ motivo: 'provedor_limitou', retryAfterS: 6 })
    expect((await stt(T0 + 7_000)).ok).toBe(true)
  })

  it('o bloqueio do 429 vale mesmo com o balde do minuto já reabastecido', async () => {
    for (let i = 0; i < 20; i++) await stt(T0)
    await adm.registrarLimiteNaAdmissao('stt', 'groq', 'm', 120, T0)
    const r = await stt(T0 + 90_000) // o minuto já encheu de novo; o provedor pediu 120 s
    expect(r.ok === false && r.recusa).toEqual({ motivo: 'provedor_limitou', retryAfterS: 30 })
    expect((await stt(T0 + 120_000)).ok).toBe(true)
  })

  it('a vaga em voo volta a 0 depois de liberar', async () => {
    process.env.IA_EM_VOO_LLM = '2'
    const a = await adm.ocuparVaga('u-voo', 'llm', T0)
    const b = await adm.ocuparVaga('u-voo', 'llm', T0)
    expect(a && b).toBeTruthy()
    expect(await adm.ocuparVaga('u-voo', 'llm', T0)).toBeNull()
    expect((await linha('voo:u-voo:llm', 'total')).em_voo).toBe(2)
    await a!()
    await a!() // idempotente
    await b!()
    expect((await linha('voo:u-voo:llm', 'total')).em_voo).toBe(0)
  })

  it('vaga em voo parada além do prazo do tipo é ignorada (STT 2 min, LLM 5 min)', async () => {
    process.env.IA_EM_VOO_STT = '1'
    process.env.IA_EM_VOO_LLM = '1'
    expect(repo.VOO_PARADO_MS).toEqual({ stt: 2 * MIN, tts: 2 * MIN, llm: 5 * MIN })
    expect(await adm.ocuparVaga('u-caiu', 'stt', T0)).not.toBeNull() // nunca liberadas
    expect(await adm.ocuparVaga('u-caiu', 'llm', T0)).not.toBeNull()
    expect(await adm.ocuparVaga('u-caiu', 'stt', T0 + MIN)).toBeNull()
    expect(await adm.ocuparVaga('u-caiu', 'stt', T0 + 2 * MIN + 1)).not.toBeNull()
    expect(await adm.ocuparVaga('u-caiu', 'llm', T0 + 2 * MIN + 1)).toBeNull()
    expect(await adm.ocuparVaga('u-caiu', 'llm', T0 + 5 * MIN + 1)).not.toBeNull()
    expect((await linha('voo:u-caiu:stt', 'total')).em_voo).toBe(1)
  })

  it('recusa repetida em até 1 s não vai ao banco; o ticket devolvido abre de novo', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '1'
    const primeiro = await stt(T0)
    expect(primeiro.ok).toBe(true)
    expect((await stt(T0 + 100)).ok).toBe(false)
    const cache = await linha('bucket:groq:m:stt', 'min')
    expect(cache.usado).toBe(1)
    // Outra instância liberou no banco: esta só enxerga depois que a recusa em cache expira (≤ 1 s).
    await m.db.execute(sql`UPDATE admissao_de_ia SET usado = 0 WHERE chave = 'bucket:groq:m:stt'`)
    expect((await stt(T0 + 900)).ok).toBe(false)
    expect((await stt(T0 + 1_200)).ok).toBe(true)
    // Ticket devolvido nesta instância apaga a recusa em cache na hora.
    expect((await stt(T0 + 1_300)).ok).toBe(false)
    if (primeiro.ok) await primeiro.ticket.devolver()
    expect((await stt(T0 + 1_400)).ok).toBe(true)
  })
})

describe.skipIf(URL_PG)('instruções por admissão (PGlite)', () => {
  it('admitir no balde = 1 instrução; com a vaga em voo, 2; recusa em cache, 0', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '1'
    const contador = await contarConsultas(h.load)
    try {
      contador.zerar()
      const vaga = await adm.ocuparVaga('u-conta', 'stt', T0)
      const r = await adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'c', plano: 'premium', agora: T0 })
      expect(r.ok).toBe(true)
      expect(contador.instrucoes).toHaveLength(2)

      contador.zerar()
      await adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'c', plano: 'premium', agora: T0 })
      expect(contador.instrucoes).toHaveLength(1) // a recusa veio do banco

      contador.zerar()
      await adm.admitirNoBalde({ tipo: 'stt', provedor: 'groq', modelo: 'c', plano: 'premium', agora: T0 + 500 })
      expect(contador.instrucoes).toHaveLength(0) // a mesma recusa, do cache
      await vaga?.()
    } finally {
      contador.parar()
    }
  })

  it('a fala recusada em rajada não vai ao banco: o cache é conferido antes da vaga em voo', async () => {
    process.env.IA_ADMISSAO_STT_RPM = '1'
    const { admitirStt, encerrarAdmissaoDoStt } =
      await h.load<typeof import('../../server/ai/cascataDeStt')>('../../server/ai/cascataDeStt')
    const pernas = [{ base: 'http://203.0.113.20/v1', model: 'rajada', rotulo: 'groq', apiKey: 'k' }] as any
    const primeira = await admitirStt(pernas, { userId: 'u-r1', plano: 'premium' })
    expect(primeira.ok).toBe(true)
    const contador = await contarConsultas(h.load)
    try {
      contador.zerar()
      const doBanco = await admitirStt(pernas, { userId: 'u-r2', plano: 'premium' })
      expect(doBanco.ok).toBe(false)
      expect(contador.instrucoes).toHaveLength(3) // vaga, balde (recusa), soltar a vaga

      contador.zerar()
      const doCache = await admitirStt(pernas, { userId: 'u-r3', plano: 'premium' })
      expect(doCache.ok === false && doCache.recusa.motivo).toBe('minuto')
      expect(contador.instrucoes).toHaveLength(0)
    } finally {
      contador.parar()
      if (primeira.ok === true) await encerrarAdmissaoDoStt(primeira.admissao)
    }
  })
})
