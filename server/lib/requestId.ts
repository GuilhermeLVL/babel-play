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
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * POR QUE O ID PASSOU A VIAJAR NUM `AsyncLocalStorage` (Fase 5 da rodada de saneamento).
 *
 * O id existia e quase nunca aparecia. Medido em 2026-09-09, varrendo `server/**` + `server.ts`
 * e descontando comentários: das **45** chamadas de `log()`, **23 não passavam `requestId`** —
 * metade exata do diário. E a distribuição diz por que isso não se resolve pedindo disciplina:
 * `server/lib/storageQuota.ts` (4), `server/lib/usageQuota.ts` (5), `server/lib/bootStatus.ts`
 * (3), `server/lib/entitlements.ts`, `server/db/repositories/credentials.ts` — nenhum deles TEM
 * um `Request` em mãos. Para passar o id à mão, o parâmetro teria de atravessar a assinatura de
 * toda a camada de domínio até a função-folha, só para carregar telemetria.
 *
 * `AsyncLocalStorage` (node:async_hooks) resolve isso pelo lado certo: o middleware abre um
 * contexto que acompanha a cadeia de `await` do request inteiro, e `log()` (server/lib/logger.ts)
 * lê o id de lá sozinho. NENHUM chamador muda, e as 23 linhas passam a ser correlacionáveis.
 *
 * O QUE FOI RECUSADO, e por quê:
 *
 *   - `req.requestId` propagado por parâmetro: é o que já existia, e é justamente o que produziu
 *     50% de adesão. Uma disciplina que precisa ser lembrada em cada chamada nova não é uma
 *     garantia, é uma estatística.
 *   - variável de módulo (`let idAtual`): funciona num teste e mente sob concorrência — dois
 *     requests em voo compartilhariam a mesma célula e o log atribuiria a linha ao request errado.
 *     Pior que não ter id, porque parece certo.
 *
 * O EXPLÍCITO CONTINUA GANHANDO: quem passa `requestId` na chamada tem o seu valor respeitado
 * (é o caso do worker/scheduler que quer carimbar um id sintético). O implícito só preenche o
 * vazio.
 *
 * CUSTO: o `AsyncLocalStorage` moderno (Node ≥ 20) é uma variável do contexto assíncrono, não o
 * `async_hooks` completo — não liga o rastreamento global que degradava o V8 nas versões antigas.
 * O contexto é UM objeto por request, coletado com ele.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'

/** Só o alfabeto seguro para log; teto de 64 para não inflar a linha. */
const SAFE = /^[A-Za-z0-9._-]{1,64}$/

export function makeRequestId(incoming?: string | string[]): string {
  const raw = Array.isArray(incoming) ? incoming[0] : incoming
  if (typeof raw === 'string' && SAFE.test(raw)) return raw
  return randomUUID()
}

/**
 * O contexto do request em curso.
 *
 * É um objeto (e não a string direta) porque o que precisa viajar com o request vai crescer —
 * `route` e `userId` são os próximos candidatos, e trocar o TIPO do contexto depois obrigaria a
 * mexer em todo mundo que o lê. Com um objeto, um campo novo é aditivo.
 */
export interface ContextoDoRequest {
  requestId: string
}

const contexto = new AsyncLocalStorage<ContextoDoRequest>()

/**
 * O id do request em curso, ou `undefined` fora do ciclo de um request.
 *
 * `undefined` é a resposta CERTA no boot, no cron e no worker do cluster: inventar um id ali faria
 * o operador procurar por uma requisição que nunca existiu.
 */
export function requestIdAtual(): string | undefined {
  return contexto.getStore()?.requestId
}

/**
 * Roda `fn` dentro de um contexto com o id dado. Existe para o teste (e para qualquer trabalho
 * fora de HTTP que queira se correlacionar) sem precisar subir um servidor.
 */
export function comRequestId<T>(id: string, fn: () => T): T {
  return contexto.run({ requestId: id }, fn)
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = makeRequestId(req.headers['x-request-id'])
  req.requestId = id
  res.setHeader('x-request-id', id)
  /* `run` e não `enterWith`: `enterWith` contamina o contexto do TICK inteiro, inclusive do que
     vier depois do request no mesmo tick do event loop. `run` fecha o escopo em volta do resto da
     cadeia de middlewares, que é exatamente o ciclo que se quer marcar. */
  contexto.run({ requestId: id }, next)
}
