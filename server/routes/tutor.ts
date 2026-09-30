/**
 * O TUTOR — `POST /api/tutor/chat` (antes `/api/gemini/chat`, que continua como ALIAS temporário
 * para o cliente em cache; ver `server/http/app.ts`): o ADAPTADOR do Express para `conversarComTutor`.
 *
 * O NOME MUDOU PORQUE MENTIA. A rota chamava-se "gemini" e respondia pela Groq quase sempre; e na
 * Fase 2 do lançamento o Gemini saiu de vez: o app é aberto a menores, e os termos do Gemini
 * proíbem uso em serviço voltado a menores de 18.
 *
 * A regra mora no núcleo (`server/ai/nucleo/conversarComTutor.ts`): a instrução de menor, a cascata
 * do nível, o portão, a política de custo, a admissão, a reserva, o custo e o Ollama do self-host.
 * Aqui fica o que é do HTTP do app: ler o corpo, abrir a PORTA gratuita (convidado e pool do dia —
 * ela lê IP e cabeçalho do request), montar o contexto, responder o que o núcleo decidiu no instante
 * em que ele decide, e devolver à porta a mensagem reservada quando a nuvem não entregou.
 */
import { type Request, type Response, Router } from 'express'

import {
  conversarComTutor,
  lerPedidoDoTutor,
  type PedidoDoTutor,
  type ResultadoDoTutor,
} from '../ai/nucleo/conversarComTutor'
import { responderRecusa } from '../ai/respostaDoNucleo'
import { abrirRastro, type RastroDeIa } from '../ai/telemetriaDeIa'
import { abrirPortaGratuita, type PortaGratuita } from '../lib/convidado'
import { getEntitlements } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'

export const tutorRouter = Router()

function responderTutor(res: Response, r: ResultadoDoTutor): void {
  if (r.ok === false) {
    responderRecusa(res, r)
    return
  }
  if (r.motor) res.json({ text: r.texto, engine: r.motor, local: r.motor === 'ollama' })
  else res.json({ text: null, unavailable: true, reason: r.indisponivel })
}

/**
 * A rota, embrulhada no rastro de telemetria (`server/ai/telemetriaDeIa.ts`). A função (`tutor` ou
 * `corretor`) só é conhecida depois de validar o corpo; até lá o rastro nasce como `tutor`, que é o
 * que o corpo inválido pedia de qualquer jeito.
 */
export async function tutorChat(req: Request, res: Response): Promise<void> {
  const pedida = (req.body as { funcao?: unknown } | undefined)?.funcao
  const rastro = abrirRastro(req, pedida === 'corretor' ? 'corretor' : 'tutor')
  try {
    await conversar(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

async function conversar(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const lido = lerPedidoDoTutor(req.body)
  if (lido.ok === false) {
    responderRecusa(res, lido)
    return
  }
  /* Fase 7: as travas de convidado/free (flag, limite por IP, pool do dia, tetos). A mensagem de
     tutor do convidado é reservada na porta e devolvida se a nuvem não entregou. */
  let gratuita: PortaGratuita | null = null
  let respondeuDaNuvem = false
  try {
    gratuita = await abrirPortaGratuita(req, res, 'tutor')
    if (!gratuita) return // já respondeu: 403 `exige_conta`, 429, 402 ou 503
    const r = await conversarComTutor(contextoDoApp(req, rastro, gratuita), lido.pedido satisfies PedidoDoTutor, {
      aoDecidir: (resultado) => responderTutor(res, resultado),
    })
    respondeuDaNuvem = r.ok === true && r.motor === 'nuvem'
  } catch (error) {
    log('error', { event: 'tutor_erro', error: erroDeRota(error, { event: 'tutor_erro' }), requestId: req.requestId })
    if (!res.headersSent) res.status(502).json({ error: 'tutor indisponível', code: 'provedor_indisponivel' })
  } finally {
    if (!respondeuDaNuvem) await gratuita?.estornar()
  }
}

/**
 * O contexto do app. O tutor nunca usou a franquia do alívio (a oferta é da legenda) nem leu o
 * alívio na admissão: `modo: 'plano'` preserva isso. O teste de 14 dias entra na faixa grátis.
 */
function contextoDoApp(req: Request, rastro: RastroDeIa, gratuita: PortaGratuita) {
  return {
    userId: req.userId,
    requestId: req.requestId,
    rastro,
    entitlements: getEntitlements(gratuita.plano),
    emTeste: gratuita.teste === true,
    modo: 'plano' as const,
    canal: 'app' as const,
    perfilProtegido: null,
    registrarCusto: (usd: number) => gratuita.registrarCusto(usd),
  }
}

tutorRouter.post('/chat', tutorChat)
