/**
 * JOBS IDEMPOTENTES (Fase 2, Task 9). Num Worker os jobs rodam do `scheduled` dos Cron Triggers, e o
 * mesmo cron pode disparar em dois isolates ao mesmo tempo; no Node, os `setTimeout` de sempre. Os dois
 * chamam `executarJob` sobre o MESMO registro (`server/jobs/registro.ts`), e cada passada toma uma
 * LEASE (linha `g:job:<nome>` em `travas`, com prazo): duas passadas simultâneas do mesmo job rodam UMA
 * vez; uma passada que morreu no meio não trava a próxima para sempre (a lease vence).
 *
 * E a limpeza diária, o job mais longo, deixa de segurar uma transação por usuário enquanto apaga: cada
 * lote (até 500 linhas) é uma transação curta com a trava do usuário, e há teto de lotes por passada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

type ModuloExecutar = typeof import('../../server/jobs/executar')
type ModuloRegistro = typeof import('../../server/jobs/registro')
type Job = import('../../server/jobs/registro').Job

const URL_PG = process.env.TESTE_POSTGRES_URL
const DIA = 86_400_000
const AGORA = 1_800_000_000_000

let h: EphemeralDb
let db: any
let sql: any
let t: any
let m: typeof import('../../server/db/db')
let ex: ModuloExecutar
let reg: ModuloRegistro

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  m = await h.load('../../server/db/db')
  db = m.db
  ;({ sql } = await h.load('drizzle-orm'))
  t = await h.load('../../server/db/schema')
  ex = await h.load<ModuloExecutar>('../../server/jobs/executar')
  reg = await h.load<ModuloRegistro>('../../server/jobs/registro')
}, 60_000)

afterAll(async () => {
  await h?.cleanup()
})

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Um job falso: conta quantas vezes rodou e demora `ms` (para a segunda passada chegar no meio). */
function jobFalso(nome: string, cron = '0 3 * * *', ms = 50, extra: Partial<Job> = {}) {
  const estado = { rodou: 0 }
  const job: Job = {
    nome,
    cron,
    node: { atrasoInicialMs: 60_000, intervaloMs: DIA },
    async rodar() {
      estado.rodou += 1
      await espera(ms)
      return { feito: 1 }
    },
    ...extra,
  }
  return { job, estado }
}

const lease = async (nome: string) =>
  m.linhas<{ criado_em: string }>(await db.execute(sql`SELECT criado_em FROM travas WHERE chave = ${`g:job:${nome}`}`))

