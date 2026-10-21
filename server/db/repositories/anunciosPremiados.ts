/**
 * AS EXIBIÇÕES DO ANÚNCIO PREMIADO NO BANCO (tabela `anuncios_premiados`, migração 0006). Só SQL: quem decide
 * política, recompensa e resposta é `server/routes/anuncios.ts`.
 *
 * A CONCLUSÃO É UMA TRANSAÇÃO com a trava do usuário e, depois dela, uma trava global (`g:anuncios-premiados`):
 * em READ COMMITTED duas conclusões em voo passariam as duas pela contagem do teto (uma não vê a outra antes
 * do COMMIT). Com as travas, a contagem e o `UPDATE ... WHERE concluido_em IS NULL` são vistos em série, e a
 * mesma exibição nunca é concluída duas vezes. A trava global serializa só as conclusões — no máximo o teto
 * global por dia (2.000), uma escrita curta cada.
 */
import { sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db, emTransacao, linhas, linhasAfetadas, travarGlobal, travarUsuario } from '../db'

const DIA_MS = 86_400_000

export type ResultadoDaConclusao =
  | { tipo: 'creditada'; espaco: string; concluidoEm: number }
  | { tipo: 'ja-creditada'; espaco: string; concluidoEm: number }
  | { tipo: 'desconhecida' }
  | { tipo: 'expirada' }
  | { tipo: 'espaco-inativo' }
  | { tipo: 'espaco-bloqueado' }
  | { tipo: 'cedo-demais' }
  | { tipo: 'teto' }
  | { tipo: 'teto-do-mes' }

export interface TetosDaConclusao {
  /** A exibição credita só se for concluída antes de `iniciado_em + prazoMs`. */
  prazoMs: number
  /** E só depois de `iniciado_em + duracaoMinimaMs(espaco)` (R33: concluir logo depois de iniciar é forjar). */
  duracaoMinimaMs: (espaco: string) => number
  limitePorPessoa: number
  tetoGlobal: number
  /** Tetos por pessoa de um espaço no dia (o `nuvem-30`). */
  limitePorEspaco: Readonly<Record<string, number>>
  /** Tetos por pessoa de um espaço no mês UTC (o `nuvem-30`). Conferidos antes dos do dia. */
  limitePorEspacoNoMes: Readonly<Record<string, number>>
  /** Espaços que a interface não monta: nunca concluem (`ESPACOS_PREMIADOS_ATIVOS`). */
  espacoAtivo: (espaco: string) => boolean
  /** Espaços que não podem ser creditados agora (o `nuvem-30` com a nuvem do Grátis desligada). */
  espacosBloqueados: ReadonlySet<string>
}

/**
 * As concluídas do dia UTC: da pessoa, de todas as contas e da pessoa naquele espaço; e as da pessoa naquele
 * espaço no MÊS UTC até o dia (o `dia` é `AAAA-MM-DD`, então o mês começa em `AAAA-MM-01`).
 */
function contagensDoDia(userId: UserId, dia: string, espaco: string) {
  return sql`
    SELECT count(*) FILTER (WHERE user_id = ${userId})::int AS pessoa,
           count(*) FILTER (WHERE user_id = ${userId} AND espaco = ${espaco})::int AS do_espaco,
           count(*)::int AS total,
           (SELECT count(*) FROM anuncios_premiados
            WHERE user_id = ${userId} AND espaco = ${espaco} AND concluido_em IS NOT NULL
              AND dia >= ${`${dia.slice(0, 7)}-01`} AND dia <= ${dia})::int AS do_espaco_no_mes
    FROM anuncios_premiados WHERE dia = ${dia} AND concluido_em IS NOT NULL`
}
type LinhaDeContagem = { pessoa: number; do_espaco: number; total: number; do_espaco_no_mes: number }

/** `AAAA-MM-DD` UTC. */
export const diaUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 10)

