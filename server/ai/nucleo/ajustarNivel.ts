/**
 * AJUSTAR NÍVEL — o núcleo de `POST /api/leitura/ajustar-nivel` (openspec `leitura-assistida`, spec
 * `ajustar-nivel-de-leitura`; fatia D), sem Express. O modelo é `escrita.ts`.
 *
 * A pessoa seleciona uma palavra, um trecho, um parágrafo (ou o capítulo, parágrafo a parágrafo) e pede o nível de A1 a C2;
 * a IA reescreve preservando as palavras que ela já conhece (até 300 formas, só palavras). Quem decide se ficou no nível é o
 * CLASSIFICADOR LOCAL (`src/core/leitura/ajustarNivel.ts`), não o modelo.
 *
 * A ORDEM, e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `ia_ajustar_nivel` — desligada, 404 `recurso_indisponivel`, sem gastar nada;
 *   2. O PLANO e a COTA (`ajustesDeNivelMes`, ou `ajustesDeCapituloMes` no 1o parágrafo do capítulo): Grátis, convidado e teste
 *      não têm (403 `sem_plano`); esgotada, 429 `cota_esgotada` com a data em que volta;
 *   3. PÚBLICO MENOR (ECA Digital): menor — ou idade não declarada — recebe `INSTRUCAO_DE_SEGURANCA_PARA_MENORES`;
 *   4. RETENÇÃO ZERO: pernas só de provedor `zdr` (`pernasDaFuncao`); sem perna, 501. Gemini nunca é perna;
 *   5. portão da nuvem, política de custo, admissão e a reserva de tokens do plano (para as 2 chamadas do pior caso);
 *   6. GERAR (1 chamada) → MEDIR (local, de graça) → REESCREVER no máximo UMA vez se o nível ficou fora do alvo ou uma conhecida
 *      sumiu. NUNCA mais que 2 chamadas por ajuste. O custo declarado é a SOMA do que os provedores cobraram;
 *   7. PERFIL PROTEGIDO: o texto final passa por `recusaSeSaidaBarrada` ANTES de sair; barrou, 502 `saida_filtrada` e nada do
 *      texto vai na resposta (a tela mantém o original).
 *
 * O ESTORNO: a cota do mês só fica gasta quando a pessoa RECEBE um ajuste (falha, resposta inútil e saída barrada devolvem). Os
 * TOKENS que o provedor cobrou continuam na `tokensMes` e no gasto global, que seguram o laço de "texto que faz o modelo calar".
 * Na 2a chamada inútil, a primeira versão é devolvida com o aviso.
 *
 * NADA GUARDADO: sem cache no servidor (o cache é do aparelho) e nenhum texto (do livro ou da IA) vai a banco ou log — só
 * escopo, nível pedido, nível medido, número de chamadas e custo.
 */
import { z } from 'zod'

import {
  CUSTO_ZERO,
  type CustoDoAjuste,
  decidirReescrita,
  ehAcaoDeUmaChamada,
  ESCOPOS_DO_AJUSTE,
  IDIOMA_VALIDO,
  lerTextoAjustado,
  MAX_CARACTERES_DA_PALAVRA,
  MAX_CARACTERES_DO_AJUSTE,
  MAX_CONHECIDAS,
  medirNivel,
  NIVEIS_DO_AJUSTE,
  type NivelDoAjuste,
  somarCusto,
  systemDaAcao,
  systemDoAjuste,
  userDoAjuste,
} from '../../../src/core/leitura/ajustarNivel'
import { definicaoDoPlano, FLAG_IA_AJUSTAR_NIVEL } from '../../../src/core/planos'
import { contarRespostaInvalida } from '../../http/metricas'
import { reservarAjusteDeNivel, type TipoDeAjuste } from '../../lib/ajustesDeNivel'
import { erroDeRota } from '../../lib/erroDeRota'
import { estornarUsoDeEstudo, type ReservaDeEstudo } from '../../lib/iaDeEstudo'
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

const AJUSTE = FUNCOES_DE_IA.ajustarNivel
const ROTA = '/api/leitura/ajustar-nivel'
/** Os relógios: a pessoa espera olhando o painel. Duas chamadas cabem no prazo total. */
const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 10_000
const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 40_000
/** A frase em volta da palavra, em caracteres. */
export const MAX_CARACTERES_DA_FRASE_DA_PALAVRA = 400

