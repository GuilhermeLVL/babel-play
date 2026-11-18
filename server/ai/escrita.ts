/**
 * O RETORNO DA ESCRITA DA LEITURA ATIVA — `POST /api/ai/escrita` (openspec `leitura-ativa-textos-simples`): o
 * ADAPTADOR do Express para `pedirRetornoDaEscrita`.
 *
 * A regra mora no núcleo (`server/ai/nucleo/escrita.ts`): a flag, os dados pessoais, o plano, a cota, o menor, a
 * retenção zero, o portão, a admissão e a cascata. Aqui fica o que é do HTTP: a flag antes de ler o corpo, o plano
 * (fail-closed: erro ao ler é 502) e a resposta.
 *
 * O CORPO DE SUCESSO: `{ retorno: { elogio, pontos: [{ trecho, tipo, dica, exemplo }], resolvidos: [trechos] } }`.
 * As recusas vêm no envelope `{ error, code, detalhes? }`.
 */
import type { Request, Response } from 'express'

import { FLAG_LEITURA_ATIVA } from '../../src/core/planos'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { envelopeDeErro } from '../lib/respostaDeErro'
import { lerPedidoDeEscrita, pedirRetornoDaEscrita, type ResultadoDaEscrita } from './nucleo/escrita'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function escritaProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'escrita')
  try {
    await pedirRetorno(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderEscrita(res: Response, r: ResultadoDaEscrita): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.setHeader('x-ia-modelo', r.modelo)
  res.json({ retorno: r.retorno })
}

async function pedirRetorno(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_LEITURA_ATIVA))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDeEscrita(req.body)
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
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'escrita_erro' })}` })
    return
  }

  await pedirRetornoDaEscrita(
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
    { aoDecidir: (r) => responderEscrita(res, r) },
  )
}
