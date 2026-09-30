import type { Request, Response } from 'express'

import { abrirPortaGratuita } from '../lib/convidado'
import { getEntitlements } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { lerPedidoDeTraducao, type ResultadoDaTraducao, traduzirNoNivel } from './nucleo/traduzirNoNivel'
import { responderRecusa } from './respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

/**
 * `POST /api/ai/mt` — o ADAPTADOR do Express para `traduzirNoNivel` (Fase F).
 *
 * A tradução por LLM mora no núcleo (`server/ai/nucleo/traduzirNoNivel.ts`): nível, registro,
 * variante, glossário, cache, portão, política de custo, admissão, reserva, cascata e custo. Aqui fica
 * só o que é do HTTP do app: ler o corpo, abrir a PORTA gratuita (convidado, pool do dia, nuvem de
 * alívio — ela lê IP, cabeçalho e flag do request), resolver o plano uma vez, montar o contexto e
 * responder o que o núcleo decidiu, no instante em que ele decide (`aoDecidir`).
 */

/* Os testes de rota importam a versão do prompt daqui, de onde ela sempre esteve. */
export { VERSAO_DO_PROMPT } from './nucleo/traduzirNoNivel'

/**
 * O corpo da resposta. Procedência no PAYLOAD: a origem diz o modelo que REALMENTE serviu — com a
 * cascata, pode ser o da reserva. `engine` é o id NEUTRO do adaptador (A5).
 */
function respostaDeTraducao(texto: string, modelo: string, doCache = false) {
  return {
    text: texto,
    engine: 'server-llm-mt',
    ...(doCache ? { cache: true } : {}),
    provenance: {
      kind: 'ai',
      origin: modelo,
      method: 'tradução por LLM',
      limits:
        'Tradução gerada por modelo de linguagem — pode conter erros de sentido, registro ou termo técnico. Confira antes de decorar.',
    },
  }
}

function responderTraducao(res: Response, r: ResultadoDaTraducao): void {
  if (r.ok === false) responderRecusa(res, r)
  else res.json(respostaDeTraducao(r.texto, r.modelo, r.doCache))
}

/**
 * A rota, embrulhada no rastro de telemetria (`telemetriaDeIa.ts`): UM rastro por requisição,
 * fechado no `finally` com o status que o cliente recebeu — qualquer que seja o `return` lá dentro.
 * A função é `mt-fala` (microfone) ou `mt-texto` (legenda, importação): custam diferente e são
 * produtos diferentes no preço.
 */
export async function mtTranslateProxy(req: Request, res: Response): Promise<void> {
  const falada = (req.body as { falada?: unknown } | undefined)?.falada === true
  const rastro = abrirRastro(req, falada ? 'mt-fala' : 'mt-texto')
  try {
    await traduzir(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

async function traduzir(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDeTraducao(req.body, rastro)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }

  /* Fase 7: convidado (flag, limite por IP, tetos) e pool gratuito do dia (`server/lib/convidado.ts`).
     `null` = já respondeu (403 `exige_conta`, 429, 402, 503). A NUVEM DE ALÍVIO (A10): a conta Grátis
     que aceitou a oferta traduz pela franquia do alívio (`nuvemDeAlivio.ts`). */
  const gratuita = await abrirPortaGratuita(req, res, 'mt')
  if (!gratuita) return
  /* UMA leitura de plano, dois usos: o que deixa entrar e o que escolhe o modelo. FAIL-CLOSED: erro ao
     derivar o plano vira 502 (nunca passa direto), consistente com o STT e o tutor. */
  let entitlements
  try {
    entitlements = getEntitlements(gratuita.plano)
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_route_error' })}` })
    return
  }

  await traduzirNoNivel(
    {
      userId: req.userId,
      requestId: req.requestId,
      rastro,
      entitlements,
      emTeste: gratuita.teste === true,
      modo: gratuita.alivio === true ? 'alivio' : 'plano',
      canal: 'app',
      perfilProtegido: null,
      registrarCusto: (usd) => gratuita.registrarCusto(usd),
    },
    lido.pedido,
    { aoDecidir: (r) => responderTraducao(res, r) },
  )
}