/** O primeiro dia (UTC) do mês ANTERIOR ao de `agora`, `AAAA-MM-01`. */
function inicioDoMesAnterior(agora: number): string {
  const d = new Date(agora)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

export const anunciosPremiadosRepo = {
  /**
   * As exibições CONCLUÍDAS no dia UTC: as da pessoa, as dela no `espaco` e as de todas as contas; e as dela no
   * `espaco` no mês UTC até o dia (`doEspacoNoMes`).
   */
  async concluidasNoDia(
    userId: UserId,
    dia: string,
    espaco: string,
  ): Promise<{ daPessoa: number; doEspaco: number; global: number; doEspacoNoMes: number }> {
    const [c] = linhas<LinhaDeContagem>(await db.execute(contagensDoDia(userId, dia, espaco)))
    return {
      daPessoa: Number(c?.pessoa ?? 0),
      doEspaco: Number(c?.do_espaco ?? 0),
      global: Number(c?.total ?? 0),
      doEspacoNoMes: Number(c?.do_espaco_no_mes ?? 0),
    }
  },

  /** As exibições da pessoa ainda PENDENTES iniciadas desde `desde` (ms). */
  async pendentesDesde(userId: UserId, desde: number): Promise<number> {
    const [c] = linhas<{ n: number }>(
      await db.execute(sql`
        SELECT count(*)::int AS n FROM anuncios_premiados
        WHERE user_id = ${userId} AND concluido_em IS NULL AND iniciado_em >= ${desde}`),
    )
    return Number(c?.n ?? 0)
  },

  async iniciar(userId: UserId, exibicaoId: string, espaco: string, agora: number): Promise<void> {
    await db.execute(sql`
      INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
      VALUES (${userId}, ${exibicaoId}, ${espaco}, NULL, ${agora}, NULL)`)
  },

  /**
   * CONCLUI a exibição, uma vez só: a linha tem de ser desta conta, de um espaço ativo, pendente, dentro do
   * prazo, com a duração mínima cumprida, de um espaço não bloqueado, e os tetos do mês e do dia (contados nas
   * concluídas por `dia`) têm de caber. Concluída antes → `ja-creditada` (quem chama não credita de novo, ou
   * reaplica um crédito idempotente).
   */
  async concluir(
    userId: UserId,
    exibicaoId: string,
    agora: number,
    tetos: TetosDaConclusao,
  ): Promise<ResultadoDaConclusao> {
    const dia = diaUtc(agora)
    return emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      await travarGlobal(tx, 'anuncios-premiados')
      const [linha] = linhas<{ espaco: string; iniciado_em: number; concluido_em: number | null }>(
        await tx.execute(sql`
          SELECT espaco, iniciado_em, concluido_em FROM anuncios_premiados
          WHERE user_id = ${userId} AND exibicao_id = ${exibicaoId}`),
      )
      if (!linha) return { tipo: 'desconhecida' }
      if (!tetos.espacoAtivo(linha.espaco)) return { tipo: 'espaco-inativo' }
      if (linha.concluido_em != null)
        return { tipo: 'ja-creditada', espaco: linha.espaco, concluidoEm: Number(linha.concluido_em) }
      const decorrido = agora - Number(linha.iniciado_em)
      if (decorrido >= tetos.prazoMs) return { tipo: 'expirada' }
      if (tetos.espacosBloqueados.has(linha.espaco)) return { tipo: 'espaco-bloqueado' }
      if (decorrido < tetos.duracaoMinimaMs(linha.espaco)) return { tipo: 'cedo-demais' }

      const [c] = linhas<LinhaDeContagem>(await tx.execute(contagensDoDia(userId, dia, linha.espaco)))
      const limiteDoEspaco = tetos.limitePorEspaco[linha.espaco] ?? Number.POSITIVE_INFINITY
      const limiteDoMes = tetos.limitePorEspacoNoMes[linha.espaco] ?? Number.POSITIVE_INFINITY
      if (Number(c?.do_espaco_no_mes ?? 0) >= limiteDoMes) return { tipo: 'teto-do-mes' }
      if (
        Number(c?.pessoa ?? 0) >= tetos.limitePorPessoa ||
        Number(c?.total ?? 0) >= tetos.tetoGlobal ||
        Number(c?.do_espaco ?? 0) >= limiteDoEspaco
      ) {
        return { tipo: 'teto' }
      }

      const r = await tx.execute(sql`
        UPDATE anuncios_premiados SET concluido_em = ${agora}, dia = ${dia}
        WHERE user_id = ${userId} AND exibicao_id = ${exibicaoId} AND concluido_em IS NULL`)
      /* Sob as travas a linha não muda entre o SELECT e aqui; a condição é a segunda defesa. */
      if (linhasAfetadas(r) !== 1) throw new Error('anuncios_premiados: conclusão não gravada')
      return { tipo: 'creditada', espaco: linha.espaco, concluidoEm: agora }
    })
  },

  /** Quantas exibições do `espaco` a pessoa concluiu no mês UTC (`AAAA-MM`). */
  async concluidasNoMes(userId: UserId, espaco: string, mes: string): Promise<number> {
    const r = linhas<{ n: number }>(
      await db.execute(sql`
        SELECT count(*)::int AS n FROM anuncios_premiados
        WHERE user_id = ${userId} AND espaco = ${espaco} AND concluido_em IS NOT NULL
          AND dia >= ${`${mes}-01`} AND dia <= ${`${mes}-31`}`),
    )
    return Number(r[0]?.n ?? 0)
  },

  /**
   * A poda da limpeza diária: pendentes de mais de um dia (nunca mais creditam) e concluídas antes do mês
   * anterior (o teto é do dia e o bônus de nuvem, do mês). Teto de linhas por passada.
   */
  async podar(agora: number): Promise<number> {
    return linhasAfetadas(
      await db.execute(sql`DELETE FROM anuncios_premiados WHERE (user_id, exibicao_id) IN (
        SELECT user_id, exibicao_id FROM anuncios_premiados
        WHERE (concluido_em IS NULL AND iniciado_em < ${agora - DIA_MS})
           OR (concluido_em IS NOT NULL AND dia < ${inicioDoMesAnterior(agora)})
        LIMIT 5000 FOR UPDATE SKIP LOCKED)`),
    )
  },
}
