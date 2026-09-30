/**
 * O TESTE DE 14 DIAS DO PREMIUM E A MARCA QUE IMPEDE REPETI-LO (C6, migração 0043).
 *
 * Dois escritos que precisam andar JUNTOS: a marca do e-mail (`marcas_de_teste`) e o teste da conta
 * (`testes_premium`). Marca sem teste gastaria o teste de alguém sem dar nada; teste sem marca deixaria
 * apagar a conta e recomeçar. Por isso o início é uma TRANSAÇÃO — uma das poucas do projeto, e cabe
 * aqui: é lógica condicional (a marca já existe?) num caminho frio, um toque por pessoa na vida da
 * conta (`db.ts` explica por que o caminho quente usa `batch`).
 *
 * A MARCA É A TRAVA: o INSERT com a PK da marca e `DO NOTHING` decide e grava numa instrução — duas
 * contas com o mesmo e-mail tocando ao mesmo tempo, só uma ganha.
 */
import { eq, lt } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db, emTransacao } from '../db'
import { marcasDeTeste, testesPremium } from '../schema'

export type TestePremium = typeof testesPremium.$inferSelect

export type InicioDoTeste =
  | { tipo: 'iniciado'; teste: TestePremium }
  /** A conta já tinha um teste (ativo ou vencido): nada muda. */
  | { tipo: 'ja_existia'; teste: TestePremium }
  /** O e-mail (a marca) já testou, noutra conta ou numa conta apagada: nada é gravado. */
  | { tipo: 'marca_usada' }

export const testesPremiumRepo = {
  /** O teste desta conta, ativo ou vencido; `null` se ela nunca testou. */
  async doUsuario(userId: UserId): Promise<TestePremium | null> {
    const rows = await db.select().from(testesPremium).where(eq(testesPremium.userId, userId)).limit(1)
    return rows[0] ?? null
  },

  async marcaExiste(marca: string): Promise<boolean> {
    const rows = await db
      .select({ marca: marcasDeTeste.marca })
      .from(marcasDeTeste)
      .where(eq(marcasDeTeste.marca, marca))
      .limit(1)
    return rows.length > 0
  },

  /** Começa o teste: a marca e o teste da conta, os dois ou nenhum. */
  async iniciar(userId: UserId, marca: string, inicio: number, fim: number): Promise<InicioDoTeste> {
    return emTransacao(async (tx) => {
      const existente = await tx.select().from(testesPremium).where(eq(testesPremium.userId, userId)).limit(1)
      if (existente[0]) return { tipo: 'ja_existia', teste: existente[0] }
      const marcou = await tx
        .insert(marcasDeTeste)
        .values({ marca, criadoEm: inicio })
        .onConflictDoNothing({ target: marcasDeTeste.marca })
      if (marcou.rowsAffected === 0) return { tipo: 'marca_usada' }
      const teste = { userId, iniciadoEm: inicio, terminaEm: fim }
      await tx.insert(testesPremium).values(teste)
      return { tipo: 'iniciado', teste }
    })
  },

  /** A retenção da marca: apaga as criadas antes de `antesDe`. Devolve quantas saíram. */
  async podarMarcas(antesDe: number): Promise<number> {
    const r = await db.delete(marcasDeTeste).where(lt(marcasDeTeste.criadoEm, antesDe))
    return r.rowsAffected
  },
}
