/**
 * AS CONTAGENS POR FONTE — o que `GET /api/vocab/conteudo` devolve (o seletor de conteúdo).
 *
 * Quatro leituras estreitas, em paralelo, e a conta é a função pura do contrato
 * (`src/core/learning/contagensDeConteudo.ts`), a mesma que a edição sem servidor roda no aparelho:
 *
 *   1. os cartões NO BARALHO, só com as sete colunas que decidem idioma, sessão, vencimento, erro e
 *      frase (leitura compacta: uma célula, sem um objeto do driver por linha);
 *   2. os pares distintos cartão × origem de Anki e Trilha (`idx_occ_origem`), como no resumo;
 *   3. as sessões vivas da conta: título, tipo, data e duração;
 *   4. os baralhos do Anki vivos: nome e data (`idx_anki_decks_user`).
 *
 * Tudo escopado por `user_id`: a sessão ou o baralho de outra conta não entra em consulta nenhuma.
 */
import { sql } from 'drizzle-orm'

import {
  type BaralhoParaContar,
  type CartaoParaContar,
  type ContagensDeConteudo,
  contarConteudo,
  type OrigemParaContar,
  type SessaoParaContar,
} from '../../../src/core/learning/contagensDeConteudo'
import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { type ColunaCompacta, lerCompacto } from '../leituraCompacta'

const COLUNAS_DO_CARTAO: ColunaCompacta[] = [
  ['id', 'id', 'texto'],
  ['inDeck', 'in_deck'],
  ['dueAt', 'due_at'],
  ['lapses', 'lapses'],
  // Coluna gerada: `lower(substr(coalesce(src_lang,''),1,2))`, a mesma base que o filtro de idioma usa.
  ['idioma', 'src_lang_base', 'texto'],
  ['sessionId', 'session_id', 'texto'],
  ['sentence', 'sentence', 'texto'],
]

/**
 * O que muda o corpo e NENHUM contador de `versoes_de_dados` vê: o nome de um baralho do Anki
 * (`anki_decks` não tem gatilho). Uma consulta pelo índice da conta; entra na versão do ETag.
 */
export async function versaoDosBaralhos(userId: UserId): Promise<string> {
  const [l] = await db.all<{ n: number | null; m: number | null }>(
    sql`SELECT count(*) AS n, max(updated_at) AS m FROM anki_decks WHERE user_id = ${userId} AND deleted_at IS NULL`,
  )
  return `${Number(l?.n ?? 0)}.${Number(l?.m ?? 0)}`
}

export async function contagensDeConteudo(
  userId: UserId,
  { agora, idioma }: { agora: number; idioma: string },
): Promise<ContagensDeConteudo> {
  const [cartoes, origens, sessoes, baralhos] = await Promise.all([
    lerCompacto<CartaoParaContar>(COLUNAS_DO_CARTAO, {
      tabela: 'vocab_cards',
      onde: sql`user_id = ${userId} AND deleted_at IS NULL AND (in_deck IS NULL OR in_deck = 1)`,
    }),
    lerCompacto<OrigemParaContar>(
      [
        ['cardId', 'card_id', 'texto'],
        ['tipo', 'origin_kind', 'texto'],
        ['ref', 'origin_ref', 'texto'],
      ],
      {
        tabela: 'vocab_occurrences',
        onde: sql`user_id = ${userId} AND deleted_at IS NULL AND origin_kind IN (${'anki'}, ${'trilha'})`,
        distinta: true,
      },
    ),
    db.all<{ id: string; nome: string | null; tipo: string | null; quando: number | null; duracaoMs: number | null }>(
      sql`SELECT id, title AS nome, kind AS tipo, created_at AS quando, duration_ms AS duracaoMs
          FROM sessions WHERE user_id = ${userId} AND deleted_at IS NULL`,
    ),
    db.all<{ id: string; nome: string | null; quando: number | null }>(
      sql`SELECT id, nome, created_at AS quando FROM anki_decks WHERE user_id = ${userId} AND deleted_at IS NULL`,
    ),
  ])
  return contarConteudo({
    cartoes,
    origens,
    sessoes: sessoes.map(
      (s): SessaoParaContar => ({
        id: s.id,
        nome: s.nome ?? '',
        tipo: s.tipo,
        quando: Number(s.quando ?? 0),
        duracaoMs: s.duracaoMs == null ? null : Number(s.duracaoMs),
      }),
    ),
    baralhos: baralhos.map((b): BaralhoParaContar => ({ id: b.id, nome: b.nome ?? '', quando: Number(b.quando ?? 0) })),
    idioma,
    agora,
  })
}
