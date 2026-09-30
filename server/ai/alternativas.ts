/**
 * "OUTRAS FORMAS" — `POST /api/ai/mt/alternativas` (D4 da Fase D, 30/09/2026): o ADAPTADOR do Express
 * para `sugerirAlternativas` (Fase F).
 *
 * A regra mora no núcleo (`server/ai/nucleo/sugerirAlternativas.ts`): a capacidade (`traducaoNuance`),
 * o portão, a política de custo, a admissão, a reserva, a cascata e o custo. Aqui fica o que é do HTTP
 * do app: ler o corpo, resolver o plano (fail-closed: erro ao ler é 502), montar o contexto e
 * responder o que o núcleo decidiu, no instante em que ele decide.
 */
import type { Request, Response } from 'express'

import { getEntitlements, getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import {
  lerPedidoDeAlternativas,
  type ResultadoDasAlternativas,
  sugerirAlternativas,
} from './nucleo/sugerirAlternativas'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function alternativasProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'mt-alternativas')
  try {
    await pedirAlternativas(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderAlternativas(res: Response, r: ResultadoDasAlternativas): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.json({
    opcoes: r.opcoes,
    nota: r.nota,
    provenance: {
      kind: 'ai',
      origin: r.modelo,
      method: 'outras formas por LLM',
      limits:
        'Formas geradas por modelo de linguagem — podem mudar o tom ou errar um termo. Escolha a que soa certa para você.',
    },
  })
}

async function pedirAlternativas(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDeAlternativas(req.body, rastro)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }

  /* A CAPACIDADE, fail-closed: erro ao ler o plano é 502, nunca uma chamada que passou direto. */
  let entitlements
  try {
    entitlements = getEntitlements(await getPlanForUser(req.userId))
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_alternativas_erro' })}` })
    return
  }

  await sugerirAlternativas(
    {
      userId: req.userId,
      requestId: req.requestId,
      rastro,
      entitlements,
      /* Esta rota nunca leu o TESTE de 14 dias (lê só o plano, `getPlanForUser`): o teste entra na
         admissão como Premium aqui, e como grátis no `/mt` e no polimento. `false` preserva a faixa de
         hoje; alinhar é uma decisão de produto, não deste refactor (relatório da Fase F). */
      emTeste: false,
      modo: 'plano',
      canal: 'app',
      perfilProtegido: null,
    },
    lido.pedido,
    { aoDecidir: (r) => responderAlternativas(res, r) },
  )
}
