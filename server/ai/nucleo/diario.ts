/**
 * O RETORNO DO DIÁRIO — o núcleo de `POST /api/ai/diario` (openspec `diario-com-correcao-que-vira-cartao`, specs
 * `diario-de-escrita`), sem Express. O modelo é `escrita.ts` (Leitura ativa): MESMO caminho, sem a ficha do acervo.
 *
 * A pessoa escreve livremente sobre o dia no idioma que aprende (20 a 200 palavras). Nos planos pagos, a IA devolve 1
 * elogio e até 3 pontos (`trecho` exato, `tipo`, `dica` em português, `exemplo`); cada ponto vira cartão no CLIENTE
 * (`pontoParaCartao`), sem nova chamada de IA. No Grátis a tela confere no aparelho e nem chama aqui.
 *
 * A ORDEM, e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `diario` — desligada, 404 `recurso_indisponivel`;
 *   2. MENOR (ECA Digital): na v1 a IA do diário é SÓ PARA ADULTO DECLARADO. Menor, idade não declarada ou sem conta:
 *      403 `sem_plano`, antes de qualquer cota. Liberar 12 a 17 anos é decisão do dono, depois de `filtro-tutor-menores`
 *      4.3/4.4 e da rodada de risco (`IA_DO_DIARIO_PARA_MENORES`);
 *   3. DADOS PESSOAIS (a mesma regra do cliente): 422 `dado_pessoal`, sem reservar cota nem chamar provedor;
 *   4. SINAIS DE RISCO (`sinalDeRisco`, a mesma regra do cliente): 422 `sinal_de_risco` sem chamar a IA, sem registrar o
 *      texto (o log leva só a categoria) — o cliente adulterado não passa;
 *   5. O PLANO e a COTA `escritasMes` (a MESMA da Leitura ativa; decisão assumida): Grátis, convidado e teste 403
 *      `sem_plano`; esgotada, 429 `cota_esgotada`;
 *   6. RETENÇÃO ZERO: as pernas só de provedor com `retencao: 'zdr'` (`pernasDaFuncao`); sem perna, 501;
 *   7. portão da nuvem, política de custo, admissão e a reserva de tokens do plano, como as outras funções;
 *   8. a cascata com o esquema `SAIDA_DA_ESCRITA` e a leitura defensiva (`lerRetornoDoDiario`): corta em 3, descarta
 *      ponto cujo trecho não está no texto; fora do esquema, 502 `resposta_invalida`.
 *
 * O ESTORNO: qualquer falha devolve o retorno do mês, inclusive a resposta inválida. Os TOKENS cobrados continuam
 * contando na `tokensMes` e no gasto global (é o que segura o laço de "texto que quebra o JSON").
 *
 * NADA GUARDADO: sem cache, e nenhum texto (da pessoa ou da IA) vai para banco ou log — só o contador de uso e, no log,
 * quantos pontos e de que tipos.
 */
import { z } from 'zod'

import { sinalDeRisco } from '../../../src/core/diario/sinaisDeRisco'
import { contarPalavrasDaEscrita } from '../../../src/core/leitura/conferenciaLocal'
import { dadosPessoaisNoTexto } from '../../../src/core/leitura/dadosPessoais'
import { definicaoDoPlano, FLAG_DIARIO } from '../../../src/core/planos'
import { SAIDA_DA_ESCRITA } from '../../../src/lib/esquemasDeSaida'
import type { RetornoDaEscrita } from '../../../src/lib/estudo/promptDaEscrita'
import {
  type IdiomaDoDiario,
  IDIOMAS_DO_DIARIO,
  lerRetornoDoDiario,
  MAX_PALAVRAS_DO_DIARIO,
  MIN_PALAVRAS_DO_DIARIO,
  NIVEIS_DO_DIARIO,
  type NivelDoDiario,
  systemDoDiario,
  userDoDiario,
} from '../../../src/lib/estudo/promptDoDiario'
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

const DIARIO = FUNCOES_DE_IA.diario
const ROTA = '/api/ai/diario'
/** Os relógios do retorno: a pessoa espera olhando "Lendo o seu texto…". */
const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 10_000
const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 30_000

/**
 * A IA do diário para PERFIL PROTEGIDO (menor de 18 ou idade não declarada). `false` na v1 (decisão 2 da change, assumida
 * como a recomendação: só adulto declarado). Virar `true` só depois de `filtro-tutor-menores` 4.3/4.4 e da rodada de
 * risco (tarefa 3.4) — ato do dono. Com `true`, a instrução de segurança e o moderador de saída já estão no caminho.
 */
export const IA_DO_DIARIO_PARA_MENORES = false as boolean

const esquemaDoPedido = z
  .object({
    idioma: z.enum(IDIOMAS_DO_DIARIO),
    nivel: z.enum(NIVEIS_DO_DIARIO),
    escrita: z.string().trim().min(1).max(DIARIO.tetoEntrada),
  })
  .strip()

export interface PedidoDoDiario {
  idioma: IdiomaDoDiario
  nivel: NivelDoDiario
  escrita: string
}

