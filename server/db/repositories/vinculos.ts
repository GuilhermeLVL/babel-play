/**
 * VÍNCULO COM O RESPONSÁVEL (migração 0028, Fase 4 — ECA Digital art. 24 e LGPD art. 14).
 *
 * Uma linha nasce CONVITE (o menor informa o e-mail do responsável; guardamos só o HASH de um
 * token de uso único, com expiração) e vira VÍNCULO quando um adulto logado aceita. O aceite é UMA
 * instrução condicional (`UPDATE ... WHERE usado_em IS NULL AND expira_em > agora`): duas abas
 * aceitando ao mesmo tempo não viram dois vínculos, e um token usado não serve de novo.
 *
 * Escopo: o `userId` da linha é o MENOR (titular). As leituras cruzadas (o responsável listando os
 * menores vinculados a ele, o aceite pelo token) são as ÚNICAS consultas por outra coluna, e cada
 * uma só devolve o que aquele papel precisa ver.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { and, desc, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { idadesDeclaradas, users, vinculosDeResponsavel } from '../schema'

export type Vinculo = typeof vinculosDeResponsavel.$inferSelect

/** Validade do convite: uma semana é tempo de o responsável abrir o e-mail sem deixar link vivo para sempre. */
export const VALIDADE_DO_CONVITE_MS = 7 * 86_400_000

export const hashDoToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export interface Aceite {
  responsavelUserId: UserId
  nomeDoResponsavel: string
  consentimento: { versao: string; texto: string } | null
}

