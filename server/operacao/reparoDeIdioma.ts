/**
 * REPARO DO IDIOMA GRAVADO NO SERVIDOR — o mesmo plano do modo sem conta
 * (`src/core/texto/reparoDeIdioma.ts`), aplicado ao banco usuário a usuário.
 *
 *   node dist-server/operacao.cjs reparar-idiomas            # só MOSTRA o plano (padrão)
 *   node dist-server/operacao.cjs reparar-idiomas --aplicar  # grava
 *
 * Não é migração de schema: nenhuma coluna muda, só etiquetas de idioma em linhas existentes, e a
 * decisão depende de detecção de texto — coisa que SQL não faz. Por isso roda como comando
 * consciente, com ensaio antes. Nunca apaga: troca `source_lang`/`target_lang` de falas e sessões e
 * `src_lang`/`tgt_lang`/`norm_key` de cartões; cartão cuja chave nova já pertence a outro cartão vivo
 * fica como está (conflito relatado). Idempotente: rodar de novo, com os dados coerentes, não muda
 * nada.
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { and, eq, isNull } from 'drizzle-orm'

import { chaveDedup } from '../../src/core/texto/palavra'
import { planejarReparoDeIdioma, planoVazio } from '../../src/core/texto/reparoDeIdioma'
import { db } from '../db/db'
import { tuplaDeBatch } from '../db/lotes'
import { sessions, utterances, vocabCards } from '../db/schema'

export interface RelatorioDoReparo {
  usuarios: number
  falas: number
  cartoes: number
  sessoes: number
  conflitos: number
}

/** Planeja (e, com `aplicar`, grava) o reparo de UM usuário. */
async function repararUsuario(userId: string | null, aplicar: boolean): Promise<Omit<RelatorioDoReparo, 'usuarios'>> {
  const doDono = <T extends { userId: unknown; deletedAt: unknown }>(t: T) =>
    and(userId === null ? isNull(t.userId as never) : eq(t.userId as never, userId), isNull(t.deletedAt as never))
  const [ss, fs, cs] = await Promise.all([
    db.select({ id: sessions.id, sourceLang: sessions.sourceLang, targetLang: sessions.targetLang }).from(sessions).where(doDono(sessions)),
    db
      .select({ id: utterances.id, sessionId: utterances.sessionId, sourceLang: utterances.sourceLang, sourceText: utterances.sourceText })
      .from(utterances)
      .where(doDono(utterances)),
    db
      .select({
        id: vocabCards.id,
        word: vocabCards.word,
        sentence: vocabCards.sentence,
        srcLang: vocabCards.srcLang,
        tgtLang: vocabCards.tgtLang,
        sessionId: vocabCards.sessionId,
        normKey: vocabCards.normKey,
      })
      .from(vocabCards)
      .where(doDono(vocabCards)),
  ])
  const plano = planejarReparoDeIdioma({ sessoes: ss, falas: fs, cartoes: cs })
  const r = { falas: plano.falas.length, cartoes: 0, sessoes: plano.sessoes.length, conflitos: 0 }
  if (planoVazio(plano)) return r

  const donoDaChave = new Map(cs.map((c) => [c.normKey, c.id]))
  const palavraDe = new Map(cs.map((c) => [c.id, c.word]))
  const agora = Date.now()
  const instrucoes = []
  for (const t of plano.falas) {
    instrucoes.push(db.update(utterances).set({ sourceLang: t.para, updatedAt: agora }).where(eq(utterances.id, t.id)))
  }
  for (const t of plano.sessoes) {
    instrucoes.push(
      db.update(sessions).set({ sourceLang: t.sourcePara, targetLang: t.targetPara, updatedAt: agora }).where(eq(sessions.id, t.id)),
    )
  }
  for (const t of plano.cartoes) {
    const normKey = chaveDedup(palavraDe.get(t.id) ?? '', t.srcPara)
    const dono = donoDaChave.get(normKey)
    if (dono && dono !== t.id) {
      r.conflitos++
      continue
    }
    donoDaChave.set(normKey, t.id)
    r.cartoes++
    instrucoes.push(
      db.update(vocabCards).set({ srcLang: t.srcPara, tgtLang: t.tgtPara, normKey, updatedAt: agora }).where(eq(vocabCards.id, t.id)),
    )
  }
  if (aplicar && instrucoes.length) await db.batch(tuplaDeBatch(instrucoes))
  return r
}

export async function repararIdiomasNoBanco(opcoes: { aplicar: boolean }): Promise<RelatorioDoReparo> {
  const donos = await db.selectDistinct({ userId: sessions.userId }).from(sessions)
  const total: RelatorioDoReparo = { usuarios: 0, falas: 0, cartoes: 0, sessoes: 0, conflitos: 0 }
  for (const { userId } of donos) {
    const r = await repararUsuario(userId, opcoes.aplicar)
    if (r.falas || r.cartoes || r.sessoes || r.conflitos) total.usuarios++
    total.falas += r.falas
    total.cartoes += r.cartoes
    total.sessoes += r.sessoes
    total.conflitos += r.conflitos
  }
  return total
}
