/**
 * O ASSISTENTE AO VIVO — o núcleo, sem Express (`POST /api/ai/assistente/*`; spec
 * `docs/specs/2026-10-25-assistente-ao-vivo.md`). Quatro ajudas de IDIOMA sobre o texto que a PRÓPRIA pessoa está vendo
 * na legenda ou acabou de falar:
 *
 *   expressoes    — as expressões idiomáticas e gírias da linha da legenda (automático; o cliente guarda em cache);
 *   termos        — o termo técnico ou a sigla da linha, em uma linha (automático; cache no cliente, por termo);
 *   comoRespondo  — três respostas curtas com a tradução (sob demanda) — ajuda de idioma, nunca "modo oculto";
 *   correcao      — a correção gentil da fala da própria pessoa (opt-in no cliente).
 *
 * A palavra acima do nível é 100% local (`src/core/assistente/palavrasAcimaDoNivel.ts`) e não passa por aqui.
 *
 * A ORDEM (a mesma da explicação, `explicarFrase.ts`), e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `assistente_ao_vivo` — desligada (ou sem quem a responda), 404
 *      `recurso_indisponivel`, sem gastar nada;
 *   2. O TETO DO DIA (`server/lib/assistenteAoVivo.ts`): o plano (`assistenteDia`). Grátis e convidado: 402
 *      `sem_plano`; o teto de hoje acabou: 429 `teto_do_assistente` — antes de portão, admissão ou provedor;
 *   3. PÚBLICO MENOR (ECA Digital): menor — ou quem não declarou a idade — recebe
 *      `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` no fim do system, e o "Como respondo?" vai SEM o contexto (só a frase
 *      que a própria pessoa está vendo; nada de conversa de terceiros);
 *   4. RETENÇÃO ZERO: só provedor com `retencao: 'zdr'` (`pernasDaFuncao('assistente')`); sem perna, 501;
 *   5. o MESMO CAMINHO DAS OUTRAS FUNÇÕES: portão da nuvem, política de custo, admissão, a SUBCOTA de tokens do
 *      assistente (`assistenteTokensMes`, 25% da `tokensMes`; esgotada, 402 `cota_do_assistente`) e a reserva de
 *      chamada + tokens da cota do plano (o 429 `uso_justo_do_dia` vem dela) — os mesmos tokens contam nas duas;
 *   6. a cascata com relógios CURTOS (a frase some da tela em segundos), o custo no gasto global e a leitura defensiva:
 *      resposta fora do formato é 502 `resposta_invalida` — nunca ajuda inventada —, com o uso do dia CONSUMIDO (o
 *      provedor cobrou). O uso do dia só é estornado quando nenhum provedor respondeu.
 *
 * O CORPO É ESTRITO (`z.strictObject`): só os campos do texto da própria pessoa (`frase`, `termos`, `contexto`,
 * `minhaFala`) e os idiomas. Chave desconhecida (um "falante", "participantes", a transcrição inteira) é 400 — não há
 * caminho para analisar terceiros. SEM CACHE no servidor (retenção zero): a frase é da conversa de alguém.
 */
import { z } from 'zod'

