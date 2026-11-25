/**
 * REESCRITA DA CHAVE DE DUPLICATA (`vocab_cards.norm_key`) — openspec `modelo-do-aluno-e-dados`, tarefas 5.2 e 5.3.
 *
 *   node dist-server/operacao.cjs chave-de-duplicata                              # ENSAIO: só conta (padrão)
 *   node dist-server/operacao.cjs chave-de-duplicata --aplicar --backup-feito     # v1 → v2
 *   node dist-server/operacao.cjs chave-de-duplicata --para 1 --aplicar --backup-feito   # VOLTA (v2 → v1)
 *
 * Não é migração de schema (nenhuma coluna muda): a chave depende de Unicode e de regra por idioma, coisa que SQL
 * não faz. Por isso é um comando consciente, com ensaio antes, no padrão de `reparar-idiomas`.
 *
 *  - NUNCA apaga nem junta cartão. Só troca `norm_key`; o cartão, as revisões e as ocorrências ficam como estão.
 *  - Um usuário por vez, num lote só (travado como os outros lotes do `vocab.ts`): ou ele inteiro vai, ou nada.
 *  - Idempotente: cartão que já está na chave de destino não muda; rodar de novo não faz nada.
 *  - Cobre também `palavras_marcadas.chave` e `palavras_vistas.chave` (tarefa 5.3, junto com a reescrita):
 *      · vistas: as sessões indexadas do usuário são RECONSTRUÍDAS das falas com a chave da versão de destino
 *        (a mesma reconstrução de `palavras reindexar`), no MESMO lote dos cartões;
 *      · marcadas: a chave guarda só a forma reduzida, então a ida só ACRESCENTA a linha v2 das palavras
 *        conhecidas (cartões e falas) cuja v1 é a marcada; a volta leva cada linha à chave v1.
 *  - `--aplicar` exige `--backup-feito` (a confirmação de que o `pg_dump` foi tirado). Sem isso, recusa.
 *  - Cartões fundidos por engano NÃO se separam aqui: o ensaio só CONTA os que têm ocorrência provando a fusão
 *    (`comProvaDeFusao`); separar é decisão do dono depois de ver o número.
 *  - NÃO liga a flag `chave_dedup_v2`. Ordem de produção: parar o app, backup, ensaio, `--aplicar`, ligar a flag
 *    (`operacao.cjs flags ligar chave_dedup_v2`), subir o app. Na volta, desligar a flag ANTES de `--para 1`.
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import type { VersaoDaChaveDedup } from '../../src/core/texto/palavra'
import {
  cartaoComProvaDeFusao,
  type CartaoParaReescrever,
  planejarReescritaDeChaves,
  planejarReescritaDeMarcadas,
} from '../../src/core/texto/reescritaDeChaves'
import { palavrasDoTexto } from '../../src/core/texto/segmentacao'
import { db, type ExecutorDb, travarUsuario } from '../db/db'
import { type InstrucaoDeBatch, rodarLote } from '../db/lotes'
import { palavrasVistasRepo } from '../db/repositories/palavrasVistas'
import { palavrasMarcadas, palavrasVistas, sessions, utterances, vocabCards, vocabOccurrences } from '../db/schema'
import type { UserId } from '../lib/authContext'
import { definirVersaoDaChaveDedup, versaoDaChaveDedup } from '../lib/versaoDaChaveDedup'

export interface RelatorioDaChave {
  usuarios: number
  cartoes: number
  /** Cartões que trocam de `norm_key` (no ensaio, os que TROCARIAM). */
  mudam: number
  iguais: number
  conflitos: number
  foraDoPadrao: number
  porIdioma: Record<string, number>
  /** Só no ensaio: cartões com ocorrência que prova que juntaram duas palavras. */
  comProvaDeFusao: number
  /** `palavras_marcadas`: linhas criadas (ida) ou que trocam de chave (volta); as que saem; as sem desdobra (ida). */
  marcadasCriam: number
  marcadasMovem: number
  marcadasSaem: number
  marcadasSemDesdobra: number
  /** `palavras_vistas`: sessões indexadas que são (ou seriam) reconstruídas com a chave de destino. */
  vistasSessoes: number
}

