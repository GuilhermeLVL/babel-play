/**
 * MEDIR, AGREGAR E LIMPAR (change `modelo-do-aluno-e-dados`, fatias 1 e 2), num banco temporário.
 *
 *  1. GRAVAÇÃO: a revisão guarda origem, formato, tempo (com teto), meta e retenção prevista, e a
 *     rodada guarda nível e fonte, SEM mudar o agendamento.
 *  2. AGREGADOS: o que é somado na escrita é igual ao que se reconta do bruto; escrita por fora dos
 *     repositórios é percebida e recontada.
 *  3. IGUALDADE: o perfil pela leitura nova (agregados) é o MESMO JSON do caminho antigo (todas as
 *     revisões linha a linha, `perfilPeloBruto`), e as "revisões de sempre" da Memória dos Cartões
 *     são o `count(*)` de antes. O ouro do perfil gravado com o código anterior continua valendo em
 *     `rotas-caras-equivalencia.test.ts` (`__snapshots__/rotas-caras/perfil-global.json`).
 *  4. LIMPEZA: o que foi apagado há menos de 30 dias fica; o que passou sai com os dependentes;
 *     nada de outro usuário é tocado; e o perfil não perde revisão por causa disso.
 *
 * O fuso do PROCESSO é UTC de propósito, e o do usuário é o padrão (America/Sao_Paulo): é o caso em
 * que o dia do processo e o dia de quem estuda discordam. `rotas-caras-equivalencia` cobre os dois
 * iguais.
 */
process.env.TZ = 'UTC'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { makeFsrs5, retrievability } from '../../src/core/learning/scheduler'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { AGORA, semearRico } from './_semeaduraRica'

const DIA = 86_400_000
const DONO = 'local-owner'