import { type NivelDaTraducao, rebaixarNivel } from '../../../src/core/nivelDeTraducao'
import { FLAG_ASSISTENTE_AO_VIVO } from '../../../src/core/planos'
import {
  type FormatoDeSaida,
  SAIDA_DA_CORRECAO,
  SAIDA_DAS_EXPRESSOES,
  SAIDA_DO_COMO_RESPONDO,
  SAIDA_DOS_TERMOS,
} from '../../../src/lib/esquemasDeSaida'
import {
  type CorrecaoDaFala,
  type EntradaDoAssistente,
  estaNaFrase,
  type ExpressaoDestacada,
  lerCorrecao,
  lerExpressoes,
  lerSugestoes,
  lerTermos,
  PARAMETROS_DO_ASSISTENTE,
  type RecursoDoAssistente,
  type SugestaoDeResposta,
  systemDoAssistente,
  type TermoExplicado,
  userDoAssistente,
} from '../../../src/lib/estudo/promptDoAssistente'
import { criarLeitorDeSugestoesEmFluxo } from '../../../src/lib/estudo/sugestoesEmFluxo'
import { contarRespostaInvalida } from '../../http/metricas'
import {
  acertarTokensDoAssistente,
  estornarUsoDoAssistente,
  type ReservaDeTokensDoAssistente,
  type ReservaDoAssistente,
  reservarTokensDoAssistente,
  reservarUsoDoAssistente,
} from '../../lib/assistenteAoVivo'
import { erroDeRota } from '../../lib/erroDeRota'
import { ehMenor, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../../lib/idade'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { ContadorIndisponivel, estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { recusaCancelada } from '../cancelamento'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { comInstrucaoDeMenor } from '../llmRequest'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { cascataDeNuvem } from '../provedores'
import { recusaContadorIndisponivel, ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { codigoDeIdioma, type RastroDeIa } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

export const ROTA_DO_ASSISTENTE: Readonly<Record<RecursoDoAssistente, string>> = {
  expressoes: '/api/ai/assistente/expressoes',
  termos: '/api/ai/assistente/termos',
  comoRespondo: '/api/ai/assistente/como-respondo',
  correcao: '/api/ai/assistente/correcao',
}

/**
 * O NÍVEL DE CADA RECURSO — o mais barato que não piora a experiência (`docs/auditoria/eval-assistente-v1.md`). Sempre
 * pelo `rebaixarNivel`: quem não tem `traducaoNuance` recebe a rápida. Medido em 25/10/2026: a rápida (Gemma 4 26B com
 * o roteamento da legenda) empatou ou venceu o DeepSeek v4.1 Flash e o gpt-oss-120b nos quatro, e custou menos.
 */
export const NIVEL_DO_RECURSO: Readonly<Record<RecursoDoAssistente, NivelDaTraducao>> = {
  expressoes: 'rapida',
  termos: 'rapida',
  comoRespondo: 'rapida',
  correcao: 'rapida',
}

const SAIDA_DO_RECURSO: Readonly<Record<RecursoDoAssistente, FormatoDeSaida>> = {
  expressoes: SAIDA_DAS_EXPRESSOES,
  termos: SAIDA_DOS_TERMOS,
  comoRespondo: SAIDA_DO_COMO_RESPONDO,
  correcao: SAIDA_DA_CORRECAO,
}

/**
 * OS RELÓGIOS. A frase fica na tela por segundos, e o "Como respondo?" tem alvo de 3 s no p95 (a conversa já passou
 * depois disso): a primeira perna tem 5 s, as reservas 6 s, e a cascata inteira 10 s. O cliente desiste em 12 s
 * (`src/data/apiDoAssistente.ts`), depois do servidor.
 */
export const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 5_000
const TIMEOUT_MS = 6_000
export const PRAZO_TOTAL_MS = 10_000
/**
 * EM FLUXO, a primeira sugestão só COMPROMETE a resposta se sobrar pelo menos isto até o prazo total: com menos, a
 * pessoa veria 1 sugestão e logo o erro do prazo. A perna segue sem compromisso: termina a tempo, a lista vai inteira
 * de uma vez; não termina, é o 502 de sempre, sem cobrança.
 */
export const MARGEM_DO_COMPROMISSO_MS = 1_500

/** Os limites de entrada, em caracteres. */
export const MAX_CARACTERES_DA_LINHA = 300
export const MAX_CARACTERES_DA_FALA = 400
export const MAX_TERMOS_PEDIDOS = 3
export const MAX_CARACTERES_DO_TERMO_PEDIDO = 40
export const MAX_LINHAS_DE_CONTEXTO = 2

/** BCP-47 (o mesmo da explicação): o código entra no system do prompt, então texto livre aqui seria injeção. */
const idioma = z
  .string()
  .trim()
  .max(20)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
const linha = z.string().trim().min(1).max(MAX_CARACTERES_DA_LINHA)

/* ESTRITOS: chave desconhecida é 400 (ver o topo). */
const ESQUEMAS = {
  expressoes: z.strictObject({ frase: linha, lang: idioma, langDaPessoa: idioma }),
  termos: z
    .strictObject({
      frase: linha,
      termos: z.array(z.string().trim().min(1).max(MAX_CARACTERES_DO_TERMO_PEDIDO)).max(MAX_TERMOS_PEDIDOS).optional(),
      lang: idioma,
      langDaPessoa: idioma,
    })
    /* O termo pedido TEM de estar na frase: o assistente explica o que a pessoa está vendo, não um texto qualquer. */
    .refine((p) => (p.termos ?? []).every((t) => estaNaFrase(t, p.frase))),
  comoRespondo: z.strictObject({
    frase: z.string().trim().min(1).max(MAX_CARACTERES_DA_FALA),
    contexto: z.array(z.string().trim().max(MAX_CARACTERES_DA_LINHA)).max(MAX_LINHAS_DE_CONTEXTO).optional(),
    lang: idioma,
    langDaPessoa: idioma,
  }),
  correcao: z.strictObject({
    minhaFala: z.string().trim().min(1).max(MAX_CARACTERES_DA_FALA),
    lang: idioma,
    langDaPessoa: idioma,
  }),
} as const

export type PedidoDoAssistente =
  | ({ recurso: 'expressoes' } & z.infer<(typeof ESQUEMAS)['expressoes']>)
  | ({ recurso: 'termos' } & z.infer<(typeof ESQUEMAS)['termos']>)
  | ({ recurso: 'comoRespondo' } & z.infer<(typeof ESQUEMAS)['comoRespondo']>)
  | ({ recurso: 'correcao' } & z.infer<(typeof ESQUEMAS)['correcao']>)

const MENSAGEM_DO_INVALIDO: Readonly<Record<RecursoDoAssistente, string>> = {
  expressoes: `pedido inválido: frase (1 a ${MAX_CARACTERES_DA_LINHA} caracteres), lang e langDaPessoa; nenhum outro campo`,
  termos: `pedido inválido: frase (1 a ${MAX_CARACTERES_DA_LINHA} caracteres), termos (até ${MAX_TERMOS_PEDIDOS}, cada um presente na frase), lang e langDaPessoa; nenhum outro campo`,
  comoRespondo: `pedido inválido: frase (1 a ${MAX_CARACTERES_DA_FALA} caracteres), contexto (até ${MAX_LINHAS_DE_CONTEXTO} linhas), lang e langDaPessoa; nenhum outro campo`,
  correcao: `pedido inválido: minhaFala (1 a ${MAX_CARACTERES_DA_FALA} caracteres), lang e langDaPessoa; nenhum outro campo`,
}

/** Lê o corpo cru de um recurso: o pedido validado (e o par de idiomas no rastro), ou o 400 `invalido`. */
export function lerPedidoDoAssistente(
  recurso: RecursoDoAssistente,
  corpo: unknown,
  rastro?: RastroDeIa,
): { ok: true; pedido: PedidoDoAssistente } | RecusaDeIa {
  const parsed = ESQUEMAS[recurso].safeParse(corpo ?? {})
  if (!parsed.success) return recusaDeErro(400, MENSAGEM_DO_INVALIDO[recurso], 'invalido')
  rastro?.anotar({
    parDeIdiomas: `${codigoDeIdioma(parsed.data.lang)}-${codigoDeIdioma(parsed.data.langDaPessoa)}`,
  })
  return { ok: true, pedido: { recurso, ...parsed.data } as PedidoDoAssistente }
}

/** O que cada recurso entrega. */
export type ValorDoAssistente =
  | { recurso: 'expressoes'; expressoes: ExpressaoDestacada[] }
  | { recurso: 'termos'; termos: TermoExplicado[] }
  | { recurso: 'comoRespondo'; sugestoes: SugestaoDeResposta[] }
  | { recurso: 'correcao'; correcao: CorrecaoDaFala }

export interface AjudaEntregue {
  ok: true
  valor: ValorDoAssistente
  /** Quantas chamadas sobram hoje (`null` sem teto). */
  restanteHoje: number | null
  modelo: string
}

export type ResultadoDoAssistente = AjudaEntregue | RecusaDeIa

const MENSAGEM_SEM_ASSISTENTE = {
  sem_plano: 'O assistente ao vivo não está disponível nesta conta; a legenda e a tradução continuam.',
  teto_do_dia: 'O assistente de hoje chegou ao limite; a legenda e a tradução continuam, e ele volta amanhã.',
  cota_do_mes: 'O assistente deste mês chegou ao limite; a legenda e a tradução continuam, e ele volta no dia 1º.',
} as const

/** A entrada do prompt — no perfil protegido, o "Como respondo?" vai SEM contexto (só a frase que a pessoa vê). */
function entradaDoPrompt(p: PedidoDoAssistente, menor: boolean): EntradaDoAssistente {
  switch (p.recurso) {
    case 'expressoes':
      return { recurso: 'expressoes', frase: p.frase }
    case 'termos':
      return { recurso: 'termos', frase: p.frase, ...(p.termos?.length ? { termos: p.termos } : {}) }
    case 'comoRespondo':
      return {
        recurso: 'comoRespondo',
        frase: p.frase,
        ...(!menor && p.contexto?.length ? { contexto: p.contexto } : {}),
      }
    case 'correcao':
      return { recurso: 'correcao', minhaFala: p.minhaFala }
  }
}

/** Lê a resposta do modelo no formato do recurso; `null` = fora do formato. */
function lerValor(p: PedidoDoAssistente, texto: string): ValorDoAssistente | null {
  switch (p.recurso) {
    case 'expressoes': {
      const expressoes = lerExpressoes(texto, p.frase)
      return expressoes ? { recurso: 'expressoes', expressoes } : null
    }
    case 'termos': {
      const termos = lerTermos(texto, p.frase, p.termos)
      return termos ? { recurso: 'termos', termos } : null
    }
    case 'comoRespondo': {
      const sugestoes = lerSugestoes(texto)
      return sugestoes ? { recurso: 'comoRespondo', sugestoes } : null
    }
    case 'correcao': {
      const correcao = lerCorrecao(texto, p.minhaFala)
      return correcao ? { recurso: 'correcao', correcao } : null
    }
  }
}

/**
 * O "COMO RESPONDO?" EM FLUXO (só esse recurso): quem pede recebe cada sugestão assim que ela fecha no texto do
 * modelo, lida pelo mesmo leitor defensivo (`sugestoesEmFluxo.ts`). O PRIMEIRO BYTE é a primeira sugestão:
 *
 *   - antes dela, nada saiu — a cascata vale (a perna que cai cede à reserva) e toda recusa é a de sempre;
 *   - `aoComecar` vem uma vez, logo antes da primeira sugestão, com o modelo da perna que está respondendo e o
 *     `restanteHoje`; daí em diante, não há reserva: a falha da perna é o resultado (`aoDecidir` com a recusa);
 *   - o resultado final (`aoDecidir`) é o de sempre: a lista inteira, lida por `lerSugestoes` sobre o texto final.
 *
 * A cota é a mesma: o uso do dia e os tokens são acertados pelo real no fim; o que já tinha sido gerado quando o fluxo
 * caiu (ou quando quem pediu desistiu) conta; nada gerado, tudo volta.
 */
export interface FluxoDoComoRespondo {
  aoComecar: (modelo: string, restanteHoje: number | null) => void
  aoSugerir: (sugestao: SugestaoDeResposta) => void
}

export async function pedirAoAssistente(
  ctx: ContextoDeIa,
  pedido: PedidoDoAssistente,
  ganchos?: GanchosDoNucleo<ResultadoDoAssistente>,
  fluxo?: FluxoDoComoRespondo,
): Promise<ResultadoDoAssistente> {
  const decidir = decisor(ganchos)
  return decidir(await atender(ctx, pedido, decidir, pedido.recurso === 'comoRespondo' ? fluxo : undefined))
}

async function atender(
  ctx: ContextoDeIa,
  pedido: PedidoDoAssistente,
  decidir: (r: ResultadoDoAssistente) => ResultadoDoAssistente,
  fluxo: FluxoDoComoRespondo | undefined,
): Promise<ResultadoDoAssistente> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements
  const { recurso } = pedido
  const rota = ROTA_DO_ASSISTENTE[recurso]
  const evento = `assistente_${recurso}`

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_ASSISTENTE_AO_VIVO)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  let doDia: ReservaDoAssistente | null = null
  let provedorRespondeu = false
  let reserva: ReservaDeLlm | null = null
  let subcota: ReservaDeTokensDoAssistente | null = null
  let tokensReais = 0
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 2) O TETO DO DIA — antes de qualquer custo. */
    const r = await reservarUsoDoAssistente(ctx.userId, plano.plan)
    if (r.ok === false)
      return decidir(
        r.motivo === 'sem_plano'
          ? recusaDeErro(402, MENSAGEM_SEM_ASSISTENTE.sem_plano, 'sem_plano')
          : recusaDeErro(429, MENSAGEM_SEM_ASSISTENTE.teto_do_dia, 'teto_do_assistente'),
      )
    doDia = r

    /* 3) Público menor. */
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })

    /* 4) Pernas do tutor, só com retenção zero, no nível do recurso. */
    const nivel = rebaixarNivel(NIVEL_DO_RECURSO[recurso], plano)
    const pernas = cascataDeNuvem({ funcao: 'assistente', nivel, modelosGrandes: plano.largerModels === true })
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para o assistente' }))
    rastro.anotar({ nivel })

    /* 5) Portão, custo, admissão, cota do plano. */
    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const messages: MensagemDeChat[] = [
      {
        role: 'system',
        content: comInstrucaoDeMenor(
          systemDoAssistente(recurso, pedido.lang, pedido.langDaPessoa),
          menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
        ),
      },
      { role: 'user', content: userDoAssistente(entradaDoPrompt(pedido, menor)) },
    ]
    const { maxTokens, temperatura } = PARAMETROS_DO_ASSISTENTE[recurso]
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

    /* A SUBCOTA DE TOKENS do assistente (25% da `tokensMes`), ANTES da cota do plano: os mesmos tokens contam nas
       duas, e o assistente para aqui antes de chegar perto da cota da legenda. */
    subcota = await reservarTokensDoAssistente(ctx.userId, plano.plan, estimativa)
    if (!subcota) return decidir(recusaDeErro(402, MENSAGEM_SEM_ASSISTENTE.cota_do_mes, 'cota_do_assistente'))

    const reservada = await reservarLlm(ctx.userId, estimativa, 'plano', plano.plan)
    if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402/429 da cota ou 503 do contador
    reserva = reservada

    /* 6) A cascata — em fluxo, cada perna lê as sugestões aos pedaços; a primeira compromete a resposta. */
    let comecou = false
    let primeiraMs: number | null = null
    const restanteHoje = doDia.restanteHoje
    const emFluxo = fluxo
      ? (modelo: string) => {
          const leitor = criarLeitorDeSugestoesEmFluxo()
          let semTempo = false
          return (acumulado: string, restanteMs: number): boolean => {
            for (const s of leitor.alimentar(acumulado)) {
              if (!comecou) {
                if (semTempo || restanteMs < MARGEM_DO_COMPROMISSO_MS) {
                  semTempo = true
                  continue
                }
                comecou = true
                primeiraMs = Date.now() - t0
                rastro.anotar({ primeiraSugestaoMs: primeiraMs })
                fluxo.aoComecar(modelo, restanteHoje)
              }
              fluxo.aoSugerir(s)
            }
            return comecou
          }
        }
      : undefined
    const { entregue, ultimaFalha, limitadoPeloProvedor, cancelado, parcial, gastoDescartadoUsd } =
      await percorrerCascata(
        custo.pernas,
        {
          messages,
          temperature: temperatura,
          maxTokens,
          timeoutMs: TIMEOUT_MS,
          formatoDeSaida: SAIDA_DO_RECURSO[recurso],
          /* O ROTEAMENTO DA LEGENDA no OpenRouter (o endpoint mais barato que responde em até 1,5 s no p50): na bancada,
           o mesmo Gemma ficou mais barato (~20%) e com a cauda menor (p95 das glosas abaixo de 2,1 s). */
          legenda: true,
          ...(ctx.sinal ? { sinal: ctx.sinal } : {}),
        },
        {
          evento,
          route: rota,
          requestId: ctx.requestId,
          funcao: 'assistente',
          rastro,
          admissao,
          fatorDeSaida: custo.fatorDeSaida,
          timeoutDaPrimeiraPernaMs: TIMEOUT_DA_PRIMEIRA_PERNA_MS,
          prazoTotalMs: PRAZO_TOTAL_MS,
          ...(emFluxo ? { emFluxo } : {}),
        },
      )
    /* EM FLUXO, a perna caiu (ou quem pediu desistiu) DEPOIS da primeira sugestão: o que ela gerou foi cobrado — o
       uso do dia, os tokens e o gasto contam pelo que saiu —, e não há reserva depois do primeiro byte. */
    if (!entregue && parcial) {
      provedorRespondeu = true
      tokensReais = parcial.tokensEntrada + parcial.tokensSaida
      await reserva.consumir(tokensReais)
      await registrarGastoDeIa(parcial.custoUsd, { userId: ctx.userId, plano: plano.plan })
      await ctx.registrarCusto?.(parcial.custoUsd)
      rastro.anotar({ desfechoDoFluxo: cancelado ? 'cancelado' : 'interrompido' })
      if (cancelado) return decidir(recusaCancelada())
      log('error', {
        event: `${evento}_fluxo_interrompido`,
        route: rota,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'o assistente parou no meio; tente de novo', 'provedor_indisponivel'))
    }
    /* Quem pediu desistiu antes de qualquer coisa sair: a PESSOA não paga (o `finally` devolve tudo), mas o que o
       provedor já leu e escreveu entra no orçamento GLOBAL — o portão da nuvem tem de ver o gasto real. */
    if (!entregue && cancelado) {
      /* Com a conta: o teto em US$ por conta e a vigia de gasto também veem (cancelar em série não sai de graça). */
      if (gastoDescartadoUsd) await registrarGastoDeIa(gastoDescartadoUsd, { userId: ctx.userId, plano: plano.plan })
      if (fluxo) rastro.anotar({ desfechoDoFluxo: 'cancelado' })
      return decidir(recusaCancelada())
    }
    if (!entregue && limitadoPeloProvedor)
      return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS }))
    if (!entregue) {
      log('error', {
        event: `${evento}_indisponivel`,
        route: rota,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'o assistente está indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: tokens, gasto e o uso do dia contam, com ou sem JSON útil. */
    provedorRespondeu = true
    tokensReais = entregue.tokensEntrada + entregue.tokensSaida
    await reserva.consumir(tokensReais)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const valor = lerValor(pedido, entregue.texto)
    if (!valor) {
      if (primeiraMs !== null) rastro.anotar({ desfechoDoFluxo: 'invalido' })
      contarRespostaInvalida('assistente', entregue.model)
      log('warn', { event: `${evento}_resposta_invalida`, route: rota, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu uma resposta utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    log('info', {
      event: evento,
      route: rota,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    /* O tempo até a primeira sugestão (em fluxo): é o que a pessoa sente. */
    if (primeiraMs !== null) rastro.anotar({ desfechoDoFluxo: 'completo' })
    return decidir({ ok: true, valor, restanteHoje: doDia.restanteHoje, modelo: entregue.model })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: `falha no assistente: ${erroDeRota(err, { event: `${evento}_erro` })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        // Todo caminho que NÃO consumiu devolve chamada e tokens do plano.
        await reserva?.estornar()
      } finally {
        /* O uso do dia só volta quando NENHUM provedor respondeu (a resposta inválida foi cobrada e consome). */
        if (doDia && !provedorRespondeu) await estornarUsoDoAssistente(ctx.userId, doDia)
        /* A subcota de tokens: acertada pelo real, ou devolvida inteira se ninguém respondeu. */
        if (subcota) await acertarTokensDoAssistente(ctx.userId, subcota, provedorRespondeu ? tokensReais : 0)
      }
    }
  }
}
