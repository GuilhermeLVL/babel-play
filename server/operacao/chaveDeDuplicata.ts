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
 *  - `--aplicar` exige `--backup-feito` (a confirmação de que o `pg_dump` foi tirado). Sem isso, recusa.
 *  - Cartões fundidos por engano NÃO se separam aqui: o ensaio só CONTA os que têm ocorrência provando a fusão
 *    (`comProvaDeFusao`); separar é decisão do dono depois de ver o número.
 *  - NÃO liga a flag `chave_dedup_v2`. Ordem de produção: parar o app, backup, ensaio, `--aplicar`, ligar a flag
 *    (`operacao.cjs flags ligar chave_dedup_v2`), subir o app. Na volta, desligar a flag ANTES de `--para 1`.
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { eq, isNotNull } from 'drizzle-orm'

import type { VersaoDaChaveDedup } from '../../src/core/texto/palavra'
import {
  cartaoComProvaDeFusao,
  type CartaoParaReescrever,
  planejarReescritaDeChaves,
} from '../../src/core/texto/reescritaDeChaves'
import { db, type ExecutorDb, travarUsuario } from '../db/db'
import { type InstrucaoDeBatch, rodarLote } from '../db/lotes'
import { vocabCards, vocabOccurrences } from '../db/schema'

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

  if (aplicar && plano.mudam.length) {
    const instrucoes: InstrucaoDeBatch[] = [(tx: ExecutorDb) => travarUsuario(tx, userId)]
    for (const m of plano.mudam) {
      instrucoes.push((tx) => tx.update(vocabCards).set({ normKey: m.para }).where(eq(vocabCards.id, m.id)))
    }
    await rodarLote(instrucoes)
  }
  return {
    cartoes: cartoes.length,
    mudam: plano.mudam.length,
    iguais: plano.iguais,
    conflitos: plano.conflitos.length,
    foraDoPadrao: plano.foraDoPadrao.length,
    porIdioma: plano.porIdioma,
    comProvaDeFusao,
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
  const donos = await db
    .selectDistinct({ userId: vocabCards.userId })
    .from(vocabCards)
    .where(isNotNull(vocabCards.userId))
  const total: RelatorioDaChave = {
    usuarios: 0,
    cartoes: 0,
    mudam: 0,
    iguais: 0,
    conflitos: 0,
    foraDoPadrao: 0,
    porIdioma: {},
    comProvaDeFusao: 0,
  }
  for (const { userId } of donos) {
    const r = await reescreverUsuario(userId as string, de, para, opcoes.aplicar)
    if (r.mudam || r.conflitos) total.usuarios++
    total.cartoes += r.cartoes
    total.mudam += r.mudam
    total.iguais += r.iguais
    total.conflitos += r.conflitos
    total.foraDoPadrao += r.foraDoPadrao
    total.comProvaDeFusao += r.comProvaDeFusao
    for (const [k, n] of Object.entries(r.porIdioma)) total.porIdioma[k] = (total.porIdioma[k] ?? 0) + n
  }
  return total
}
