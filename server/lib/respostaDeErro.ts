/**
 * UM ENVELOPE DE ERRO, e não nove (auditoria de 2026-09-07, achado A30).
 *
 * O QUE ESTAVA ERRADO. O servidor respondia erro em nove formas diferentes: `{ error: string }` na
 * maioria das rotas, `{ error: { code, message, requestId } }` no handler global — aninhado, e
 * portanto incompatível com quem lia `body.error` como texto —, e várias com campos avulsos no
 * topo (`preco`, `falta`, `saldo`, `usedBytes`, `capBytes`, `reason`, `entitlement`).
 *
 * A consequência não era estética. Nenhum arquivo em `src/` lia `code` nem `codigo`, e nenhum dos
 * campos avulsos chegava à interface: o servidor dizia "faltam 12 Seeds" ou "requer plano Pro" e a
 * tela mostrava uma mensagem genérica, porque o cliente não sabia onde procurar. Informação que o
 * servidor já tinha, e que resolveria a dúvida de quem está na tela, morria no transporte.
 *
 * O ENVELOPE:
 *
 *   { error: string, code?: string, detalhes?: Record<string, unknown> }
 *
 * `error` é sempre TEXTO — nunca objeto —, porque é o que todo consumidor já esperava e o que
 * qualquer tela consegue mostrar sem entender de códigos. `code` é o discriminador estável para a
 * tela decidir o que fazer. `detalhes` é onde vai o resto: um lugar só, em vez de campos avulsos
 * no topo que cada rota batizava do seu jeito.
 */
import type { Response } from 'express'

export interface EnvelopeDeErro {
  error: string
  code?: string
  detalhes?: Record<string, unknown>
}

/**
 * Monta o envelope. Existe como função (e não como literal em cada rota) porque foi a ausência de
 * um lugar único que produziu as nove formas.
 */
export function envelopeDeErro(error: string, code?: string, detalhes?: Record<string, unknown>): EnvelopeDeErro {
  const corpo: EnvelopeDeErro = { error }
  if (code) corpo.code = code
  if (detalhes && Object.keys(detalhes).length > 0) corpo.detalhes = detalhes
  return corpo
}

/** Responde no envelope. `res.status(...).json(envelopeDeErro(...))` escrito uma vez. */
export function responderErro(
  res: Response,
  status: number,
  error: string,
  code?: string,
  detalhes?: Record<string, unknown>,
): void {
  res.status(status).json(envelopeDeErro(error, code, detalhes))
}
