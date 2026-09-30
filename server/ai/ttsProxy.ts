/**
 * A VOZ NATURAL DO MODO INTÉRPRETE — `POST /api/ai/tts` (E4 da Fase E, 30/09/2026): o ADAPTADOR do
 * Express para `sintetizarVoz` (Fase F).
 *
 * A regra mora no núcleo (`server/ai/nucleo/sintetizarVoz.ts`), na ordem de sempre: corpo e clonagem
 * (400), entitlement `vozNatural` (402), flag `voz_natural` (503), configuração (501/422), cache L1,
 * portão, admissão `tts`, cota de caracteres no mês e no dia, cascata das pernas e custo. Aqui fica o
 * que é do HTTP do app: ler o corpo, resolver o plano e o teste de 14 dias (fail-closed: erro ao ler é
 * 502), dar ao núcleo as flags DESTE request, e enviar o áudio.
 *
 * A RESPOSTA é o próprio áudio, com `Cache-Control: no-store` e `nosniff`.
 */
import type { Request, Response } from 'express'

import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { lerPedidoDeVoz, type ResultadoDaVoz, sintetizarVoz } from './nucleo/sintetizarVoz'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

/* Os testes de rota esvaziam o cache da voz por aqui, de onde ele sempre foi chamado. */
export { esvaziarCacheDeVoz } from './nucleo/sintetizarVoz'

export async function ttsProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'tts')
  try {
    await sintetizar(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

/**
 * Os bytes vão ao navegador como ÁUDIO e nunca como outra coisa: o tipo já saiu do núcleo numa lista
 * fechada de `audio/*`, e o `nosniff` impede o navegador de adivinhar HTML num corpo forjado.
 */
function enviarVoz(res: Response, r: ResultadoDaVoz): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  res.status(200)
  res.setHeader('Content-Type', r.tipo)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Voz-Modelo', r.modelo)
  if (r.doCache) res.setHeader('X-Voz-Cache', '1')
  res.send(r.bytes)
}

async function sintetizar(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDeVoz(req.body, rastro)
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
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'tts_erro' })}` })
    return
  }

  await sintetizarVoz(
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
    { aoDecidir: (r) => enviarVoz(res, r) },
  )
}