const FORMA = /^\p{L}[\p{L}\p{M}'’-]*$/u

const esquemaDoPedido = z
  .object({
    texto: z.string().trim().min(1).max(MAX_CARACTERES_DO_AJUSTE),
    frase: z.string().trim().max(MAX_CARACTERES_DA_FRASE_DA_PALAVRA).optional(),
    idioma: z.string().trim().max(20).regex(IDIOMA_VALIDO),
    escopo: z.enum(ESCOPOS_DO_AJUSTE as [string, ...string[]]),
    nivelAlvo: z.enum(NIVEIS_DO_AJUSTE as unknown as [string, ...string[]]),
    acao: z.enum(['ajustar', 'exemplo', 'gramatica', 'resumo']).optional(),
    /** O idioma de quem estuda: a explicação da gramática vem nele. */
    idiomaDaPessoa: z.string().trim().max(20).regex(IDIOMA_VALIDO).optional(),
    inicioDeCapitulo: z.boolean().optional(),
    conhecidas: z.array(z.string().max(40)).max(MAX_CONHECIDAS).optional(),
  })
  .strip()

export interface PedidoDeAjuste {
  texto: string
  frase: string | undefined
  idioma: string
  escopo: (typeof ESCOPOS_DO_AJUSTE)[number]
  alvo: NivelDoAjuste
  acao: 'ajustar' | 'exemplo' | 'gramatica' | 'resumo'
  idiomaDaPessoa: string
  inicioDeCapitulo: boolean
  conhecidas: string[]
}

/** Lê o corpo cru: o pedido validado, ou o 400 `invalido`. As conhecidas viram SÓ palavras (entram no system). */
export function lerPedidoDeAjuste(corpo: unknown): { ok: true; pedido: PedidoDeAjuste } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  const invalido = recusaDeErro(
    400,
    `pedido inválido: texto (1 a ${MAX_CARACTERES_DO_AJUSTE} caracteres; a palavra, até ${MAX_CARACTERES_DA_PALAVRA}), idioma, escopo (palavra|trecho|paragrafo|capitulo), nivelAlvo (A1 a C2) e até ${MAX_CONHECIDAS} conhecidas`,
    'invalido',
  )
  if (!parsed.success) return invalido
  const d = parsed.data
  if (d.escopo === 'palavra' && d.texto.length > MAX_CARACTERES_DA_PALAVRA) return invalido
  if (d.escopo === 'palavra' && (d.acao ?? 'ajustar') === 'ajustar' && !d.frase) return invalido
  return {
    ok: true,
    pedido: {
      texto: d.texto,
      frase: d.frase || undefined,
      idioma: d.idioma,
      escopo: d.escopo as PedidoDeAjuste['escopo'],
      alvo: d.nivelAlvo as NivelDoAjuste,
      acao: d.acao ?? 'ajustar',
      idiomaDaPessoa: d.idiomaDaPessoa ?? 'pt-BR',
      inicioDeCapitulo: d.inicioDeCapitulo === true,
      conhecidas: (d.conhecidas ?? []).map((c) => c.trim()).filter((c) => FORMA.test(c)),
    },
  }
}

/** O ajuste entregue, o nível MEDIDO (nunca o prometido) e o que a tela deve avisar. */
export interface AjusteEntregue {
  ok: true
  ajustado: string
  /** O nível medido pelo classificador local; `null` quando não dá para medir (idioma sem lista, texto curto). */
  nivelMedido: NivelDoAjuste | null
  confianciaDaMedida: 'alta' | 'media' | 'baixa'
  /** Conhecidas que o modelo trocou, mesmo depois da reescrita (a tela avisa). */
  conhecidasTrocadas: string[]
  /** O nível ainda ficou fora do alvo depois da reescrita (a tela mostra o medido e não afirma o pedido). */
  foraDoNivel: boolean
  reescrito: boolean
  custo: CustoDoAjuste
  modelo: string
}

export type ResultadoDoAjuste = AjusteEntregue | RecusaDeIa

export async function ajustarNivel(
  ctx: ContextoDeIa,
  pedido: PedidoDeAjuste,
  ganchos?: GanchosDoNucleo<ResultadoDoAjuste>,
): Promise<ResultadoDoAjuste> {
  const decidir = decisor(ganchos)
  return decidir(await ajustar(ctx, pedido, decidir))
}

const MENSAGEM_SEM_PLANO = 'o ajuste de nível faz parte dos planos pagos'

function tipoDeAjuste(p: PedidoDeAjuste): TipoDeAjuste {
  if (p.escopo !== 'capitulo') return 'nivel'
  return p.inicioDeCapitulo ? 'capitulo-inicio' : 'capitulo-continuacao'
}

