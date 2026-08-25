import type { Request, Response } from 'express'
import { sql } from 'drizzle-orm'
import { db } from '../db/db'
import { bootStatus } from '../lib/bootStatus'
import { log } from '../lib/logger'

/**
 * GET /api/health — status do servidor, conectividade do banco e integridade do BOOT.
 *
 * P2-5: migração e backfill do boot falhavam com `console.warn` e o servidor subia assim
 * mesmo, sem nenhum sinal externo. Agora um passo de boot que falhou deixa a probe em 503 —
 * é o que um orquestrador consegue enxergar. Só o NOME do passo é exposto; a mensagem do
 * erro fica no log (não vaza caminho nem detalhe de infra).
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const boot = bootStatus()
  const bootPayload = boot.ok
    ? { boot: 'ok' as const }
    : { boot: 'degraded' as const, bootErros: boot.erros.map((e) => e.passo) }

  try {
    // P1-N2: era só `SELECT 1`, que funciona com o SCHEMA INTEIRO faltando. Medido na
    // re-auditoria: com a tabela `sessions` ausente, toda escrita devolvia 400 e o health
    // respondia 200 — o orquestrador manteria a réplica quebrada no balanceador.
    // Sondar uma tabela real custa o mesmo e detecta o caso.
    await db.run(sql`SELECT 1 FROM sessions LIMIT 1`)
    if (!boot.ok) {
      res.status(503).json({ status: 'degraded', db: 'up', ...bootPayload, at: Date.now() })
      return
    }
    res.json({ status: 'ok', db: 'up', ...bootPayload, at: Date.now() })
  } catch (err) {
    // Detalhe do erro só no log do servidor — a resposta não vaza caminho/driver do banco.
    // `db: 'down'` cobre os dois casos (inacessível e schema quebrado); distinguir na
    // resposta pública diria a um estranho o que exatamente está faltando.
    // F5-04: pelo logger, para chegar a um sink externo. Banco fora do ar é o evento que mais
    // precisa acordar alguém, e era o que só existia como texto no stdout.
    log('error', { event: 'health_db_indisponivel', route: '/api/health', status: 503, error: String(err).slice(0, 300) })
    res.status(503).json({ status: 'degraded', db: 'down', ...bootPayload })
  }
}