export class BackupNaoConfirmado extends Error {
  constructor() {
    super('--aplicar exige --backup-feito: tire o pg_dump antes e confirme')
  }
}

async function reescreverUsuario(
  userId: string,
  de: VersaoDaChaveDedup,
  para: VersaoDaChaveDedup,
  aplicar: boolean,
): Promise<Omit<RelatorioDaChave, 'usuarios'>> {
  const linhas = await db
    .select({
      id: vocabCards.id,
      word: vocabCards.word,
      sentence: vocabCards.sentence,
      srcLang: vocabCards.srcLang,
      normKey: vocabCards.normKey,
      deletedAt: vocabCards.deletedAt,
    })
    .from(vocabCards)
    .where(eq(vocabCards.userId, userId))
  const cartoes: CartaoParaReescrever[] = linhas.map((l) => ({
    id: l.id,
    word: l.word,
    srcLang: l.srcLang,
    normKey: l.normKey,
    apagado: l.deletedAt != null,
  }))
  const plano = planejarReescritaDeChaves(cartoes, de, para)

  let comProvaDeFusao = 0
  if (!aplicar && de === 1) {
    const ocs = await db
      .select({ cardId: vocabOccurrences.cardId, sentence: vocabOccurrences.sentence })
      .from(vocabOccurrences)
      .where(eq(vocabOccurrences.userId, userId))
    const frasesDe = new Map<string, string[]>()
    for (const o of ocs)
      if (o.sentence) (frasesDe.get(o.cardId) ?? frasesDe.set(o.cardId, []).get(o.cardId)!).push(o.sentence)
    for (const l of linhas) {
      if (l.deletedAt != null) continue
      const frases = [l.sentence ?? null, ...(frasesDe.get(l.id) ?? [])]
      if (cartaoComProvaDeFusao(l.word, l.srcLang, frases)) comProvaDeFusao++
    }
  }

  const instrucoes: InstrucaoDeBatch[] = []
  for (const m of plano.mudam) {
    instrucoes.push((tx) => tx.update(vocabCards).set({ normKey: m.para }).where(eq(vocabCards.id, m.id)))
  }

  /* As marcadas sem cartão. */
  const marcadas = (
    await db
      .select({ lang: palavrasMarcadas.lang, chave: palavrasMarcadas.chave, estado: palavrasMarcadas.estado })
      .from(palavrasMarcadas)
      .where(eq(palavrasMarcadas.userId, userId))
  ).map((m) => ({ lang: m.lang, chave: m.chave, estado: m.estado }))
  const palavras: { palavra: string; lang: string }[] = []
  if (para === 2 && marcadas.length) {
    for (const l of linhas) if (l.srcLang) palavras.push({ palavra: l.word, lang: l.srcLang })
    const falas = await db
      .select({ texto: utterances.sourceText, lang: utterances.sourceLang, langDaSessao: sessions.sourceLang })
      .from(utterances)
      .innerJoin(sessions, eq(sessions.id, utterances.sessionId))
      .where(and(eq(utterances.userId, userId), isNull(utterances.deletedAt)))
    for (const f of falas) {
      const lang = f.lang || f.langDaSessao
      if (lang) for (const p of palavrasDoTexto(f.texto, lang)) palavras.push({ palavra: p, lang })
    }
  }
  const marc = planejarReescritaDeMarcadas(marcadas, palavras, para)
  const agora = Date.now()
  for (const m of marc.inserir) {
    instrucoes.push((tx) =>
      tx
        .insert(palavrasMarcadas)
        .values({ userId, lang: m.lang, chave: m.chave, estado: m.estado, atualizadoEm: agora })
        .onConflictDoNothing(),
    )
  }
  for (const m of marc.mover) {
    instrucoes.push((tx) =>
      tx
        .update(palavrasMarcadas)
        .set({ chave: m.para })
        .where(
          and(eq(palavrasMarcadas.userId, userId), eq(palavrasMarcadas.lang, m.lang), eq(palavrasMarcadas.chave, m.de)),
        ),
    )
  }
  for (const m of marc.apagar) {
    instrucoes.push((tx) =>
      tx
        .delete(palavrasMarcadas)
        .where(
          and(
            eq(palavrasMarcadas.userId, userId),
            eq(palavrasMarcadas.lang, m.lang),
            eq(palavrasMarcadas.chave, m.chave),
          ),
        ),
    )
  }

  /* As palavras vistas: só as sessões que JÁ têm índice (as sem índice são da `palavras reindexar`). */
  const sessoesIndexadas = (
    await db
      .selectDistinct({ id: palavrasVistas.sessionId })
      .from(palavrasVistas)
      .where(eq(palavrasVistas.userId, userId))
  ).map((r) => r.id)
  for (const id of sessoesIndexadas) instrucoes.push(palavrasVistasRepo.stmtReconstruirLendo(userId as UserId, id))

  if (aplicar && instrucoes.length) {
    const anterior = versaoDaChaveDedup()
    definirVersaoDaChaveDedup(para) // `stmtReconstruirLendo` conta com a versão do processo
    try {
      await rodarLote([(tx: ExecutorDb) => travarUsuario(tx, userId), ...instrucoes])
    } finally {
      definirVersaoDaChaveDedup(anterior)
    }
  }
  return {
    cartoes: cartoes.length,
    mudam: plano.mudam.length,
    iguais: plano.iguais,
    conflitos: plano.conflitos.length,
    foraDoPadrao: plano.foraDoPadrao.length,
    porIdioma: plano.porIdioma,
    comProvaDeFusao,
    marcadasCriam: marc.inserir.length,
    marcadasMovem: marc.mover.length,
    marcadasSaem: marc.apagar.length,
    marcadasSemDesdobra: marc.semDesdobra,
    vistasSessoes: sessoesIndexadas.length,
  }
}

