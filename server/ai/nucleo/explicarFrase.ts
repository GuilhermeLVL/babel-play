/**
 * EXPLICAR A FRASE — o núcleo da IA de estudo (`POST /api/ai/explicar`; planos v4, etapa 2), sem Express.
 *
 * A pessoa toca numa frase e pede a explicação: por que se diz assim, a gramática, o registro e as gírias. O prompt
 * e a leitura da resposta moram em `src/lib/estudo/promptDaExplicacao.ts`.
 *
 * A ORDEM, e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `ia_de_estudo` — desligada (ou sem quem a responda), 404
 *      `recurso_indisponivel`, sem gastar nada;
 *   2. A FRANQUIA (`server/lib/iaDeEstudo.ts`): o plano (`explicacoesMes`) ou a AMOSTRA do Grátis (5 por dia). Sem ela,
 *      402 `sem_plano` / `amostra_acabou` / `cota_do_mes` — antes de portão, admissão ou provedor. A amostra NÃO passa
 *      por `managedCloudLlm` nem por `tokensMes`: o Grátis continua sem tutor, Nuance e polimento;
 *   3. PÚBLICO MENOR (ECA Digital): menor — ou quem não declarou a idade — recebe
 *      `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` no fim do system, como o tutor e o corretor;
 *   4. RETENÇÃO ZERO: as pernas são as do tutor, só de provedor com `retencao: 'zdr'` (`pernasDaFuncao`); sem perna,
 *      501;
 *   5. o MESMO CAMINHO DAS OUTRAS FUNÇÕES: portão da nuvem (chave de emergência e orçamento global), política de
 *      custo, admissão (o Grátis na faixa `gratis`), e — só no plano — a reserva de chamada + tokens da cota do plano
 *      (o 429 `uso_justo_do_dia` vem dela). Na amostra o teto de tokens é o `maxTokens` da função (1.200 de saída);
 *   6. a cascata, o custo da perna que respondeu no gasto global do mês, e a leitura defensiva: resposta que não é a
 *      explicação pedida é 502 `resposta_invalida` — nunca explicação inventada —, com a reserva de estudo CONSUMIDA
 *      (o provedor cobrou; tokens do plano acertados pelo real). A reserva de estudo só é estornada quando nenhum
 *      provedor respondeu (falha antes da chamada, ou todas as pernas falharam ou estouraram o tempo).
 *
 * SEM CACHE, de propósito: a frase tocada é da conversa de alguém.
 */
import { z } from 'zod'

