/**
 * O RETORNO DA ESCRITA DA LEITURA ATIVA — o núcleo de `POST /api/ai/escrita` (openspec `leitura-ativa-textos-simples`,
 * spec `leitura-ativa-escrita`; design, decisão 9), sem Express. O modelo é `explicarFrase.ts`.
 *
 * Depois de ler um texto do acervo, a pessoa reescreve com as próprias palavras ou dá a opinião (20 a 120 palavras).
 * Nos planos pagos, a IA devolve 1 elogio e até 3 pontos; no Grátis a tela confere no aparelho e nem chama aqui.
 *
 * A ORDEM, e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `leitura_ativa` — desligada, 404 `recurso_indisponivel`;
 *   2. DADOS PESSOAIS (`src/core/leitura/dadosPessoais.ts`, a mesma regra do cliente): achou, 422 `dado_pessoal` sem
 *      reservar cota nem chamar provedor — o cliente adulterado não passa;
 *   3. O PLANO: Grátis, convidado e teste de 3 dias não têm (403 `sem_plano`);
 *   4. A COTA `escritasMes` (`reservarEscrita`): esgotada, 429 `cota_esgotada`, com a data em que volta;
 *   5. PÚBLICO MENOR (ECA Digital): menor — ou idade não declarada — recebe `INSTRUCAO_DE_SEGURANCA_PARA_MENORES`;
 *   6. RETENÇÃO ZERO: as pernas só de provedor com `retencao: 'zdr'` (`pernasDaFuncao`); sem perna, 501;
 *   7. portão da nuvem, política de custo, admissão e a reserva de tokens do plano, como as outras funções;
 *   8. a cascata com o esquema `SAIDA_DA_ESCRITA`, e a leitura defensiva (`lerRetornoDaEscrita`): corta em 3, descarta
 *      ponto cujo trecho não está no texto; fora do esquema, 502 `resposta_invalida`.
 *
 * O ESTORNO (spec): qualquer falha devolve o retorno do mês — inclusive a resposta inválida ("Não deu para ler seu
 * texto agora", sem gastar cota). Os TOKENS que o provedor cobrou continuam contando na `tokensMes` e no gasto global,
 * e é isso que segura o laço de "texto que quebra o JSON": cada tentativa custa tokens do plano e passa pelo uso justo.
 *
 * NADA GUARDADO: sem cache, e nenhum texto (da pessoa ou da IA) vai para banco ou log — só o contador de uso e, no
 * log, quantos pontos e de que tipos.
 */
import { z } from 'zod'

