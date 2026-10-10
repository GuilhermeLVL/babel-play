/**
 * O NÚCLEO DE IA NO EXPRESS — a tradução da recusa em resposta HTTP (Fase F).
 *
 * O núcleo (`server/ai/nucleo/`) devolve a recusa como dado; aqui ela vira exatamente a resposta que
 * as rotas davam antes da Fase F: o cabeçalho `Retry-After` quando há espera, o status e o corpo. A
 * ordem (cabeçalho antes do status) e a guarda do `setHeader` são as das respostas de antes
 * (`responderNuvemOcupada`, o 429 do uso justo): os testes de rota chamam os handlers com uma resposta
 * falsa que às vezes não tem `setHeader`.
 */
import type { Response } from 'express'

import { CODIGO_DE_CANCELAMENTO } from './cancelamento'
import type { RecusaDeIa } from './nucleo/recusa'

export function responderRecusa(res: Response, recusa: RecusaDeIa): void {
  /* O CLIENTE DESISTIU (`cancelamento.ts`): não há a quem responder. O status fica marcado para o
     rastro de telemetria e o log de acesso lerem 499 em vez de um 200 que ninguém recebeu. */
  if (recusa.code === CODIGO_DE_CANCELAMENTO) {
    if (!res.headersSent) res.statusCode = recusa.status
    return
  }
  if (recusa.retryAfterS !== undefined && typeof res.setHeader === 'function')
    res.setHeader('Retry-After', String(recusa.retryAfterS))
  res.status(recusa.status).json(recusa.corpo)
}