import { FLAG_IA_DE_ESTUDO } from '../../../src/core/planos'
import { SAIDA_DA_EXPLICACAO } from '../../../src/lib/esquemasDeSaida'
import {
  type ExplicacaoDaFrase,
  lerExplicacao,
  systemDaExplicacao,
  userDaExplicacao,
} from '../../../src/lib/estudo/promptDaExplicacao'
import { contarRespostaInvalida } from '../../http/metricas'
import { erroDeRota } from '../../lib/erroDeRota'
import {
  estornarUsoDeEstudo,
  type OrigemDoEstudo,
  type ReservaDeEstudo,
  reservarUsoDeEstudo,
} from '../../lib/iaDeEstudo'
import { ehMenor, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../../lib/idade'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { ContadorIndisponivel, estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { FUNCOES_DE_IA } from '../funcoesDeIa'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { comInstrucaoDeMenor } from '../llmRequest'
import { cascataDoPlano } from '../niveis'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { recusaContadorIndisponivel, ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { codigoDeIdioma, type RastroDeIa } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

const EXPLICACAO = FUNCOES_DE_IA.explicacao
const ROTA = '/api/ai/explicar'
/**
 * OS RELÓGIOS (revisão de 25/10/2026). Alguém está olhando a folha da frase esperando, e o relógio era por perna: com
 * 15 s em cada uma o pior caso passava de 45 s. Agora:
 *   - a PRIMEIRA perna (o DeepSeek, p95 medido de 3 s; com o orçamento a 70/90% a política de custo põe a mais barata
 *     na frente, e o relógio curto vai com ela) tem 8 s;
 *   - as reservas, os 15 s das "Outras formas";
 *   - a cascata inteira, 30 s: a perna em curso recebe só o que sobra, e as seguintes não são chamadas. O cliente
 *     desiste em 35 s (`src/data/apiDoEstudo.ts`), depois do servidor.
 * A repetição sem esquema (`chamarChat`) cabe dentro do relógio da perna.
 */
export const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 8_000
const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 30_000
/** Os limites de entrada (Task 1 da etapa 2): a frase e cada fala de contexto, em caracteres. */
export const MAX_CARACTERES_DA_FRASE = 400
export const MAX_FALAS_DE_CONTEXTO = 3

/** BCP-47 (o mesmo do resumo): o código entra no system do prompt, então texto livre aqui seria injeção. */
const idioma = z
  .string()
  .trim()
  .max(20)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
const esquemaDoPedido = z
  .object({
    texto: z.string().trim().min(1).max(MAX_CARACTERES_DA_FRASE),
    traducao: z.string().max(MAX_CARACTERES_DA_FRASE),
    lang: idioma,
    langDaTraducao: idioma,
    contexto: z.array(z.string().max(MAX_CARACTERES_DA_FRASE)).max(MAX_FALAS_DE_CONTEXTO).optional(),
  })
  .strip()

export type PedidoDeExplicacao = z.infer<typeof esquemaDoPedido>

/** Lê o corpo cru: o pedido validado (e o par de idiomas no rastro), ou o 400 `invalido`. */
export function lerPedidoDeExplicacao(
  corpo: unknown,
  rastro?: RastroDeIa,
): { ok: true; pedido: PedidoDeExplicacao } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success)
    return recusaDeErro(
      400,
      `pedido inválido: texto (1 a ${MAX_CARACTERES_DA_FRASE} caracteres), traducao, lang e langDaTraducao obrigatórios; contexto até ${MAX_FALAS_DE_CONTEXTO} falas`,
      'invalido',
    )
  rastro?.anotar({
    parDeIdiomas: `${codigoDeIdioma(parsed.data.lang)}-${codigoDeIdioma(parsed.data.langDaTraducao)}`,
  })
  return { ok: true, pedido: parsed.data }
}

/** A explicação entregue, de que franquia saiu e quanto sobra na amostra (`null` no plano). */
export interface ExplicacaoEntregue {
  ok: true
  explicacao: ExplicacaoDaFrase
  origem: OrigemDoEstudo
  restanteNaAmostra: number | null
  modelo: string
}

export type ResultadoDaExplicacao = ExplicacaoEntregue | RecusaDeIa

/** As recusas da franquia de estudo: 402, com o código que o cliente decide (nunca venda no servidor). */
const MENSAGEM_SEM_ESTUDO = {
  sem_plano: 'A explicação da frase não está disponível nesta conta; a legenda e a tradução continuam.',
  amostra_acabou: 'As explicações de hoje acabaram; a legenda e a tradução continuam, e elas voltam amanhã.',
  cota_do_mes: 'As explicações deste mês acabaram; a legenda e a tradução continuam, e elas voltam no dia 1º.',
} as const

export async function explicarFrase(
  ctx: ContextoDeIa,
  pedido: PedidoDeExplicacao,
  ganchos?: GanchosDoNucleo<ResultadoDaExplicacao>,
): Promise<ResultadoDaExplicacao> {
  const decidir = decisor(ganchos)
  return decidir(await explicar(ctx, pedido, decidir))
}

