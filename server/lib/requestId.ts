/**
 * ID de correlação por request (rastreabilidade — Fase 5 da auditoria).
 *
 * O logger (`server/lib/logger.ts:19`) já previa o campo `requestId` na allowlist, mas nada
 * o produzia: cada linha de log era um evento solto, impossível de amarrar ao request que a
 * originou. Este middleware fecha essa lacuna.
 *
 * Aceita um id vindo de fora (`x-request-id`) para encadear com proxy/CDN, mas SANITIZA:
 * o valor entra em linha de log, então caractere de controle viraria injeção de log. Sem
 * header válido, gera um UUID.
 *
 * O id volta ao cliente no header `x-request-id` — é o que permite ao usuário reportar um
 * problema e o operador achar exatamente aquele request no log.
 */
import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

/** Só o alfabeto seguro para log; teto de 64 para não inflar a linha. */
const SAFE = /^[A-Za-z0-9._-]{1,64}$/

export function makeRequestId(incoming?: string | string[]): string {
  const raw = Array.isArray(incoming) ? incoming[0] : incoming
  if (typeof raw === 'string' && SAFE.test(raw)) return raw
  return randomUUID()
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = makeRequestId(req.headers['x-request-id'])
  req.requestId = id
  res.setHeader('x-request-id', id)
  next()
}
