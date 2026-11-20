/**
 * O ÍNDICE DAS PALAVRAS VISTAS (etiquetas de palavras; tabela `palavras_vistas`, migração PG 0012).
 *
 * Quem escreve nas falas chama as instruções daqui DENTRO DO MESMO LOTE (`rodarLote`): criar a sessão com
 * falas, retomar a captura, o lote da captura longa, a edição de uma fala, a remoção da sessão. O índice
 * nunca diverge das falas por uma escrita que caiu no meio. A leitura do que sai vai DENTRO da transação,
 * depois de `travarUsuario`: dois lotes iguais ao mesmo tempo se enfileiram em vez de contar a mesma fala
 * duas vezes. `versoes_de_dados.palavras` sobe só quando o conjunto de chaves pode ter mudado — é a versão
 * do ETag de `GET /api/vocab/vistas`.
 *
 * Duas formas de escrever:
 *   · AJUSTAR: a diferença entre as falas que saem e as que entram (`diferencaDeChaves`), em 1 upsert
 *     multi-VALUES por fatia (`vezes = vezes + delta`) e, só se alguma chave perdeu ocorrência, 1 DELETE das
 *     linhas que zeraram. O lote da captura longa custa isso, não uma releitura da sessão inteira;
 *   · RECONSTRUIR: apaga as linhas da sessão e insere a contagem inteira. É o que retomar a captura, a troca
 *     de idioma e o `palavras reindexar` fazem — idempotente por construção.
 *
 * A regra de corte do texto (tokens, chave, o que fica de fora) é `src/core/texto/palavrasVistas.ts`.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { type EstadoDoCartao, estadoDoCartao, fsrsStateDaLinha } from '../../../src/core/learning/estadoDoCartao'
import { chaveDaPalavra, chaveDedup } from '../../../src/core/texto/palavra'
import { type ContagemDeChave, contarChaves, fraseComAChave, idiomaBase } from '../../../src/core/texto/palavrasVistas'
import type { UserId } from '../../lib/authContext'
import { db, type ExecutorDb, linhas as linhasDe, travarUsuario } from '../db'
import { emLotes, inserirEmLotes, type InstrucaoDeBatch, rodarLote, tamanhoDoLoteDeInsert } from '../lotes'
import { palavrasVistas, reviewLogs, sessions, utterances, vocabCards } from '../schema'
import { agregadosRepo } from './agregados'

/** Teto de chaves de `GET /api/vocab/vistas`: acima dele a resposta vem com `truncado: true`. */
export const TETO_DE_CHAVES_VISTAS = 20_000

/** Quantas sessões o histórico de uma palavra lista em "onde". */
const SESSOES_NO_HISTORICO = 10

/** Quantas falas o histórico varre numa sessão quando a fala de exemplo não contém mais a palavra. */
const FALAS_NA_VARREDURA = 2_000

/** Sessões por transação na reconstrução em massa (`palavras reindexar`): transações curtas, poucas idas. */
const SESSOES_POR_LOTE = 50

const ALVO = [palavrasVistas.userId, palavrasVistas.sessionId, palavrasVistas.lang, palavrasVistas.chave]

/** As falas de uma sessão já com o idioma que vale para cada uma (o da fala, senão o da sessão). */
export function falasComIdioma<T extends { sourceText: string | null; sourceLang: string | null; idx: number | null }>(
  falas: readonly T[],
  idiomaDaSessao: string | null | undefined,
) {
  return falas.map((f) => ({ texto: f.sourceText, idioma: f.sourceLang || idiomaDaSessao, idx: f.idx }))
}

/**
 * Sobe a versão `palavras` do usuário (`versoes_de_dados.palavras`, o ETag de `GET /api/vocab/vistas`). Só
 * quem pode ter mudado o CONJUNTO de chaves chama: uma linha nova, uma linha que zerou, uma reconstrução,
 * uma sessão removida. Somar ocorrência numa chave que já existe não sobe — o lote da captura e a edição de
 * tradução, título ou polimento não invalidam a lista.
 */