async function explicar(
  ctx: ContextoDeIa,
  pedido: PedidoDeExplicacao,
  decidir: (r: ResultadoDaExplicacao) => ResultadoDaExplicacao,
): Promise<ResultadoDaExplicacao> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_IA_DE_ESTUDO)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  let estudo: ReservaDeEstudo | null = null
  /** Algum provedor RESPONDEU (e cobrou)? Então o uso de estudo foi consumido, com ou sem JSON útil. */
  let provedorRespondeu = false
  let reserva: ReservaDeLlm | null = null
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 2) A FRANQUIA: o plano ou a amostra — antes de qualquer custo. */
    const r = await reservarUsoDeEstudo(ctx.userId, plano.plan, 'explicacao')
    if (r.ok === false) return decidir(recusaDeErro(402, MENSAGEM_SEM_ESTUDO[r.motivo], r.motivo))
    estudo = r

    /* 3) Público menor. */
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })

    /* 4) Pernas do tutor, só com retenção zero. */
    const { nivel, pernas } = cascataDoPlano('explicacao', plano)
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para a explicação' }))
    rastro.anotar({ nivel })

    /* 5) Portão, custo, admissão. */
    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const { texto, traducao, contexto, lang, langDaTraducao } = pedido
    const messages: MensagemDeChat[] = [
      {
        role: 'system',
        content: comInstrucaoDeMenor(
          systemDaExplicacao(lang, langDaTraducao),
          menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
        ),
      },
      { role: 'user', content: userDaExplicacao(texto, traducao, contexto) },
    ]
    const maxTokens = EXPLICACAO.maxTokens
    const estimativa = estimarTokens(tamanhoDoPrompt(messages), maxTokens)

    const custo = await aplicarPoliticaDeCusto({
      pernas,
      nivel,
      fracaoDoOrcamento: portao.fracaoDoOrcamento ?? 0,
      tokensEntrada: estimativa - maxTokens,
      tokensSaida: maxTokens,
    })
    if (custo.degradacao !== 'nenhuma') rastro.anotar({ degradacao: custo.degradacao })

    const admitida = await admitirCascata(custo.pernas, {
      userId: ctx.userId,
      plano: planoDeAdmissao(plano.plan, false, ctx.emTeste),
      tokens: estimativa,
    })
    if (admitida.ok === false) return decidir(recusaNuvemOcupada(admitida.recusa))
    admissao = admitida.admissao

    /* Só o PLANO gasta a cota de tokens (e passa pelo uso justo do dia). A amostra tem a franquia dela. */
    if (estudo.origem === 'plano') {
      const reservada = await reservarLlm(ctx.userId, estimativa, 'plano', plano.plan)
      if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402/429 da cota ou 503 do contador
      reserva = reservada
    }

    /* 6) A cascata. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      {
        messages,
        temperature: EXPLICACAO.temperatura,
        maxTokens,
        timeoutMs: TIMEOUT_MS,
        formatoDeSaida: SAIDA_DA_EXPLICACAO,
      },
      {
        evento: 'explicacao',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'explicacao',
        rastro,
        admissao,
        fatorDeSaida: custo.fatorDeSaida,
        timeoutDaPrimeiraPernaMs: TIMEOUT_DA_PRIMEIRA_PERNA_MS,
        prazoTotalMs: PRAZO_TOTAL_MS,
      },
    )
    if (!entregue && limitadoPeloProvedor)
      return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS }))
    if (!entregue) {
      log('error', {
        event: 'explicacao_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'explicação indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: tokens, gasto e o uso de estudo contam, com ou sem JSON útil. */
    provedorRespondeu = true
    await reserva?.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const explicacao = lerExplicacao(entregue.texto)
    if (!explicacao) {
      contarRespostaInvalida('explicacao', entregue.model)
      log('warn', { event: 'explicacao_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu uma explicação utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    log('info', {
      event: 'explicacao',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({
      ok: true,
      explicacao,
      origem: estudo.origem,
      restanteNaAmostra: estudo.restanteNaAmostra,
      modelo: entregue.model,
    })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: `falha na explicação: ${erroDeRota(err, { event: 'explicacao_erro' })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        // Todo caminho que NÃO consumiu devolve chamada e tokens do plano.
        await reserva?.estornar()
      } finally {
        /* O uso de estudo (plano ou amostra) só volta quando NENHUM provedor respondeu. A resposta inválida foi
           cobrada e consome: senão um texto que manda o modelo quebrar o JSON daria explicações sem fim. */
        if (estudo && !provedorRespondeu) await estornarUsoDeEstudo(ctx.userId, estudo)
      }
    }
  }
}
