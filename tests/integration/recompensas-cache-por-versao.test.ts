/**
 * AS ROTAS DAS RECOMPENSAS PARAM DE RELER O HISTÓRICO A CADA CHAMADA — e devolvem o mesmo que
 * devolviam (auditoria de desempenho do servidor de 10/10/2026, achado A1).
 *
 * `GET /api/metrics/missoes`, `/temporada`, `/maestria`, `/xp` e `GET /api/exercises/historico`
 * nasceram depois do conserto do perfil (fix/rotas-caras) e liam todas as linhas de jogo, de revisão
 * e de sessão da conta a cada pedido: medido, 33 a 180 ms com 5.000 revisões e 5.000 exercícios, e
 * `missoes` roda em toda abertura do app. Passam a usar o mesmo `CachePorVersao` do perfil, com a
 * versão `atividade` de `versoes_de_dados` (os gatilhos da migração 0032 cobrem as quatro tabelas).
 *
 * Três metades, como em `rotas-caras-equivalencia`:
 *
 *  1. EQUIVALÊNCIA: o JSON inteiro de cada rota, a cada passo do roteiro abaixo, gravado com o
 *     código ANTERIOR ao cache. O roteiro é determinístico (relógio congelado, semeadura fixa).
 *  2. CUSTO: sem escrita no meio, a segunda leitura não toca `exercise_results` nem `review_logs`.
 *  3. INVALIDAÇÃO E RELÓGIO: depois de uma rodada, de uma revisão e de uma escrita em SQL cru, a
 *     leitura seguinte enxerga a escrita; e quando o DIA vira (ou a temporada acaba) sem escrita
 *     nenhuma, a resposta muda mesmo assim, porque o relógio fica fora do cache.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { type Semeado, semearRico } from './_semeaduraRica'

const DONO = 'local-owner'
/** 05/10/2026 15:00 UTC: dentro da temporada 1 (01/10 a 25/11, no dia de Brasília). */
const HOJE = Date.UTC(2026, 9, 5, 15, 0, 0)
const DIA = 86_400_000
const FUSO = 'fuso=America%2FSao_Paulo'
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`
const foto = (nome: string) => `../__snapshots__/recompensas-cache/${nome}.json`

/** As tabelas grandes: o que uma leitura quente não pode tocar. */
const TABELAS_DO_HISTORICO = /exercise_results|review_logs|vocab_cards|utterances|"sessions"/

describe('rotas das recompensas: equivalência, custo e invalidação', () => {
  let s: AppDeTeste
  let semeado: Semeado
  let instrucoes: string[] = []

  /** Uma chamada HTTP e o SQL que ela mandou ao banco. */
  async function medir(caminho: string): Promise<{ corpo: unknown; sql: string[] }> {
    instrucoes = []
    const r = await s.get(caminho)
    expect(r.status).toBe(200)
    const corpo = await r.json()
    return { corpo, sql: instrucoes }
  }
  const ler = async (caminho: string) => (await medir(caminho)).corpo

  function rodada(roundId: string, jogo: string, certos: number, total = 10) {
    return s.post('/api/exercises/rodada', {
      roundId,
      exerciseKind: jogo,
      origem: 'baralho',
      score: 100,
      melhorSequencia: certos,
      itens: Array.from({ length: total }, (_, i) => ({
        itemRef: `${roundId}-${i}`,
        correct: i < certos ? 1 : 0,
        kind: 'drill',
      })),
    })
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(HOJE)
    s = await subirApp({ modo: 'self-host' })
    semeado = await semearRico(s, DONO)
    expect((await rodada('r-hoje-1', 'blitz', 10)).status).toBe(200)
    const { client } = await s.load('../../server/db/db')
    const execute = client.execute.bind(client)
    const batch = client.batch.bind(client)
    const texto = (x: unknown) => (typeof x === 'string' ? x : ((x as { sql?: string }).sql ?? ''))
    client.execute = ((...a: Parameters<typeof execute>) => {
      instrucoes.push(texto(a[0]))
      return execute(...a)
    }) as typeof client.execute
    client.batch = ((...a: Parameters<typeof batch>) => {
      for (const x of a[0] as unknown[]) instrucoes.push(texto(x))
      return batch(...a)
    }) as typeof client.batch
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  const ROTAS: Array<[string, string]> = [
    ['missoes', `/api/metrics/missoes?${FUSO}`],
    ['temporada', '/api/metrics/temporada'],
    ['maestria', '/api/metrics/maestria'],
    ['xp-dia', '/api/metrics/xp'],
    ['xp-semana-desde', `/api/metrics/xp?balde=semana&desde=${HOJE - 10 * DIA}`],
    ['historico', '/api/exercises/historico'],
    ['historico-baralho', '/api/exercises/historico?origem=baralho'],
    ['historico-desde', `/api/exercises/historico?desde=${HOJE - 5 * DIA}`],
  ]

  describe('equivalência com o código anterior (JSON inteiro)', () => {
    for (const [nome, caminho] of ROTAS) {
      it(`GET ${caminho.split('?')[0]} (${nome})`, async () => {
        await expect(json(await ler(caminho))).toMatchFileSnapshot(foto(`1-${nome}`))
      })
    }
  })

  describe('custo: a segunda leitura sem escrita no meio não relê o histórico', () => {
    /* `historico-desde` fica de fora de propósito: `desde` é um número livre do cliente, e guardar
       uma entrada por valor encheria o cache de respostas que ninguém pede duas vezes. */
    const QUENTES = ROTAS.filter(([nome]) => nome !== 'historico-desde')
    for (const [nome, caminho] of QUENTES) {
      it(`${nome}: mesmo corpo, nenhuma consulta às tabelas grandes`, async () => {
        const a = await ler(caminho)
        const { corpo, sql } = await medir(caminho)
        expect(corpo).toEqual(a)
        expect(sql.filter((x) => TABELAS_DO_HISTORICO.test(x))).toEqual([])
        expect(sql.length).toBeLessThanOrEqual(8)
      })
    }

    it('historico: o ETag é o da versão, e o If-None-Match igual responde 304 com uma consulta', async () => {
      const r = await s.get('/api/exercises/historico')
      const etag = r.headers.get('etag') ?? ''
      await r.arrayBuffer()
      expect(etag).toMatch(/^W\/"historico-/)
      instrucoes = []
      const r304 = await s.chamar('GET', '/api/exercises/historico', { headers: { 'if-none-match': etag } })
      expect(r304.status).toBe(304)
      expect(await r304.text()).toBe('')
      expect(instrucoes.length).toBeLessThanOrEqual(1)
      /* O filtro faz parte do ETag: a resposta de uma fonte não revalida a de outra. */
      const outra = await s.chamar('GET', '/api/exercises/historico?origem=baralho', {
        headers: { 'if-none-match': etag },
      })
      expect(outra.status).toBe(200)
      await outra.arrayBuffer()
    })
  })

  describe('invalidação: a escrita aparece na leitura seguinte', () => {
    it('uma rodada nova muda maestria, missões, temporada, XP e histórico', async () => {
      const antes = (await ler('/api/metrics/maestria')) as { jogos: Array<{ jogo: string; pontos: number }> }
      const etagAntes = (await s.get('/api/exercises/historico')).headers.get('etag')
      expect((await rodada('r-hoje-2', 'memory', 9)).status).toBe(200)
      const depois = (await ler('/api/metrics/maestria')) as { jogos: Array<{ jogo: string; pontos: number }> }
      const pontos = (m: typeof antes) => m.jogos.find((j) => j.jogo === 'memory')!.pontos
      expect(pontos(depois)).toBeGreaterThan(pontos(antes))
      const condicional = await s.chamar('GET', '/api/exercises/historico', {
        headers: { 'if-none-match': etagAntes ?? '' },
      })
      expect(condicional.status).toBe(200)
      await condicional.arrayBuffer()
      for (const [nome, caminho] of ROTAS) {
        await expect(json(await ler(caminho))).toMatchFileSnapshot(foto(`2-rodada-${nome}`))
      }
    })

    it('uma revisão nova muda o XP e a temporada', async () => {
      const antes = (await ler('/api/metrics/xp')) as { xpTotal: number }
      expect((await s.post(`/api/vocab/${semeado.cartoes[3]}/review`, { grade: 4 })).status).toBe(200)
      const depois = (await ler('/api/metrics/xp')) as { xpTotal: number }
      expect(depois.xpTotal).toBeGreaterThan(antes.xpTotal)
      await expect(json(await ler('/api/metrics/temporada'))).toMatchFileSnapshot(foto('3-revisao-temporada'))
      await expect(json(await ler(`/api/metrics/missoes?${FUSO}`))).toMatchFileSnapshot(foto('3-revisao-missoes'))
    })

    it('uma escrita FORA dos repositórios (SQL cru) também invalida', async () => {
      const antes = (await ler('/api/exercises/historico')) as Array<{ itemRef: string }>
      const { client } = await s.load('../../server/db/db')
      await client.execute({
        sql: `INSERT INTO exercise_results (id, created_at, updated_at, user_id, kind, correct, exercise_kind, round_id, item_ref, origem)
              VALUES ('cru-1', ?, ?, ?, 'drill', 1, 'termo', 'r-cru', 'item-cru', 'baralho')`,
        args: [HOJE, HOJE, DONO],
      })
      const depois = (await ler('/api/exercises/historico')) as Array<{ itemRef: string }>
      expect(depois.length).toBe(antes.length + 1)
      expect(depois.some((h) => h.itemRef === 'item-cru')).toBe(true)
      await expect(json(await ler('/api/metrics/maestria'))).toMatchFileSnapshot(foto('4-cru-maestria'))
    })
  })

  describe('o relógio fica fora do cache', () => {
    it('quando o dia vira, sem escrita nenhuma, as missões são as do dia novo', async () => {
      const hoje = (await ler(`/api/metrics/missoes?${FUSO}`)) as { dia: string }
      expect(hoje.dia).toBe('2026-10-05')
      vi.setSystemTime(HOJE + DIA)
      const { corpo, sql } = await medir(`/api/metrics/missoes?${FUSO}`)
      const amanha = corpo as { dia: string; missoes: Array<{ atual: number }> }
      expect(amanha.dia).toBe('2026-10-06')
      /* As rodadas de ontem não contam no dia novo, e a leitura continuou quente. */
      expect(amanha.missoes.every((m) => m.atual === 0)).toBe(true)
      await expect(json(amanha)).toMatchFileSnapshot(foto('5-dia-seguinte-missoes'))
      expect(sql.filter((x) => TABELAS_DO_HISTORICO.test(x))).toEqual([])
    })

    it('quando a temporada acaba, sem escrita nenhuma, a rota deixa de somar XP', async () => {
      const dentro = (await ler('/api/metrics/temporada')) as { temporada: { id: string } | null; xp: number }
      expect(dentro.temporada?.id).toBe('t1')
      expect(dentro.xp).toBeGreaterThan(0)
      vi.setSystemTime(Date.UTC(2026, 10, 26, 12, 0, 0))
      const fora = (await ler('/api/metrics/temporada')) as { temporada: unknown; xp: number }
      expect(fora.temporada).toBeNull()
      expect(fora.xp).toBe(0)
      await expect(json(fora)).toMatchFileSnapshot(foto('6-fim-da-temporada'))
    })
  })
})