describe('medir, agregar e limpar', () => {
  let s: AppDeTeste
  /* Tipos frouxos de propósito: os módulos do servidor só podem ser importados depois do banco. */
  let db: any
  let t: any
  let client: any
  let U: (id: string) => any
  let vocabRepo: any
  let exerciseResultsRepo: any
  let agregadosRepo: any
  let metricas: any

  /** Um cartão gravado direto na tabela, com id e idioma escolhidos. */
  async function cartao(userId: string, id: string, extra: Record<string, unknown> = {}) {
    await db.insert(t.vocabCards).values({
      id,
      createdAt: AGORA - 50 * DIA,
      updatedAt: AGORA - 50 * DIA,
      userId,
      word: id,
      back: `tradução de ${id}`,
      srcLang: 'en',
      tgtLang: 'pt',
      inDeck: 1,
      box: 1,
      dueAt: AGORA - DIA,
      normKey: `en|${id}`,
      addedAt: AGORA - 50 * DIA,
      ...extra,
    })
    return id
  }

  const linha = async (sql: string, args: unknown[] = []) => (await client.execute({ sql, args })).rows[0] as any
  const linhas = async (sql: string, args: unknown[] = []) => (await client.execute({ sql, args })).rows as any[]
  const numero = async (sql: string, args: unknown[] = []) => Number(Object.values(await linha(sql, args))[0])

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'self-host' })
    ;({ db, client } = await s.load('../../server/db/db'))
    t = await s.load('../../server/db/schema')
    U = (await s.load('../../server/lib/authContext')).asUserId
    ;({ vocabRepo } = await s.load('../../server/db/repositories/vocab'))
    ;({ exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults'))
    ;({ agregadosRepo } = await s.load('../../server/db/repositories/agregados'))
    metricas = await s.load('../../server/db/repositories/metrics')
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  describe('1. a revisão e a rodada guardam os campos novos, e o agendamento não muda', () => {
    it('primeira revisão: origem, formato, tempo com teto, meta usada; sem previsão (não havia estabilidade)', async () => {
      const id = await cartao(DONO, 'medir-1')
      const antes = await vocabRepo.get(U(DONO), id)
      const r = await s.post(`/api/vocab/${id}/review`, {
        grade: 3,
        retencao: 0.85,
        origem: 'revisao',
        formato: 'digitar',
        respostaMs: 75_000,
      })
      expect(r.status).toBe(200)
      const depois = (await r.json()) as Record<string, number>
      const log = await linha('SELECT * FROM review_logs WHERE card_id = ?', [id])
      expect(log).toMatchObject({
        grade: 3,
        origem: 'revisao',
        formato: 'digitar',
        resposta_ms: 60_000, // 75 s foi abandono: o teto é 60 s
        meta_retencao: 0.85,
        retencao_prevista: null,
      })
      /* O agendamento é o do agendador puro com a MESMA entrada: nada do registro entrou na conta. */
      const esperado = makeFsrs5(undefined, 0.85).review({ box: antes.box, dueAt: antes.dueAt }, 3, AGORA)
      expect(depois.dueAt).toBe(esperado.dueAt)
      expect(depois.stability).toBe(esperado.stability)
      expect(depois.difficulty).toBe(esperado.difficulty)
    })

    it('segunda revisão: a retenção prevista sai do estado ANTERIOR, e sem meta vale 90%', async () => {
      const id = 'medir-1'
      const antes = await vocabRepo.get(U(DONO), id)
      vi.setSystemTime(AGORA + 3 * DIA)
      const r = await s.post(`/api/vocab/${id}/review`, {
        grade: 4,
        origem: 'jogo:blitz',
        formato: 'blitz',
        respostaMs: 2400,
      })
      expect(r.status).toBe(200)
      const depois = (await r.json()) as Record<string, number>
      const log = await linha('SELECT * FROM review_logs WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT 1', [id])
      expect(log).toMatchObject({ origem: 'jogo:blitz', formato: 'blitz', resposta_ms: 2400, meta_retencao: 0.9 })
      expect(log.retencao_prevista).toBeCloseTo(retrievability(3, antes.stability), 12)
      const esperado = makeFsrs5().review(
        {
          box: antes.box,
          dueAt: antes.dueAt,
          stability: antes.stability,
          difficulty: antes.difficulty,
          reps: antes.reps,
          lapses: antes.lapses,
          lastReview: antes.lastReview,
        },
        4,
        AGORA + 3 * DIA,
      )
      expect(depois.dueAt).toBe(esperado.dueAt)
      expect(depois.stability).toBe(esperado.stability)
      vi.setSystemTime(AGORA)
    })

    it('a revisão de um cliente antigo (só a nota) continua valendo, com os campos novos nulos', async () => {
      const id = await cartao(DONO, 'medir-2')
      expect((await s.post(`/api/vocab/${id}/review`, { grade: 2 })).status).toBe(200)
      const log = await linha('SELECT * FROM review_logs WHERE card_id = ?', [id])
      expect(log).toMatchObject({ grade: 2, origem: null, formato: null, resposta_ms: null, meta_retencao: 0.9 })
    })

    it('origem ou formato fora do formato esperado: 400, e nada é gravado', async () => {
      const id = await cartao(DONO, 'medir-3')
      for (const corpo of [
        { grade: 3, origem: 'qualquer coisa' },
        { grade: 3, origem: 'jogo:' },
        { grade: 3, formato: 'Com Espaço' },
        { grade: 3, respostaMs: -5 },
      ]) {
        expect((await s.post(`/api/vocab/${id}/review`, corpo)).status, JSON.stringify(corpo)).toBe(400)
      }
      expect(await numero('SELECT count(*) FROM review_logs WHERE card_id = ?', [id])).toBe(0)
    })

    it('a rodada guarda o nível jogado e a fonte com o identificador dela', async () => {
      const r = await s.post('/api/exercises/rodada', {
        roundId: 'rodada-medir-1',
        exerciseKind: 'blitz',
        origem: 'trilha:A2',
        nivel: 'dificil',
        fonte: 'trilha',
        fonteRef: 'A2',
        itens: [
          { cardId: 'medir-1', itemRef: 'medir-1', correct: 1, ms: 900, kind: 'srs' },
          { itemRef: 'solta', correct: 0, ms: 1500, kind: 'drill' },
        ],
      })
      expect(r.status).toBe(200)
      const gravadas = await linhas('SELECT nivel, fonte, fonte_ref FROM exercise_results WHERE round_id = ?', [
        'rodada-medir-1',
      ])
      expect(gravadas).toHaveLength(2)
      for (const g of gravadas) expect(g).toMatchObject({ nivel: 'dificil', fonte: 'trilha', fonte_ref: 'A2' })
      // Nível inventado é recusado; rodada sem os campos novos continua valendo.
      const ruim = await s.post('/api/exercises/rodada', {
        roundId: 'rodada-medir-2',
        nivel: 'impossivel',
        itens: [{ itemRef: 'x', correct: 1 }],
      })
      expect(ruim.status).toBe(400)
      const antiga = await s.post('/api/exercises/rodada', {
        roundId: 'rodada-medir-3',
        itens: [{ itemRef: 'x', correct: 1 }],
      })
      expect(antiga.status).toBe(200)
      expect(
        await linha('SELECT nivel, fonte, fonte_ref FROM exercise_results WHERE round_id = ?', ['rodada-medir-3']),
      ).toMatchObject({ nivel: null, fonte: null, fonte_ref: null })
    })
  })

  describe('2. agregados diários: somados na escrita = recontados do bruto', () => {
    const A = 'agregados-a'
    /** As células do usuário como estão gravadas e como ficam depois de recontar do bruto. */
    async function somadasERecontadas(userId: string) {
      const somadas = await agregadosRepo.celulas(U(userId))
      await agregadosRepo.reconstruir(U(userId))
      return { somadas, recontadas: await agregadosRepo.celulas(U(userId)) }
    }
    const semCarimbo = (cs: any[]) => cs.map((c) => ({ ...c, somaPrevista: Number(c.somaPrevista.toPrecision(12)) }))

    beforeAll(async () => {
      for (const [id, lang] of [
        ['ag-en-1', 'en'],
        ['ag-en-2', 'en-US'],
        ['ag-es-1', 'es'],
        ['ag-apagar', 'en'],
      ]) {
        await cartao(A, id, { srcLang: lang, normKey: `${lang}|${id}` })
      }
      // Conta o passado (nada ainda) e cria o estado: daqui em diante as escritas somam.
      await agregadosRepo.reconstruir(U(A))
    })

    it('revisões em dias e idiomas diferentes, uma desfeita e um cartão apagado', async () => {
      const u = U(A)
      /* 01:30 UTC de 18/09 ainda é 17/09 à noite em São Paulo: o dia é o de quem estuda. */
      vi.setSystemTime(Date.UTC(2026, 8, 18, 1, 30))
      await vocabRepo.review(u, 'ag-en-1', 3, undefined, { origem: 'revisao', formato: 'lembrar', respostaMs: 4000 })
      await vocabRepo.review(u, 'ag-es-1', 1, undefined, { origem: 'revisao', respostaMs: 9000 })
      vi.setSystemTime(Date.UTC(2026, 8, 18, 15, 0))
      await vocabRepo.review(u, 'ag-en-2', 4)
      await vocabRepo.review(u, 'ag-apagar', 3)
      vi.setSystemTime(Date.UTC(2026, 8, 19, 15, 0))
      await vocabRepo.review(u, 'ag-en-1', 2, 0.85, { origem: 'jogo:termo', formato: 'termo', respostaMs: 1200 })
      await vocabRepo.review(u, 'ag-apagar', 1)
      // Desfaz a última de `ag-en-1` (a de nota 2) e apaga o cartão `ag-apagar` (duas revisões).
      await vocabRepo.desfazerRevisao(u, 'ag-en-1', {
        box: 2,
        dueAt: AGORA,
        stability: 3,
        difficulty: 5,
        reps: 1,
        lapses: 0,
        lastReview: AGORA - DIA,
      })
      expect(await vocabRepo.remove(u, 'ag-apagar')).toBe(true)
      vi.setSystemTime(AGORA)

      // As marcas casam: quem ler agora NÃO precisa recontar.
      const estado = await agregadosRepo.estado(u)
      expect(estado.marcaVista).toBe(estado.marcaBruto)
      expect(await agregadosRepo.garantir(u, estado.fuso)).toBe(false)

      const { somadas, recontadas } = await somadasERecontadas(A)
      expect(semCarimbo(somadas)).toEqual(semCarimbo(recontadas))

      const dia17 = somadas.filter((c: any) => c.dia === somadas[0].dia)
      expect(dia17.map((c: any) => c.idioma).sort()).toEqual(['en', 'es'])
      const total = (k: string) => somadas.reduce((n: number, c: any) => n + c[k], 0)
      // Seis aconteceram; três continuam vivas (a desfeita e as duas do cartão apagado saíram).
      expect(total('revisoes')).toBe(6)
      expect(total('revisoesVivas')).toBe(3)
      expect(total('acertos')).toBe(3)
      expect(total('nota1') + total('nota2') + total('nota3') + total('nota4')).toBe(3)
      expect(total('novas')).toBe(3)
      expect(total('tempoRevisaoMs')).toBe(13_000)
      // `en-US` conta em `en`: a célula é da base do idioma.
      expect(new Set(somadas.map((c: any) => c.idioma))).toEqual(new Set(['en', 'es']))
      // O bruto confirma os totais.
      expect(await numero('SELECT count(*) FROM review_logs WHERE user_id = ?', [A])).toBe(6)
      expect(await numero('SELECT count(*) FROM review_logs WHERE user_id = ? AND deleted_at IS NULL', [A])).toBe(3)
    })

    it('rodadas: itens, drill, rodada contada uma vez; a rodada repetida não soma de novo', async () => {
      const u = U(A)
      const rodada = {
        roundId: 'ag-rodada-1',
        exerciseKind: 'memory',
        origem: 'baralho',
        nivel: 'facil',
        fonte: 'baralho',
        itens: [
          { cardId: 'ag-en-1', itemRef: 'ag-en-1', correct: 1, ms: 1000, kind: 'srs' },
          { cardId: 'ag-es-1', itemRef: 'ag-es-1', correct: 0, ms: 2000, kind: 'srs' },
          { itemRef: 'sem-cartao', correct: 1, ms: 500, kind: 'drill' },
        ],
      }
      expect((await exerciseResultsRepo.addRodada(u, rodada)).gravados).toBe(3)
      const antesDaRepetida = await agregadosRepo.celulas(u)
      expect(await exerciseResultsRepo.addRodada(u, rodada)).toMatchObject({ gravados: 0, jaExistia: true })
      expect(await agregadosRepo.celulas(u)).toEqual(antesDaRepetida)
      vi.setSystemTime(AGORA + 1000)
      await exerciseResultsRepo.addRodada(u, {
        roundId: 'ag-rodada-2',
        exerciseKind: 'memory',
        itens: [{ cardId: 'ag-en-1', itemRef: 'ag-en-1', correct: 0, ms: 700, kind: 'srs' }],
      })
      vi.setSystemTime(AGORA)

      const estado = await agregadosRepo.estado(u)
      expect(estado.marcaVista).toBe(estado.marcaBruto)
      const { somadas, recontadas } = await somadasERecontadas(A)
      expect(semCarimbo(somadas)).toEqual(semCarimbo(recontadas))
      const total = (k: string) => somadas.reduce((n: number, c: any) => n + c[k], 0)
      expect(total('itensDeJogo')).toBe(4)
      expect(total('itensCertos')).toBe(2)
      expect(total('itensDrill')).toBe(1)
      expect(total('itensDrillCertos')).toBe(1)
      expect(total('tempoJogoMs')).toBe(4200)
      expect(total('rodadas')).toBe(2)
      // A primeira rodada tem item sem cartão: conta no idioma vazio (o menor). A segunda, em `en`.
      expect(
        somadas
          .filter((c: any) => c.rodadas > 0)
          .map((c: any) => c.idioma)
          .sort(),
      ).toEqual(['', 'en'])
    })

    it('estado por item: acertos, erros e o último resultado por cartão e jogo, igual ao recontado', async () => {
      const u = U(A)
      const lido = await agregadosRepo.estadoPorItem(u, 'ag-en-1')
      expect(lido).toEqual([{ jogo: 'memory', acertos: 1, erros: 1, ultimoResultado: 0, ultimoEm: AGORA + 1000 }])
      expect(await agregadosRepo.estadoPorItem(u, 'ag-es-1')).toEqual([
        { jogo: 'memory', acertos: 0, erros: 1, ultimoResultado: 0, ultimoEm: AGORA },
      ])
      vi.setSystemTime(AGORA + 60_000)
      await exerciseResultsRepo.addRodada(u, {
        roundId: 'ag-rodada-3',
        exerciseKind: 'termo',
        itens: [{ cardId: 'ag-en-1', itemRef: 'ag-en-1', correct: 1, kind: 'srs' }],
      })
      await exerciseResultsRepo.addRodada(u, {
        roundId: 'ag-rodada-4',
        exerciseKind: 'memory',
        itens: [{ cardId: 'ag-en-1', itemRef: 'ag-en-1', correct: 1, kind: 'srs' }],
      })
      vi.setSystemTime(AGORA)
      const somado = await agregadosRepo.estadoPorItem(u, 'ag-en-1')
      expect(somado).toEqual([
        { jogo: 'memory', acertos: 2, erros: 1, ultimoResultado: 1, ultimoEm: AGORA + 60_000 },
        { jogo: 'termo', acertos: 1, erros: 0, ultimoResultado: 1, ultimoEm: AGORA + 60_000 },
      ])
      await agregadosRepo.reconstruir(u)
      expect(await agregadosRepo.estadoPorItem(u, 'ag-en-1')).toEqual(somado)
    })

    it('escrita por fora dos repositórios: as marcas deixam de casar e a leitura reconta', async () => {
      const u = U(A)
      const antes = await agregadosRepo.revisoesVivas(u)
      await client.execute({
        sql: `INSERT INTO review_logs (id, created_at, updated_at, user_id, card_id, reviewed_at, grade)
              VALUES ('por-fora', ?, ?, ?, 'ag-en-1', ?, 3)`,
        args: [AGORA, AGORA, A, AGORA],
      })
      const estado = await agregadosRepo.estado(u)
      expect(estado.marcaBruto).toBe(estado.marcaVista + 1)
      // Quem lê não vê número velho: `revisoesVivas` reconta antes de responder.
      expect(await agregadosRepo.revisoesVivas(u)).toBe(antes + 1)
      const depois = await agregadosRepo.estado(u)
      expect(depois.marcaVista).toBe(depois.marcaBruto)
    })

    it('reetiquetar o idioma de um cartão move as revisões dele de célula na próxima leitura', async () => {
      const u = U(A)
      const noEspanhol = async () =>
        (await agregadosRepo.celulas(u))
          .filter((c: any) => c.idioma === 'es')
          .reduce((n: number, c: any) => n + c.revisoes, 0)
      const antes = await noEspanhol()
      expect(await vocabRepo.relabel(u, [{ id: 'ag-en-2', srcLang: 'es', tgtLang: 'pt' }])).toBe(1)
      expect(await agregadosRepo.garantir(u)).toBe(true)
      expect(await noEspanhol()).toBe(antes + 1)
    })

    it('usuário nunca contado: a primeira leitura conta o passado; o passo de arranque faz o mesmo', async () => {
      const B = 'agregados-b'
      await cartao(B, 'agb-1')
      for (let i = 0; i < 5; i++) {
        await db.insert(t.reviewLogs).values({
          id: `agb-rev-${i}`,
          createdAt: AGORA - i * DIA,
          updatedAt: AGORA - i * DIA,
          userId: B,
          cardId: 'agb-1',
          reviewedAt: AGORA - i * DIA,
          grade: i % 2 ? 1 : 3,
          deletedAt: i === 4 ? AGORA : null,
        })
      }
      expect(await agregadosRepo.estado(U(B))).toBeNull()
      const { preencherAgregadosPendentes } = await s.load('../../server/db/repositories/agregados')
      const r = await preencherAgregadosPendentes()
      expect(r.preenchidos).toBeGreaterThanOrEqual(1)
      expect(r.restam).toBe(false)
      expect(await agregadosRepo.estado(U(B))).not.toBeNull()
      expect(await agregadosRepo.revisoesVivas(U(B))).toBe(4)
      // Idempotente: de novo, não há ninguém pendente e nada muda.
      const celulas = await agregadosRepo.celulas(U(B))
      expect((await preencherAgregadosPendentes()).preenchidos).toBe(0)
      await agregadosRepo.reconstruir(U(B))
      expect(await agregadosRepo.celulas(U(B))).toEqual(celulas)
    })
  })

  describe('3. igualdade com o caminho antigo, no mesmo banco', () => {
    /* Só o que NÃO depende do instante exato da leitura sai do relógio congelado; `asOf` é o mesmo
       porque o relógio está parado. */
    const iguais = async (userId: string) => {
      const novo = await metricas.computeProfile(U(userId))
      const antigo = await metricas.perfilPeloBruto(U(userId))
      expect(novo).toEqual(antigo)
      return novo
    }
    const revisoesDeSempreDeAntes = (userId: string) =>
      numero('SELECT count(*) FROM review_logs WHERE user_id = ? AND deleted_at IS NULL', [userId])
    const resumo = async (userId: string) => {
      const { resumoDosCartoes } = await s.load('../../server/db/repositories/resumoDosCartoes')
      return resumoDosCartoes(U(userId), { agora: AGORA, inicioDoDia: AGORA - 15 * 3_600_000 })
    }

    it('conta semeada com todos os ramos (revisão sem data, sem nota, cartão apagado): perfil idêntico', async () => {
      await semearRico(s, 'rico-a')
      const p = await iguais('rico-a')
      expect(p.reviews).toBe(260)
      expect(p.palavrasDificeis.length).toBeGreaterThan(0)
      expect(p.revisoesRecentes.length).toBeGreaterThan(0)
      expect((await resumo('rico-a')).revisoesDeSempre).toBe(await revisoesDeSempreDeAntes('rico-a'))
    })

    it('depois de revisar, desfazer e apagar um cartão: continua idêntico, e a Memória conta só as vivas', async () => {
      const u = U('rico-a')
      await vocabRepo.review(u, 'card-ricoa-001', 3)
      await vocabRepo.review(u, 'card-ricoa-002', 1)
      await vocabRepo.review(u, 'card-ricoa-003', 4)
      const c2 = await vocabRepo.get(u, 'card-ricoa-002')
      await vocabRepo.desfazerRevisao(u, 'card-ricoa-002', {
        box: c2.box,
        dueAt: c2.dueAt,
        stability: null,
        difficulty: null,
        reps: 0,
        lapses: 0,
        lastReview: null,
      })
      await vocabRepo.remove(u, 'card-ricoa-003')
      const p = await iguais('rico-a')
      // O perfil conta a desfeita e as do cartão apagado; a Memória, não.
      expect(p.reviews).toBe(263)
      const vivas = await revisoesDeSempreDeAntes('rico-a')
      expect(vivas).toBeLessThan(263)
      expect((await resumo('rico-a')).revisoesDeSempre).toBe(vivas)
    })

    it('ofensiva longa (40 dias seguidos), com o dia do processo diferente do dia do usuário: mesmo número', async () => {
      const L = 'ofensiva-longa'
      await cartao(L, 'longa-1')
      for (let d = 0; d < 40; d++) {
        await db.insert(t.reviewLogs).values({
          id: `longa-rev-${d}`,
          createdAt: AGORA - d * DIA,
          updatedAt: AGORA - d * DIA,
          userId: L,
          cardId: 'longa-1',
          // Meia hora depois da meia-noite UTC: o dia do processo e o de São Paulo discordam.
          reviewedAt: Date.UTC(2026, 8, 20, 0, 30) - d * DIA,
          grade: 3,
        })
      }
      // Uma falha e mais revisões antes dela, que não podem entrar na ofensiva.
      await db.insert(t.reviewLogs).values({
        id: 'longa-antiga',
        createdAt: AGORA - 45 * DIA,
        updatedAt: AGORA - 45 * DIA,
        userId: L,
        cardId: 'longa-1',
        reviewedAt: AGORA - 45 * DIA,
        grade: 3,
      })
      const p = await iguais(L)
      expect(p.streakDays).toBe(40)
      expect(p.reviews).toBe(41)
    })

    it('quem não revisou hoje nem ontem: ofensiva zero nos dois caminhos', async () => {
      const P = 'parado'
      await cartao(P, 'parado-1')
      for (const d of [3, 4, 5, 30]) {
        await db.insert(t.reviewLogs).values({
          id: `parado-rev-${d}`,
          createdAt: AGORA - d * DIA,
          updatedAt: AGORA - d * DIA,
          userId: P,
          cardId: 'parado-1',
          reviewedAt: AGORA - d * DIA,
          grade: d === 4 ? 1 : 3,
        })
      }
      const p = await iguais(P)
      expect(p.streakDays).toBe(0)
      expect(p.reviews).toBe(4)
    })

    it('o fuso gravado muda: os dias são recontados no fuso novo e o perfil continua idêntico', async () => {
      const { estadoDaContaRepo } = await s.load('../../server/db/repositories/estadoDaConta')
      expect(await estadoDaContaRepo.gravarFuso(U('ofensiva-longa'), 'Asia/Tokyo', AGORA, 0)).toBe(true)
      await iguais('ofensiva-longa')
      expect((await agregadosRepo.estado(U('ofensiva-longa'))).fuso).toBe('Asia/Tokyo')
    })

    it('pela rota: o perfil e o resumo do dono respondem com os números do bruto', async () => {
      const perfil = (await (await s.get('/api/metrics/profile')).json()) as { reviews: number }
      expect(perfil.reviews).toBe(await numero('SELECT count(*) FROM review_logs WHERE user_id = ?', [DONO]))
      const r = (await (await s.get(`/api/vocab/resumo?inicioDoDia=${AGORA - 15 * 3_600_000}`)).json()) as {
        revisoesDeSempre: number
      }
      expect(r.revisoesDeSempre).toBe(await revisoesDeSempreDeAntes(DONO))
    })
  })

  describe('4. limpeza diária', () => {
    const X = 'limpeza-x'
    const Y = 'limpeza-y'
    const HA_40 = AGORA - 40 * DIA
    const HA_10 = AGORA - 10 * DIA
    let reviewsAntes = 0
    let diasAntes: number[] = []

    async function sessao(userId: string, id: string, deletedAt: number | null) {
      await db
        .insert(t.sessions)
        .values({ id, createdAt: HA_40 - DIA, updatedAt: HA_40, userId, deletedAt, title: id, kind: 'live' })
      for (let i = 0; i < 3; i++) {
        await db.insert(t.utterances).values({
          id: `${id}-fala-${i}`,
          createdAt: HA_40 - DIA,
          updatedAt: HA_40,
          userId,
          deletedAt,
          sessionId: id,
          idx: i,
          sourceText: 'texto',
        })
      }
    }
    async function revisao(userId: string, id: string, cardId: string, deletedAt: number | null, grade = 3) {
      await db.insert(t.reviewLogs).values({
        id,
        createdAt: AGORA - 45 * DIA,
        updatedAt: AGORA - 45 * DIA,
        userId,
        cardId,
        reviewedAt: AGORA - 45 * DIA,
        grade,
        deletedAt,
      })
    }
    async function ocorrencia(userId: string, id: string, cardId: string, deletedAt: number | null) {
      await db.insert(t.vocabOccurrences).values({
        id,
        createdAt: HA_40,
        updatedAt: HA_40,
        userId,
        deletedAt,
        cardId,
        occurredAt: HA_40,
        originKind: 'manual',
      })
    }

    beforeAll(async () => {
      for (const u of [X, Y]) {
        const p = u === X ? 'x' : 'y'
        // Sessões: apagada há 40 dias sem cartão (sai), apagada há 40 com cartão vivo (fica),
        // apagada há 10 (fica), viva (fica).
        await sessao(u, `${p}-ses-velha`, HA_40)
        await sessao(u, `${p}-ses-com-cartao`, HA_40)
        await sessao(u, `${p}-ses-recente`, HA_10)
        await sessao(u, `${p}-ses-viva`, null)
        // Cartões: apagado há 40 (sai, com tudo dele), apagado há 10 (fica), vivo (fica),
        // apagado há 40 mas ainda apontado por uma nota do Anki (fica).
        await cartao(u, `${p}-card-velho`, { deletedAt: HA_40, normKey: null, sessionId: `${p}-ses-viva` })
        await cartao(u, `${p}-card-recente`, { deletedAt: HA_10, normKey: null })
        await cartao(u, `${p}-card-vivo`, { sessionId: `${p}-ses-com-cartao` })
        await cartao(u, `${p}-card-do-anki`, { deletedAt: HA_40, normKey: null })
        await client.execute({
          sql: `INSERT INTO anki_decks (id, created_at, updated_at, user_id, nome, nome_no_arquivo, arquivo_origem, estado, idioma_origem, idioma_alvo)
                VALUES (?, ?, ?, ?, 'Baralho', 'Baralho', 'baralho.apkg', 'ativo', 'en', 'pt')`,
          args: [`${p}-deck`, HA_40, HA_40, u],
        })
        await client.execute({
          sql: `INSERT INTO anki_notes (id, created_at, updated_at, user_id, deck_id, guid, notetype, estrutura_hash, campos_brutos, frente, verso, exemplo, tags, estado, projected_card_id, import_id)
                VALUES (?, ?, ?, ?, ?, ?, 'Basic', 'a1b2c3d4e5f60718', '{}', 'frente', 'verso', '', '', 'ativa', ?, 'imp-1')`,
          args: [`${p}-nota`, HA_40, HA_40, u, `${p}-deck`, `${p}-guid`, `${p}-card-do-anki`],
        })
        // Dependentes do cartão velho: ocorrência, duas revisões (uma acerto) e um resultado de jogo.
        await ocorrencia(u, `${p}-occ-do-velho`, `${p}-card-velho`, HA_40)
        await revisao(u, `${p}-rev-do-velho-1`, `${p}-card-velho`, HA_40, 4)
        await revisao(u, `${p}-rev-do-velho-2`, `${p}-card-velho`, HA_40, 1)
        // No cartão vivo: revisão desfeita há 40 dias (sai), desfeita há 10 (fica), viva (fica);
        // ocorrência apagada há 40 (sai) e viva (fica).
        await revisao(u, `${p}-rev-desfeita-velha`, `${p}-card-vivo`, HA_40)
        await revisao(u, `${p}-rev-desfeita-recente`, `${p}-card-vivo`, HA_10)
        await revisao(u, `${p}-rev-viva`, `${p}-card-vivo`, null)
        await ocorrencia(u, `${p}-occ-velha`, `${p}-card-vivo`, HA_40)
        await ocorrencia(u, `${p}-occ-viva`, `${p}-card-vivo`, null)
        // Fala apagada há 40 dias numa sessão viva (sai) e resultado de jogo ligado ao cartão e à sessão que saem.
        await db.insert(t.utterances).values({
          id: `${p}-fala-solta`,
          createdAt: HA_40,
          updatedAt: HA_40,
          userId: u,
          deletedAt: HA_40,
          sessionId: `${p}-ses-viva`,
          idx: 9,
        })
        await db.insert(t.exerciseResults).values({
          id: `${p}-exe`,
          createdAt: HA_40,
          updatedAt: HA_40,
          userId: u,
          kind: 'srs',
          correct: 1,
          exerciseKind: 'memory',
          roundId: `${p}-rodada`,
          itemRef: 'palavra',
          cardId: `${p}-card-velho`,
          sessionId: `${p}-ses-velha`,
        })
      }
      const antes = await metricas.computeProfile(U(X))
      reviewsAntes = antes.reviews
      diasAntes = (await agregadosRepo.revisoesDoPerfil(U(X), 'America/Sao_Paulo')).dias
      expect(reviewsAntes).toBe(5)
    })

    const ids = async (tabela: string, userId: string) =>
      (await linhas(`SELECT id FROM ${tabela} WHERE user_id = ? ORDER BY id`, [userId])).map((l) => String(l.id))

    it('com o prazo de 30 dias: sai o que passou do prazo, com os dependentes; o resto fica', async () => {
      const { limparBanco } = await s.load('../../server/lib/limpezaDiaria')
      /* Só o usuário X tem linha velha o bastante neste ponto? Não: Y também. A passada pega os dois,
         e o caso seguinte confere Y contra o que se espera dele, linha a linha. */
      const r = await limparBanco({ agora: AGORA, dias: 30, checkpoint: false })
      expect(r.usuarios).toBeGreaterThanOrEqual(2)
      expect(r.otimizado).toBe(true)
      expect(r.checkpoint).toBeNull()

      expect(await ids('sessions', X)).toEqual(['x-ses-com-cartao', 'x-ses-recente', 'x-ses-viva'])
      // As falas da sessão que fica (por ter cartão) saem: estavam apagadas há 40 dias, e são o que pesa.
      expect(await ids('utterances', X)).toEqual([
        'x-ses-recente-fala-0',
        'x-ses-recente-fala-1',
        'x-ses-recente-fala-2',
        'x-ses-viva-fala-0',
        'x-ses-viva-fala-1',
        'x-ses-viva-fala-2',
      ])
      expect(await ids('vocab_cards', X)).toEqual(['x-card-do-anki', 'x-card-recente', 'x-card-vivo'])
      expect(await ids('vocab_occurrences', X)).toEqual(['x-occ-viva'])
      expect(await ids('review_logs', X)).toEqual(['x-rev-desfeita-recente', 'x-rev-viva'])
      // O resultado do jogo fica, sem apontar para o cartão nem para a sessão que saíram.
      expect(
        await linha('SELECT card_id, session_id, item_ref FROM exercise_results WHERE id = ?', ['x-exe']),
      ).toMatchObject({
        card_id: null,
        session_id: null,
        item_ref: 'palavra',
      })
      // Nenhuma chave estrangeira ficou apontando para o vazio.
      expect(await linhas('PRAGMA foreign_key_check')).toEqual([])
    })

    it('o outro usuário teve exatamente o mesmo tratamento, e nada dele saiu além do prazo', async () => {
      expect(await ids('sessions', Y)).toEqual(['y-ses-com-cartao', 'y-ses-recente', 'y-ses-viva'])
      expect(await ids('vocab_cards', Y)).toEqual(['y-card-do-anki', 'y-card-recente', 'y-card-vivo'])
      expect(await ids('review_logs', Y)).toEqual(['y-rev-desfeita-recente', 'y-rev-viva'])
      expect(await ids('vocab_occurrences', Y)).toEqual(['y-occ-viva'])
    })

    it('usuário sem nada vencido não é tocado (nem uma linha, nem os agregados)', async () => {
      const Z = 'limpeza-z'
      await cartao(Z, 'z-card', { deletedAt: HA_10, normKey: null })
      await revisao(Z, 'z-rev', 'z-card', HA_10)
      await agregadosRepo.reconstruir(U(Z))
      const estadoAntes = await agregadosRepo.estado(U(Z))
      const { limparBanco } = await s.load('../../server/lib/limpezaDiaria')
      const r = await limparBanco({ agora: AGORA, dias: 30, checkpoint: false })
      // X e Y já foram limpos na passada anterior: agora não há ninguém.
      expect(r).toMatchObject({ usuarios: 0, sessoes: 0, falas: 0, cartoes: 0, ocorrencias: 0, revisoes: 0 })
      expect(await ids('vocab_cards', Z)).toEqual(['z-card'])
      expect(await ids('review_logs', Z)).toEqual(['z-rev'])
      expect(await agregadosRepo.estado(U(Z))).toEqual(estadoAntes)
    })

    it('o perfil não perde revisão: as apagadas de vez continuam em reviews e nos dias de prática', async () => {
      const depois = await metricas.computeProfile(U(X))
      expect(depois.reviews).toBe(reviewsAntes)
      expect((await agregadosRepo.revisoesDoPerfil(U(X), 'America/Sao_Paulo')).dias).toEqual(diasAntes)
      const celulas = await agregadosRepo.celulas(U(X))
      const total = (k: string) => celulas.reduce((n: number, c: any) => n + c[k], 0)
      // Saíram três do bruto (as duas do cartão velho e a desfeita há 40 dias); duas ficaram.
      expect(total('revisoesPurgadas')).toBe(3)
      expect(total('revisoes')).toBe(2)
      expect(total('revisoesVivas')).toBe(1)
      // Recontar do bruto preserva as purgadas: é a única parte que o bruto não sabe mais dizer.
      await agregadosRepo.reconstruir(U(X))
      expect(await agregadosRepo.celulas(U(X))).toEqual(celulas)
      expect((await metricas.computeProfile(U(X))).reviews).toBe(reviewsAntes)
    })

    it('com prazo menor, o que tinha 10 dias também sai; o cartão do Anki e a sessão com cartão continuam', async () => {
      const { limparBanco } = await s.load('../../server/lib/limpezaDiaria')
      const r = await limparBanco({ agora: AGORA, dias: 5, checkpoint: true })
      expect(r.usuarios).toBeGreaterThanOrEqual(2)
      // Pedido o checkpoint: feito (ou ocupado), nunca "não pedido".
      expect(r.checkpoint).not.toBeNull()
      expect(await ids('sessions', X)).toEqual(['x-ses-com-cartao', 'x-ses-viva'])
      expect(await ids('vocab_cards', X)).toEqual(['x-card-do-anki', 'x-card-vivo'])
      expect(await ids('review_logs', X)).toEqual(['x-rev-viva'])
      expect(await linhas('PRAGMA foreign_key_check')).toEqual([])
      expect((await metricas.computeProfile(U(X))).reviews).toBe(reviewsAntes)
    })

    it('o prazo vem do ambiente, e valor inválido cai nos 30 dias', async () => {
      const { diasAteApagarDeVez, limpezaDiariaLigada, checkpointNaLimpeza } = await s.load('../../server/lib/config')
      expect(diasAteApagarDeVez({})).toBe(30)
      expect(diasAteApagarDeVez({ LIMPEZA_RETENCAO_DIAS: '45' })).toBe(45)
      for (const ruim of ['0', '-3', '2.5', 'abc']) expect(diasAteApagarDeVez({ LIMPEZA_RETENCAO_DIAS: ruim })).toBe(30)
      expect(limpezaDiariaLigada({})).toBe(false)
      expect(limpezaDiariaLigada({ LIMPEZA_DIARIA: '1' })).toBe(true)
      expect(limpezaDiariaLigada({ LIMPEZA_DIARIA: '1', NODE_ENV: 'test' })).toBe(false)
      expect(checkpointNaLimpeza({})).toBe(false)
      expect(checkpointNaLimpeza({ LIMPEZA_CHECKPOINT: '1' })).toBe(true)
    })
  })
})