async function subirVersaoDasPalavras(tx: ExecutorDb, userId: UserId): Promise<void> {
  await tx.execute(sql`INSERT INTO versoes_de_dados (user_id, vocab, atividade, palavras) VALUES (${userId}, 0, 0, 1)
    ON CONFLICT (user_id) DO UPDATE SET palavras = versoes_de_dados.palavras + 1`)
}

export interface ResumoDaPalavra {
  chave: string
  lang: string
  cartao: null | {
    id: string
    estado: 'nova' | 'aprendendo' | 'dominada'
    proximaRevisao: string | null
    reps: number
    lapses: number
  }
  vistas: { vezes: number; sessoes: number; primeiraEm: string | null; ultimaEm: string | null }
  onde: Array<{ sessaoId: string; titulo: string | null; quando: string; frase: string | null }>
  jogos: Array<{ jogo: string; acertos: number; erros: number; ultimoEm: string }>
  nota: string | null
}

/** O estado do núcleo no vocabulário do contrato: `aprendida` (o desenho da moldura) é `aprendendo` aqui. */
const ESTADO_NO_CONTRATO: Record<EstadoDoCartao, 'nova' | 'aprendendo' | 'dominada'> = {
  nova: 'nova',
  aprendida: 'aprendendo',
  dominada: 'dominada',
}

const iso = (ms: number | null | undefined): string | null => (ms == null ? null : new Date(Number(ms)).toISOString())