export const vinculosRepo = {
  /**
   * Cria um convite e devolve o TOKEN em claro (só existe aqui e no link).
   *
   * NÃO revoga os anteriores: isso só acontece depois que o e-mail SAIU (`substituirAnteriores`).
   * Se o envio falhar, o convite novo é descartado (`descartar`) e o que já estava na caixa do
   * responsável continua valendo — revogar antes faria uma falha do provedor de e-mail invalidar
   * um convite que funcionava.
   */
  async convidar(
    menor: UserId,
    email: string,
    agora = Date.now(),
  ): Promise<{ id: string; token: string; expiraEm: number }> {
    const id = randomUUID()
    const token = randomBytes(32).toString('base64url')
    const expiraEm = agora + VALIDADE_DO_CONVITE_MS
    await db.insert(vinculosDeResponsavel).values({
      id,
      createdAt: agora,
      updatedAt: agora,
      userId: menor,
      emailDoResponsavel: email,
      tokenHash: hashDoToken(token),
      expiraEm,
    })
    return { id, token, expiraEm }
  },

  /** O convite `id` saiu: os outros pendentes do mesmo menor são revogados — vale só o último. */
  async substituirAnteriores(menor: UserId, id: string, agora = Date.now()): Promise<void> {
    await db
      .update(vinculosDeResponsavel)
      .set({ revogadoEm: agora, updatedAt: agora })
      .where(
        and(
          eq(vinculosDeResponsavel.userId, menor),
          ne(vinculosDeResponsavel.id, id),
          isNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
        ),
      )
  },

  /**
   * O convite `id` NÃO saiu (o e-mail falhou): apaga a linha. DELETE físico, e não revogação,
   * porque o convite nunca existiu para ninguém — e a linha carrega o e-mail de um terceiro que
   * não há motivo para guardar (LGPD, necessidade). Também é o que tira a tentativa do limite.
   */
  async descartar(menor: UserId, id: string): Promise<void> {
    await db
      .delete(vinculosDeResponsavel)
      .where(
        and(
          eq(vinculosDeResponsavel.userId, menor),
          eq(vinculosDeResponsavel.id, id),
          isNull(vinculosDeResponsavel.usadoEm),
        ),
      )
  },

  /** Quantos convites este menor criou desde `desde` (todos os estados) — a base do limite diário. */
  async convitesDesde(menor: UserId, desde: number): Promise<number> {
    const [r] = await db
      .select({ n: sql<number>`count(*)` })
      .from(vinculosDeResponsavel)
      .where(and(eq(vinculosDeResponsavel.userId, menor), gt(vinculosDeResponsavel.createdAt, desde)))
    return Number(r?.n ?? 0)
  },

  /** O convite pelo token (qualquer estado) — quem decide o que ele permite é o chamador. */
  async porToken(token: string): Promise<Vinculo | null> {
    const rows = await db
      .select()
      .from(vinculosDeResponsavel)
      .where(eq(vinculosDeResponsavel.tokenHash, hashDoToken(token)))
      .limit(1)
    return rows[0] ?? null
  },

  /**
   * ACEITA o convite numa instrução só. `false` = alguém usou antes, expirou ou foi revogado no
   * meio do caminho — o chamador responde 410.
   */
  async aceitar(token: string, aceite: Aceite, agora = Date.now()): Promise<boolean> {
    const r = await db
      .update(vinculosDeResponsavel)
      .set({
        usadoEm: agora,
        updatedAt: agora,
        responsavelUserId: aceite.responsavelUserId,
        nomeDoResponsavel: aceite.nomeDoResponsavel,
        consentimentoVersao: aceite.consentimento?.versao ?? null,
        consentimentoTexto: aceite.consentimento?.texto ?? null,
        consentimentoEm: aceite.consentimento ? agora : null,
      })
      .where(
        and(
          eq(vinculosDeResponsavel.tokenHash, hashDoToken(token)),
          isNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
          gt(vinculosDeResponsavel.expiraEm, agora),
        ),
      )
    return r.rowsAffected > 0
  },

  /** O vínculo ACEITO e vivo do menor (o mais recente). */
  async aceitoDoMenor(menor: UserId): Promise<Vinculo | null> {
    const rows = await db
      .select()
      .from(vinculosDeResponsavel)
      .where(
        and(
          eq(vinculosDeResponsavel.userId, menor),
          isNotNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
          isNull(vinculosDeResponsavel.deletedAt),
        ),
      )
      .orderBy(desc(vinculosDeResponsavel.usadoEm))
      .limit(1)
    return rows[0] ?? null
  },

  /** O convite ainda pendente (não usado, não revogado, não expirado). */
  async pendenteDoMenor(menor: UserId, agora = Date.now()): Promise<Vinculo | null> {
    const rows = await db
      .select()
      .from(vinculosDeResponsavel)
      .where(
        and(
          eq(vinculosDeResponsavel.userId, menor),
          isNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
          gt(vinculosDeResponsavel.expiraEm, agora),
        ),
      )
      .orderBy(desc(vinculosDeResponsavel.createdAt))
      .limit(1)
    return rows[0] ?? null
  },

  /** O responsável `resp` está vinculado (aceito, vivo) ao menor `menor`? */
  async ehResponsavelDe(resp: UserId, menor: UserId): Promise<boolean> {
    const rows = await db
      .select({ id: vinculosDeResponsavel.id })
      .from(vinculosDeResponsavel)
      .where(
        and(
          eq(vinculosDeResponsavel.userId, menor),
          eq(vinculosDeResponsavel.responsavelUserId, resp),
          isNotNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
          isNull(vinculosDeResponsavel.deletedAt),
        ),
      )
      .limit(1)
    return rows.length > 0
  },

  /** Os menores vinculados a este responsável — só o que a tela dele mostra. */
  async menoresDoResponsavel(
    resp: UserId,
  ): Promise<Array<{ menorId: string; nome: string | null; nascimento: string | null; desde: number | null }>> {
    const rows = await db
      .select({
        menorId: vinculosDeResponsavel.userId,
        desde: vinculosDeResponsavel.usadoEm,
        nome: users.displayName,
        nascimento: idadesDeclaradas.nascimento,
      })
      .from(vinculosDeResponsavel)
      .leftJoin(users, eq(users.id, vinculosDeResponsavel.userId))
      .leftJoin(idadesDeclaradas, eq(idadesDeclaradas.userId, vinculosDeResponsavel.userId))
      .where(
        and(
          eq(vinculosDeResponsavel.responsavelUserId, resp),
          isNotNull(vinculosDeResponsavel.usadoEm),
          isNull(vinculosDeResponsavel.revogadoEm),
          isNull(vinculosDeResponsavel.deletedAt),
        ),
      )
    return rows
      .filter((r): r is typeof r & { menorId: string } => !!r.menorId)
      .map((r) => ({ menorId: r.menorId, nome: r.nome ?? null, nascimento: r.nascimento ?? null, desde: r.desde }))
  },
}
