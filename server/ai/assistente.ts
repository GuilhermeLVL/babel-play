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
 * O "COMO RESPONDO?" EM FLUXO: com `Accept: application/x-ndjson`, a resposta é NDJSON (um evento JSON por linha), e a
 * primeira sugestão sai assim que fecha no texto do modelo:
 *   {"tipo":"sugestao","sugestao":{texto,traducao,tom}}   — uma por sugestão, na ordem (já lida e limpa);
 *   {"tipo":"fim","sugestoes":[…],"restanteHoje":n}       — a lista final (a de sempre, lida do texto inteiro);
 *   {"tipo":"erro","code":"…","error":"…"}                — o fluxo falhou DEPOIS da primeira sugestão.
 * O status 200, o `Content-Type` e o `x-ia-modelo` saem com a primeira sugestão. Toda recusa ANTES dela (flag, plano,
 * cota, provedor fora, resposta inválida) é a resposta HTTP de sempre, com o status e o envelope. Sem o `Accept`, o
 * contrato antigo (o JSON inteiro), sem mudança nenhuma.
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
import { CODIGO_DE_CANCELAMENTO, sinalDoCliente } from './cancelamento'
import {
  type FluxoDoComoRespondo,
  lerPedidoDoAssistente,
  pedirAoAssistente,
  type ResultadoDoAssistente,
} from './nucleo/assistenteAoVivo'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type FuncaoTelemetrada, type RastroDeIa } from './telemetriaDeIa'

/** Pedidos por minuto por conta, somando os quatro recursos. */
export const PEDIDOS_POR_MINUTO_DO_ASSISTENTE = 30

/**
 * A FLAG ANTES DO TETO POR MINUTO: com o assistente desligado, o pedido é 404 sem contar no balde (e sem escrever no
 * banco). Montada antes de `tetoDoAssistente` em `server/routes/ai.ts`; o handler e o núcleo conferem de novo.
 */
export async function exigirFlagDoAssistente(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await flagLigada(req, FLAG_ASSISTENTE_AO_VIVO))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  next()
}

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

/** O tipo do "Como respondo?" em fluxo. */
export const TIPO_DO_FLUXO = 'application/x-ndjson'

/** Quem pediu aceita o fluxo? (só o "Como respondo?" tem fluxo) */
function querFluxo(recurso: RecursoDoAssistente, req: Request): boolean {
  if (recurso !== 'comoRespondo') return false
  const aceita = typeof req.header === 'function' ? req.header('accept') : req.headers?.accept
  return typeof aceita === 'string' && aceita.toLowerCase().includes(TIPO_DO_FLUXO)
}

/**
 * A RESPOSTA EM FLUXO: o cabeçalho sai com a primeira sugestão (`comecar`), cada evento é uma linha, e o resultado do
 * núcleo fecha o fluxo. Sem `no-transform`, o `compression` do Node seguraria os pedaços até o fim.
 */
function respostaEmFluxo(res: Response): { fluxo: FluxoDoComoRespondo; responder: (r: ResultadoDoAssistente) => void } {
  let comecou = false
  const escrever = (evento: Record<string, unknown>): void => {
    res.write(`${JSON.stringify(evento)}\n`)
    ;(res as Response & { flush?: () => void }).flush?.()
  }
  const comecar = (modelo: string): void => {
    comecou = true
    res.status(200)
    res.setHeader('Content-Type', `${TIPO_DO_FLUXO}; charset=utf-8`)
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('x-ia-modelo', modelo)
    res.flushHeaders?.()
  }
  return {
    fluxo: {
      aoComecar: (modelo) => comecar(modelo),
      aoSugerir: (sugestao) => escrever({ tipo: 'sugestao', sugestao }),
    },
    responder: (r) => {
      if (!comecou) {
        if (r.ok === false) {
          responderRecusa(res, r)
          return
        }
        /* Nada saiu em fluxo (a perna voltou ao caminho inteiro, sem `stream`): o mesmo fluxo, tudo de uma vez. */
        comecar(r.modelo)
        if (r.valor.recurso === 'comoRespondo')
          for (const sugestao of r.valor.sugestoes) escrever({ tipo: 'sugestao', sugestao })
      }
      if (r.ok === false) {
        /* Quem pediu desistiu: não há a quem escrever (o status do rastro fica 499, como em `responderRecusa`). */
        if (r.code === CODIGO_DE_CANCELAMENTO) {
          res.end()
          return
        }
        escrever({
          tipo: 'erro',
          code: r.code ?? 'provedor_indisponivel',
          error: r.corpo?.error ?? 'falha no assistente',
        })
      } else if (r.valor.recurso === 'comoRespondo') {
        escrever({ tipo: 'fim', sugestoes: r.valor.sugestoes, restanteHoje: r.restanteHoje })
      }
      res.end()
    },
  }
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
  const emFluxo = querFluxo(recurso, req) ? respostaEmFluxo(res) : null
  const sinal = emFluxo ? sinalDoCliente(res) : undefined
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
      /* Em fluxo, fechar a conexão (o Cancelar da folha) aborta a chamada ao provedor. */
      ...(sinal ? { sinal } : {}),
    },
    lido.pedido,
    { aoDecidir: (r) => (emFluxo ? emFluxo.responder(r) : responder(res, r)) },
    emFluxo?.fluxo,
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
