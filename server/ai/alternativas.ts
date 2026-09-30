/**
 * "OUTRAS FORMAS" — `POST /api/ai/mt/alternativas` (D4 da Fase D, 30/09/2026).
 *
 * A pessoa toca numa frase da conversa e pede outras maneiras de dizê-la: até 3 traduções diferentes
 * da atual e uma nota curta sobre quando usar cada uma. O prompt e a leitura da resposta moram em
 * `src/lib/traducao/promptDasAlternativas.ts`.
 *
 * É DA TRADUÇÃO NUANCE, e o servidor decide pelo ENTITLEMENT (`traducaoNuance`), nunca pelo nome do
 * plano: sem a capacidade, 402 `exige_nuance` — antes de portão, cota ou provedor, sem gastar nada. O
 * cliente mostra o recurso com cadeado e o texto positivo; aqui só se garante que o corpo forjado de um
 * `curl` não passe.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA (a `alternativas` em `FUNCOES_DE_IA`): portão da nuvem
 * (chave de emergência e orçamento), política de custo (B4), admissão por provedor (ADR 0007), reserva
 * de chamada + tokens ANTES do provedor, cascata com reserva, custo da perna que respondeu no gasto do
 * mês. Registro, variante e glossário valem como no `/mt` (`aplicarNuance`, `glossarioDoPedido`).
 *
 * SEM CACHE, de propósito: é um pedido explícito, raro, cujo valor está em variar — e a frase tocada
 * é da conversa de alguém. RESPOSTA INVÁLIDA (o modelo não devolveu JSON utilizável) é 502
 * `resposta_invalida`, nunca opção inventada; o custo que o provedor cobrou continua registrado.
 */
import type { Request, Response } from 'express'
import { z } from 'zod'

import {
  type OpcoesDaNuance,
  REGISTROS_DA_TRADUCAO,
  type VarianteDaTraducao,
  VARIANTES_DA_TRADUCAO,
} from '../../src/lib/traducao/promptComunicativo'
import {
  lerAlternativas,
  systemDasAlternativas,
  userDasAlternativas,
} from '../../src/lib/traducao/promptDasAlternativas'
import { getEntitlements, getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa, responderPortaoFechado } from '../lib/orcamentoDeIa'
import { responderErro } from '../lib/respostaDeErro'
import { estimarTokens } from '../lib/usageQuota'
import { planoDeAdmissao, responderNuvemOcupada } from './admissao'
import { admitirCascata, encerrarAdmissao, percorrerCascata } from './cascata'
import { FUNCOES_DE_IA } from './funcoesDeIa'
import { glossarioDoPedido } from './glossario'
import { type MensagemDeChat, tamanhoDoPrompt } from './llmClient'
import { cascataDoPlano } from './niveis'
import { aplicarNuance } from './nuanceDaTraducao'
import { aplicarPoliticaDeCusto } from './politicaDeCusto'
import { abrirReservaDeLlm, type ReservaDeLlm } from './reservaDeNuvem'
import { abrirRastro, codigoDeIdioma, type RastroDeIa } from './telemetriaDeIa'

const ALTERNATIVAS = FUNCOES_DE_IA.alternativas
const ROTA = '/api/ai/mt/alternativas'
/** Alguém está olhando a folha da frase esperando; um pouco mais que a legenda (12 s), menos que o tutor. */
const TIMEOUT_MS = 15_000

const bodySchema = z
  .object({
    text: z.string().min(1).max(ALTERNATIVAS.tetoEntrada),
    src: z.string().max(20).optional(),
    tgt: z.string().min(2).max(20),
    /** A tradução que está na tela: as opções vêm diferentes dela. */
    traducaoAtual: z.string().max(ALTERNATIVAS.tetoEntrada).optional(),
    contexto: z.array(z.string().max(300)).max(3).optional(),
    registro: z.enum(REGISTROS_DA_TRADUCAO).optional(),
    variante: z.enum(Object.keys(VARIANTES_DA_TRADUCAO) as [VarianteDaTraducao, ...VarianteDaTraducao[]]).optional(),
  })
  .strip()

