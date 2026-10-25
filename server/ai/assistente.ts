/**
 * O ASSISTENTE AO VIVO — `POST /api/ai/assistente/{expressoes,termos,como-respondo,correcao}`: o ADAPTADOR do Express
 * para `pedirAoAssistente` (spec `docs/specs/2026-10-25-assistente-ao-vivo.md`).
 *
 * A regra mora no núcleo (`server/ai/nucleo/assistenteAoVivo.ts`): a flag, o teto do dia, o menor, a retenção zero, o
 * portão, a admissão, a cota, a cascata e o custo. Aqui fica o que é do HTTP do app: o teto por minuto, ler o corpo,
 * resolver o plano (fail-closed: erro ao ler é 502), dar ao núcleo as flags DESTE request e responder.
 *
 * OS CORPOS DE SUCESSO (todos com `restanteHoje: number | null`; o modelo vai no cabeçalho `x-ia-modelo`):
 *   expressoes     `{ expressoes: [{ trecho, sentido, tipo }] }`
 *   termos         `{ termos: [{ termo, explicacao }] }`
 *   como-respondo  `{ sugestoes: [{ texto, traducao, tom }] }`
 *   correcao       `{ correcao: { ok, corrigida, dica } }`
 * As recusas vêm no envelope `{ error, code }`.
 *
 * O TETO POR MINUTO (`tetoDoAssistente`): 30 pedidos por minuto por conta, num balde PRÓPRIO no banco
 * (`METRIC_RATELIMIT_ASSISTENTE`). As glosas automáticas acompanham a legenda, que já gasta o balde caro de `/api/ai`
 * com a tradução de cada fala; dividir o balde cortaria a legenda (o mesmo A27 do feedback). Por isso o assistente
 * sai do limitador caro (`server/http/app.ts`) e tem o seu.
 */
import type { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'

import { FLAG_ASSISTENTE_AO_VIVO } from '../../src/core/planos'
import type { RecursoDoAssistente } from '../../src/lib/estudo/promptDoAssistente'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { chaveDoRequest, createDbRateLimitStore, METRIC_RATELIMIT_ASSISTENTE } from '../lib/rateLimitStore'
import { envelopeDeErro } from '../lib/respostaDeErro'
import { lerPedidoDoAssistente, pedirAoAssistente, type ResultadoDoAssistente } from './nucleo/assistenteAoVivo'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type FuncaoTelemetrada, type RastroDeIa } from './telemetriaDeIa'

/** Pedidos por minuto por conta, somando os quatro recursos. */
export const PEDIDOS_POR_MINUTO_DO_ASSISTENTE = 30

export const tetoDoAssistente = rateLimit({
  windowMs: 60_000,
  limit: PEDIDOS_POR_MINUTO_DO_ASSISTENTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: chaveDoRequest,
  store: createDbRateLimitStore(METRIC_RATELIMIT_ASSISTENTE),
  handler: (_req, res) => {
    res.status(429).json(envelopeDeErro('pedidos demais ao assistente em pouco tempo', 'assistente_demais'))
  },
})

const TELEMETRIA: Readonly<Record<RecursoDoAssistente, FuncaoTelemetrada>> = {
  expressoes: 'assistente-expressoes',
  termos: 'assistente-termos',
  comoRespondo: 'assistente-como-respondo',
  correcao: 'assistente-correcao',
}

function responder(res: Response, r: ResultadoDoAssistente): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.setHeader('x-ia-modelo', r.modelo)
  const { recurso: _recurso, ...corpo } = r.valor
  res.json({ ...corpo, restanteHoje: r.restanteHoje })
}

async function atender(recurso: RecursoDoAssistente, req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_ASSISTENTE_AO_VIVO))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDoAssistente(recurso, req.body, rastro)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }
  let entitlements
  let emTeste: boolean
  try {
    const resolvido = await resolverPlano(req.userId)
    entitlements = getEntitlements(resolvido.plano)
    emTeste = resolvido.teste !== null
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'assistente_erro' })}` })
    return
  }
  await pedirAoAssistente(
    {
      userId: req.userId,
      requestId: req.requestId,
      rastro,
      entitlements,
      emTeste,
      modo: 'plano',
      canal: 'app',
      perfilProtegido: null,
      flagLigada: (chave) => flagLigada(req, chave),
    },
    lido.pedido,
    { aoDecidir: (r) => responder(res, r) },
  )
}

/** O handler de um recurso (um por rota). */
export function rotaDoAssistente(recurso: RecursoDoAssistente) {
  return async (req: Request, res: Response, _next?: NextFunction): Promise<void> => {
    const rastro = abrirRastro(req, TELEMETRIA[recurso])
    try {
      await atender(recurso, req, res, rastro)
    } finally {
      rastro.encerrar(res.statusCode)
    }
  }
}
