import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { vocabCards, vocabOccurrences, reviewLogs, sessions } from '../schema'
import { makeFsrs5, type Grade, type SchedulingState } from '../../../src/core/learning/scheduler'
import { nivelCefr } from '../../../src/core/learning/cefrWordlist'
import { avaliarCartao, type MotivoDescarte } from '../../../src/core/learning/quality'
import { calcularDificuldade, faixaDe, cortesDoDeck, type CortesDeFaixa, type FaixaDificuldade } from '../../../src/core/learning/dificuldade'
import { exerciseResultsRepo } from './exerciseResults'
import type { UserId } from '../../lib/authContext'

// FSRS-5 lift do desktop (núcleo isomórfico) — o agendamento roda no servidor.
const fsrs = makeFsrs5()

/**
 * Mistura 50% médio / 25% fácil / 25% difícil, completando com o que houver.
 * Um recorte que só tem 2 difíceis não pode devolver 2 itens numa rodada de 8 — completa e a UI
 * declara que completou (ver spec da F6).
 */
function balancear<T extends { difficultyScore: number | null }>(cartoes: T[], limite: number, cortes?: CortesDeFaixa): T[] {
  const faixa = (c: T) => (c.difficultyScore == null ? 'medio' : faixaDe(c.difficultyScore, cortes))
  const por = { facil: [] as T[], medio: [] as T[], dificil: [] as T[] }
  for (const c of cartoes) por[faixa(c) as 'facil' | 'medio' | 'dificil'].push(c)
  const alvo = { medio: Math.round(limite * 0.5), facil: Math.round(limite * 0.25), dificil: limite - Math.round(limite * 0.5) - Math.round(limite * 0.25) }
  const out: T[] = []
  for (const k of ['medio', 'facil', 'dificil'] as const) out.push(...por[k].slice(0, alvo[k]))
  if (out.length < limite) {
    const usados = new Set(out)
    for (const c of cartoes) { if (out.length >= limite) break; if (!usados.has(c)) out.push(c) }
  }
  return out.slice(0, limite)
}

export type VocabCard = typeof vocabCards.$inferSelect

/** Um cartão recusado na entrada, com o motivo — a tela mostra, não engole. */
export interface SkippedCard {
  word: string
  motivo: MotivoDescarte
}

/** O contrato declarado em `core/learning/contract.ts` e finalmente implementado. */
export interface BulkAddResult {
  /** Cartões NOVOS criados nesta chamada. */
  cards: VocabCard[]
  skipped: SkippedCard[]
  /** Palavras que já existiam e tiveram a ocorrência CONTADA em vez de descartada. */
  repetidas: string[]
}