import {
  contarPalavrasDaEscrita,
  MAX_PALAVRAS_DA_ESCRITA,
  MIN_PALAVRAS_DA_ESCRITA,
} from '../../../src/core/leitura/conferenciaLocal'
import { dadosPessoaisNoTexto } from '../../../src/core/leitura/dadosPessoais'
import type { FichaDeTexto } from '../../../src/core/leitura/fichaDeTexto'
import { definicaoDoPlano, FLAG_LEITURA_ATIVA } from '../../../src/core/planos'
import textos from '../../../src/data/leitura/textos.json'
import { SAIDA_DA_ESCRITA } from '../../../src/lib/esquemasDeSaida'
import {
  lerRetornoDaEscrita,
  MAX_CARACTERES_DO_TRECHO_DA_ESCRITA,
  MAX_PONTOS_DA_ESCRITA,
  type RetornoDaEscrita,
  systemDaEscrita,
  userDaEscrita,
} from '../../../src/lib/estudo/promptDaEscrita'
import { contarRespostaInvalida } from '../../http/metricas'
import { erroDeRota } from '../../lib/erroDeRota'
import { estornarUsoDeEstudo, type ReservaDeEstudo, reservarEscrita } from '../../lib/iaDeEstudo'
import { ehMenor, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../../lib/idade'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { ContadorIndisponivel, estimarTokens, quandoACotaVolta } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { FUNCOES_DE_IA } from '../funcoesDeIa'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { comInstrucaoDeMenor } from '../llmRequest'
import { cascataDoPlano } from '../niveis'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { recusaContadorIndisponivel, ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'
import { recusaSeSaidaBarrada } from './saidaFiltrada'

const ESCRITA = FUNCOES_DE_IA.escrita
const ROTA = '/api/ai/escrita'
/** Os relógios da explicação: a pessoa espera olhando "Lendo o seu texto…". */
const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 10_000
const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 30_000

/** O acervo, por id (a ficha é nossa: o texto lido e o enunciado vêm daqui, nunca do cliente). */
const FICHAS: ReadonlyMap<string, FichaDeTexto> = new Map((textos as unknown as FichaDeTexto[]).map((f) => [f.id, f]))

const esquemaDoPedido = z
  .object({
    textoId: z
      .string()
      .max(80)
      .regex(/^[a-z0-9-]+$/),
    tarefa: z.enum(['reescrever', 'opinar']),
    escrita: z.string().trim().min(1).max(ESCRITA.tetoEntrada),
    anteriores: z.array(z.string().max(MAX_CARACTERES_DO_TRECHO_DA_ESCRITA)).max(MAX_PONTOS_DA_ESCRITA).optional(),
  })
  .strip()

export interface PedidoDeEscrita {
  ficha: FichaDeTexto
  tarefa: 'reescrever' | 'opinar'
  escrita: string
  anteriores: string[]
}

/** Lê o corpo cru: o pedido validado (com a ficha do acervo), ou o 400 `invalido`. */
export function lerPedidoDeEscrita(corpo: unknown): { ok: true; pedido: PedidoDeEscrita } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  const ficha = parsed.success ? FICHAS.get(parsed.data.textoId) : undefined
  if (!parsed.success || !ficha)
    return recusaDeErro(
      400,
      `pedido inválido: textoId do acervo, tarefa (reescrever|opinar), escrita (até ${ESCRITA.tetoEntrada} caracteres) e até ${MAX_PONTOS_DA_ESCRITA} trechos anteriores`,
      'invalido',
    )
  const palavras = contarPalavrasDaEscrita(parsed.data.escrita)
  if (palavras < MIN_PALAVRAS_DA_ESCRITA || palavras > MAX_PALAVRAS_DA_ESCRITA)
    return recusaDeErro(
      400,
      `a escrita precisa ter de ${MIN_PALAVRAS_DA_ESCRITA} a ${MAX_PALAVRAS_DA_ESCRITA} palavras`,
      'invalido',
    )
  return {
    ok: true,
    pedido: {
      ficha,
      tarefa: parsed.data.tarefa,
      escrita: parsed.data.escrita,
      anteriores: (parsed.data.anteriores ?? []).map((a) => a.trim()).filter(Boolean),
    },
  }
}

export interface RetornoEntregue {
  ok: true
  retorno: RetornoDaEscrita
  modelo: string
}

export type ResultadoDaEscrita = RetornoEntregue | RecusaDeIa

export async function pedirRetornoDaEscrita(
  ctx: ContextoDeIa,
  pedido: PedidoDeEscrita,
  ganchos?: GanchosDoNucleo<ResultadoDaEscrita>,
): Promise<ResultadoDaEscrita> {
  const decidir = decisor(ganchos)
  return decidir(await retornar(ctx, pedido, decidir))
}

async function retornar(
  ctx: ContextoDeIa,
  pedido: PedidoDeEscrita,
  decidir: (r: ResultadoDaEscrita) => ResultadoDaEscrita,
): Promise<ResultadoDaEscrita> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_LEITURA_ATIVA)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  /* 2) DADOS PESSOAIS: a mesma regra do cliente, antes de qualquer custo. Só os tipos vão no corpo, nunca o trecho. */
  /* Os trechos anteriores também vão ao prompt: o cliente não é confiável, então passam pela mesma régua. */
  const pessoais = [pedido.escrita, ...pedido.anteriores].flatMap((t) => dadosPessoaisNoTexto(t))
  if (pessoais.length > 0)
    return decidir(
      recusaDeErro(422, 'o texto tem dados pessoais; tire essa parte antes de enviar', 'dado_pessoal', {
        tipos: [...new Set(pessoais.map((p) => p.tipo))],
      }),
    )

  let escrita: ReservaDeEstudo | null = null
  let entregou = false
  let reserva: ReservaDeLlm | null = null
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 3) e 4) O PLANO e a COTA do mês. */
    const r = await reservarEscrita(ctx.userId, plano.plan, ctx.emTeste)
    if (r.ok === false) {
      if (r.motivo === 'cota_do_mes') {
        const limite = definicaoDoPlano(plano.plan).quotas.escritasMes
        const quando = await quandoACotaVolta(ctx.userId)
        return decidir(
          recusaDeErro(429, `Você usou os ${limite} retornos deste mês. Eles voltam ${quando}.`, 'cota_esgotada', {
            limite,
            voltam: quando,
          }),
        )
      }
      return decidir(recusaDeErro(403, 'o retorno com IA faz parte dos planos pagos', 'sem_plano'))
    }
    escrita = r

    /* 5) Público menor. */
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })

    /* 6) Pernas só com retenção zero. */
    const { nivel, pernas } = cascataDoPlano('escrita', plano)
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para a escrita' }))
    rastro.anotar({ nivel })

    /* 7) Portão, custo, admissão, tokens do plano. */
    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const { ficha } = pedido
    const messages: MensagemDeChat[] = [
      {
        role: 'system',
        content: comInstrucaoDeMenor(
          systemDaEscrita(ficha.nivel),
          menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
        ),
      },
      {
        role: 'user',
        content: userDaEscrita({
          escrita: pedido.escrita,
          original: ficha.texto,
          enunciado: ficha.tarefaDeEscrita[pedido.tarefa],
          anteriores: pedido.anteriores,
        }),
      },
    ]
    const maxTokens = ESCRITA.maxTokens
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

    const reservada = await reservarLlm(ctx.userId, estimativa, 'plano', plano.plan)
    if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402/429 da cota de tokens ou 503
    reserva = reservada

    /* 8) A cascata. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      {
        messages,
        temperature: ESCRITA.temperatura,
        maxTokens,
        timeoutMs: TIMEOUT_MS,
        formatoDeSaida: SAIDA_DA_ESCRITA,
      },
      {
        evento: 'escrita',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'escrita',
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
        event: 'escrita_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'retorno indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: os tokens e o gasto contam, com ou sem JSON útil. */
    await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const retorno = lerRetornoDaEscrita(entregue.texto, pedido.escrita, pedido.anteriores)
    if (!retorno) {
      contarRespostaInvalida('escrita', entregue.model)
      log('warn', { event: 'escrita_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu um retorno utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    /* Perfil protegido: o que o modelo escreveu passa pelo filtro local antes de sair (change `filtro-tutor-menores`). */
    const barrada = await recusaSeSaidaBarrada(ctx, 'escrita', menor, retorno)
    if (barrada) return decidir(barrada)
    entregou = true
    /* Só quantos pontos e de que tipos: nada do texto. */
    log('info', {
      event: 'escrita',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      total: retorno.pontos.length,
      situacao: retorno.pontos
        .map((p) => p.tipo)
        .sort()
        .join(','),
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({ ok: true, retorno, modelo: entregue.model })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: `falha na escrita: ${erroDeRota(err, { event: 'escrita_erro' })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        await reserva?.estornar()
      } finally {
        /* O retorno do mês só conta quando a pessoa RECEBEU um retorno (spec: erro da IA não gasta cota). */
        if (escrita && !entregou) await estornarUsoDeEstudo(ctx.userId, escrita)
      }
    }
  }
}