export async function alternativasProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'mt-alternativas')
  try {
    await pedirAlternativas(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

async function pedirAlternativas(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    responderErro(res, 400, 'payload inválido: text/tgt obrigatórios', 'payload_invalido')
    return
  }
  const { text, src, tgt, traducaoAtual, contexto, registro, variante } = parsed.data
  rastro.anotar({ parDeIdiomas: `${codigoDeIdioma(src)}-${codigoDeIdioma(tgt)}` })

  /* A CAPACIDADE, fail-closed: erro ao ler o plano é 502, nunca uma chamada que passou direto. */
  let plano
  try {
    plano = getEntitlements(await getPlanForUser(req.userId))
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_alternativas_erro' })}` })
    return
  }
  if (!plano.managedCloudLlm || plano.traducaoNuance !== true) {
    res.status(402).json({
      error: 'as outras formas de dizer são da Tradução Nuance',
      code: 'exige_nuance',
      entitlement: 'traducaoNuance',
    })
    return
  }

  const { nivel, pernas } = cascataDoPlano('alternativas', plano)
  if (pernas.length === 0) {
    res.status(501).json({ error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' })
    return
  }
  rastro.anotar({ nivel })

  const portao = await portaoDaNuvem()
  if (!portao.ok) {
    responderPortaoFechado(res, portao)
    return
  }

  const nuance = aplicarNuance({ tgt, src, registro, variante }, plano)
  const glossario = await glossarioDoPedido(req.userId, { texto: text, src, tgt })
  if (glossario.length) rastro.anotar({ glossario: glossario.length })
  const opcoes: OpcoesDaNuance = {
    ...(nuance.registro ? { registro: nuance.registro } : {}),
    ...(glossario.length ? { glossario } : {}),
  }
  const messages: MensagemDeChat[] = [
    { role: 'system', content: systemDasAlternativas(nuance.tgt, nuance.src, opcoes) },
    { role: 'user', content: userDasAlternativas(text, traducaoAtual, contexto, opcoes) },
  ]
  const maxTokens = ALTERNATIVAS.maxTokens
  const estimativa = estimarTokens(tamanhoDoPrompt(messages), maxTokens)

  const custo = aplicarPoliticaDeCusto({
    pernas,
    nivel,
    fracaoDoOrcamento: portao.fracaoDoOrcamento ?? 0,
    tokensEntrada: estimativa - maxTokens,
    tokensSaida: maxTokens,
  })
  if (custo.degradacao !== 'nenhuma') rastro.anotar({ degradacao: custo.degradacao })

  const admitida = admitirCascata(custo.pernas, {
    userId: req.userId,
    plano: planoDeAdmissao(plano.plan),
    tokens: estimativa,
  })
  if (admitida.ok === false) {
    responderNuvemOcupada(res, admitida.recusa)
    return
  }

  let reserva: ReservaDeLlm | null = null
  const t0 = Date.now()
  try {
    reserva = await abrirReservaDeLlm(req.userId, estimativa, res)
    if (!reserva) return // já respondeu: 402 de cota ou 503 do contador

    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      { messages, temperature: ALTERNATIVAS.temperatura, maxTokens, timeoutMs: TIMEOUT_MS },
      {
        evento: 'mt_alternativas',
        route: ROTA,
        requestId: req.requestId,
        funcao: 'alternativas',
        rastro,
        admissao: admitida.admissao,
        fatorDeSaida: custo.fatorDeSaida,
      },
    )
    if (!entregue && limitadoPeloProvedor) {
      responderNuvemOcupada(res, { motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS })
      return
    }
    if (!entregue) {
      log('error', {
        event: 'mt_alternativas_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: req.requestId,
      })
      responderErro(res, 502, 'outras formas indisponíveis agora', 'provedor_indisponivel')
      return
    }

    /* O provedor respondeu e cobrou: a cota e o gasto contam o que foi gasto, com ou sem JSON útil. */
    await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: req.userId, plano: plano.plan })

    const lidas = lerAlternativas(entregue.texto, traducaoAtual)
    if (!lidas) {
      log('warn', { event: 'mt_alternativas_resposta_invalida', route: ROTA, status: 502, requestId: req.requestId })
      responderErro(res, 502, 'o modelo não devolveu outras formas utilizáveis; tente de novo', 'resposta_invalida')
      return
    }
    log('info', {
      event: 'mt_alternativas',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: req.requestId,
    })
    res.json({
      opcoes: lidas.opcoes,
      nota: lidas.nota,
      provenance: {
        kind: 'ai',
        origin: entregue.model,
        method: 'outras formas por LLM',
        limits:
          'Formas geradas por modelo de linguagem — podem mudar o tom ou errar um termo. Escolha a que soa certa para você.',
      },
    })
  } catch (err) {
    if (!res.headersSent)
      res.status(502).json({ error: `falha nas outras formas: ${erroDeRota(err, { event: 'mt_alternativas_erro' })}` })
  } finally {
    encerrarAdmissao(admitida.admissao)
    // Todo caminho que NÃO consumiu devolve chamada e tokens.
    await reserva?.estornar()
  }
}