/** Chave de deduplicação: palavra sem acento/caixa + idioma base. */
function chaveDedup(word: string, srcLang: string | null | undefined): string {
  const palavra = (word ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
  const lang = (srcLang ?? '').toLowerCase().split('-')[0]
  return `${lang}|${palavra}`
}

export interface NewVocabCard {
  word: string
  back?: string
  sentence?: string
  srcLang?: string
  tgtLang?: string
  clozePrompt?: string
  clozeAnswer?: string
  sessionId?: string
  /** Nível CEFR já conhecido (lista curada). Quando ausente, o servidor estima. */
  cefrLevel?: string
  cefrConfidence?: number
}

/** Extrai o SchedulingState (contrato do FSRS) de uma linha de card.
 *  Exportado para server/db/manutencao.ts (migração de boot) reutilizar. */
export function toState(card: VocabCard): SchedulingState {
  return {
    box: card.box ?? 1,
    dueAt: card.dueAt ?? Date.now(),
    stability: card.stability ?? undefined,
    difficulty: card.difficulty ?? undefined,
    reps: card.reps ?? undefined,
    lapses: card.lapses ?? undefined,
    lastReview: card.lastReview ?? undefined,
  }
}

// Marco 1: userId obrigatório (branded) em TODA função deste repositório, sem exceção.
// P3-1: a migração de boot (que atravessa tenants) mudou para server/db/manutencao.ts.
export const vocabRepo = {
  /**
   * O baralho, com a marca de PROCEDÊNCIA que faltava.
   *
   * `vocab_cards.session_id` é NULL para cartão vindo da trilha — `bulkAdd` sanea o id
   * (`dosDono.has(...)`) e `trilha:en` não é sessão do dono. A origem sobrevive só em
   * `vocab_occurrences.origin_kind`, e o comentário de `origemDe()` acima registra que essa metade
   * foi consertada. A OUTRA metade não: o cliente ainda filtrava por `sourceSessionId ===
   * 'trilha:<lang>'`, comparação que NUNCA casa. Efeito: a fonte "trilha" nunca via as palavras
   * que a pessoa já errou, `nivelSugerido` devolvia A1 para sempre e o painel da trilha
   * anunciava 0%.
   *
   * DUAS CONSULTAS, e não uma subconsulta correlacionada: `idx_occ_origem` cobre
   * `(user_id, origin_kind)`, então a segunda é um lookup indexado único, em vez de um EXISTS por
   * linha sobre um baralho de milhares. `list()` roda depois de cada rodada — o custo importa.
   */
  async list(userId: UserId): Promise<Array<VocabCard & { daTrilha: boolean }>> {
    const [cartoes, daTrilha] = await Promise.all([
      db.select().from(vocabCards)
        .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)))
        .orderBy(desc(vocabCards.addedAt)),
      db.selectDistinct({ cardId: vocabOccurrences.cardId }).from(vocabOccurrences)
        .where(and(
          eq(vocabOccurrences.userId, userId),
          isNull(vocabOccurrences.deletedAt),
          eq(vocabOccurrences.originKind, 'trilha'),
        )),
    ])
    const daTrilhaIds = new Set(daTrilha.map((r) => r.cardId))
    return cartoes.map((c) => ({ ...c, daTrilha: daTrilhaIds.has(c.id) }))
  },

  async get(userId: UserId, id: string): Promise<VocabCard | undefined> {
    const rows = await db
      .select()
      .from(vocabCards)
      // P2-9: sem `isNull(deletedAt)`, `review` e `patch` operavam em cartão já removido —
      // o usuário apagava e continuava sendo cobrado dele no agendamento.
      .where(and(eq(vocabCards.id, id), eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)))
      .limit(1)
    return rows[0]
  },

  /**
   * ENTRADA DE CARTÕES — com régua e sem duplicata.
   *
   * A DEDUPLICAÇÃO É POR (palavra, idioma) e agora também POR USUÁRIO: A e B podem ter a mesma
   * palavra no baralho de cada um. Comparação sem acento e sem caixa.
   *
   * O QUE É PULADO VOLTA NA RESPOSTA, com o motivo. A tela precisa poder dizer "salvei 4, pulei 2".
   */
  async bulkAdd(userId: UserId, cards: NewVocabCard[]): Promise<BulkAddResult> {
    if (!cards.length) return { cards: [], skipped: [], repetidas: [] }
    const now = Date.now()
    const skipped: SkippedCard[] = []

    /* A DEDUP SAIU DO JS E FOI PARA O BANCO.
       Antes: `SELECT` do baralho INTEIRO deste usuário a cada chamada (mesmo para 1 palavra),
       dedup num Set, e `INSERT`. A janela entre o SELECT e o INSERT era a corrida — e ela já
       tinha produzido 214 duplicatas no banco real. Agora quem garante unicidade é o índice
       `uq_vocab_user_norm`, e o upsert transforma repetição em CONTAGEM. */
    const aceitos: NewVocabCard[] = []
    const vistasNoLote = new Set<string>()
    for (const c of cards) {
      const v = avaliarCartao(
        { word: c.word, translation: c.back ?? '', sentence: c.sentence ?? '', srcLang: c.srcLang } as never,
      )
      if (!v.serve) { skipped.push({ word: c.word, motivo: v.motivo! }); continue }
      // Colapsa repetição DENTRO do mesmo lote: 3 vezes no mesmo payload = 3 ocorrências, 1 upsert.
      const chave = chaveDedup(c.word, c.srcLang ?? null)
      if (vistasNoLote.has(chave)) { aceitos.push(c); continue }
      vistasNoLote.add(chave)
      aceitos.push(c)
    }
    if (!aceitos.length) return { cards: [], skipped, repetidas: [] }

    // P2-N1: `sessionId` vem do CLIENTE e era gravado sem conferir o dono — mesmo defeito
    // do P2-8, que fora corrigido só em `exerciseResults`. Sessão que não é do usuário (ou
    // que não existe) vira `null`; o cartão continua valendo.
    const idsPedidos = [...new Set(aceitos.map((c) => c.sessionId).filter((x): x is string => !!x))]
    const dosDono = new Set<string>()
    if (idsPedidos.length) {
      for (const row of await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), inArray(sessions.id, idsPedidos)))) {
        dosDono.add(row.id)
      }
    }

    /* ORIGEM da ocorrência. `trilha:en` era enviado pelo cliente e virava NULL aqui, porque o
       código só aceitava id de sessão existente — e o filtro que depois procurava 'trilha:en'
       nunca casava. Agora a origem é decomposta em (tipo, referência) e sobrevive. */
    const origemDe = (c: NewVocabCard): { kind: string; ref: string | null } => {
      const s = c.sessionId
      if (!s) return { kind: 'manual', ref: null }
      if (s.startsWith('trilha:')) return { kind: 'trilha', ref: s.slice('trilha:'.length) }
      return dosDono.has(s) ? { kind: 'sessao', ref: s } : { kind: 'manual', ref: null }
    }

    const rows: (typeof vocabCards.$inferInsert)[] = aceitos.map((c) => {
      /* Nível CEFR: curado (se veio na carga) > wordlist real (CEFR-J/Octanove) > AUSENTE.
         Nunca estimado: o antigo `estimateCefr` decidia por comprimento de palavra e produzia
         2.087 de 2.126 cartões com confiança < 0,5, com a escala invertida. Palavra fora da
         wordlist agora fica com nível `null` e confiança 0 — "não sei" em vez de um chute que
         a UI e o modelo de dificuldade tratariam como dado. Ver src/core/learning/cefrWordlist.ts */
      const cefr = nivelCefr(c.word, c.srcLang ?? 'en', { curado: c.cefrLevel ?? null })
      return {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        userId,
        word: c.word,
        back: c.back ?? null,
        sentence: c.sentence ?? null,
        srcLang: c.srcLang ?? null,
        tgtLang: c.tgtLang ?? null,
        clozePrompt: c.clozePrompt ?? null,
        clozeAnswer: c.clozeAnswer ?? null,
        sessionId: c.sessionId && dosDono.has(c.sessionId) ? c.sessionId : null,
        cefrLevel: cefr.level,
        cefrConfidence: cefr.confidence,
        cefrSource: cefr.source,
        box: 1,
        dueAt: now, // carta nova vence agora
        inDeck: 1,
        addedAt: now,
        normKey: chaveDedup(c.word, c.srcLang ?? null),
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      }
    })

    /* UPSERT: palavra nova entra; palavra repetida INCREMENTA `occurrences` e move `last_seen_at`.
       `occurrences + 1` acontece no banco, não em read-modify-write no JS — é o que torna duas
       gravações simultâneas somarem em vez de uma sobrescrever a outra. */
    const repetidas: string[] = []
    for (const row of rows) {
      await db.insert(vocabCards).values(row).onConflictDoUpdate({
        target: [vocabCards.userId, vocabCards.normKey],
        /* O índice é PARCIAL (`where deleted_at is null`), e o SQLite exige que o alvo do
           ON CONFLICT repita o mesmo predicado — sem isto ele não reconhece o índice e responde
           SQLITE_ERROR. Não é detalhe de estilo: é o que faz o upsert existir. */
        targetWhere: sql`${vocabCards.deletedAt} IS NULL`,
        set: {
          occurrences: sql`${vocabCards.occurrences} + 1`,
          lastSeenAt: now,
          updatedAt: now,
          // Preenche buracos sem sobrescrever o que já é bom: tradução e frase só entram se faltarem.
          back: sql`COALESCE(NULLIF(${vocabCards.back}, ''), ${row.back ?? null})`,
          sentence: sql`COALESCE(NULLIF(${vocabCards.sentence}, ''), ${row.sentence ?? null})`,
        },
        setWhere: sql`${vocabCards.deletedAt} IS NULL`,
      })
    }

    // Releitura pela CHAVE, não pelo id gerado: num conflito, o id que vale é o do cartão que já existia.
    const chaves = rows.map((r) => r.normKey!)
    const finais = await db.select().from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt), inArray(vocabCards.normKey, chaves)))
    const porChave = new Map(finais.map((c) => [c.normKey!, c]))

    // UMA ocorrência por item aceito — inclusive as repetidas dentro do mesmo lote.
    const ocorrencias = aceitos.flatMap((c) => {
      const card = porChave.get(chaveDedup(c.word, c.srcLang ?? null))
      if (!card) return []
      const o = origemDe(c)
      return [{
        id: randomUUID(), createdAt: now, updatedAt: now, userId, cardId: card.id, occurredAt: now,
        originKind: o.kind, originRef: o.ref, sentence: c.sentence ?? null, utteranceId: null,
      }]
    })
    if (ocorrencias.length) await db.insert(vocabOccurrences).values(ocorrencias)

    const novos = finais.filter((c) => c.occurrences === 1 && c.addedAt === now)
    for (const c of finais) if (!novos.includes(c)) repetidas.push(c.word)
    return { cards: novos, skipped, repetidas }
  },

  /**
   * Listagem PAGINADA por cursor, com busca, filtros e ordenação resolvidos no SERVIDOR.
   *
   * `list()` devolve o baralho inteiro e é chamado a cada fim de rodada (`Play.tsx:787`). Com
   * 2.116 cartões isso é 45,3 ms de full scan por chamada, e a tela não tem como filtrar sem
   * baixar tudo. Aqui o índice trabalha: `idx_vocab_user_added`, `_occ`, `_cefr`, `_dificuldade`.
   *
   * Cursor composto `(chave, id)` em vez de OFFSET: com OFFSET, inserir uma palavra durante a
   * rolagem faz um item repetir na página seguinte.
   */
  async listarPagina(userId: UserId, opts: {
    limite?: number
    cursor?: { valor: number | string | null; id: string } | null
    busca?: string
    niveis?: string[]
    origens?: string[]
    desde?: number
    ate?: number
    ordem?: 'recentes' | 'frequentes' | 'dificuldade' | 'alfabetica'
  } = {}): Promise<{ itens: VocabCard[]; proximoCursor: { valor: number | string | null; id: string } | null; total: number }> {
    const limite = Math.min(Math.max(opts.limite ?? 200, 1), 500)
    const ordem = opts.ordem ?? 'recentes'
    const cond = [eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)]

    if (opts.busca?.trim()) {
      // Busca em palavra E tradução: procurar "alavanc" tem de achar tanto "leverage" quanto o verso.
      const q = `%${opts.busca.trim().toLowerCase()}%`
      cond.push(sql`(lower(${vocabCards.word}) LIKE ${q} OR lower(COALESCE(${vocabCards.back},'')) LIKE ${q})`)
    }
    if (opts.niveis?.length) {
      // 'ausente' é um filtro legítimo: "o que eu tenho sem nível" é uma pergunta real.
      const reais = opts.niveis.filter((n) => n !== 'ausente')
      const querAusente = opts.niveis.includes('ausente')
      if (reais.length && querAusente) cond.push(sql`(${vocabCards.cefrLevel} IN ${reais} OR ${vocabCards.cefrLevel} IS NULL)`)
      else if (querAusente) cond.push(isNull(vocabCards.cefrLevel))
      else cond.push(inArray(vocabCards.cefrLevel, reais))
    }
    if (opts.desde) cond.push(sql`${vocabCards.lastSeenAt} >= ${opts.desde}`)
    if (opts.ate) cond.push(sql`${vocabCards.lastSeenAt} <= ${opts.ate}`)
    if (opts.origens?.length) {
      cond.push(sql`EXISTS (SELECT 1 FROM ${vocabOccurrences} o
        WHERE o.card_id = ${vocabCards.id} AND o.origin_kind IN ${opts.origens})`)
    }

    const colunaDe = {
      recentes: vocabCards.addedAt,
      frequentes: vocabCards.occurrences,
      dificuldade: vocabCards.difficultyScore,
      alfabetica: vocabCards.word,
    } as const
    const coluna = colunaDe[ordem]

    if (opts.cursor) {
      const { valor, id } = opts.cursor
      cond.push(ordem === 'alfabetica'
        ? sql`(${coluna} > ${valor} OR (${coluna} = ${valor} AND ${vocabCards.id} > ${id}))`
        : sql`(${coluna} < ${valor} OR (${coluna} IS ${valor} AND ${vocabCards.id} > ${id}))`)
    }

    const where = and(...cond)
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(vocabCards).where(where)
    const itens = await db.select().from(vocabCards).where(where)
      .orderBy(ordem === 'alfabetica' ? coluna : desc(coluna), vocabCards.id)
      .limit(limite + 1)

    const temMais = itens.length > limite
    const pagina = temMais ? itens.slice(0, limite) : itens
    const ultimo = pagina[pagina.length - 1]
    /* O cursor carrega o valor da MESMA coluna que ordena — senão a página seguinte parte de um
       ponto que a ordenação não conhece e itens somem no meio. */
    const valorDoCursor = (c: VocabCard): number | string | null =>
      ordem === 'recentes' ? c.addedAt
        : ordem === 'frequentes' ? c.occurrences
          : ordem === 'dificuldade' ? c.difficultyScore
            : c.word
    return {
      itens: pagina,
      total: Number(n),
      proximoCursor: temMais && ultimo ? { valor: valorDoCursor(ultimo), id: ultimo.id } : null,
    }
  },

  /**
   * Recalcula e MATERIALIZA a dificuldade. Nunca no caminho de leitura da tela.
   *
   * Preguiçoso por desenho: roda quando chega ocorrência nova, quando chega resultado de
   * exercício, ou quando `difficulty_at` passa de 7 dias. Calcular na leitura faria a tela de
   * vocabulário pagar 2.000 cálculos por pageview.
   */
  async recalcularDificuldade(userId: UserId, cardIds?: string[]): Promise<number> {
    const agora = Date.now()
    const cond = [eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)]
    if (cardIds?.length) cond.push(inArray(vocabCards.id, cardIds))
    else cond.push(sql`(${vocabCards.difficultyAt} IS NULL OR ${vocabCards.difficultyAt} < ${agora - 7 * 86_400_000})`)

    const cartoes = await db.select().from(vocabCards).where(and(...cond))
    if (!cartoes.length) return 0

    const desempenho = await exerciseResultsRepo.desempenhoPorCartao(userId, cartoes.map((c) => c.id))

    const stmts = cartoes.map((c) => {
      const d = calcularDificuldade({
        word: c.word,
        cefrLevel: c.cefrLevel,
        cefrSource: (c.cefrSource as 'curado' | 'wordlist' | 'ausente') ?? 'ausente',
        occurrences: c.occurrences ?? 1,
        lastSeenAt: c.lastSeenAt ?? c.addedAt,
        reps: c.reps ?? 0,
        lapses: c.lapses ?? 0,
        stability: c.stability,
        lastReview: c.lastReview,
        acertos: desempenho[c.id]?.acertos ?? 0,
        tentativas: desempenho[c.id]?.tentativas ?? 0,
        agora,
      })
      return {
        sql: 'UPDATE vocab_cards SET difficulty_score = ?, difficulty_at = ?, updated_at = ? WHERE id = ?',
        args: [d.score, agora, agora, c.id],
      }
    })
    for (let i = 0; i < stmts.length; i += 200) await db.$client.batch(stmts.slice(i, i + 200), 'write')
    return cartoes.length
  },

  /**
   * Cortes de faixa DESTE usuário (Z3), calculados dos scores materializados.
   *
   * Uma consulta sobre `idx_vocab_user_dificuldade` — a coluna é indexada justamente para isto.
   * Os cortes são relativos ao deck porque, medido, o score é concentrado (78% entre 0,55 e 0,70)
   * e cortes fixos jogam 77,8% numa faixa só. As guardas de `cortesDoDeck` impedem que um deck
   * pequeno ou homogêneo finja separação.
   */
  async cortesDeFaixa(userId: UserId): Promise<CortesDeFaixa> {
    const linhas = await db.select({ s: vocabCards.difficultyScore }).from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt), sql`${vocabCards.difficultyScore} IS NOT NULL`))
    return cortesDoDeck(linhas.map((l) => Number(l.s)))
  },

  /**
   * Distribuição por faixa — INSTRUMENTAÇÃO (Z3).
   *
   * O drift precisa ser observável: se uma faixa voltar a engolir o deck conforme os dados
   * acumulam, isso tem de aparecer num número, não numa reclamação de usuário.
   */
  async distribuicaoDeDificuldade(userId: UserId) {
    const cortes = await this.cortesDeFaixa(userId)
    const linhas = await db.select({ s: vocabCards.difficultyScore }).from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt), sql`${vocabCards.difficultyScore} IS NOT NULL`))
    const conta = { facil: 0, medio: 0, dificil: 0 }
    for (const l of linhas) conta[faixaDe(Number(l.s), cortes)] += 1
    const n = linhas.length || 1
    const pct = (x: number) => +((x / n) * 100).toFixed(1)
    return {
      cortes,
      total: linhas.length,
      faixas: conta,
      pct: { facil: pct(conta.facil), medio: pct(conta.medio), dificil: pct(conta.dificil) },
      maiorFaixaPct: pct(Math.max(...Object.values(conta))),
    }
  },

  /**
   * SELEÇÃO PARA JOGO — no servidor, onde os índices trabalham.
   *
   * `cartoesDaFonte` filtrava no cliente sobre o baralho inteiro, que `fetchDeck()` rebaixava a
   * cada fim de rodada. Cada item volta com PROVENIÊNCIA: de onde veio, que nível tem e de que
   * procedência, e por que foi escolhido. "Por que esta palavra apareceu?" passa a ter resposta.
   */
  async selecionarParaJogo(userId: UserId, opts: {
    fonte?: 'baralho' | 'sessao' | 'trilha'
    fonteRef?: string | null
    dificuldade?: FaixaDificuldade[]
    estrategia?: 'equilibrado' | 'recentes' | 'frequentes' | 'em-dificuldade'
    limite?: number
    evitar?: string[]
    /** Base ISO-639-1 ('en', 'pt'). Vazio/ausente = sem filtro, o comportamento antigo. */
    lang?: string | null
  } = {}) {
    const limite = Math.min(Math.max(opts.limite ?? 20, 1), 200)
    const estrategia = opts.estrategia ?? 'equilibrado'
    const cortes = await this.cortesDeFaixa(userId)
    const cond = [eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt), eq(vocabCards.inDeck, 1)]

    /**
     * O FILTRO DE IDIOMA, que faltava — e a falta custava a rodada inteira.
     *
     * Sem ele, a seleção gastava os 200 slots com cartões de qualquer idioma, ordenados por
     * vencimento; e como `bulkAdd` grava todo cartão novo com `dueAt = now`, os primeiros da fila
     * eram justamente as capturas antigas nunca revisadas — as que têm frase e não têm tradução.
     * Medido no baralho real: praticando português, dos 200 servidos só 5 tinham tradução, embora
     * o baralho tivesse 323 palavras portuguesas jogáveis.
     *
     * `SUBSTR(...,1,2)` é a normalização de `baseLangDe` ('en-US' → 'en') escrita em SQL. As duas
     * PRECISAM concordar: se divergirem, o servidor manda um conjunto que o cliente descarta, e
     * voltamos ao mesmo lugar por outro caminho. É o que o teste de idioma trava.
     */
    const lang = (opts.lang ?? '').toLowerCase().split('-')[0].trim()
    if (lang) {
      cond.push(sql`LOWER(SUBSTR(COALESCE(${vocabCards.srcLang}, ''), 1, 2)) = ${lang}`)
    }

    if (opts.fonte === 'sessao' && opts.fonteRef) {
      cond.push(sql`EXISTS (SELECT 1 FROM ${vocabOccurrences} o WHERE o.card_id = ${vocabCards.id}
        AND o.origin_kind = 'sessao' AND o.origin_ref = ${opts.fonteRef})`)
    } else if (opts.fonte === 'trilha') {
      cond.push(sql`EXISTS (SELECT 1 FROM ${vocabOccurrences} o WHERE o.card_id = ${vocabCards.id}
        AND o.origin_kind = 'trilha'${opts.fonteRef ? sql` AND o.origin_ref = ${opts.fonteRef}` : sql``})`)
    } else {
      /* "Minhas gravações" EXCLUI a trilha — o mesmo `!daTrilha` que `cartoesDaFonte` aplica no
         cliente. Sem esta linha o servidor priorizaria palavras da trilha que o cliente descarta
         logo em seguida, gastando slots da rodada com material que nunca chega aos jogos. As duas
         pontas têm de concordar sobre o que é "gravações", senão o recorte fica torto de novo. */
      cond.push(sql`NOT EXISTS (SELECT 1 FROM ${vocabOccurrences} o WHERE o.card_id = ${vocabCards.id}
        AND o.origin_kind = 'trilha')`)
    }
    if (opts.evitar?.length) cond.push(sql`${vocabCards.id} NOT IN ${opts.evitar}`)
    if (opts.dificuldade?.length) {
      const faixas = opts.dificuldade.map((f) =>
        f === 'facil' ? sql`${vocabCards.difficultyScore} < ${cortes.corte1}`
          : f === 'medio' ? sql`(${vocabCards.difficultyScore} >= ${cortes.corte1} AND ${vocabCards.difficultyScore} < ${cortes.corte2})`
            : sql`${vocabCards.difficultyScore} >= ${cortes.corte2}`)
      cond.push(sql`(${sql.join(faixas, sql` OR `)})`)
    }

    const ordem = estrategia === 'recentes' ? desc(vocabCards.lastSeenAt)
      : estrategia === 'frequentes' ? desc(vocabCards.occurrences)
        : estrategia === 'em-dificuldade' ? desc(vocabCards.difficultyScore)
          // Equilibrado mantém a prioridade do FSRS: vencido primeiro, como desempate.
          : sql`${vocabCards.dueAt} ASC`

    const cartoes = await db.select().from(vocabCards).where(and(...cond)).orderBy(ordem).limit(limite * 3)

    // Mistura 50/25/25 só na estratégia equilibrada; nas outras a ordem já é o critério.
    const escolhidos = estrategia === 'equilibrado' ? balancear(cartoes, limite, cortes) : cartoes.slice(0, limite)

    return {
      total: cartoes.length,
      /** Os cortes usados viajam com a resposta — a UI precisa poder explicar a faixa. */
      cortes,
      itens: escolhidos.map((c) => ({
        cardId: c.id, word: c.word, back: c.back, sentence: c.sentence, srcLang: c.srcLang, tgtLang: c.tgtLang,
        clozePrompt: c.clozePrompt, clozeAnswer: c.clozeAnswer, dueAt: c.dueAt, box: c.box,
        proveniencia: {
          origem: opts.fonte ?? 'baralho',
          origemRef: opts.fonteRef ?? null,
          nivel: c.cefrLevel,
          nivelFonte: c.cefrSource ?? 'ausente',
          dificuldade: c.difficultyScore,
          faixa: c.difficultyScore == null ? null : faixaDe(c.difficultyScore, cortes),
          ocorrencias: c.occurrences,
          porQueSelecionado: (c.dueAt ?? Infinity) <= Date.now() ? 'vencido' : `estrategia:${estrategia}`,
        },
      })),
    }
  },

  /**
   * Quando a contagem de ocorrências passou a ser REAL, e quanto do acervo é anterior a isso.
   *
   * A migração da F2b não teve histórico para reconstruir: cada cartão nasceu com uma ocorrência
   * `legado`. A tela precisa dizer isso — um "1×" que na verdade significa "não medido" é um
   * número falso apresentado como dado (Ajuste 4).
   */
  async inicioDaContagem(userId: UserId): Promise<{ inicioEm: number | null; totalLegado: number; total: number }> {
    const [{ inicio }] = await db.select({ inicio: sql<number | null>`min(${vocabOccurrences.occurredAt})` })
      .from(vocabOccurrences)
      .where(and(eq(vocabOccurrences.userId, userId), isNull(vocabOccurrences.deletedAt),
        sql`${vocabOccurrences.originKind} <> 'legado'`))
    const [{ n: total }] = await db.select({ n: sql<number>`count(*)` }).from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)))
    const [{ n: legado }] = await db.select({ n: sql<number>`count(*)` }).from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt),
        sql`NOT EXISTS (SELECT 1 FROM ${vocabOccurrences} o WHERE o.card_id = ${vocabCards.id} AND o.origin_kind <> 'legado')`))
    return { inicioEm: inicio ?? null, totalLegado: Number(legado), total: Number(total) }
  },

  /** Ocorrências de um cartão — a linha do tempo que a tela de detalhe (F5) mostra. */
  async ocorrencias(userId: UserId, cardId: string) {
    return db.select().from(vocabOccurrences)
      .where(and(eq(vocabOccurrences.userId, userId), isNull(vocabOccurrences.deletedAt),
        eq(vocabOccurrences.cardId, cardId)))
      .orderBy(desc(vocabOccurrences.occurredAt))
  },

  /** Aplica uma revisão FSRS-5, persiste o novo estado e grava um review_log. */
  async review(userId: UserId, id: string, grade: Grade): Promise<VocabCard> {
    const card = await this.get(userId, id)
    if (!card) throw new Error('card não encontrado')
    const now = Date.now()
    const prev = toState(card)
    const next = fsrs.review(prev, grade, now)

    await db
      .update(vocabCards)
      .set({
        box: next.box,
        dueAt: next.dueAt,
        stability: next.stability ?? null,
        difficulty: next.difficulty ?? null,
        reps: next.reps ?? null,
        lapses: next.lapses ?? null,
        lastReview: next.lastReview ?? null,
        updatedAt: now,
      })
      .where(and(eq(vocabCards.id, id), eq(vocabCards.userId, userId)))

    await db.insert(reviewLogs).values({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      cardId: id,
      reviewedAt: now,
      grade,
      prevStability: prev.stability ?? null,
      newStability: next.stability ?? null,
      prevDue: prev.dueAt,
      newDue: next.dueAt,
      elapsedDays: prev.lastReview ? (now - prev.lastReview) / 86_400_000 : 0,
    })

    const updated = await this.get(userId, id)
    if (!updated) throw new Error('falha ao reler card')
    return updated
  },

  /**
   * Reetiqueta o idioma de cartões já existentes (Auditoria de idioma). Só toca `srcLang`/`tgtLang`.
   * O `AND user_id` impede reetiquetar cartão de outro usuário.
   */
  async relabel(userId: UserId, items: Array<{ id: string; srcLang: string; tgtLang: string }>): Promise<number> {
    if (!items.length) return 0
    const now = Date.now()
    let changed = 0
    for (const it of items) {
      if (!it?.id || !it.srcLang || !it.tgtLang) continue
      const res = await db
        .update(vocabCards)
        .set({ srcLang: it.srcLang, tgtLang: it.tgtLang, updatedAt: now })
        .where(and(eq(vocabCards.id, it.id), eq(vocabCards.userId, userId)))
      changed += Number((res as { rowsAffected?: number }).rowsAffected ?? 0)
    }
    return changed
  },

  /**
   * Edição pontual de um cartão, vinda da CURADORIA. Só toca tradução e presença no baralho —
   * não encosta no agendamento FSRS. Arquivar (`inDeck: false`) tira das rodadas SEM apagar.
   */
  async patch(userId: UserId, id: string, patch: { back?: string; inDeck?: boolean }): Promise<VocabCard | undefined> {
    const set: Record<string, unknown> = { updatedAt: Date.now() }
    if (typeof patch.back === 'string') set.back = patch.back.trim() || null
    if (typeof patch.inDeck === 'boolean') set.inDeck = patch.inDeck ? 1 : 0
    await db.update(vocabCards).set(set).where(and(eq(vocabCards.id, id), eq(vocabCards.userId, userId)))
    return this.get(userId, id)
  },

  /**
   * P2-N4: devolve se afetou linha — a rota vira 404 quando o cartão não é do usuário.
   *
   * F3-04: o soft delete PROPAGA para as ocorrências e os review_logs. Antes eles ficavam vivos
   * sob um pai invisível — 4 review_logs neste banco — e toda leitura que filtra só por
   * `deleted_at IS NULL` continuava contando revisões de um cartão que o usuário apagou.
   */
  async remove(userId: UserId, id: string): Promise<boolean> {
    const now = Date.now()
    const alvo = await db.select({ id: vocabCards.id }).from(vocabCards)
      .where(and(eq(vocabCards.id, id), eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt)))
      .limit(1)
    if (!alvo.length) return false
    await db.batch([
      db.update(vocabCards).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(vocabCards.id, id), eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt))),
      db.update(vocabOccurrences).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(vocabOccurrences.cardId, id), eq(vocabOccurrences.userId, userId), isNull(vocabOccurrences.deletedAt))),
      db.update(reviewLogs).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(reviewLogs.cardId, id), eq(reviewLogs.userId, userId), isNull(reviewLogs.deletedAt))),
    ])
    return true
  },
}
