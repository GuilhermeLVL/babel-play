/**
 * Error handler global do Express — achado D7 da auditoria, aberto desde 2026-08-13.
 *
 * O QUE ELE CONSERTA. Cada rota tem `try/catch` com `erroDeRota`, mas não existia
 * `app.use((err, req, res, next) => …)`. E há rotas SEM `try/catch` — `sessions.ts:151` e todo o
 * `admin.ts`. No Express 4 (que é o deste projeto; o 5 mudou isso), a rejeição de um handler
 * `async` **não** vira 500: ela vira uma promise rejeitada que ninguém trata, e o request fica
 * **PENDURADO** até o cliente desistir. Do lado do usuário é uma tela girando para sempre; do
 * lado do servidor é uma conexão que não fecha.
 *
 * DUAS PEÇAS, e as duas são necessárias:
 *
 *   `capturarAssincrono` embrulha o roteador para que uma rejeição vire `next(err)` — sem isso o
 *   handler abaixo nunca é chamado, porque o Express 4 não encaminha rejeição de promise.
 *
 *   `erroGlobal` é a rede final: loga com a cadeia de causas (o mesmo tratamento de `erroDeRota`,
 *   porque a mensagem útil do SQLite mora em `cause`) e responde 500 com envelope estável.
 *
 * O QUE ELE NÃO FAZ: substituir os `try/catch` das rotas. Eles continuam sendo o caminho certo,
 * porque sabem devolver 400/404 com mensagem específica. Isto é o que sobra quando eles falham ou
 * não existem.
 */
import type { NextFunction, Request, Response, Router } from 'express'

import { cadeiaDeCausas } from './cadeiaDeCausas'
import { log } from './logger'
import { envelopeDeErro } from './respostaDeErro'

/**
 * Embrulha um router para que rejeição de handler `async` vire `next(err)`.
 *
 * Sem isto o `erroGlobal` seria decorativo: o Express 4 simplesmente não encaminha promise
 * rejeitada, e o request pendura antes de chegar a qualquer handler de erro.
 */
export function capturarAssincrono(router: Router): Router {
  const camadas = (router as unknown as { stack?: Array<{ route?: { stack: Array<{ handle: unknown }> } }> }).stack
  if (!Array.isArray(camadas)) return router

  for (const camada of camadas) {
    const pilha = camada.route?.stack
    if (!Array.isArray(pilha)) continue
    for (const item of pilha) {
      const original = item.handle as (req: Request, res: Response, next: NextFunction) => unknown
      if (typeof original !== 'function' || original.length > 3) continue
      item.handle = (req: Request, res: Response, next: NextFunction) => {
        try {
          const r = original(req, res, next)
          // `Promise.resolve` cobre tanto `async function` quanto retorno de thenable.
          if (r && typeof (r as Promise<unknown>).catch === 'function') {
            ;(r as Promise<unknown>).catch(next)
          }
        } catch (err) {
          next(err)
        }
      }
    }
  }
  return router
}

/**
 * O handler final. A assinatura de 4 argumentos é o que faz o Express reconhecê-lo como handler
 * de erro — remover o `_next` o transformaria num middleware comum, em silêncio.
 */
export function erroGlobal(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const causa = cadeiaDeCausas(err, ' <- ')
  log('error', {
    event: 'erro_nao_tratado',
    route: req.path,
    status: 500,
    error: causa.slice(0, 300),
    // Mesma decisão de `erroDeRota`, pelo mesmo motivo medido: o stack entra na linha JSON,
    // redigido por `log()`, em vez de sair num dump ao lado que a allowlist não alcança.
    stack: `${causa}${err instanceof Error && err.stack ? `\n${err.stack}` : ''}`.slice(0, 1200),
    requestId: (req as Request & { requestId?: string }).requestId,
  })
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[erro_nao_tratado] ${req.method} ${req.path}`, err)
  }

  // Resposta já iniciada: só encerrar. Escrever de novo estouraria ERR_HTTP_HEADERS_SENT e
  // trocaria um erro por outro.
  if (res.headersSent) {
    res.end()
    return
  }

  /**
   * O MESMO ENVELOPE DE TODO MUNDO (auditoria de 2026-09-07, achado A30).
   *
   * Aqui o erro vinha ANINHADO — `{ error: { code, message, requestId } }` — enquanto todas as
   * outras rotas respondem `{ error: string }`. Quem lia `body.error` esperando texto recebia um
   * objeto e mostrava `[object Object]`, ou nada. Era o único handler que o cliente não sabia ler,
   * e justamente o que responde quando algo inesperado acontece.
   *
   * Nunca a causa no `error`: ela carrega nome de coluna, caminho de arquivo e às vezes o valor
   * que falhou. Quem investiga usa o `requestId` para achar a linha no log.
   */
  res
    .status(500)
    .json(
      envelopeDeErro('erro interno', 'erro_interno', {
        requestId: (req as Request & { requestId?: string }).requestId ?? null,
      }),
    )
}
