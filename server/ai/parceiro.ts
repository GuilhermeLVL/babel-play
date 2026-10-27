/**
 * O PARCEIRO DE LEITURA — `POST /api/ai/leitura/parceiro`: o ADAPTADOR do Express para `pedirAoParceiro` (L4 de
 * Livros & Leitura). A regra mora no núcleo (`server/ai/nucleo/parceiroDeLeitura.ts`): a flag, o plano, o livro e a
 * idade, o cache, a retenção zero, as cotas, a cascata e o custo. Aqui fica o que é do HTTP do app: ler o corpo,
 * resolver o plano (fail-closed: erro ao ler é 502), dar ao núcleo as flags DESTE request e responder.
 *
 * O CORPO DE SUCESSO: `{ resposta: { texto, pontos, citacoes: [{ trechoId, exato }], naoEstaNoTrecho }, origem:
 * 'cache' | 'modelo', restanteHoje?: number | null, textoConferido: boolean, aviso }` e o modelo no cabeçalho `x-ia-modelo`. As recusas vêm no
 * envelope `{ error, code }` (contrato completo em `src/data/rotas/parceiroDeLeitura.ts`).
 */
import type { Request, Response } from 'express'

import { FLAG_PARCEIRO_DE_LEITURA } from '../../src/core/planos'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { envelopeDeErro } from '../lib/respostaDeErro'
import { lerPedidoDoParceiro, pedirAoParceiro, type ResultadoDoParceiro } from './nucleo/parceiroDeLeitura'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

/** A marca que acompanha toda resposta (a tela a mostra junto). */
export const AVISO_DO_PARCEIRO = 'Gerado por IA a partir do texto e da ficha do livro.'

function responder(res: Response, r: ResultadoDoParceiro): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.setHeader('x-ia-modelo', r.modelo)
  res.json({
    resposta: r.resposta,
    origem: r.origem,
    ...(r.restanteHoje !== undefined ? { restanteHoje: r.restanteHoje } : {}),
    textoConferido: r.textoConferido,
    aviso: AVISO_DO_PARCEIRO,
  })
}

async function atender(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  /* A FLAG PRIMEIRO: desligada, qualquer corpo é 404 e nada mais é lido. O núcleo confere de novo. */
  if (!(await flagLigada(req, FLAG_PARCEIRO_DE_LEITURA))) {
    res.status(404).json(envelopeDeErro('recurso indisponível', 'recurso_indisponivel'))
    return
  }
  const lido = lerPedidoDoParceiro(req.body, rastro)
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
    res
      .status(502)
      .json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'parceiro_de_leitura_erro' })}` })
    return
  }
  await pedirAoParceiro(
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

export async function parceiroProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'parceiro-de-leitura')
  try {
    await atender(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}
