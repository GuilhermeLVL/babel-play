/**
 * O RESUMO DA SESSÃO — `POST /api/ai/resumir` (IA de estudo, planos v4, etapa 2, Task 3): o ADAPTADOR do Express
 * para `resumirSessao`.
 *
 * A regra mora no núcleo (`server/ai/nucleo/resumirSessao.ts`): a flag, a sessão do dono, a franquia (plano ou
 * amostra semanal do Grátis), o menor, a retenção zero, o portão, a admissão, a cota, a cascata, o custo e o filtro
 * dos cartões. Aqui fica o que é do HTTP do app: a flag primeiro, ler o corpo, resolver o plano (fail-closed) e
 * responder o que o núcleo decidiu.
 *
 * O CORPO DE SUCESSO: `{ pontos: string[3], cartoes: { word, back, sentence, srcLang, tgtLang }[0..10], origem:
 * 'plano' | 'amostra', restanteNaAmostra: number | null }`. As recusas vêm no envelope `{ error, code }`.
 */
import type { Request, Response } from 'express'

import { FLAG_IA_DE_ESTUDO } from '../../src/core/planos'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { envelopeDeErro } from '../lib/respostaDeErro'
import { lerPedidoDeResumo, type ResultadoDoResumo, resumirSessao } from './nucleo/resumirSessao'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function resumirProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'resumo')
  try {
    await pedirResumo(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderResumo(res: Response, r: ResultadoDoResumo): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.json({ pontos: r.pontos, cartoes: r.cartoes, origem: r.origem, restanteNaAmostra: r.restanteNaAmostra })
}

async function pedirResumo(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_IA_DE_ESTUDO))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDeResumo(req.body)
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
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'resumo_erro' })}` })
    return
  }

  await resumirSessao(
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
    { aoDecidir: (r) => responderResumo(res, r) },
  )
}