describe('o registro', () => {
  it('nomes únicos, cron de 5 campos e horário de primeira passada no Node para cada job', () => {
    const nomes = reg.JOBS.map((j) => j.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
    expect(nomes).toEqual(
      expect.arrayContaining([
        'retencaoDeAudio',
        'limpezaDeConvidados',
        'podaDasJanelasDiarias',
        'podaDasMarcasDeTeste',
        'podaDoCacheDeTraducao',
        'limpezaDiaria',
        'reconciliarArmazenamento',
      ]),
    )
    expect(nomes).not.toContain('snapshotDiario') // aposentado (BACKUP_DIARIO fica como legado)
    for (const j of reg.JOBS) {
      expect(j.cron.split(' '), j.nome).toHaveLength(5)
      expect(j.node.atrasoInicialMs, j.nome).toBeGreaterThan(0)
      expect(j.node.intervaloMs, j.nome).toBeGreaterThan(0)
    }
  })

  it('as condições reproduzem o que o boot do Node decidia', () => {
    const c = (nome: string, env: NodeJS.ProcessEnv) => reg.JOBS.find((j) => j.nome === nome)!.condicao?.(env) ?? true
    expect(c('limpezaDeConvidados', { AUTH_REQUIRED: '0' })).toBe(false)
    expect(c('limpezaDeConvidados', { AUTH_REQUIRED: '1' })).toBe(true)
    expect(c('podaDasJanelasDiarias', { AUTH_REQUIRED: '1' })).toBe(true)
    expect(c('podaDasMarcasDeTeste', { AUTH_REQUIRED: '0' })).toBe(false)
    expect(c('retencaoDeAudio', { AUDIO_RETENCAO_DIAS: '0' })).toBe(false)
    expect(c('retencaoDeAudio', {})).toBe(true)
    expect(c('limpezaDiaria', { LIMPEZA_DIARIA: '1' })).toBe(true)
    expect(c('limpezaDiaria', {})).toBe(false)
    expect(c('reconciliarArmazenamento', { STORAGE_RECONCILE_MODE: 'job' })).toBe(true)
    expect(c('reconciliarArmazenamento', {})).toBe(false)
    expect(c('podaDoCacheDeTraducao', {})).toBe(true)
  })
})

describe('executarJob com lease', () => {
  it('o mesmo job duas vezes em paralelo: um roda, o outro é pulado, e a lease é solta no fim', async () => {
    const { job, estado } = jobFalso('falso-paralelo')
    const r = await Promise.all([
      ex.executarJob('falso-paralelo', { jobs: [job] }),
      ex.executarJob('falso-paralelo', { jobs: [job] }),
    ])
    expect(r.map((x) => x.estado).sort()).toEqual(['ok', 'pulado'])
    expect(r.find((x) => x.estado === 'pulado')?.motivo).toBe('em_andamento')
    expect(estado.rodou).toBe(1)
    expect(await lease('falso-paralelo')).toEqual([])
    // Solta, a próxima passada roda.
    expect((await ex.executarJob('falso-paralelo', { jobs: [job] })).estado).toBe('ok')
    expect(estado.rodou).toBe(2)
  })

  it('um job de verdade em paralelo tem efeito único (poda das janelas diárias)', async () => {
    const { usageCountersRepo } = await h.load<any>('../../server/db/repositories/usageCounters')
    const cota = await h.load<any>('../../server/lib/usageQuota')
    for (let i = 0; i < 3; i++)
      await usageCountersRepo.increment(`janela-${i}`, cota.METRIC_STT_SEGUNDOS_DIA, '2000-01-01', 5)
    const env = { AUTH_REQUIRED: '1' }
    const r = await Promise.all([
      ex.executarJob('podaDasJanelasDiarias', { env }),
      ex.executarJob('podaDasJanelasDiarias', { env }),
    ])
    expect(r.map((x) => x.estado).sort()).toEqual(['ok', 'pulado'])
    for (let i = 0; i < 3; i++)
      expect(await usageCountersRepo.get(`janela-${i}`, cota.METRIC_STT_SEGUNDOS_DIA, '2000-01-01')).toBe(0)
  })

  it('lease deixada por uma passada que morreu: vencida não bloqueia; recente bloqueia', async () => {
    const { job, estado } = jobFalso('falso-caiu', '0 3 * * *', 0)
    const chave = 'g:job:falso-caiu'
    await db.execute(sql`INSERT INTO travas (chave, criado_em) VALUES (${chave}, ${Date.now() - 60_000})`)
    const pulado = await ex.executarJob('falso-caiu', { jobs: [job] })
    expect(pulado).toMatchObject({ estado: 'pulado', motivo: 'em_andamento' })
    expect(estado.rodou).toBe(0)

    await db.execute(sql`UPDATE travas SET criado_em = ${Date.now() - ex.PRAZO_DA_LEASE_MS - 1} WHERE chave = ${chave}`)
    expect((await ex.executarJob('falso-caiu', { jobs: [job] })).estado).toBe('ok')
    expect(estado.rodou).toBe(1)
    expect(await lease('falso-caiu')).toEqual([])
  })

  it('job que falha: estado `falhou`, sem lançar, e a lease é solta', async () => {
    const { job } = jobFalso('falso-falha', '0 3 * * *', 0, {
      rodar: async () => {
        throw new Error('quebrou')
      },
    })
    const r = await ex.executarJob('falso-falha', { jobs: [job] })
    expect(r.estado).toBe('falhou')
    expect(await lease('falso-falha')).toEqual([])
  })

  it('condição falsa: pulado sem tomar lease nem rodar', async () => {
    const { job, estado } = jobFalso('falso-desligado', '0 3 * * *', 0, { condicao: (env) => env.LIGADO === '1' })
    expect(await ex.executarJob('falso-desligado', { jobs: [job], env: {} })).toMatchObject({
      estado: 'pulado',
      motivo: 'condicao',
    })
    expect(estado.rodou).toBe(0)
    expect((await ex.executarJob('falso-desligado', { jobs: [job], env: { LIGADO: '1' } })).estado).toBe('ok')
  })

  it('nome desconhecido lança', async () => {
    await expect(ex.executarJob('nao-existe', { jobs: [] })).rejects.toThrow(/nao-existe/)
  })

  it.skipIf(!URL_PG)('Postgres real: dois executores (dois isolates) ao mesmo tempo, um roda', async () => {
    const { comExecutor } = await h.load<typeof import('../../server/db/executor')>('../../server/db/executor')
    const { dubleDoHyperdrive } = await import('../harness/workers/hyperdriveDuble')
    const hyperdrive = dubleDoHyperdrive(m.urlDoBanco())
    const [a, b] = [await hyperdrive.abrir(), await hyperdrive.abrir()]
    const { job, estado } = jobFalso('falso-isolates', '0 3 * * *', 200)
    try {
      const r = await Promise.all([
        comExecutor(a, () => ex.executarJob('falso-isolates', { jobs: [job] })),
        comExecutor(b, () => ex.executarJob('falso-isolates', { jobs: [job] })),
      ])
      expect(r.map((x) => x.estado).sort()).toEqual(['ok', 'pulado'])
      expect(estado.rodou).toBe(1)
    } finally {
      await a.fechar()
      await b.fechar()
    }
  })
})

describe('executarJobsDoCron', () => {
  it('roda só os jobs daquela expressão', async () => {
    const a = jobFalso('cron-a', '0 3 * * *', 0)
    const b = jobFalso('cron-b', '0 3 * * *', 0)
    const c = jobFalso('cron-c', '5 3 * * *', 0)
    const r = await ex.executarJobsDoCron('0 3 * * *', { jobs: [a.job, b.job, c.job] })
    expect(r.map((x) => x.nome)).toEqual(['cron-a', 'cron-b'])
    expect([a.estado.rodou, b.estado.rodou, c.estado.rodou]).toEqual([1, 1, 0])
  })

  it('com o registro de verdade, a expressão da limpeza diária só chama a limpeza diária', async () => {
    const cron = reg.JOBS.find((j) => j.nome === 'limpezaDiaria')!.cron
    const r = await ex.executarJobsDoCron(cron, { env: {} })
    expect(r.map((x) => x.nome)).toEqual(reg.JOBS.filter((j) => j.cron === cron).map((j) => j.nome))
    expect(r[0]).toMatchObject({ nome: 'limpezaDiaria', estado: 'pulado', motivo: 'condicao' })
  })

  it('expressão sem job: nada roda', async () => {
    expect(await ex.executarJobsDoCron('59 23 31 12 *')).toEqual([])
  })
})

describe('limpeza diária em lotes', () => {
  const HA_40 = AGORA - 40 * DIA
  const ALVOS =
    /^\s*(delete\s+from|update)\s+(review_logs|vocab_occurrences|vocab_cards|utterances|sessions|exercise_results)\b/i

  async function semear(u: string) {
    await db.insert(t.vocabCards).values({ id: `${u}-vivo`, createdAt: HA_40, updatedAt: HA_40, userId: u, word: 'w' })
    for (let i = 0; i < 7; i++)
      await db.insert(t.reviewLogs).values({
        id: `${u}-rev-${i}`,
        createdAt: HA_40,
        updatedAt: HA_40,
        userId: u,
        cardId: `${u}-vivo`,
        reviewedAt: HA_40,
        grade: 3,
        deletedAt: HA_40,
      })
    for (let i = 0; i < 5; i++)
      await db.insert(t.vocabOccurrences).values({
        id: `${u}-occ-${i}`,
        createdAt: HA_40,
        updatedAt: HA_40,
        userId: u,
        deletedAt: HA_40,
        cardId: `${u}-vivo`,
        occurredAt: HA_40,
        originKind: 'manual',
      })
    for (let i = 0; i < 4; i++)
      await db
        .insert(t.vocabCards)
        .values({ id: `${u}-velho-${i}`, createdAt: HA_40, updatedAt: HA_40, userId: u, word: 'w', deletedAt: HA_40 })
    for (let s = 0; s < 3; s++) {
      const id = `${u}-ses-${s}`
      await db
        .insert(t.sessions)
        .values({ id, createdAt: HA_40, updatedAt: HA_40, userId: u, deletedAt: HA_40, title: id, kind: 'live' })
      for (let i = 0; i < 3; i++)
        await db.insert(t.utterances).values({
          id: `${id}-fala-${i}`,
          createdAt: HA_40,
          updatedAt: HA_40,
          userId: u,
          deletedAt: HA_40,
          sessionId: id,
          idx: i,
          sourceText: 'texto',
        })
    }
  }
  const conta = async (tabela: string, u: string) =>
    m.linhas<{ n: number }>(
      await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${tabela} WHERE user_id = '${u}'`)),
    )[0].n

  it('apaga tudo em várias passadas, cada lote numa transação curta com a trava do usuário', async () => {
    const u = 'lotes-u1'
    await semear(u)
    const { limparBanco } = await h.load<typeof import('../../server/lib/limpezaDiaria')>(
      '../../server/lib/limpezaDiaria',
    )
    const { registrarObservadorDeConsultas } = await h.load<typeof import('../../server/db/observadorDeConsultas')>(
      '../../server/db/observadorDeConsultas',
    )
    const vistas: string[] = []
    registrarObservadorDeConsultas((o) => vistas.push(...o.instrucoes))
    let r: Awaited<ReturnType<typeof limparBanco>>
    try {
      r = await limparBanco({ agora: AGORA, dias: 30, lote: 3 })
    } finally {
      registrarObservadorDeConsultas(undefined)
    }
    expect(r).toMatchObject({ revisoes: 7, ocorrencias: 5, cartoes: 4, sessoes: 3, falas: 9, incompleta: false })
    for (const tabela of ['review_logs', 'vocab_occurrences', 'utterances', 'sessions'])
      expect(await conta(tabela, u), tabela).toBe(0)
    expect(await conta('vocab_cards', u)).toBe(1) // o vivo fica

    /* Cada lote abre com a trava do usuário (`INSERT INTO travas`). Entre duas travas, no máximo UM
       apagamento/atualização de lote: nenhuma transação atravessa dois lotes. */
    const segmentos: string[][] = []
    for (const s of vistas) {
      if (/insert\s+into\s+travas/i.test(s)) segmentos.push([])
      else if (segmentos.length) segmentos[segmentos.length - 1].push(s)
    }
    for (const seg of segmentos) expect(seg.filter((s) => ALVOS.test(s)).length).toBeLessThanOrEqual(1)
    const lotesDeRevisao = segmentos.filter((seg) => seg.some((s) => /^\s*delete\s+from\s+review_logs/i.test(s)))
    expect(lotesDeRevisao.length).toBeGreaterThanOrEqual(3) // 7 revisões em lotes de 3
    expect(segmentos.length).toBeGreaterThanOrEqual(r.lotes)
    expect(r.lotes).toBeGreaterThanOrEqual(10)

    /* Os lotes de revisão ajustam os agregados incrementalmente; a reconstrução COMPLETA do usuário (que
       apaga e regrava `agregados_diarios` inteiro) é uma só, no fim. */
    const reconstrucoes = vistas.filter((s) => /^\s*delete\s+from\s+agregados_diarios\s+where\s+user_id/i.test(s))
    expect(reconstrucoes).toHaveLength(1)
  })

  it('o perfil não perde revisão: as purgadas em lotes somam o mesmo que de uma vez', async () => {
    const { agregadosRepo } = await h.load<any>('../../server/db/repositories/agregados')
    const celulas = await agregadosRepo.celulas('lotes-u1')
    expect(celulas.reduce((n: number, c: any) => n + c.revisoesPurgadas, 0)).toBe(7)
    await agregadosRepo.reconstruir('lotes-u1')
    expect(await agregadosRepo.celulas('lotes-u1')).toEqual(celulas)
  })

  it('teto de lotes por passada: para no meio e a passada seguinte retoma de onde parou', async () => {
    const u = 'lotes-u2'
    await semear(u)
    const { limparBanco } = await h.load<typeof import('../../server/lib/limpezaDiaria')>(
      '../../server/lib/limpezaDiaria',
    )
    const { agregadosRepo } = await h.load<any>('../../server/db/repositories/agregados')
    await agregadosRepo.reconstruir(u)
    const r1 = await limparBanco({ agora: AGORA, dias: 30, lote: 3, maxLotes: 2 })
    expect(r1).toMatchObject({ revisoes: 6, lotes: 2, incompleta: true })
    expect(await conta('review_logs', u)).toBe(1)
    /* Parou no meio, SEM a reconstrução do fim: o ajuste incremental dos dois lotes já deixou os agregados
       iguais aos de uma reconstrução completa, com as 6 revisões em `revisoes_purgadas`. */
    const incrementais = await agregadosRepo.celulas(u)
    expect(incrementais.reduce((n: number, c: any) => n + c.revisoesPurgadas, 0)).toBe(6)
    expect((await agregadosRepo.estado(u)).marcaBruto).toBe((await agregadosRepo.estado(u)).marcaVista)
    await agregadosRepo.reconstruir(u)
    expect(await agregadosRepo.celulas(u)).toEqual(incrementais)
    const r2 = await limparBanco({ agora: AGORA, dias: 30, lote: 3 })
    expect(r2).toMatchObject({ revisoes: 1, ocorrencias: 5, cartoes: 4, sessoes: 3, falas: 9, incompleta: false })
    for (const tabela of ['review_logs', 'vocab_occurrences', 'utterances', 'sessions'])
      expect(await conta(tabela, u), tabela).toBe(0)
  })
})
