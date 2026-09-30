/**
 * O TUTOR — `POST /api/tutor/chat` (antes `/api/gemini/chat`, que continua como ALIAS temporário
 * para o cliente em cache; ver `server/http/app.ts`).
 *
 * O NOME MUDOU PORQUE MENTIA. A rota chamava-se "gemini" e respondia pela Groq quase sempre; e na
 * Fase 2 do lançamento o Gemini saiu de vez: o app é aberto a menores, e os termos do Gemini
 * proíbem uso em serviço voltado a menores de 18.
 *
 * A CASCATA, em ordem:
 *   1. nuvem gerenciada — Groq (principal) → OpenRouter (reserva), `server/ai/cascata.ts`. Só com o
 *      entitlement `managedCloudLlm` e com a cota reservada ANTES da chamada;
 *   2. Ollama local — SÓ no self-host (`AUTH_REQUIRED` desligado). Num servidor hospedado o
 *      `localhost:11434` não existe: tentar só atrasava a resposta e fingia um caminho que o
 *      assinante não tem.
 *
 * O PROMPT É DO SERVIDOR (`server/ai/llmRequest.ts` + `funcoesDeIa.ts`): o corpo diz a função
 * (`tutor` | `corretor`) e traz o conteúdo; `systemInstruction`, temperatura e `max_tokens` do
 * cliente são descartados.
 */
import { type Request, type Response, Router } from 'express'