export async function reescreverChavesDeDuplicata(opcoes: {
  aplicar: boolean
  /** Versão de destino: 2 (padrão) ou 1 (volta). */
  para?: VersaoDaChaveDedup
  backupFeito?: boolean
}): Promise<RelatorioDaChave> {
  if (opcoes.aplicar && !opcoes.backupFeito) throw new BackupNaoConfirmado()
  const para: VersaoDaChaveDedup = opcoes.para ?? 2
  const de: VersaoDaChaveDedup = para === 2 ? 1 : 2
  /* Quem tem cartão, marcada ou palavra vista: o usuário sem cartão também tem chave a reescrever. */
  const donos = await db
    .selectDistinct({ userId: vocabCards.userId })
    .from(vocabCards)
    .where(isNotNull(vocabCards.userId))
    .union(db.selectDistinct({ userId: palavrasMarcadas.userId }).from(palavrasMarcadas))
    .union(db.selectDistinct({ userId: palavrasVistas.userId }).from(palavrasVistas))
  const total: RelatorioDaChave = {
    usuarios: 0,
    cartoes: 0,
    mudam: 0,
    iguais: 0,
    conflitos: 0,
    foraDoPadrao: 0,
    porIdioma: {},
    comProvaDeFusao: 0,
    marcadasCriam: 0,
    marcadasMovem: 0,
    marcadasSaem: 0,
    marcadasSemDesdobra: 0,
    vistasSessoes: 0,
  }
  for (const { userId } of donos) {
    const r = await reescreverUsuario(userId as string, de, para, opcoes.aplicar)
    if (r.mudam || r.conflitos || r.marcadasCriam || r.marcadasMovem || r.marcadasSaem) total.usuarios++
    total.cartoes += r.cartoes
    total.mudam += r.mudam
    total.iguais += r.iguais
    total.conflitos += r.conflitos
    total.foraDoPadrao += r.foraDoPadrao
    total.comProvaDeFusao += r.comProvaDeFusao
    total.marcadasCriam += r.marcadasCriam
    total.marcadasMovem += r.marcadasMovem
    total.marcadasSaem += r.marcadasSaem
    total.marcadasSemDesdobra += r.marcadasSemDesdobra
    total.vistasSessoes += r.vistasSessoes
    for (const [k, n] of Object.entries(r.porIdioma)) total.porIdioma[k] = (total.porIdioma[k] ?? 0) + n
  }
  return total
}
