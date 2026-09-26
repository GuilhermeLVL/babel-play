/**
 * ACERVO ANKI (`openspec/changes/motor-anki-acervo`) — repositório do estágio "acervo", que é
 * INDEPENDENTE de virar cartão jogável (essa ligação, `projetarDoAnki`, é a Fase 3 do plano e
 * não vive aqui). Este arquivo só cuida de três coisas: importar sem duplicar, arquivar sem
 * apagar, e listar com paginação por cursor no mesmo padrão de `vocab.listarPagina`.
 *
 * Decisão de design que atravessa o arquivo inteiro: `anki_notes` é o registro CANÔNICO. Nada
 * aqui deleta uma nota por ela ter sumido de um reimport — vira `ausente_no_arquivo`. A única
 * deleção física é `purgarBaralho`, uma ação explícita do usuário.
 */
import { randomUUID } from 'node:crypto'

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { cursorDeNotas, type FiltroDeNotaAnki, lerCursorDeNotas } from '../../../src/core/learning/contract'
import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import {
  emLotes,
  type InstrucaoDeBatch,
  INSTRUCOES_POR_BATCH,
  tamanhoDoLote,
  tamanhoDoLoteDeInsert,
  tuplaDeBatch,
} from '../lotes'
import { ankiDecks, ankiImports, ankiNotes } from '../schema'

export type AnkiDeck = typeof ankiDecks.$inferSelect
export type AnkiNote = typeof ankiNotes.$inferSelect
export type AnkiImport = typeof ankiImports.$inferSelect

export interface NovoImport {
  deckId: string
  arquivo?: string | null
  bytes?: number | null
  hashDoArquivo?: string | null
}

export interface PatchImport {
  estado?: 'lendo' | 'gravando' | 'concluido' | 'parcial' | 'falhou'
  notasLidas?: number
  notasNovas?: number
  notasAtualizadas?: number
  notasDescartadas?: number
  /** Contagem por motivo de descarte — o objeto inteiro, não incremento (a rota já soma). */
  porMotivo?: Record<string, number>
  erro?: string | null
}

export interface NovoDeck {
  nome: string
  nomeNoArquivo?: string | null
  arquivoOrigem: string
  idiomaOrigem?: string | null
  idiomaAlvo?: string | null
}

/** Uma nota tal como o parser do `.apkg` a entrega — ainda sem id, sem timestamps. */
export interface NotaParaGravar {
  guid: string
  notetype?: string | null
  estruturaHash?: string | null
  /** JSON já serializado ou objeto — este repositório serializa se vier objeto. */
  camposBrutos?: string | Record<string, string> | null
  frente?: string | null
  verso?: string | null
  exemplo?: string | null
  tags?: string | null
  motivoDescarte?: string | null
}

export interface ResultadoGravarNotas {
  novas: number
  atualizadas: number
  iguais: number
  /** Ids das notas afetadas (novas + atualizadas + iguais), na ordem de entrada. Útil para
   *  quem chama encadear a projeção sem precisar reconsultar. */
  ids: string[]
}

export interface ContagensBaralho {
  total: number
  ativas: number
  arquivadas: number
  /** A régua de qualidade recusou: está no arquivo, não vira item jogável. Acionável (remapear). */
  descartadas: number
  /** Sumiu do arquivo mais recente. História do baralho, não defeito — nunca some do acervo. */
  ausentes: number
}

function serializarCampos(c: NotaParaGravar['camposBrutos']): string | null {
  if (c == null) return null
  return typeof c === 'string' ? c : JSON.stringify(c)
}

