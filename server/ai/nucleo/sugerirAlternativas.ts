/**
 * SUGERIR ALTERNATIVAS — o núcleo das "Outras formas" (`POST /api/ai/mt/alternativas`), sem Express
 * (D4 da Fase D; núcleo desde a Fase F).
 *
 * A pessoa toca numa frase da conversa e pede outras maneiras de dizê-la: até 3 traduções diferentes
 * da atual e uma nota curta sobre quando usar cada uma. O prompt e a leitura da resposta moram em
 * `src/lib/traducao/promptDasAlternativas.ts`.
 *
 * É DA TRADUÇÃO NUANCE, e o núcleo decide pelo ENTITLEMENT (`traducaoNuance`), nunca pelo nome do
 * plano: sem a capacidade, 402 `exige_nuance` — antes de portão, cota ou provedor, sem gastar nada. O
 * cliente mostra o recurso com cadeado e o texto positivo; aqui só se garante que o corpo forjado de um
 * `curl` não passe.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA (a `alternativas` em `FUNCOES_DE_IA`): portão da nuvem
 * (chave de emergência e orçamento), política de custo (B4), admissão por provedor (ADR 0007), reserva
 * de chamada + tokens ANTES do provedor, cascata com reserva, custo da perna que respondeu no gasto do
 * mês. Registro, variante e glossário valem como na tradução (`aplicarNuance`, `glossarioDoPedido`).
 *
 * SEM CACHE, de propósito: é um pedido explícito, raro, cujo valor está em variar — e a frase tocada
 * é da conversa de alguém. RESPOSTA INVÁLIDA (o modelo não devolveu JSON utilizável) é 502
 * `resposta_invalida`, nunca opção inventada; o custo que o provedor cobrou continua registrado.
 */
import { z } from 'zod'

import {
  type OpcoesDaNuance,
  REGISTROS_DA_TRADUCAO,
  type VarianteDaTraducao,
  VARIANTES_DA_TRADUCAO,
} from '../../../src/lib/traducao/promptComunicativo'
import {
  lerAlternativas,
  systemDasAlternativas,
  userDasAlternativas,
} from '../../../src/lib/traducao/promptDasAlternativas'
import { erroDeRota } from '../../lib/erroDeRota'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { FUNCOES_DE_IA } from '../funcoesDeIa'
import { glossarioDoPedido } from '../glossario'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { cascataDoPlano } from '../niveis'
import { aplicarNuance } from '../nuanceDaTraducao'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { codigoDeIdioma, type RastroDeIa } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

const ALTERNATIVAS = FUNCOES_DE_IA.alternativas
/** O rótulo de log e de métrica é o da rota do app; a `/v1` terá o dela (change `api-e-mcp`). */
const ROTA = '/api/ai/mt/alternativas'
/** Alguém está olhando a folha da frase esperando; um pouco mais que a legenda (12 s), menos que o tutor. */
const TIMEOUT_MS = 15_000

const esquemaDoPedido = z
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

/** O pedido das outras formas validado — sai de `lerPedidoDeAlternativas`. */
export type PedidoDeAlternativas = z.infer<typeof esquemaDoPedido>

/** Lê o corpo cru: o pedido validado (e o par de idiomas no rastro), ou o 400 `payload_invalido`. */
export function lerPedidoDeAlternativas(
  corpo: unknown,
  rastro?: RastroDeIa,
): { ok: true; pedido: PedidoDeAlternativas } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success) return recusaDeErro(400, 'payload inválido: text/tgt obrigatórios', 'payload_invalido')
  rastro?.anotar({ parDeIdiomas: `${codigoDeIdioma(parsed.data.src)}-${codigoDeIdioma(parsed.data.tgt)}` })
  return { ok: true, pedido: parsed.data }
}

/** As outras formas entregues, com o modelo que de fato as escreveu (a procedência). */
export interface AlternativasEntregues {
  ok: true
  opcoes: string[]
  nota: string
  modelo: string
}

export type ResultadoDasAlternativas = AlternativasEntregues | RecusaDeIa

export async function sugerirAlternativas(
  ctx: ContextoDeIa,
  pedido: PedidoDeAlternativas,
  ganchos?: GanchosDoNucleo<ResultadoDasAlternativas>,
): Promise<ResultadoDasAlternativas> {
  const decidir = decisor(ganchos)
  return decidir(await sugerir(ctx, pedido, decidir))
}

async function sugerir(
  ctx: ContextoDeIa,
  pedido: PedidoDeAlternativas,
  decidir: (r: ResultadoDasAlternativas) => ResultadoDasAlternativas,
): Promise<ResultadoDasAlternativas> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { text, src, tgt, traducaoAtual, contexto, registro, variante } = pedido
  const { rastro } = ctx
  const plano = ctx.entitlements

  /* A CAPACIDADE: a Tradução Nuance, pelo entitlement. */
  if (!plano.managedCloudLlm || plano.traducaoNuance !== true)
    return decidir(
      recusar(402, {
        error: 'as outras formas de dizer são da Tradução Nuance',
        code: 'exige_nuance',
        entitlement: 'traducaoNuance',
      }),
    )

  const { nivel, pernas } = cascataDoPlano('alternativas', plano)
  if (pernas.length === 0)
    return decidir(recusar(501, { error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' }))
  rastro.anotar({ nivel })

  const portao = await portaoDaNuvem()
  if (!portao.ok) return decidir(recusaPortaoFechado(portao))

  const nuance = aplicarNuance({ tgt, src, registro, variante }, plano)
  const glossario = await glossarioDoPedido(ctx.userId, { texto: text, src, tgt })
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
    userId: ctx.userId,
    plano: planoDeAdmissao(plano.plan, ctx.modo === 'alivio', ctx.emTeste),
    tokens: estimativa,
  })
  if (admitida.ok === false) return decidir(recusaNuvemOcupada(admitida.recusa))

  let reserva: ReservaDeLlm | null = null
  const t0 = Date.now()
  try {
    const reservada = await reservarLlm(ctx.userId, estimativa, ctx.modo)
    if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402 de cota ou 503 do contador
    reserva = reservada

    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      { messages, temperature: ALTERNATIVAS.temperatura, maxTokens, timeoutMs: TIMEOUT_MS },
      {
        evento: 'mt_alternativas',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'alternativas',
        rastro,
        admissao: admitida.admissao,
        fatorDeSaida: custo.fatorDeSaida,
      },
    )
    if (!entregue && limitadoPeloProvedor)
      return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS }))
    if (!entregue) {
      log('error', {
        event: 'mt_alternativas_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'outras formas indisponíveis agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: a cota e o gasto contam o que foi gasto, com ou sem JSON útil. */
    await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const lidas = lerAlternativas(entregue.texto, traducaoAtual)
    if (!lidas) {
      log('warn', { event: 'mt_alternativas_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu outras formas utilizáveis; tente de novo', 'resposta_invalida'),
      )
    }
    log('info', {
      event: 'mt_alternativas',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({ ok: true, opcoes: lidas.opcoes, nota: lidas.nota, modelo: entregue.model })
  } catch (err) {
    return decidir(
      recusar(502, { error: `falha nas outras formas: ${erroDeRota(err, { event: 'mt_alternativas_erro' })}` }),
    )
  } finally {
    encerrarAdmissao(admitida.admissao)
    // Todo caminho que NÃO consumiu devolve chamada e tokens.
    await reserva?.estornar()
  }
}