export const palavrasVistasRepo = {
  /**
   * AJUSTA UMA sessão pela diferença (`diferencaDeChaves`), no executor recebido — quem chama leu as falas
   * que saem DENTRO da mesma transação, depois de `travarUsuario` (senão dois lotes iguais ao mesmo tempo
   * contam a mesma fala duas vezes).
   *
   * 1 upsert multi-VALUES por fatia (`vezes = vezes + delta`) e, só se alguma chave perdeu ocorrência,
   * 1 DELETE das linhas que zeraram. `faixaQueSai` é a faixa de `idx` das falas que saíram: a chave que só
   * perdeu ocorrência e cujo exemplo apontava para dentro dela fica sem exemplo (nulo), em vez de apontar
   * para uma fala que não a contém mais. A versão `palavras` sobe só se nasceu ou sumiu alguma linha.
   *
   * Uma chave que só perde ocorrência numa sessão ainda não indexada (anterior à migração) entra com
   * `vezes` negativo e sai no DELETE logo atrás — a reconstrução (`palavras reindexar`) acerta o resto.
   */
  async ajustar(
    tx: ExecutorDb,
    userId: UserId,
    sessionId: string,
    diferenca: readonly ContagemDeChave[],
    agora: number,
    faixaQueSai?: { de: number; ate: number },
  ): Promise<void> {
    if (!diferenca.length) return
    const linhas = diferenca.map((d) => ({
      userId,
      sessionId,
      lang: d.lang,
      chave: d.chave,
      vezes: d.vezes,
      primeiraEm: agora,
      ultimaEm: agora,
      exemploIdx: d.idx,
    }))
    const exemplo = faixaQueSai
      ? sql`CASE WHEN excluded.exemplo_idx IS NOT NULL THEN excluded.exemplo_idx
          WHEN ${palavrasVistas.exemploIdx} BETWEEN ${faixaQueSai.de} AND ${faixaQueSai.ate} THEN NULL
          ELSE ${palavrasVistas.exemploIdx} END`
      : sql`COALESCE(excluded.exemplo_idx, ${palavrasVistas.exemploIdx})`
    let mudouConjunto = false
    for (const fatia of emLotes(linhas, tamanhoDoLoteDeInsert(palavrasVistas))) {
      const r = await tx
        .insert(palavrasVistas)
        .values(fatia)
        .onConflictDoUpdate({
          target: ALVO,
          set: {
            vezes: sql`${palavrasVistas.vezes} + excluded.vezes`,
            ultimaEm: sql`CASE WHEN excluded.vezes > 0 THEN excluded.ultima_em ELSE ${palavrasVistas.ultimaEm} END`,
            exemploIdx: exemplo,
          },
        })
        // `xmax = 0` só na linha recém-inserida (na atualizada ele é o id da transação).
        .returning({ nova: sql<boolean>`(xmax = 0)` })
      if (r.some((l) => l.nova)) mudouConjunto = true
    }
    if (diferenca.some((d) => d.vezes < 0)) {
      const apagadas = await tx
        .delete(palavrasVistas)
        .where(
          and(
            eq(palavrasVistas.userId, userId),
            eq(palavrasVistas.sessionId, sessionId),
            sql`${palavrasVistas.vezes} <= 0`,
          ),
        )
        .returning({ chave: palavrasVistas.chave })
      if (apagadas.length) mudouConjunto = true
    }
    if (mudouConjunto) await subirVersaoDasPalavras(tx, userId)
  },

  /** MONTA o apagamento das linhas de uma sessão (a remoção soft dela), com a versão `palavras` subindo. */
  stmtApagarDaSessao(userId: UserId, sessionId: string): InstrucaoDeBatch {
    return async (tx) => {
      await tx
        .delete(palavrasVistas)
        .where(and(eq(palavrasVistas.userId, userId), eq(palavrasVistas.sessionId, sessionId)))
      await subirVersaoDasPalavras(tx, userId)
    }
  },

  /**
   * MONTA a reconstrução de UMA sessão a partir de uma contagem já feita (as falas que acabaram de entrar,
   * na criação e em "retomar a captura"): apaga as linhas dela e insere `contagem` inteira. `primeiraEm` e
   * `ultimaEm` são os da sessão (quando ela começou e a última fala que chegou).
   */
  stmtsReconstruir(
    userId: UserId,
    sessionId: string,
    contagem: ReadonlyMap<string, ContagemDeChave>,
    tempos: { primeiraEm: number; ultimaEm: number },
  ): InstrucaoDeBatch[] {
    const linhas = [...contagem.values()].map((c) => ({
      userId,
      sessionId,
      lang: c.lang,
      chave: c.chave,
      vezes: c.vezes,
      primeiraEm: tempos.primeiraEm,
      ultimaEm: tempos.ultimaEm,
      exemploIdx: c.idx,
    }))
    const apagar = this.stmtApagarDaSessao(userId, sessionId)
    if (!linhas.length) return [apagar]
    return [apagar, (tx) => inserirEmLotes(tx, palavrasVistas, linhas)]
  },

  /**
   * MONTA a reconstrução de UMA sessão que LÊ as falas no executor recebido — para ir no mesmo lote (e
   * depois da trava do usuário) de quem acabou de mudar o idioma das falas ou da sessão. Sessão apagada ou
   * de outro dono: as linhas dela saem e nada entra.
   */
  stmtReconstruirLendo(userId: UserId, sessionId: string): InstrucaoDeBatch {
    return async (tx) => {
      const [s] = await tx
        .select({ sourceLang: sessions.sourceLang, createdAt: sessions.createdAt })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.deletedAt)))
        .limit(1)
      if (!s) return this.stmtApagarDaSessao(userId, sessionId)(tx)
      const falas = await tx
        .select({
          idx: utterances.idx,
          sourceText: utterances.sourceText,
          sourceLang: utterances.sourceLang,
          createdAt: utterances.createdAt,
        })
        .from(utterances)
        .where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId), isNull(utterances.deletedAt)))
      const ultimaEm = falas.reduce((m, f) => Math.max(m, Number(f.createdAt)), Number(s.createdAt))
      const contagem = contarChaves(falasComIdioma(falas, s.sourceLang))
      for (const i of this.stmtsReconstruir(userId, sessionId, contagem, { primeiraEm: Number(s.createdAt), ultimaEm }))
        await i(tx)
    }
  },

  /**
   * RECONSTRÓI as sessões dadas a partir das falas vivas, em lotes de `SESSOES_POR_LOTE` sessões por
   * transação (com a trava do usuário). Devolve quantas sessões foram reconstruídas.
   */
  async reconstruirSessoes(userId: UserId, sessionIds: readonly string[]): Promise<number> {
    const ids = [...new Set(sessionIds)]
    for (const fatia of emLotes(ids, SESSOES_POR_LOTE)) {
      await rodarLote([
        (tx: ExecutorDb) => travarUsuario(tx, userId),
        ...fatia.map((id) => this.stmtReconstruirLendo(userId, id)),
      ])
    }
    return ids.length
  },

  /**
   * As chaves vistas num idioma (base), das mais vistas para as menos, até `teto`. `truncado` diz se
   * havia mais. Sessão apagada não conta: a remoção já tirou as linhas dela.
   */
  async chavesVistas(
    userId: UserId,
    lang: string,
    teto = TETO_DE_CHAVES_VISTAS,
  ): Promise<{ lang: string; chaves: string[]; truncado: boolean }> {
    const base = idiomaBase(lang)
    const rows = linhasDe<{ chave: string }>(
      await db.execute(sql`SELECT chave FROM palavras_vistas
        WHERE user_id = ${userId} AND lang = ${base}
        GROUP BY chave ORDER BY sum(vezes) DESC, chave LIMIT ${teto + 1}`),
    )
    return { lang: base, chaves: rows.slice(0, teto).map((r) => r.chave), truncado: rows.length > teto }
  },

  /** O histórico de UMA palavra: o cartão (se houver), onde ela apareceu, os jogos e a nota. */
  async historico(userId: UserId, lang: string, palavra: string, agora = Date.now()): Promise<ResumoDaPalavra> {
    const base = idiomaBase(lang)
    const chave = chaveDaPalavra(palavra)

    const [card] = await db
      .select({
        id: vocabCards.id,
        stability: vocabCards.stability,
        reps: vocabCards.reps,
        lapses: vocabCards.lapses,
        lastReview: vocabCards.lastReview,
        dueAt: vocabCards.dueAt,
        nota: vocabCards.nota,
      })
      .from(vocabCards)
      .where(
        and(
          eq(vocabCards.userId, userId),
          eq(vocabCards.normKey, chaveDedup(chave, base)),
          isNull(vocabCards.deletedAt),
        ),
      )
      .limit(1)

    const [totais] = linhasDe<{
      vezes: number | null
      sessoes: number
      primeira: number | null
      ultima: number | null
    }>(
      await db.execute(sql`SELECT sum(vezes) AS vezes, count(*)::int AS sessoes,
          min(primeira_em) AS primeira, max(ultima_em) AS ultima
        FROM palavras_vistas WHERE user_id = ${userId} AND lang = ${base} AND chave = ${chave}`),
    )

    const onde = await this.onde(userId, base, chave)
    const jogos = card ? await this.jogos(userId, card.id) : []

    return {
      chave,
      lang: base,
      cartao: card
        ? {
            id: card.id,
            estado:
              ESTADO_NO_CONTRATO[
                estadoDoCartao(
                  { fsrsState: fsrsStateDaLinha(card), stability: card.stability, lastReview: card.lastReview },
                  agora,
                )
              ],
            proximaRevisao: iso(card.dueAt),
            reps: Number(card.reps ?? 0),
            lapses: Number(card.lapses ?? 0),
          }
        : null,
      vistas: {
        vezes: Number(totais?.vezes ?? 0),
        sessoes: Number(totais?.sessoes ?? 0),
        primeiraEm: iso(totais?.primeira),
        ultimaEm: iso(totais?.ultima),
      },
      onde,
      jogos,
      nota: card?.nota ?? null,
    }
  },

  /**
   * "Onde eu vi": as sessões mais recentes em que a chave aparece, com a frase de exemplo. A fala do
   * `exemplo_idx` é lida e conferida; se não contiver mais a palavra (índice torto), a sessão é varrida até
   * `FALAS_NA_VARREDURA` falas. Sem exemplo (nulo) ou sem frase achada, `frase: null`.
   */
  async onde(userId: UserId, lang: string, chave: string): Promise<ResumoDaPalavra['onde']> {
    const linhas = await db
      .select({
        sessaoId: palavrasVistas.sessionId,
        primeiraEm: palavrasVistas.primeiraEm,
        exemploIdx: palavrasVistas.exemploIdx,
        titulo: sessions.title,
      })
      .from(palavrasVistas)
      .innerJoin(sessions, eq(sessions.id, palavrasVistas.sessionId))
      .where(
        and(
          eq(palavrasVistas.userId, userId),
          eq(palavrasVistas.lang, lang),
          eq(palavrasVistas.chave, chave),
          eq(sessions.userId, userId),
          isNull(sessions.deletedAt),
        ),
      )
      .orderBy(sql`${palavrasVistas.ultimaEm} DESC`, asc(palavrasVistas.sessionId))
      .limit(SESSOES_NO_HISTORICO)
    if (!linhas.length) return []

    const comIdx = linhas.filter((l) => l.exemploIdx != null)
    const exemplos = new Map<string, string | null>()
    if (comIdx.length) {
      const falas = await db
        .select({ sessionId: utterances.sessionId, idx: utterances.idx, sourceText: utterances.sourceText })
        .from(utterances)
        .where(
          and(
            eq(utterances.userId, userId),
            isNull(utterances.deletedAt),
            inArray(
              utterances.sessionId,
              comIdx.map((l) => l.sessaoId),
            ),
            inArray(utterances.idx, [...new Set(comIdx.map((l) => Number(l.exemploIdx)))]),
          ),
        )
      for (const l of comIdx) {
        const f = falas.find((x) => x.sessionId === l.sessaoId && Number(x.idx) === Number(l.exemploIdx))
        const frase = f ? fraseComAChave(f.sourceText, chave, lang) : null
        if (frase) exemplos.set(l.sessaoId, frase)
      }
    }
    for (const l of linhas) {
      if (exemplos.has(l.sessaoId)) continue
      /* Sem exemplo (a fala que o era perdeu a palavra): sem frase, sem varredura. A varredura fica para o
         exemplo que não confere — o que só um índice torto produz. */
      if (l.exemploIdx == null) {
        exemplos.set(l.sessaoId, null)
        continue
      }
      const falas = await db
        .select({ sourceText: utterances.sourceText })
        .from(utterances)
        .where(and(eq(utterances.sessionId, l.sessaoId), eq(utterances.userId, userId), isNull(utterances.deletedAt)))
        .orderBy(asc(utterances.idx))
        .limit(FALAS_NA_VARREDURA)
      let frase: string | null = null
      for (const f of falas) {
        frase = fraseComAChave(f.sourceText, chave, lang)
        if (frase) break
      }
      exemplos.set(l.sessaoId, frase)
    }
    return linhas.map((l) => ({
      sessaoId: l.sessaoId,
      titulo: l.titulo ?? null,
      quando: new Date(Number(l.primeiraEm)).toISOString(),
      frase: exemplos.get(l.sessaoId) ?? null,
    }))
  },

  /** Os jogos do cartão (`estado_por_item`) e a revisão (`review_logs`, acerto = nota >= 3). */
  async jogos(userId: UserId, cardId: string): Promise<ResumoDaPalavra['jogos']> {
    const porJogo = (await agregadosRepo.estadoPorItem(userId, cardId)).map((j) => ({
      jogo: j.jogo,
      acertos: j.acertos,
      erros: j.erros,
      ultimoEm: new Date(j.ultimoEm).toISOString(),
    }))
    if (porJogo.some((j) => j.jogo === 'revisao')) return porJogo
    const [r] = await db
      .select({
        total: sql<number>`count(*)::int`,
        acertos: sql<number>`coalesce(sum(case when ${reviewLogs.grade} >= 3 then 1 else 0 end), 0)::int`,
        ultimo: sql<number | null>`max(${reviewLogs.reviewedAt})`,
      })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.cardId, cardId), isNull(reviewLogs.deletedAt)))
    const total = Number(r?.total ?? 0)
    if (!total) return porJogo
    const acertos = Number(r?.acertos ?? 0)
    return [
      ...porJogo,
      { jogo: 'revisao', acertos, erros: total - acertos, ultimoEm: new Date(Number(r?.ultimo ?? 0)).toISOString() },
    ]
  },
}