import { planoDeAdmissao, responderNuvemOcupada } from '../ai/admissao'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../ai/cascata'
import { chamarChat, type MensagemDeChat, tamanhoDoPrompt } from '../ai/llmClient'
import { prepareLlmRequest } from '../ai/llmRequest'
import { cascataDeNuvem, llmLocal } from '../ai/provedores'
import { abrirReservaDeLlm, type ReservaDeLlm } from '../ai/reservaDeNuvem'
import { abrirRastro, nomeDoProvedor, type RastroDeIa, statusDaTentativa } from '../ai/telemetriaDeIa'
import { authRequired } from '../lib/auth'
import { abrirPortaGratuita, type PortaGratuita } from '../lib/convidado'
import { getEntitlements } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { ehMenor, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../lib/idade'
import { log } from '../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa, responderPortaoFechado } from '../lib/orcamentoDeIa'
import { estimarTokens } from '../lib/usageQuota'

export const tutorRouter = Router()

/** Teto de espera da nuvem. Alguém está olhando o balão de "pensando". */
const TIMEOUT_NUVEM_MS = 30_000
/** O local roda na CPU de quem usa o app: a espera é o preço de não depender de nuvem. */
const TIMEOUT_LOCAL_MS = 60_000

async function tentarLocal(messages: MensagemDeChat[], maxTokens: number, rastro: RastroDeIa): Promise<string | null> {
  const local = llmLocal()
  const inicio = Date.now()
  const r = await chamarChat({ ...local, messages, maxTokens, timeoutMs: TIMEOUT_LOCAL_MS })
  /* O Ollama do self-host também é geração: custo zero (a máquina é do dono), mas latência e taxa
     de falha dele são o que decide se vale oferecer a nuvem a quem roda em casa. */
  rastro.tentativa({
    inicio,
    fim: Date.now(),
    provedor: nomeDoProvedor(local.base),
    modelo: local.model,
    status: r.ok ? 'ok' : statusDaTentativa(r.status, r.causa),
    uso: r.ok ? { input: r.tokensEntrada ?? 0, output: r.tokensSaida ?? 0 } : undefined,
    custoUsd: 0,
    metadados: { rotulo: local.rotulo, statusHttp: r.status },
  })
  if (!r.ok) {
    log('warn', { event: 'tutor_ollama_indisponivel', error: r.causa })
    return null
  }
  return r.texto ?? null
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
  // Reserva de cota (chamada + tokens): estornada em todo caminho que não entrega resposta da nuvem.
  let reserva: ReservaDeLlm | null = null
  /* Admissão da cascata (ADR 0007): vaga em voo do usuário + balde do modelo. Fechada no `finally`. */
  let admissao: AdmissaoDaCascata | null = null
  /* Fase 7: as travas de convidado/free (flag, limite por IP, pool do dia, tetos). A mensagem de
     tutor do convidado é reservada na porta e devolvida no `finally` se nada foi entregue. */
  let gratuita: PortaGratuita | null = null
  let respondeuDaNuvem = false
  try {
    /* PÚBLICO MENOR (ECA Digital, Fase 4): menor — ou quem ainda não declarou a idade — recebe a
       instrução de segurança no fim do `system`. No self-host `ehMenor` é sempre falso. A TRADUÇÃO
       (`mtProxy.ts`) não recebe: ela verte fielmente um texto que a pessoa já tem, e "recuse outros
       assuntos" faria o modelo censurar ou recusar a legenda em vez de traduzir. */
    const menor = await ehMenor(req.userId)
    rastro.anotar({ menor })
    const prep = prepareLlmRequest(req.body, menor ? { instrucaoParaMenor: INSTRUCAO_DE_SEGURANCA_PARA_MENORES } : {})
    if (!prep.ok) {
      res.status(prep.status).json({ error: prep.error, code: prep.code })
      return
    }
    const selfHost = !authRequired()
    gratuita = await abrirPortaGratuita(req, res, 'tutor')
    if (!gratuita) return // já respondeu: 403 `exige_conta`, 429, 402 ou 503
    const plano = getEntitlements(gratuita.plano)

    if (plano.managedCloudLlm) {
      /* B1: com `IA_PROVEDORES`, o tutor (e o corretor) têm os modelos DELES; no legado, a mesma cascata. */
      const provedores = cascataDeNuvem({ modelosGrandes: plano.largerModels, funcao: prep.funcao })
      // Chave de emergência e orçamento global: fechado, o hospedado explica; o self-host cai no Ollama.
      const portao = provedores.length > 0 ? await portaoDaNuvem() : { ok: false }
      if (provedores.length > 0 && !portao.ok && !selfHost) {
        responderPortaoFechado(res, portao)
        return
      }
      const estimativa = estimarTokens(tamanhoDoPrompt(prep.messages), prep.maxTokens)
      /* ADMISSÃO antes da cota: sem saldo, o hospedado responde 429 `nuvem_ocupada` (o cliente
         tenta de novo depois do `Retry-After`); o self-host cai no Ollama, como com o portão fechado. */
      const admitida =
        provedores.length > 0 && portao.ok
          ? admitirCascata(provedores, { userId: req.userId, plano: planoDeAdmissao(plano.plan), tokens: estimativa })
          : null
      if (admitida && admitida.ok === false && !selfHost) {
        responderNuvemOcupada(res, admitida.recusa)
        return
      }
      if (admitida?.ok === true) admissao = admitida.admissao
      if (admissao) {
        reserva = await abrirReservaDeLlm(req.userId, estimativa, res)
        if (!reserva) return // já respondeu: 402 de cota ou 503 do contador
        const { entregue, ultimaFalha } = await percorrerCascata(
          provedores,
          {
            messages: prep.messages,
            temperature: prep.temperature,
            maxTokens: prep.maxTokens,
            timeoutMs: TIMEOUT_NUVEM_MS,
          },
          {
            evento: 'tutor',
            route: '/api/tutor/chat',
            requestId: req.requestId,
            funcao: prep.funcao,
            rastro,
            admissao,
          },
        )
        if (entregue) {
          await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
          /* B2: o custo de quem respondeu, pelo preço dele e com o cache — calculado na cascata. */
          const custo = entregue.custoUsd
          await registrarGastoDeIa(custo, { userId: req.userId, plano: plano.plan })
          await gratuita.registrarCusto(custo)
          respondeuDaNuvem = true
          res.json({ text: entregue.texto, engine: 'nuvem', local: false })
          return
        }
        log('error', {
          event: 'tutor_nuvem_indisponivel',
          route: '/api/tutor/chat',
          error: ultimaFalha.slice(0, 300),
          requestId: req.requestId,
        })
      }
      if (!selfHost) {
        res.json({ text: null, unavailable: true, reason: 'nuvem_indisponivel' })
        return
      }
    } else if (!selfHost) {
      // Modo público, plano sem nuvem: explica o plano. Não há modelo local no servidor hospedado.
      res.json({ text: null, unavailable: true, reason: 'managed_requires_plan' })
      return
    }

    // Self-host: o Ollama da máquina do dono é o piso.
    const local = await tentarLocal(prep.messages, prep.maxTokens, rastro)
    if (local) {
      res.json({ text: local, engine: 'ollama', local: true })
      return
    }
    res.json({ text: null, unavailable: true, reason: 'no_local_model' })
  } catch (error) {
    log('error', { event: 'tutor_erro', error: erroDeRota(error, { event: 'tutor_erro' }), requestId: req.requestId })
    if (!res.headersSent) res.status(502).json({ error: 'tutor indisponível', code: 'provedor_indisponivel' })
  } finally {
    encerrarAdmissao(admissao)
    await reserva?.estornar()
    if (!respondeuDaNuvem) await gratuita?.estornar()
  }
}

tutorRouter.post('/chat', tutorChat)
