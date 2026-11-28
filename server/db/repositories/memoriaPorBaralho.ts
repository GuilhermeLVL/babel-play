/**
 * A MEMÓRIA POR BARALHO — o que `GET /api/vocab/memoria-por-baralho` devolve (openspec `cartoes` 4.2; flag
 * `estudo_palavras_v2`). Contrato e regra dos 20 em `src/core/palavras/memoriaDoBaralho.ts`.
 *
 * Duas leituras estreitas por tipo de baralho, ambas por `user_id` e sem linha apagada: as notas dos últimos 90 dias
 * agrupadas pelo baralho do cartão, e a menor data de vencimento dos cartões no baralho. O baralho do Anki e a Trilha vêm de
 * `vocab_occurrences` (DISTINCT: a mesma nota pode ter mais de uma ocorrência para o mesmo cartão).
 */
import { type SQL,sql } from 'drizzle-orm'

import {
  JANELA_DA_RETENCAO_DIAS,
  type MemoriaDoBaralho,
  type MemoriaPorBaralho,
  type TipoDeBaralho,
} from '../../../src/core/palavras/memoriaDoBaralho'
import type { UserId } from '../../lib/authContext'
import { db, linhas } from '../db'

const DIA = 86_400_000

interface Recorte {
  tipo: TipoDeBaralho
  /** `FROM ... JOIN` que expõe `c` (cartão) e `chave` (o id do baralho) para o cartão. */
  de: (userId: UserId) => SQL
}

const RECORTES: Recorte[] = [
  {
    tipo: 'idioma',
    de: (u) =>
      sql`(SELECT id AS card_id, src_lang_base AS chave, in_deck, due_at FROM vocab_cards WHERE user_id = ${u} AND deleted_at IS NULL AND src_lang_base <> '') k`,
  },
  {
    tipo: 'sessao',
    de: (u) =>
      sql`(SELECT id AS card_id, session_id AS chave, in_deck, due_at FROM vocab_cards WHERE user_id = ${u} AND deleted_at IS NULL AND session_id IS NOT NULL) k`,
  },
  {
    tipo: 'anki',
    de: (u) =>
      sql`(SELECT DISTINCT o.card_id, o.origin_ref AS chave, c.in_deck, c.due_at FROM vocab_occurrences o JOIN vocab_cards c ON c.id = o.card_id AND c.user_id = ${u} AND c.deleted_at IS NULL WHERE o.user_id = ${u} AND o.deleted_at IS NULL AND o.origin_kind = 'anki' AND o.origin_ref IS NOT NULL) k`,
  },
  {
    tipo: 'trilha',
    de: (u) =>
      sql`(SELECT DISTINCT o.card_id, 'trilha' AS chave, c.in_deck, c.due_at FROM vocab_occurrences o JOIN vocab_cards c ON c.id = o.card_id AND c.user_id = ${u} AND c.deleted_at IS NULL WHERE o.user_id = ${u} AND o.deleted_at IS NULL AND o.origin_kind = 'trilha') k`,
  },
]

export async function memoriaPorBaralho(userId: UserId, agora: number): Promise<MemoriaPorBaralho> {
  const desde = agora - JANELA_DA_RETENCAO_DIAS * DIA
  const baralhos: MemoriaDoBaralho[] = []
  for (const r of RECORTES) {
    const [notas, proximas] = await Promise.all([
      db
        .execute(
          sql`SELECT k.chave AS chave, count(*) AS total, sum(CASE WHEN l.grade >= 2 THEN 1 ELSE 0 END) AS lembradas
        FROM review_logs l JOIN ${r.de(userId)} ON k.card_id = l.card_id
        WHERE l.user_id = ${userId} AND l.deleted_at IS NULL AND l.grade BETWEEN 1 AND 4
          AND coalesce(l.reviewed_at, l.created_at) >= ${desde}
        GROUP BY k.chave`,
        )
        .then((x) => linhas<{ chave: string; total: number | string; lembradas: number | string | null }>(x)),
      db
        .execute(
          sql`SELECT k.chave AS chave, min(k.due_at) AS proxima
        FROM ${r.de(userId)} WHERE (k.in_deck IS NULL OR k.in_deck = 1) AND k.due_at IS NOT NULL
        GROUP BY k.chave`,
        )
        .then((x) => linhas<{ chave: string; proxima: number | string | null }>(x)),
    ])
    const porChave = new Map<string, MemoriaDoBaralho>()
    const pegar = (chave: string): MemoriaDoBaralho => {
      let b = porChave.get(chave)
      if (!b) porChave.set(chave, (b = { tipo: r.tipo, id: chave, revisoes: 0, lembradas: 0, proximaRevisao: null }))
      return b
    }
    for (const n of notas) {
      const b = pegar(String(n.chave))
      b.revisoes = Number(n.total)
      b.lembradas = Number(n.lembradas ?? 0)
    }
    for (const p of proximas) {
      if (p.proxima != null) pegar(String(p.chave)).proximaRevisao = Number(p.proxima)
    }
    baralhos.push(...[...porChave.values()].sort((a, b) => b.revisoes - a.revisoes || (a.id < b.id ? -1 : 1)))
  }
  return { agora, janelaDias: JANELA_DA_RETENCAO_DIAS, baralhos }
}
