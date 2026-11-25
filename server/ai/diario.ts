/**
 * O RETORNO DO DIÁRIO — `POST /api/ai/diario` (openspec `diario-com-correcao-que-vira-cartao`): o ADAPTADOR do Express
 * para `pedirRetornoDoDiario`. O modelo é `escrita.ts`.
 *
 * A regra mora no núcleo (`server/ai/nucleo/diario.ts`): a flag, o menor, os dados pessoais, os sinais de risco, o plano,
 * a cota, a retenção zero, o portão, a admissão e a cascata. Aqui fica o que é do HTTP: a flag antes de ler o corpo, o
 * plano (fail-closed: erro ao ler é 502) e a resposta.
 *
 * O CORPO DE SUCESSO: `{ retorno: { elogio, pontos: [{ trecho, tipo, dica, exemplo }], resolvidos: [] } }`. As recusas
 * vêm no envelope `{ error, code, detalhes? }`.
 */
import type { Request, Response } from 'express'

import { FLAG_DIARIO } from '../../src/core/planos'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { envelopeDeErro } from '../lib/respostaDeErro'
import { lerPedidoDoDiario, pedirRetornoDoDiario, type ResultadoDoDiario } from './nucleo/diario'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function diarioProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'diario')
  try {
    await pedirRetorno(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderDiario(res: Response, r: ResultadoDoDiario): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.setHeader('x-ia-modelo', r.modelo)
  res.json({ retorno: r.retorno })
}

async function pedirRetorno(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_DIARIO))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDoDiario(req.body)
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
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'diario_erro' })}` })
    return
  }

  await pedirRetornoDoDiario(
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
    { aoDecidir: (r) => responderDiario(res, r) },
  )
}
