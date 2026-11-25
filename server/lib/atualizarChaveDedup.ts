/**
 * Mantém `versaoDaChaveDedup` em dia com a flag `chave_dedup_v2` (cache de 30 s das flags: uma consulta no máximo
 * a cada 30 s por processo). Falha de leitura NÃO muda a versão: o servidor segue com a que já tinha.
 */
import type { NextFunction, Request, Response } from 'express'

import { FLAG_CHAVE_DEDUP_V2 } from '../../src/core/planos'
import { definicoesDasFlags } from './flags'
import { log } from './logger'
import { definirVersaoDaChaveDedup } from './versaoDaChaveDedup'

export async function atualizarVersaoDaChaveDedup(): Promise<void> {
  try {
    const defs = await definicoesDasFlags()
    definirVersaoDaChaveDedup(defs.some((d) => d.chave === FLAG_CHAVE_DEDUP_V2 && d.habilitada) ? 2 : 1)
  } catch (e) {
    log('warn', { event: 'chave_dedup_flag_ilegivel', error: e instanceof Error ? e.message : String(e) })
  }
}

/** Middleware de `/api`: nunca recusa a requisição por causa da flag. */
export function versaoDaChaveNaRequisicao(_req: Request, _res: Response, next: NextFunction): void {
  void atualizarVersaoDaChaveDedup().finally(() => next())
}