/** Lê o corpo cru: o pedido validado, ou o 400 `invalido`. */
export function lerPedidoDoDiario(corpo: unknown): { ok: true; pedido: PedidoDoDiario } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success)
    return recusaDeErro(
      400,
      `pedido inválido: idioma (${IDIOMAS_DO_DIARIO.join('|')}), nivel (${NIVEIS_DO_DIARIO.join('|')}) e escrita (até ${DIARIO.tetoEntrada} caracteres)`,
      'invalido',
    )
  const palavras = contarPalavrasDaEscrita(parsed.data.escrita)
  if (palavras < MIN_PALAVRAS_DO_DIARIO || palavras > MAX_PALAVRAS_DO_DIARIO)
    return recusaDeErro(
      400,
      `a escrita precisa ter de ${MIN_PALAVRAS_DO_DIARIO} a ${MAX_PALAVRAS_DO_DIARIO} palavras`,
      'invalido',
    )
  return { ok: true, pedido: parsed.data }
}

export interface RetornoDoDiarioEntregue {
  ok: true
  retorno: RetornoDaEscrita
  modelo: string
}

export type ResultadoDoDiario = RetornoDoDiarioEntregue | RecusaDeIa

export async function pedirRetornoDoDiario(
  ctx: ContextoDeIa,
  pedido: PedidoDoDiario,
  ganchos?: GanchosDoNucleo<ResultadoDoDiario>,
): Promise<ResultadoDoDiario> {
  const decidir = decisor(ganchos)
  return decidir(await retornar(ctx, pedido, decidir))
}

async function retornar(
  ctx: ContextoDeIa,
  pedido: PedidoDoDiario,
  decidir: (r: ResultadoDoDiario) => ResultadoDoDiario,
): Promise<ResultadoDoDiario> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_DIARIO)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  /* 2) MENOR: na v1 a IA do diário é só para adulto declarado. Antes de qualquer cota. */
  const menor = await ehMenor(ctx.userId)
  rastro.anotar({ menor })
  if (menor && !IA_DO_DIARIO_PARA_MENORES)
    return decidir(recusaDeErro(403, 'o retorno com IA do diário não está disponível para este perfil', 'sem_plano'))

  /* 3) DADOS PESSOAIS: a mesma regra do cliente, antes de qualquer custo. Só os tipos vão no corpo, nunca o trecho. */
  const pessoais = dadosPessoaisNoTexto(pedido.escrita)
  if (pessoais.length > 0)
    return decidir(
      recusaDeErro(422, 'o texto tem dados pessoais; tire essa parte antes de enviar', 'dado_pessoal', {
        tipos: [...new Set(pessoais.map((p) => p.tipo))],
      }),
    )

  /* 4) SINAIS DE RISCO: com sinal, a IA não é chamada e o texto não é registrado (só a categoria). */
  const risco = sinalDeRisco(pedido.escrita)
  if (risco) {
    log('warn', { event: 'diario_sinal_de_risco', route: ROTA, categoria: risco.categoria, requestId: ctx.requestId })
    return decidir(
      recusaDeErro(422, 'este texto não pode ser enviado à IA', 'sinal_de_risco', { categoria: risco.categoria }),
    )
  }

  let escrita: ReservaDeEstudo | null = null
  let entregou = false
  let reserva: ReservaDeLlm | null = null
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 5) O PLANO e a COTA do mês (a `escritasMes` compartilhada com a Leitura ativa). */
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

    /* 6) Pernas só com retenção zero. */
    const { nivel, pernas } = cascataDoPlano('diario', plano)
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para o diário' }))
    rastro.anotar({ nivel })

    /* 7) Portão, custo, admissão, tokens do plano. */
    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const messages: MensagemDeChat[] = [
      {
        role: 'system',
        content: comInstrucaoDeMenor(
          systemDoDiario(pedido.idioma, pedido.nivel),
          menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
        ),
      },
      { role: 'user', content: userDoDiario(pedido.escrita) },
    ]
    const maxTokens = DIARIO.maxTokens
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
        temperature: DIARIO.temperatura,
        maxTokens,
        timeoutMs: TIMEOUT_MS,
        formatoDeSaida: SAIDA_DA_ESCRITA,
      },
      {
        evento: 'diario',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'diario',
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
        event: 'diario_indisponivel',
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

    const retorno = lerRetornoDoDiario(entregue.texto, pedido.escrita, [])
    if (!retorno) {
      contarRespostaInvalida('diario', entregue.model)
      log('warn', { event: 'diario_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu um retorno utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    /* Perfil protegido (quando a IA for liberada): o que o modelo escreveu passa pelo filtro local antes de sair. */
    const barrada = await recusaSeSaidaBarrada(ctx, 'diario', menor, retorno)
    if (barrada) return decidir(barrada)
    entregou = true
    /* Só quantos pontos e de que tipos: nada do texto. */
    log('info', {
      event: 'diario',
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
    return decidir(recusar(502, { error: `falha no diário: ${erroDeRota(err, { event: 'diario_erro' })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        await reserva?.estornar()
      } finally {
        /* O retorno do mês só conta quando a pessoa RECEBEU um retorno (erro da IA não gasta cota). */
        if (escrita && !entregou) await estornarUsoDeEstudo(ctx.userId, escrita)
      }
    }
  }
}
