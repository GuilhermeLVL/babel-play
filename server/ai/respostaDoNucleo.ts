/**
 * O NÚCLEO DE IA NO EXPRESS — a tradução da recusa em resposta HTTP (Fase F).
 *
 * O núcleo (`server/ai/nucleo/`) devolve a recusa como dado; aqui ela vira exatamente a resposta que
 * as rotas davam antes da Fase F: o cabeçalho `Retry-After` quando há espera, o status e o corpo. A
 * ordem (cabeçalho antes do status) e a guarda do `setHeader` são as de `responderNuvemOcupada` e de
 * `responderUsoJustoDoDia`: os testes de rota chamam os handlers com uma resposta falsa que às vezes
 * não tem `setHeader`.
 */
import type { Response } from 'express'

import type { RecusaDeIa } from './nucleo/recusa'

export function responderRecusa(res: Response, recusa: RecusaDeIa): void {
  if (recusa.retryAfterS !== undefined && typeof res.setHeader === 'function')
    res.setHeader('Retry-After', String(recusa.retryAfterS))
  res.status(recusa.status).json(recusa.corpo)
}
