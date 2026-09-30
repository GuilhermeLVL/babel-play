/**
 * "POLIR A SESSÃO" — `POST /api/ai/mt/polir` (D5 da Fase D, 30/09/2026): o ADAPTADOR do Express para
 * `polirLote` (Fase F).
 *
 * A regra mora no núcleo (`server/ai/nucleo/polirLote.ts`): a capacidade (`traducaoNuance`), as falas
 * lidas do banco pelo dono, a idempotência por bloco, o 409 do bloco em voo, o portão, a política de
 * custo, a admissão, a reserva, a cascata, a gravação ao lado da original e o custo. Aqui fica o que é
 * do HTTP do app: ler o corpo, resolver o plano e o teste de 14 dias (fail-closed: erro ao ler é 502),
 * montar o contexto e responder o que o núcleo decidiu, no instante em que ele decide.
 */
import type { Request, Response } from 'express'

import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { lerPedidoDoPolimento, polirLote, type ResultadoDoPolimento } from './nucleo/polirLote'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function polirProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'mt-polimento')
  try {
    await polir(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderPolimento(res: Response, r: ResultadoDoPolimento): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  const lote = { bloco: r.bloco, blocos: r.blocos, polidas: r.polidas, pendentes: r.pendentes }
  if (r.jaPolido === true) {
    res.json({ ...lote, jaPolido: true })
    return
  }
  res.json({
    ...lote,
    jaPolido: false,
    provenance: {
      kind: 'ai',
      origin: r.modelo,
      method: 'tradução polida por LLM',
      limits:
        'Tradução revisada por modelo de linguagem com o contexto da sessão — pode mudar um termo ou o tom. ' +
        'A original continua guardada: alterne entre as duas.',
    },
  })
}

async function polir(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDoPolimento(req.body)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }

  /* A CAPACIDADE, fail-closed: erro ao ler o plano é 502, nunca uma chamada que passou direto. */
  let entitlements
  let emTeste: boolean
  try {
    const resolvido = await resolverPlano(req.userId)
    entitlements = getEntitlements(resolvido.plano)
    emTeste = resolvido.teste !== null
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_polimento_erro' })}` })
    return
  }

  await polirLote(
    {
      userId: req.userId,
      requestId: req.requestId,
      rastro,
      entitlements,
      emTeste,
      modo: 'plano',
      canal: 'app',
      perfilProtegido: null,
    },
    lido.pedido,
    { aoDecidir: (r) => responderPolimento(res, r) },
  )
}
