/**
 * A EXPLICAÇÃO DA FRASE — `POST /api/ai/explicar` (IA de estudo, planos v4, etapa 2): o ADAPTADOR do Express para
 * `explicarFrase`.
 *
 * A regra mora no núcleo (`server/ai/nucleo/explicarFrase.ts`): a flag, a franquia (plano ou amostra do Grátis), o
 * menor, a retenção zero, o portão, a admissão, a cota, a cascata e o custo. Aqui fica o que é do HTTP do app: ler o
 * corpo, resolver o plano (fail-closed: erro ao ler é 502), dar ao núcleo as flags DESTE request e responder o que o
 * núcleo decidiu.
 *
 * O CORPO DE SUCESSO: `{ explicacao: { porQue, gramatica, registro, girias: [{ termo, sentido }] }, origem:
 * 'plano' | 'amostra', restanteNaAmostra: number | null }`. As recusas vêm no envelope `{ error, code }`.
 */
import type { Request, Response } from 'express'

import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { explicarFrase, lerPedidoDeExplicacao, type ResultadoDaExplicacao } from './nucleo/explicarFrase'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

export async function explicarProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'explicacao')
  try {
    await pedirExplicacao(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

function responderExplicacao(res: Response, r: ResultadoDaExplicacao): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.json({ explicacao: r.explicacao, origem: r.origem, restanteNaAmostra: r.restanteNaAmostra })
}

async function pedirExplicacao(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDeExplicacao(req.body, rastro)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }

  /* O PLANO, fail-closed: erro ao ler é 502, nunca uma chamada que passou direto. */
  let entitlements
  let emTeste: boolean
  try {
    const resolvido = await resolverPlano(req.userId)
    entitlements = getEntitlements(resolvido.plano)
    emTeste = resolvido.teste !== null
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'explicacao_erro' })}` })
    return
  }

  await explicarFrase(
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
    { aoDecidir: (r) => responderExplicacao(res, r) },
  )
}
