/**
 * AS VERSÕES DOS DADOS DE UM USUÁRIO — "mudou alguma coisa desde a última leitura?" numa consulta
 * de chave primária, sem ler as linhas (fix/rotas-caras, auditoria de prontidão Fase 2 §2.1).
 *
 * Quem mantém os números são os GATILHOS da migração 0031 (`versoes_de_dados`), dentro da própria
 * escrita: não há função aqui que incremente, e é de propósito — um contador que dependesse de cada
 * repositório lembrar de chamá-lo seria o primeiro a ser esquecido, e o sintoma seria um baralho
 * velho servido com 304.
 *
 *   vocab      vocab_cards + vocab_occurrences — o que `GET /api/vocab` devolve;
 *   atividade  sessions + utterances + vocab_cards + review_logs + exercise_results — as cinco
 *              tabelas que `computeProfile` varre.
 *
 * Os números só crescem. Usuário sem linha está na versão 0 (nunca escreveu desde a migração); a
 * primeira escrita cria a linha em 1.
 */
import { sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'

export interface VersoesDoUsuario {
  vocab: number
  atividade: number
}

export const versoesRepo = {
  async de(userId: UserId): Promise<VersoesDoUsuario> {
    /* `all`, e não `get`: com SQL cru e nenhuma linha, o `get` do drizzle 0.45/libsql tenta mapear
       `undefined` e lança — e "nenhuma linha" é o caso normal de quem ainda não escreveu nada. */
    const [linha] = await db.all<{ vocab: number | null; atividade: number | null }>(
      sql`SELECT vocab, atividade FROM versoes_de_dados WHERE user_id = ${userId}`,
    )
    return { vocab: Number(linha?.vocab ?? 0), atividade: Number(linha?.atividade ?? 0) }
  },
}