export const ankiRepo = {
  // ── Ledger de import ──────────────────────────────────────────────────────────────────────

  async criarImport(userId: UserId, dados: NovoImport): Promise<AnkiImport> {
    const now = Date.now()
    const row: typeof ankiImports.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      deckId: dados.deckId,
      arquivo: dados.arquivo ?? null,
      bytes: dados.bytes ?? null,
      hashDoArquivo: dados.hashDoArquivo ?? null,
      estado: 'lendo',
      notasLidas: 0,
      notasNovas: 0,
      notasAtualizadas: 0,
      notasDescartadas: 0,
      porMotivo: null,
      erro: null,
    }
    await db.insert(ankiImports).values(row)
    return row as AnkiImport
  },

  /** Progresso é CUMULATIVO por chamada: cada fatia da importação soma o que gravou nesta fatia,
   *  em vez de mandar o total (que exigiria o chamador saber o total anterior). */
  async atualizarImport(id: string, patch: PatchImport): Promise<void> {
    const now = Date.now()
    const set: Record<string, unknown> = { updatedAt: now }
    if (patch.estado !== undefined) set.estado = patch.estado
    if (patch.notasLidas !== undefined) set.notasLidas = sql`${ankiImports.notasLidas} + ${patch.notasLidas}`
    if (patch.notasNovas !== undefined) set.notasNovas = sql`${ankiImports.notasNovas} + ${patch.notasNovas}`
    if (patch.notasAtualizadas !== undefined)
      set.notasAtualizadas = sql`${ankiImports.notasAtualizadas} + ${patch.notasAtualizadas}`
    if (patch.notasDescartadas !== undefined)
      set.notasDescartadas = sql`${ankiImports.notasDescartadas} + ${patch.notasDescartadas}`
    if (patch.porMotivo !== undefined) set.porMotivo = JSON.stringify(patch.porMotivo)
    if (patch.erro !== undefined) set.erro = patch.erro
    await db.update(ankiImports).set(set).where(eq(ankiImports.id, id))
  },

  async lerImport(userId: UserId, id: string): Promise<AnkiImport | undefined> {
    const rows = await db
      .select()
      .from(ankiImports)
      .where(and(eq(ankiImports.id, id), eq(ankiImports.userId, userId)))
      .limit(1)
    return rows[0]
  },

  // ── Baralhos ───────────────────────────────────────────────────────────────────────────────

  /**
   * Idempotente por `(userId, arquivoOrigem, nome)`: reimportar o MESMO arquivo com o MESMO nome
   * de baralho acha o deck existente em vez de criar um paralelo. Não há índice único aqui (o
   * upsert é get-then-insert, como `settings.ensure` fazia antes de ganhar o unique) porque este
   * caminho é sempre um POST de import explícito, não uma corrida de leitura concorrente — o
   * risco que justificou o unique parcial em `vocab_cards` não se aplica.
   */
  async criarOuAcharDeck(userId: UserId, dados: NovoDeck): Promise<AnkiDeck> {
    const existente = await db
      .select()
      .from(ankiDecks)
      .where(
        and(
          eq(ankiDecks.userId, userId),
          eq(ankiDecks.arquivoOrigem, dados.arquivoOrigem),
          eq(ankiDecks.nome, dados.nome),
          isNull(ankiDecks.deletedAt),
        ),
      )
      .limit(1)
    if (existente[0]) {
      /**
       * REIMPORTAR UM BARALHO DESATIVADO O TRAZ DE VOLTA — e sem isto não havia NENHUM caminho de
       * volta. A spec promete, no cenário de desativação, que "o baralho pode voltar"; só que
       * desativar era a única porta implementada, e reimportar o mesmo arquivo achava o deck
       * existente e o devolvia ainda desativado. Efeito: o baralho ficava preso fora dos jogos para
       * sempre, com as notas arquivadas e sem botão nenhum que as tirasse de lá.
       *
       * Reimportar É o pedido de volta: ninguém sobe de novo um arquivo que quer manter desligado.
       * As NOTAS continuam arquivadas de propósito — quem decide quantas voltam à fila é a ativação
       * em lotes, e ressuscitar 3.600 de uma vez seria justamente o despejo que a ativação existe
       * para evitar. Os cartões que estavam projetados voltam com o histórico intacto quando o lote
       * os alcança (ver a reativação em `projetarDoAnki`).
       */
      if (existente[0].estado !== 'ativo') {
        const agora = Date.now()
        await db.update(ankiDecks).set({ estado: 'ativo', updatedAt: agora }).where(eq(ankiDecks.id, existente[0].id))
        return { ...existente[0], estado: 'ativo', updatedAt: agora }
      }
      return existente[0]
    }

    const now = Date.now()
    const row: typeof ankiDecks.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      deletedAt: null,
      nome: dados.nome,
      nomeNoArquivo: dados.nomeNoArquivo ?? null,
      arquivoOrigem: dados.arquivoOrigem,
      estado: 'ativo',
      idiomaOrigem: dados.idiomaOrigem ?? null,
      idiomaAlvo: dados.idiomaAlvo ?? null,
    }
    await db.insert(ankiDecks).values(row)
    return row as AnkiDeck
  },

  /** Contagens por baralho, numa consulta agregada — não N+1 por deck. */
  async listarBaralhos(userId: UserId): Promise<Array<AnkiDeck & ContagensBaralho>> {
    const decks = await db
      .select()
      .from(ankiDecks)
      .where(and(eq(ankiDecks.userId, userId), isNull(ankiDecks.deletedAt)))
      .orderBy(desc(ankiDecks.createdAt))
    if (!decks.length) return []

    /* `descartada` e `ausente` são coisas DIFERENTES, e contá-las juntas mentiria na tela:
       descartada = a nota está no arquivo mas não vira item jogável (a régua de qualidade a
       recusou, e `motivoDescarte` diz por quê — é acionável, o usuário pode remapear campos);
       ausente = a nota existia num import anterior e sumiu do arquivo novo — não é defeito de
       qualidade, é história do baralho. Uma tela que somasse as duas mandaria a pessoa procurar
       conserto onde não há nada quebrado. */
    const linhas = await db
      .select({
        deckId: ankiNotes.deckId,
        estado: ankiNotes.estado,
        temMotivo: sql<number>`case when ${ankiNotes.motivoDescarte} is null then 0 else 1 end`,
        n: sql<number>`count(*)`,
      })
      .from(ankiNotes)
      .where(
        and(
          eq(ankiNotes.userId, userId),
          isNull(ankiNotes.deletedAt),
          inArray(
            ankiNotes.deckId,
            decks.map((d) => d.id),
          ),
        ),
      )
      .groupBy(ankiNotes.deckId, ankiNotes.estado, sql`case when ${ankiNotes.motivoDescarte} is null then 0 else 1 end`)

    const porDeck = new Map<string, ContagensBaralho>()
    for (const d of decks) porDeck.set(d.id, { total: 0, ativas: 0, arquivadas: 0, descartadas: 0, ausentes: 0 })
    for (const l of linhas) {
      const c = porDeck.get(l.deckId)
      if (!c) continue
      const n = Number(l.n)
      c.total += n
      if (l.estado === 'ativa') c.ativas += n
      else if (l.estado === 'arquivada') c.arquivadas += n
      else if (l.estado === 'ausente_no_arquivo') c.ausentes += n
      if (Number(l.temMotivo) === 1) c.descartadas += n
    }
    return decks.map((d) => ({ ...d, ...porDeck.get(d.id)! }))
  },

  /**
   * Desativa: o deck vira 'desativado' e TODAS as suas notas viram 'arquivada' — nada é apagado.
   * Notas que tinham cartão projetado (`projectedCardId` não nulo) recebem
   * `motivoDaBaixa='desativacao'`, que é o que permite `gravarNotas` REATIVAR o cartão em vez de
   * criar um paralelo se o mesmo baralho for reimportado depois (Decisão 4 do design).
   *
   * `vocab_cards` e `review_logs` não são tocados aqui — a projeção (Fase 3) decide o que fazer
   * com o cartão a partir do `motivoDaBaixa` gravado.
   */
  async desativarBaralho(userId: UserId, deckId: string): Promise<void> {
    const now = Date.now()
    await db
      .update(ankiDecks)
      .set({ estado: 'desativado', updatedAt: now })
      .where(and(eq(ankiDecks.id, deckId), eq(ankiDecks.userId, userId)))

    await db
      .update(ankiNotes)
      .set({ estado: 'arquivada', updatedAt: now })
      .where(and(eq(ankiNotes.deckId, deckId), eq(ankiNotes.userId, userId), isNull(ankiNotes.deletedAt)))

    await db
      .update(ankiNotes)
      .set({ motivoDaBaixa: 'desativacao', updatedAt: now })
      .where(
        and(
          eq(ankiNotes.deckId, deckId),
          eq(ankiNotes.userId, userId),
          isNull(ankiNotes.deletedAt),
          sql`${ankiNotes.projectedCardId} IS NOT NULL`,
        ),
      )
  },

  /**
   * PURGA: apaga notas e deck de verdade (hard delete — este é o único lugar do arquivo que faz
   * isso). `review_logs` e `vocab_cards` NUNCA são tocados: a projeção é responsabilidade de
   * outra tarefa, e apagar o cartão jogável a partir daqui destruiria histórico de estudo que o
   * usuário nunca pediu para perder. A confirmação dupla é responsabilidade da ROTA, não deste
   * repositório.
   */
  async purgarBaralho(userId: UserId, deckId: string): Promise<void> {
    // Ordem por causa das FKs: notas e imports referenciam o deck, então saem primeiro.
    await db.delete(ankiNotes).where(and(eq(ankiNotes.deckId, deckId), eq(ankiNotes.userId, userId)))
    await db.delete(ankiImports).where(and(eq(ankiImports.deckId, deckId), eq(ankiImports.userId, userId)))
    await db.delete(ankiDecks).where(and(eq(ankiDecks.id, deckId), eq(ankiDecks.userId, userId)))
  },

  // ── Notas ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Upsert por `(deckId, guid)` — reimportar o mesmo baralho não duplica nota.
   *
   * Reaparecimento: uma nota que estava `ausente_no_arquivo` e volta no arquivo novo SAI desse
   * estado. Não há coluna de "estado anterior" — a regra observável é: se ela tinha cartão
   * projetado (`projectedCardId` não nulo), volta para `ativa`; senão volta para `arquivada`,
   * que é o estado de repouso de toda nota nova.
   *
   * "Atualizada" x "igual": comparamos os campos mapeados (frente/verso/exemplo/tags) e o JSON de
   * `camposBrutos` — se nada mudou, a linha é tocada só para sair de `ausente_no_arquivo` quando
   * aplicável (o `updatedAt` avança de qualquer forma, mas não conta como "atualizada" para o
   * ledger, que quer refletir mudança de CONTEÚDO).
   *
   * LOTES (P1 da auditoria de prontidão): o `inArray(guid)` com a lista inteira passava do teto de
   * 32.766 variáveis do SQLite a partir de ~32 mil notas, e o import aceita 50.000. E cada nota era
   * uma ida ao banco — 30 mil notas levavam 48 s. Agora a leitura vai em lotes de guids, as notas
   * novas entram em INSERT multi-VALUES e as alteradas em UPDATEs agrupados em `db.batch`.
   *
   * A escrita NÃO é uma transação única de propósito: um batch de 50 mil instruções seguraria o
   * lock de escrita por segundos, e os outros processos esperam só 5 s (`busy_timeout`). O que
   * torna uma interrupção no meio inofensiva é a idempotência por `(deckId, guid)`: reimportar
   * completa o que faltou, sem duplicar.
   */
  async gravarNotas(
    userId: UserId,
    deckId: string,
    importId: string,
    notas: NotaParaGravar[],
  ): Promise<ResultadoGravarNotas> {
    if (!notas.length) return { novas: 0, atualizadas: 0, iguais: 0, ids: [] }
    const now = Date.now()
    const guids = notas.map((n) => n.guid)

    // `deck_id = ?` é a variável fixa de cada lote.
    const existentes: AnkiNote[] = []
    for (const lote of emLotes(guids, tamanhoDoLote(1, 1))) {
      existentes.push(
        ...(await db
          .select()
          .from(ankiNotes)
          .where(and(eq(ankiNotes.deckId, deckId), inArray(ankiNotes.guid, lote)))),
      )
    }
    const porGuid = new Map(existentes.map((n) => [n.guid, n]))

    let novas = 0
    let atualizadas = 0
    let iguais = 0
    const ids: string[] = []
    const linhasNovas: (typeof ankiNotes.$inferInsert)[] = []
    const alteracoes: InstrucaoDeBatch[] = []

    for (const n of notas) {
      const camposBrutos = serializarCampos(n.camposBrutos)
      const existente = porGuid.get(n.guid)

      if (!existente) {
        const id = randomUUID()
        linhasNovas.push({
          id,
          createdAt: now,
          updatedAt: now,
          userId,
          deletedAt: null,
          deckId,
          guid: n.guid,
          notetype: n.notetype ?? null,
          estruturaHash: n.estruturaHash ?? null,
          camposBrutos,
          frente: n.frente ?? null,
          verso: n.verso ?? null,
          exemplo: n.exemplo ?? null,
          tags: n.tags ?? null,
          estado: 'arquivada',
          projectedCardId: null,
          motivoDaBaixa: null,
          motivoDescarte: n.motivoDescarte ?? null,
          importId,
        })
        novas++
        ids.push(id)
        continue
      }

      const mudou =
        existente.frente !== (n.frente ?? null) ||
        existente.verso !== (n.verso ?? null) ||
        existente.exemplo !== (n.exemplo ?? null) ||
        existente.tags !== (n.tags ?? null) ||
        existente.camposBrutos !== camposBrutos

      const reapareceu = existente.estado === 'ausente_no_arquivo'
      const novoEstado = reapareceu ? (existente.projectedCardId ? 'ativa' : 'arquivada') : existente.estado

      if (!mudou && !reapareceu) {
        iguais++
        ids.push(existente.id)
        continue
      }

      alteracoes.push(
        db
          .update(ankiNotes)
          .set({
            updatedAt: now,
            notetype: n.notetype ?? existente.notetype,
            estruturaHash: n.estruturaHash ?? existente.estruturaHash,
            camposBrutos,
            frente: n.frente ?? null,
            verso: n.verso ?? null,
            exemplo: n.exemplo ?? null,
            tags: n.tags ?? null,
            estado: novoEstado,
            motivoDescarte: n.motivoDescarte ?? null,
            importId,
          })
          .where(eq(ankiNotes.id, existente.id)),
      )

      if (mudou) atualizadas++
      else iguais++
      ids.push(existente.id)
    }

    const instrucoes: InstrucaoDeBatch[] = [
      ...emLotes(linhasNovas, tamanhoDoLoteDeInsert(ankiNotes)).map((linhas) => db.insert(ankiNotes).values(linhas)),
      ...alteracoes,
    ]
    for (const bloco of emLotes(instrucoes, INSTRUCOES_POR_BATCH)) await db.batch(tuplaDeBatch(bloco))

    return { novas, atualizadas, iguais, ids }
  },

  /**
   * Notas do baralho cujo `guid` NÃO está em `guidsPresentes` (o arquivo mais recente) viram
   * `ausente_no_arquivo`. NUNCA deleta — é assim que "esse cartão sumiu do Anki" vira estado
   * inspecionável em vez de perda silenciosa. Notas já `ausente_no_arquivo` não são retocadas
   * (idempotente); notas com `guid` presente também não, mesmo que já estejam marcadas — só as
   * que estão fora da lista mudam.
   */
  async marcarAusentes(userId: UserId, deckId: string, guidsPresentes: string[]): Promise<number> {
    const now = Date.now()
    const cond = [
      eq(ankiNotes.deckId, deckId),
      eq(ankiNotes.userId, userId),
      isNull(ankiNotes.deletedAt),
      sql`${ankiNotes.estado} != 'ausente_no_arquivo'`,
    ]
    /* MARCAR-E-VARRER em vez de `NOT IN (lista)`: a lista é o arquivo inteiro (até 50.000 guids)
       e passava do teto de 32.766 variáveis do SQLite. As candidatas são as notas DESTE baralho
       — conjunto que o banco já delimita pelo índice `(deck_id, estado)` — e a diferença contra
       o arquivo é feita aqui, num Set. Mesma semântica, inclusive para lista vazia (todas as
       candidatas somem), que o `NOT IN ()` nem aceitava. */
    const presentes = new Set(guidsPresentes)
    const candidatas = await db
      .select({ id: ankiNotes.id, guid: ankiNotes.guid })
      .from(ankiNotes)
      .where(and(...cond))
    const alvo = candidatas.filter((c) => !presentes.has(c.guid))
    if (!alvo.length) return 0
    // Um batch só (atômico): ou o baralho inteiro reflete o arquivo novo, ou nada muda. As duas
    // variáveis fixas são as do SET (`estado`, `updated_at`).
    await db.batch(
      tuplaDeBatch(
        emLotes(
          alvo.map((a) => a.id),
          tamanhoDoLote(1, 2),
        ).map((lote) =>
          db.update(ankiNotes).set({ estado: 'ausente_no_arquivo', updatedAt: now }).where(inArray(ankiNotes.id, lote)),
        ),
      ),
    )
    return alvo.length
  },

  /**
   * Paginação por cursor composto `(createdAt, id)` — mesmo padrão de `vocab.listarPagina`: com
   * OFFSET, uma nota nova gravada durante a rolagem faz um item repetir na página seguinte.
   */
  async listarNotas(
    userId: UserId,
    deckId: string,
    opts: {
      limite?: number
      /* O MESMO valor que a pagina anterior devolveu, opaco. Era `{ valor, id }` e o cliente
       tipava string: quem paginava devolvia `[object Object]` e a segunda pagina repetia a
       primeira para sempre (achado A21). Devolver o que se recebeu tem de bastar. */
      cursor?: string | null
      estado?: FiltroDeNotaAnki
      busca?: string
    } = {},
  ): Promise<{ itens: AnkiNote[]; proximoCursor: string | null; total: number }> {
    const limite = Math.min(Math.max(opts.limite ?? 200, 1), 500)
    const cond = [eq(ankiNotes.deckId, deckId), eq(ankiNotes.userId, userId), isNull(ankiNotes.deletedAt)]

    /* `descartada` nao e valor da coluna: e o recorte de quem tem `motivo_descarte`. Filtrar por
       ele respondia 400 antes de o schema conhecer o nome, e a tela oferecia o filtro assim mesmo
       (achado A21). Ver o vocabulario em `contract.ts`. */
    if (opts.estado === 'descartada') cond.push(sql`${ankiNotes.motivoDescarte} IS NOT NULL`)
    else if (opts.estado) cond.push(eq(ankiNotes.estado, opts.estado))
    if (opts.busca?.trim()) {
      const q = `%${opts.busca.trim().toLowerCase()}%`
      cond.push(
        sql`(lower(COALESCE(${ankiNotes.frente},'')) LIKE ${q} OR lower(COALESCE(${ankiNotes.verso},'')) LIKE ${q})`,
      )
    }
    const cursor = lerCursorDeNotas(opts.cursor)
    if (cursor) {
      const { valor, id } = cursor
      cond.push(
        sql`(${ankiNotes.createdAt} < ${valor} OR (${ankiNotes.createdAt} = ${valor} AND ${ankiNotes.id} > ${id}))`,
      )
    }

    const where = and(...cond)
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(ankiNotes)
      .where(where)
    const itens = await db
      .select()
      .from(ankiNotes)
      .where(where)
      .orderBy(desc(ankiNotes.createdAt), ankiNotes.id)
      .limit(limite + 1)

    const temMais = itens.length > limite
    const pagina = temMais ? itens.slice(0, limite) : itens
    const ultimo = pagina[pagina.length - 1]
    return {
      itens: pagina,
      total: Number(n),
      proximoCursor: temMais && ultimo ? cursorDeNotas(ultimo.createdAt, ultimo.id) : null,
    }
  },
}
