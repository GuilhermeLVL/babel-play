import { createHash,randomUUID } from 'node:crypto'

import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'

import { db } from '../db'
import { rank } from '../schema'

/**
 * RANKING GLOBAL — o placar público dos minijogos, agora no servidor.
 *
 * Ele era uma Pages Function do Cloudflare contra um banco D1 separado, e veio para cá quando a
 * edição leve foi encerrada (07/09). As regras são as mesmas, e todas são regras de placar de
 * fliperama, não de banco: teto de pontos, apelido saneado, um envio por minuto por origem.
 *
 * A POSTURA SOBRE TRAPAÇA, dita na cara: um placar público sem conta é trapaceável, e este é. O
 * que os tetos garantem não é honestidade — é que a trapaça não QUEBRE a tabela (um envio de dez
 * milhões deixaria o resto invisível para sempre). Fingir o contrário exigiria conta, e o ranking
 * existe justamente para funcionar igual com e sem ela.
 */

/** Teto de pontos plausível por rodada. Acima disso é trapaça e não entra. */
export const TETO_DE_PONTOS = 5_000
export const TETO_DE_COMBO = 200
/** Janela de flood: um envio por origem a cada minuto. */
export const JANELA_DE_ENVIO_MS = 60_000

export interface LinhaDoRanking {
  apelido: string
  pontos: number
  combo: number
  quando: number
}

/**
 * 3–20 caracteres de letra, número, espaço, `_` ou `-`. Devolve `null` quando não sobra apelido.
 *
 * O cliente já sanea antes de enviar (`src/lib/ranking.ts`), e isto NÃO é redundância: aquele é
 * conforto de digitação, este é a regra. Um placar público recebe corpo montado à mão.
 */
export function sanearApelido(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const limpo = bruto.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20)
  return limpo.length >= 3 ? limpo : null
}

/**
 * A origem do envio, como HASH — nunca o endereço.
 *
 * A versão D1 gravava o IP em claro para esta mesma trava. Um identificador de rede, guardado sem
 * prazo e sem caminho de exclusão, é dado pessoal dentro de uma tabela que se apresenta como
 * anônima. O hash responde à única pergunta que a trava faz ("vieram do mesmo lugar?") e a
 * nenhuma outra: dele não se volta ao endereço sem a chave do servidor e uma busca exaustiva.
 */
export function hashDaOrigem(ip: string, segredo: string): string {
  return createHash('sha256').update(`${segredo}|${ip}`).digest('hex').slice(0, 32)
}

export const rankRepo = {
  /** O topo de um jogo. Empate de pontos decide pelo mais ANTIGO: quem chegou primeiro. */
  async topo(jogo: string, limite: number): Promise<LinhaDoRanking[]> {
    const linhas = await db
      .select({ apelido: rank.apelido, pontos: rank.pontos, combo: rank.combo, quando: rank.criadoEm })
      .from(rank)
      .where(eq(rank.jogo, jogo))
      .orderBy(desc(rank.pontos), asc(rank.criadoEm))
      .limit(limite)
    return linhas
  },

  /** Houve envio desta origem dentro da janela? É a trava de flood. */
  async enviouRecentemente(ipHash: string, agora: number): Promise<boolean> {
    const r = await db
      .select({ id: rank.id })
      .from(rank)
      .where(and(eq(rank.ipHash, ipHash), gt(rank.criadoEm, agora - JANELA_DE_ENVIO_MS)))
      .limit(1)
    return r.length > 0
  },

  /**
   * Registra uma pontuação. Uma linha por (jogo, apelido), e só a MELHOR fica.
   *
   * `manteve: true` quando a pontuação enviada não bate o recorde do apelido — não é erro, é a
   * resposta certa para "joguei de novo e fui pior". O UPSERT é uma instrução só: duas partidas
   * terminando juntas não podem criar duas linhas do mesmo apelido, e o índice único é quem
   * arbitra isso, não uma leitura anterior.
   */
  async registrar(input: {
    jogo: string; apelido: string; pontos: number; combo: number; ipHash: string; agora: number
  }): Promise<{ ok: true; manteve: boolean }> {
    const r = await db.run(sql`
      INSERT INTO ${rank} (id, criado_em, jogo, apelido, pontos, combo, ip_hash)
      VALUES (${randomUUID()}, ${input.agora}, ${input.jogo}, ${input.apelido}, ${input.pontos}, ${input.combo}, ${input.ipHash})
      ON CONFLICT (jogo, apelido) DO UPDATE SET
        pontos = excluded.pontos,
        combo = excluded.combo,
        criado_em = excluded.criado_em,
        ip_hash = excluded.ip_hash
      WHERE excluded.pontos > ${rank}.pontos
    `)
    /* 0 linhas afetadas = o `WHERE` do UPDATE recusou, ou seja, o recorde guardado é melhor. */
    return { ok: true, manteve: Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0 }
  },
}