async function ajustar(
  ctx: ContextoDeIa,
  pedido: PedidoDeAjuste,
  decidir: (r: ResultadoDoAjuste) => ResultadoDoAjuste,
): Promise<ResultadoDoAjuste> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_IA_AJUSTAR_NIVEL)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  let cota: ReservaDeEstudo | null = null
  /** A pessoa RECEBEU um ajuste? Só então a cota do mês fica gasta (erro da IA não gasta cota, como na escrita). */
  let entregou = false
  let reserva: ReservaDeLlm | null = null
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 2) O PLANO e a COTA. */
    const tipo = tipoDeAjuste(pedido)
    const r = await reservarAjusteDeNivel(ctx.userId, plano.plan, ctx.emTeste, tipo)
    if (r.ok === false) {
      if (r.motivo === 'cota_do_mes') {
        const quotas = definicaoDoPlano(plano.plan).quotas
        const limite = tipo === 'nivel' ? quotas.ajustesDeNivelMes : quotas.ajustesDeCapituloMes
        const quando = await quandoACotaVolta(ctx.userId)
        return decidir(
          recusaDeErro(429, `Você usou os ajustes deste mês. Eles voltam ${quando}.`, 'cota_esgotada', {
            limite,
            voltam: quando,
            capitulo: tipo !== 'nivel',
          }),
        )
      }
      return decidir(recusaDeErro(403, MENSAGEM_SEM_PLANO, 'sem_plano'))
    }
    cota = r

    /* 3) Público menor. */
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })

    /* 4) Pernas só com retenção zero. */
    const { nivel, pernas } = cascataDoPlano('ajustarNivel', plano)
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para o ajuste de nível' }))
    rastro.anotar({ nivel })

    /* 5) Portão, custo, admissão, tokens do plano (o pior caso: 2 chamadas). */
    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const instrucaoDeMenor = menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined
    const montar = (system: string, user: string): MensagemDeChat[] => [
      { role: 'system', content: comInstrucaoDeMenor(system, instrucaoDeMenor) },
      { role: 'user', content: user },
    ]
    /* Exemplo, gramática e resumo: UMA chamada, sem medir nível nem reescrever. */
    const acaoSimples = ehAcaoDeUmaChamada(pedido.acao) ? pedido.acao : null
    const umaChamada = acaoSimples !== null
    const primeira = montar(
      acaoSimples
        ? systemDaAcao({
            acao: acaoSimples,
            idioma: pedido.idioma,
            idiomaDaPessoa: pedido.idiomaDaPessoa,
            alvo: pedido.alvo,
            conhecidas: pedido.conhecidas,
          })
        : systemDoAjuste({
            idioma: pedido.idioma,
            alvo: pedido.alvo,
            escopo: pedido.escopo,
            conhecidas: pedido.conhecidas,
          }),
      userDoAjuste({ texto: pedido.texto, escopo: pedido.escopo, frase: pedido.frase }),
    )
    const maxTokens = AJUSTE.maxTokens
    const estimativaDeUma = estimarTokens(tamanhoDoPrompt(primeira), maxTokens)
    const chamadasPossiveis = umaChamada || pedido.escopo === 'palavra' ? 1 : 2
    /* A reescrita leva o texto de novo + a versão anterior: o dobro da entrada, no máximo. */
    const estimativa = estimativaDeUma * chamadasPossiveis + (chamadasPossiveis > 1 ? tamanhoDoPrompt(primeira) / 4 : 0)

    const custo = await aplicarPoliticaDeCusto({
      pernas,
      nivel,
      fracaoDoOrcamento: portao.fracaoDoOrcamento ?? 0,
      tokensEntrada: Math.max(1, estimativa - maxTokens * chamadasPossiveis),
      tokensSaida: maxTokens * chamadasPossiveis,
    })
    if (custo.degradacao !== 'nenhuma') rastro.anotar({ degradacao: custo.degradacao })

    const admitida = await admitirCascata(custo.pernas, {
      userId: ctx.userId,
      plano: planoDeAdmissao(plano.plan, false, ctx.emTeste),
      tokens: Math.ceil(estimativa),
    })
    if (admitida.ok === false) return decidir(recusaNuvemOcupada(admitida.recusa))
    admissao = admitida.admissao

    const reservada = await reservarLlm(ctx.userId, Math.ceil(estimativa), 'plano', plano.plan)
    if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402/429 da cota de tokens ou 503
    reserva = reservada

    /* Uma chamada da cascata; soma o que o provedor cobrou. `null` = nenhuma perna respondeu. */
    let gasto: CustoDoAjuste = CUSTO_ZERO
    let modelo = ''
    let falha: RecusaDeIa | null = null
    let ultimaFalha = ''
    const chamar = async (messages: MensagemDeChat[]): Promise<string | null> => {
      const {
        entregue,
        ultimaFalha: f,
        limitadoPeloProvedor,
      } = await percorrerCascata(
        custo.pernas,
        { messages, temperature: AJUSTE.temperatura, maxTokens, timeoutMs: TIMEOUT_MS },
        {
          evento: 'ajustar_nivel',
          route: ROTA,
          requestId: ctx.requestId,
          funcao: 'ajustar-nivel',
          rastro,
          admissao: admissao ?? undefined,
          fatorDeSaida: custo.fatorDeSaida,
          timeoutDaPrimeiraPernaMs: TIMEOUT_DA_PRIMEIRA_PERNA_MS,
          prazoTotalMs: PRAZO_TOTAL_MS,
        },
      )
      if (!entregue) {
        ultimaFalha = f
        if (limitadoPeloProvedor)
          falha = recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS })
        return null
      }
      gasto = somarCusto(gasto, {
        tokensEntrada: entregue.tokensEntrada,
        tokensSaida: entregue.tokensSaida,
        usd: entregue.custoUsd,
        chamadas: 1,
      })
      modelo = entregue.model
      await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
      await ctx.registrarCusto?.(entregue.custoUsd)
      return entregue.texto
    }

    /* 6) GERAR. */
    const bruto = await chamar(primeira)
    if (bruto === null) {
      if (falha) return decidir(falha)
      log('error', {
        event: 'ajustar_nivel_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'ajuste indisponível agora', 'provedor_indisponivel'))
    }
    let ajustado = lerTextoAjustado(bruto, pedido.texto)
    if (ajustado === null) {
      await reserva.consumir(gasto.tokensEntrada + gasto.tokensSaida)
      contarRespostaInvalida('ajustarNivel', modelo)
      log('warn', { event: 'ajustar_nivel_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(recusaDeErro(502, 'o modelo não devolveu um texto utilizável; tente de novo', 'resposta_invalida'))
    }

    /* MEDIR (local) e, se for o caso, REESCREVER UMA VEZ. */
    let reescrito = false
    if (!umaChamada && pedido.escopo !== 'palavra') {
      const decisao = decidirReescrita({
        original: pedido.texto,
        ajustado,
        alvo: pedido.alvo,
        idioma: pedido.idioma,
        conhecidas: pedido.conhecidas,
        escopo: pedido.escopo,
      })
      if (decisao.reescrever) {
        const segunda = await chamar(
          montar(
            systemDoAjuste({
              idioma: pedido.idioma,
              alvo: pedido.alvo,
              escopo: pedido.escopo,
              conhecidas: pedido.conhecidas,
              corrigir: {
                medido: decisao.motivos.some((m) => m !== 'conhecidas') ? decisao.medido.nivel : null,
                perdidas: decisao.perdidas,
              },
            }),
            userDoAjuste({ texto: pedido.texto, escopo: pedido.escopo, versaoAnterior: ajustado }),
          ),
        )
        /* A 2a chamada falhou ou veio inútil: fica a 1a versão, com o aviso. */
        const lida = segunda === null ? null : lerTextoAjustado(segunda, pedido.texto)
        if (lida !== null) {
          ajustado = lida
          reescrito = true
        }
      }
    }
    await reserva.consumir(gasto.tokensEntrada + gasto.tokensSaida)

    /* O resultado final medido: é o que a tela mostra (nunca "exatamente B1"). */
    const final = umaChamada || pedido.escopo === 'palavra' ? null : medirNivel(ajustado, pedido.idioma)
    const perdidas = umaChamada
      ? []
      : decidirReescrita({
          original: pedido.texto,
          ajustado,
          alvo: pedido.alvo,
          idioma: pedido.idioma,
          conhecidas: pedido.conhecidas,
          escopo: 'palavra',
        }).perdidas
    const foraDoNivel =
      final !== null &&
      decidirReescrita({
        original: pedido.texto,
        ajustado,
        alvo: pedido.alvo,
        idioma: pedido.idioma,
        conhecidas: [],
        escopo: pedido.escopo,
      }).reescrever

    /* 7) Perfil protegido: o texto passa pelo filtro local antes de sair. */
    const barrada = await recusaSeSaidaBarrada(ctx, 'ajustarNivel', menor, ajustado)
    if (barrada) return decidir(barrada)

    /* Só números e rótulos: nada do texto. */
    log('info', {
      event: 'ajustar_nivel',
      route: ROTA,
      status: 200,
      /* O LogFields é lista fechada: `total` leva as chamadas feitas (1 ou 2); nível e escopo ficam no rastro. */
      total: gasto.chamadas,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    entregou = true
    return decidir({
      ok: true,
      ajustado,
      nivelMedido: final?.nivel ?? null,
      confianciaDaMedida: final?.confianca ?? 'baixa',
      conhecidasTrocadas: perdidas,
      foraDoNivel,
      reescrito,
      custo: gasto,
      modelo,
    })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: `falha no ajuste: ${erroDeRota(err, { event: 'ajustar_nivel_erro' })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        await reserva?.estornar()
      } finally {
        /* A cota do mês só conta quando a pessoa RECEBEU um ajuste. Os TOKENS que o provedor cobrou seguem na `tokensMes` e no
           gasto global, e é isso que segura o laço de "texto que faz o modelo calar". */
        if (cota && !entregou) await estornarUsoDeEstudo(ctx.userId, cota)
      }
    }
  }
}
