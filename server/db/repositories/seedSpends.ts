import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, like, sql, sum } from 'drizzle-orm'
import { db } from '../db'
import { seedSpends } from '../schema'
import type { UserId } from '../../lib/authContext'

export type SeedSpend = typeof seedSpends.$inferSelect

export interface NewSeedSpend {
  /** Gerado pelo CLIENTE antes de enviar. É a chave da idempotência. */
  spendId: string
  amount: number
  reason: string
  ref?: string
}

/**
 * GASTOS DE SEEDS. A metade que faltava para a moeda existir — ver o comentário de `seed_spends`
 * em `schema.ts` para o porquê de o ganho poder ser derivado e o gasto não.
 */
export const seedSpendsRepo = {
  /**
   * Debita — UMA vez por `spendId`.
   *
   * O duplo-clique é o caso comum, não o exótico: o botão que gasta fica numa tela de fim de
   * rodada, onde a pessoa está clicando rápido. Sem idempotência, o segundo clique cobraria de
   * novo por uma coisa que já foi entregue. Consulta antes de inserir em vez de depender do erro
   * de UNIQUE: assim o reenvio devolve 200 com a linha original, e quem chamou não precisa
   * distinguir "já debitei" de "falhou".
   */
  async debitar(
    userId: UserId,
    input: NewSeedSpend,
    opts: { tetoDeGasto?: number } = {},
  ): Promise<{ linha: SeedSpend | null; jaExistia: boolean; recusadoPorSaldo: boolean }> {
    // Idempotência POR usuário: a mesma (userId, spendId) é o mesmo débito, não uma segunda
    // cobrança. O INSERT é a própria checagem — `uq_seed_spends_user_spend` (migração 0005)
    // arbitra quem venceu. Antes era select-then-insert contra um unique GLOBAL de spend_id,
    // então dois cliques simultâneos podiam cobrar duas vezes e, pior, o id do usuário A
    // barrava o gasto de B (auditoria P1-5).
    const now = Date.now()
    const row: typeof seedSpends.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      spendId: input.spendId,
      /* Piso em zero e inteiro: um `amount` negativo viraria um ganho pela porta dos fundos, e a
         única forma de ganhar seeds é fazendo o trabalho. */
      amount: Math.max(0, Math.round(input.amount)),
      reason: input.reason,
      ref: input.ref ?? null,
    }
    // SQL cru aqui de propósito. `uq_seed_spends_user_spend` é um índice PARCIAL (só linhas
    // vivas) e o SQLite exige que o alvo do ON CONFLICT repita o predicado. O builder do
    // drizzle 0.45 emite `... do nothing where …`, com o predicado DEPOIS do `do nothing` —
    // SQL inválido. Uma instrução, mesma atomicidade, alvo correto.
    /**
     * O TETO ENTRA NO PRÓPRIO INSERT — é assim que a corrida se fecha.
     *
     * A rota conferia o saldo com um SELECT e inseria depois. Entre as duas coisas cabe outra
     * requisição: duas compras diferentes em voo passavam as duas pela conferência e o saldo
     * estourava (o furo estava documentado em `routes/metrics.ts` e agora está fechado).
     *
     * A alternativa óbvia — rodar `computeProfile` dentro de uma transação — custaria caro e
     * serializaria o banco inteiro: são cinco varreduras de tabela seguradas por uma transação de
     * escrita. Aqui o `teto` (as Seeds GANHAS) é calculado FORA e o INSERT só acontece se o
     * gasto já lançado mais este couberem nele. Ganho só cresce, então um teto calculado há
     * milissegundos é conservador: no pior caso recusa uma compra que teria passado, e o retry
     * seguinte passa. O oposto — cobrar além do saldo — não pode acontecer.
     *
     * `INSERT ... SELECT ... WHERE` e não `INSERT ... VALUES`: a condição precisa ser avaliada
     * pelo SQLite no momento da escrita, dentro da mesma instrução.
     */
    const teto = opts.tetoDeGasto
    const r = teto === undefined
      ? await db.run(sql`
        INSERT INTO ${seedSpends} (id, created_at, updated_at, user_id, spend_id, amount, reason, ref)
        VALUES (${row.id}, ${row.createdAt}, ${row.updatedAt}, ${row.userId}, ${row.spendId}, ${row.amount}, ${row.reason}, ${row.ref})
        ON CONFLICT (user_id, spend_id) WHERE deleted_at IS NULL DO NOTHING
      `)
      : await db.run(sql`
        INSERT INTO ${seedSpends} (id, created_at, updated_at, user_id, spend_id, amount, reason, ref)
        SELECT ${row.id}, ${row.createdAt}, ${row.updatedAt}, ${row.userId}, ${row.spendId}, ${row.amount}, ${row.reason}, ${row.ref}
        WHERE (
          SELECT COALESCE(SUM(amount), 0) FROM ${seedSpends}
          WHERE user_id = ${row.userId} AND deleted_at IS NULL
        ) + ${row.amount} <= ${Math.floor(teto)}
        ON CONFLICT (user_id, spend_id) WHERE deleted_at IS NULL DO NOTHING
      `)

    /* 0 linhas afetadas agora tem DUAS causas: já existia (viva), ou o teto barrou. Quem
       distingue é a releitura abaixo — a linha existe no primeiro caso e não no segundo. */
    const naoInseriu = Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0
    // P2-N2: este SELECT não filtrava `deletedAt` enquanto `totalGasto()` filtrava. Um gasto
    // soft-deletado devolvia `jaExistia: true` (não cobrava de novo) E não contava no saldo —
    // ou seja, a compra saía de graça. As duas queries precisam concordar sobre o que existe.
    const rows = await db
      .select()
      .from(seedSpends)
      .where(and(eq(seedSpends.spendId, input.spendId), eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
      .limit(1)
    if (!rows[0]) {
      /* Sem linha e sem inserção: o teto recusou. Não é erro de gravação — é saldo insuficiente,
         e quem chamou responde 402 com o mesmo corpo da conferência antecipada. */
      if (naoInseriu && teto !== undefined) return { linha: null, jaExistia: false, recusadoPorSaldo: true }
      throw new Error('falha ao gravar gasto de seeds')
    }
    return { linha: rows[0], jaExistia: naoInseriu, recusadoPorSaldo: false }
  },

  /**
   * ESTE GASTO JÁ FOI COBRADO? A conferência de saldo (`/seeds/gastar`) precisa saber, porque o
   * reenvio de uma compra já paga NÃO pode ser recusado por saldo: quem gastou as últimas 40
   * Seeds veria o retry da própria compra virar 402, e a idempotência deixaria de ser idempotente.
   */
  async jaGastou(userId: UserId, spendId: string): Promise<boolean> {
    const r = await db
      .select({ id: seedSpends.id })
      .from(seedSpends)
      .where(and(eq(seedSpends.spendId, spendId), eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
      .limit(1)
    return r.length > 0
  },

  /**
   * OS APRIMORAMENTOS COMPRADOS, derivados do log — como a posse da Loja já era.
   *
   * O nível de cada aprimoramento vivia só em `localStorage` (`babel.aprimoramentos`): o gasto
   * era gravado com `reason = 'aprimoramento:<alvo>:<n>'` e NADA lia de volta. Um usuário que
   * editasse a chave ficava com Nv.3 em tudo, invisível ao servidor, e trocar de navegador
   * perdia o que foi pago de verdade. Contar os degraus pagos resolve os dois.
   */
  async aprimoramentosComprados(userId: UserId): Promise<Record<string, number>> {
    const linhas = await db
      .select({ reason: seedSpends.reason })
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt), like(seedSpends.reason, 'aprimoramento:%')))
    const porAlvo: Record<string, number> = {}
    for (const l of linhas) {
      const [, alvo, n] = l.reason.split(':')
      const nivel = Number(n)
      if (!alvo || !Number.isInteger(nivel)) continue
      // O NÍVEL é o maior degrau pago, não a contagem: um degrau reenviado é o mesmo degrau.
      porAlvo[alvo] = Math.max(porAlvo[alvo] ?? 0, nivel)
    }
    return porAlvo
  },

  /** O total gasto. É o que `deriveProgress` subtrai do ganho para chegar ao saldo. */
  async totalGasto(userId: UserId): Promise<number> {
    const r = await db
      .select({ total: sum(seedSpends.amount) })
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
    return Number(r[0]?.total ?? 0)
  },

  /**
   * A POSSE DA LOJA, derivada do razão de gastos (economia-de-creditos 1.2 / brecha B4).
   *
   * A compra sempre foi evento no servidor (`reason: 'loja:<itemId>'`); o que faltava era o
   * caminho de VOLTA — o cliente confiava só no `localStorage`, que some com o navegador e
   * se edita no DevTools. Não há tabela nova: inventário É o log de compras, a mesma regra
   * "saldo por eventos, nunca saldo mutável" da spec.
   */
  async itensComprados(userId: UserId): Promise<string[]> {
    const rows = await db
      .select({ reason: seedSpends.reason })
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt), like(seedSpends.reason, 'loja:%')))
    return [...new Set(rows.map((r) => r.reason.slice('loja:'.length)).filter(Boolean))]
  },

  /**
   * OS CROMAS COMPRADOS — mesma derivação de `itensComprados`, outro prefixo.
   *
   * Croma é cor comprada com a moeda de estudo, e por isso segue a regra que a brecha B4
   * estabeleceu: quem guarda a posse é o razão de eventos, não o navegador. O id devolvido é o
   * mesmo que o cliente usa (`croma:<item>:<matiz>`), então a hidratação é uma união direta.
   */
  async cromasComprados(userId: UserId): Promise<string[]> {
    const rows = await db
      .select({ reason: seedSpends.reason })
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt), like(seedSpends.reason, 'croma:%')))
    return [...new Set(rows.map((r) => r.reason).filter(Boolean))]
  },

  async listar(userId: UserId, limite = 50): Promise<SeedSpend[]> {
    return db
      .select()
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
      .orderBy(desc(seedSpends.createdAt))
      .limit(limite)
  },
}
