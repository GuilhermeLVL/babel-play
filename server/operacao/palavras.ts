/**
 * REINDEXAR AS PALAVRAS VISTAS — o índice derivado das falas (`palavras_vistas`, migração PG 0012).
 *
 *   node dist-server/operacao.cjs palavras reindexar                     # todas as sessões vivas
 *   node dist-server/operacao.cjs palavras reindexar --usuario <id>      # só as de uma conta
 *
 * Toda escrita em falas mantém o índice no mesmo lote; isto existe para o que veio ANTES da migração
 * (sessões sem nenhuma linha no índice) e para reparar um índice que se suspeite torto. Cada sessão é
 * reconstruída do zero (apaga as linhas dela e insere a contagem das falas vivas), 50 sessões por transação, com a trava do
 * usuário, então rodar de novo dá o mesmo estado — e o servidor pode continuar no ar enquanto roda.
 *
 * Comando consciente, e não job de cron: a passada inteira lê todas as falas de todas as contas, e só faz
 * sentido uma vez depois do deploy (ou num reparo).
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm'

import { db } from '../db/db'
import { palavrasVistasRepo } from '../db/repositories/palavrasVistas'
import { sessions } from '../db/schema'
import { asUserId } from '../lib/authContext'

export interface RelatorioDaReindexacao {
  sessoes: number
  usuarios: number
}

/** Sessões por página da varredura (por `id`, para recomeçar de onde parou sem OFFSET). */
const PAGINA = 500

export async function reindexarPalavrasVistas(opcoes: { usuario?: string } = {}): Promise<RelatorioDaReindexacao> {
  const usuarios = new Set<string>()
  let sessoes = 0
  let depoisDe = ''
  for (;;) {
    const pagina = await db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(
        and(
          isNull(sessions.deletedAt),
          opcoes.usuario ? eq(sessions.userId, opcoes.usuario) : isNotNull(sessions.userId),
          gt(sessions.id, depoisDe),
        ),
      )
      .orderBy(asc(sessions.id))
      .limit(PAGINA)
    if (!pagina.length) break
    const porUsuario = new Map<string, string[]>()
    for (const s of pagina) {
      if (!s.userId) continue
      porUsuario.set(s.userId, [...(porUsuario.get(s.userId) ?? []), s.id])
    }
    for (const [userId, ids] of porUsuario) {
      sessoes += await palavrasVistasRepo.reconstruirSessoes(asUserId(userId), ids)
      usuarios.add(userId)
    }
    depoisDe = pagina[pagina.length - 1].id
  }
  return { sessoes, usuarios: usuarios.size }
}

/** `palavras reindexar [--usuario <id>]`. Sai com 0, ou 2 em uso errado. */
export async function comandoDePalavras(args: string[]): Promise<number> {
  if (args[0] !== 'reindexar') {
    console.error('uso: operacao.cjs palavras reindexar [--usuario <id>]')
    return 2
  }
  const i = args.indexOf('--usuario')
  const usuario = i >= 0 ? args[i + 1] : undefined
  if (i >= 0 && !usuario) {
    console.error('uso: operacao.cjs palavras reindexar [--usuario <id>]')
    return 2
  }
  const r = await reindexarPalavrasVistas({ usuario })
  console.log(`palavras vistas reindexadas: ${r.sessoes} sessões de ${r.usuarios} conta(s)`)
  return 0
}
