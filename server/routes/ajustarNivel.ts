/**
 * AJUSTAR NÍVEL — `POST /api/leitura/ajustar-nivel` (openspec `leitura-assistida`, fatia D): o ADAPTADOR do Express para o
 * núcleo `server/ai/nucleo/ajustarNivel.ts`. A regra (flag, plano, cota, menor, retenção zero, 2 chamadas no máximo, filtro de
 * saída) mora no núcleo; aqui fica o HTTP: a flag antes de ler o corpo, o plano (fail-closed: erro ao ler é 502) e a resposta.
 *
 * O CORPO DE SUCESSO: `{ ajustado, nivelMedido, confianciaDaMedida, conhecidasTrocadas, foraDoNivel, reescrito, custo }`, com o
 * modelo no cabeçalho `x-ia-modelo`. Recusas no envelope `{ error, code, detalhes? }`. Nada do texto é guardado.
 */
import type { Request, Response } from 'express'
import { Router } from 'express'

import { FLAG_IA_AJUSTAR_NIVEL } from '../../src/core/planos'
import { ajustarNivel, lerPedidoDeAjuste, type ResultadoDoAjuste } from '../ai/nucleo/ajustarNivel'
import { responderRecusa } from '../ai/respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from '../ai/telemetriaDeIa'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { envelopeDeErro } from '../lib/respostaDeErro'

export const ajustarNivelRouter = Router()

ajustarNivelRouter.post('/', async (req: Request, res: Response) => {
  const rastro = abrirRastro(req, 'ajustar-nivel')
  try {
    await pedir(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
})

function responder(res: Response, r: ResultadoDoAjuste): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  const { modelo, ok: _ok, ...corpo } = r
  res.setHeader('x-ia-modelo', modelo)
  res.json(corpo)
}

async function pedir(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_IA_AJUSTAR_NIVEL))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDeAjuste(req.body)
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
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'ajustar_nivel_erro' })}` })
    return
  }

  await ajustarNivel(
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
