/**
 * O PARCEIRO DE LEITURA — o núcleo, sem Express (`POST /api/ai/leitura/parceiro`; L4 de
 * `docs/specs/2026-10-26-livros-e-leitura.md`). Um parceiro que "já leu o livro e pesquisou sobre ele": explica o
 * trecho, faz uma analogia, responde a pergunta citando o capítulo, conta uma curiosidade da ficha, propõe uma ideia
 * para discutir e diz o que observar no capítulo. Os prompts e a leitura da resposta moram em
 * `src/lib/estudo/promptDoParceiro.ts`.
 *
 * A ORDEM (a do assistente ao vivo, `assistenteAoVivo.ts`, com o cache no meio), e o porquê de cada passo:
 *   1. QUEM PEDE (fora do app, só adulto) e a FLAG `parceiro_de_leitura` — desligada (ou sem quem a responda), 404
 *      `recurso_indisponivel`, sem gastar nada;
 *   2. O PLANO: sem `parceiroDia` (Grátis, convidado), 402 `sem_plano`. O teste de 14 dias tem o plano dele;
 *   3. O LIVRO E QUEM LÊ: livro do catálogo fora da lista é 404 `livro_inexistente`; o menor (ou quem não declarou a
 *      idade) só pede sobre o livro que a vitrine mostraria a ele (`visivelPara` com `tetoPelaFaixa`), senão 403
 *      `livro_fora_da_faixa`. A ficha vai ao prompt já filtrada para a idade (`fichaParaOPrompt`: sem spoiler, e sem o
 *      sensível abaixo de 16). Menor recebe `COMPLEMENTO_PARA_MENOR` e `INSTRUCAO_DE_SEGURANCA_PARA_MENORES`;
 *   4. O CACHE COMPARTILHADO (só livro do catálogo, nunca a pergunta livre): acertou, a resposta sai sem provedor e
 *      SEM contar no dia nem nos tokens;
 *   5. RETENÇÃO ZERO: só provedor com `retencao: 'zdr'` (`pernasDaFuncao('leitura')`); sem perna, 501. Sem busca na
 *      web: não há provedor de busca com retenção zero, e o parceiro responde só com o texto e a ficha;
 *   6. o TETO DO DIA (`parceiroDia`, 429 `teto_do_parceiro`), o portão, a política de custo, a admissão, a SUBCOTA de
 *      tokens (`parceiroTokensMes`, 402 `cota_do_parceiro`) e a reserva de chamada + tokens do plano (o 429
 *      `uso_justo_do_dia` vem dela);
 *   7. a cascata (`json_schema` estrito), o custo no gasto global e a leitura defensiva: fora do formato, ou com
 *      citação inventada no texto principal, é 502 `resposta_invalida` com o uso CONSUMIDO (o provedor cobrou); a
 *      resposta boa vai ao cache (quando pode).
 *
 * O CORPO É ESTRITO (`z.strictObject`): chave desconhecida é 400. NUNCA O LIVRO INTEIRO: no livro do catálogo, a
 * seleção e até 40 trechos do capítulo (8.000 caracteres); no livro TRAZIDO pela pessoa, só a seleção e até 2 trechos
 * vizinhos (1.500) — passou disso, 413 `contexto_grande_demais`. O teto do catálogo só vale com o texto CONFERIDO no
 * manifesto do livro (`server/ai/leitura/manifestos.ts`); o que não casa é recortado para o teto do livro trazido. A TELEMETRIA não leva texto: o modo, a origem do
 * livro, o nível, o par de idiomas e o acerto do cache.
 */
import { z } from 'zod'

import { visivelPara } from '../../../src/core/livros/catalogo'
import { fichaParaOPrompt, tetoPelaFaixa } from '../../../src/core/livros/ficha'
import { FLAG_PARCEIRO_DE_LEITURA } from '../../../src/core/planos'
import { SAIDA_DO_PARCEIRO } from '../../../src/lib/esquemasDeSaida'
import {
  COMPLEMENTO_PARA_MENOR,
  ID_DA_SELECAO,
  lerRespostaDoParceiro,
  type ModoDoParceiro,
  MODOS_COM_SELECAO,
  MODOS_DO_PARCEIRO,
  PARAMETROS_DO_PARCEIRO,
  recortarParaOTrazido,
  type RespostaDoParceiro,
  systemDoParceiro,
  TETOS_DO_PARCEIRO,
  type TrechoDoCapitulo,
  userDoParceiro,
  VERSAO_DO_PROMPT_DO_PARCEIRO,
} from '../../../src/lib/estudo/promptDoParceiro'
import { contarRespostaInvalida } from '../../http/metricas'
import { erroDeRota } from '../../lib/erroDeRota'
import { faixaDoUsuario, INSTRUCAO_DE_SEGURANCA_PARA_MENORES } from '../../lib/idade'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import {
  acertarTokensDoParceiro,
  estornarUsoDoParceiro,
  type ReservaDeTokensDoParceiro,
  type ReservaDoParceiro,
  reservarTokensDoParceiro,
  reservarUsoDoParceiro,
  restanteDoParceiroHoje,
  temParceiro,
} from '../../lib/parceiroDeLeitura'
import { ContadorIndisponivel, estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { type AdmissaoDaCascata, admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { chaveDoParceiro, gravarNoCache, lerDoCache } from '../leitura/cacheDoParceiro'
import { fichaDoServidor, livroDoCatalogo } from '../leitura/fichas'
import { textoConferido } from '../leitura/manifestos'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { comInstrucaoDeMenor } from '../llmRequest'
import { nivelDaFuncao } from '../niveis'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { cascataDeNuvem } from '../provedores'
import { recusaContadorIndisponivel, ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { codigoDeIdioma, type RastroDeIa } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

export const ROTA_DO_PARCEIRO = '/api/ai/leitura/parceiro'

/**
 * OS RELÓGIOS. A pessoa pediu e está olhando o painel do livro: a primeira perna tem 10 s (o capítulo é maior que a
 * frase da explicação), as reservas 15 s, a cascata inteira 30 s. O cliente desiste em 35 s
 * (`src/data/rotas/parceiroDeLeitura.ts`), depois do servidor.
 */
export const TIMEOUT_DA_PRIMEIRA_PERNA_MS = 10_000
const TIMEOUT_MS = 15_000
export const PRAZO_TOTAL_MS = 30_000

const NIVEIS_DE_LEITURA = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/** BCP-47 (o mesmo da explicação): o código entra no system do prompt, então texto livre aqui seria injeção. */
const idioma = z
  .string()
  .trim()
  .max(20)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)

const trecho = z.strictObject({
  id: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]+$/)
    .min(1)
    .max(TETOS_DO_PARCEIRO.idDoTrecho)
    .refine((id) => id !== ID_DA_SELECAO),
  texto: z.string().trim().min(1).max(TETOS_DO_PARCEIRO.textoDoTrecho),
})

const esquemaDoPedido = z
  .strictObject({
    modo: z.enum(MODOS_DO_PARCEIRO),
    livro: z.discriminatedUnion('origem', [
      z.strictObject({ origem: z.literal('catalogo'), id: z.string().trim().min(1).max(200) }),
      z.strictObject({ origem: z.literal('proprio') }),
    ]),
    tituloDoCapitulo: z.string().trim().max(TETOS_DO_PARCEIRO.tituloDoCapitulo).optional(),
    selecao: z.string().trim().max(TETOS_DO_PARCEIRO.selecao).optional(),
    trechos: z.array(trecho).max(TETOS_DO_PARCEIRO.catalogo.trechos),
    pergunta: z.string().trim().min(1).max(TETOS_DO_PARCEIRO.pergunta).optional(),
    nivel: z.enum(NIVEIS_DE_LEITURA),
    idiomaDoLivro: idioma,
    idiomaDaPessoa: idioma,
  })
  .refine((p) => !MODOS_COM_SELECAO.includes(p.modo) || !!p.selecao, 'o modo pede uma seleção')
  .refine((p) => (p.modo === 'pergunta') === !!p.pergunta, 'a pergunta só (e sempre) no modo pergunta')
  .refine((p) => !!p.selecao || p.trechos.length > 0, 'mande a seleção ou os trechos do capítulo')
  .refine((p) => new Set(p.trechos.map((t) => t.id)).size === p.trechos.length, 'ids de trecho repetidos')

export type PedidoDoParceiro = z.infer<typeof esquemaDoPedido>

/** O teto da origem do livro: quantos trechos e quantos caracteres (trechos + seleção) cabem. */
function cabeNoTeto(p: PedidoDoParceiro): boolean {
  const teto = p.livro.origem === 'catalogo' ? TETOS_DO_PARCEIRO.catalogo : TETOS_DO_PARCEIRO.proprio
  const caracteres = p.trechos.reduce((n, t) => n + t.texto.length, 0) + (p.selecao?.length ?? 0)
  return p.trechos.length <= teto.trechos && caracteres <= teto.caracteres
}

/** Lê o corpo cru: o pedido validado (e o par de idiomas no rastro), ou o 400/413. */
export function lerPedidoDoParceiro(
  corpo: unknown,
  rastro?: RastroDeIa,
): { ok: true; pedido: PedidoDoParceiro } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success)
    return recusaDeErro(
      400,
      'pedido inválido: modo, livro ({origem:"catalogo",id} ou {origem:"proprio"}), trechos [{id,texto}], nivel (A1–C2), idiomaDoLivro e idiomaDaPessoa; selecao nos modos explicar/analogia/curiosidade; pergunta só no modo pergunta; nenhum outro campo',
      'invalido',
    )
  if (!cabeNoTeto(parsed.data)) {
    const teto = parsed.data.livro.origem === 'catalogo' ? TETOS_DO_PARCEIRO.catalogo : TETOS_DO_PARCEIRO.proprio
    return recusaDeErro(
      413,
      `contexto grande demais: até ${teto.trechos} trechos e ${teto.caracteres} caracteres somados (com a seleção)`,
      'contexto_grande_demais',
      { trechos: teto.trechos, caracteres: teto.caracteres },
    )
  }
  rastro?.anotar({
    parDeIdiomas: `${codigoDeIdioma(parsed.data.idiomaDoLivro)}-${codigoDeIdioma(parsed.data.idiomaDaPessoa)}`,
    modoDoParceiro: parsed.data.modo,
    origemDoLivro: parsed.data.livro.origem,
  })
  return { ok: true, pedido: parsed.data }
}

export interface RespostaEntregue {
  ok: true
  resposta: RespostaDoParceiro
  /** `cache` = saiu do cache compartilhado (nada foi gasto); `modelo` = chamada nova. */
  origem: 'cache' | 'modelo'
  /** Ausente = o contador não respondeu (só na resposta do cache). */
  restanteHoje?: number | null
  /** O texto do pedido casou com o manifesto do livro PD (teto do catálogo e cache). */
  textoConferido: boolean
  modelo: string
}

export type ResultadoDoParceiro = RespostaEntregue | RecusaDeIa

const MENSAGEM = {
  sem_plano: 'O parceiro de leitura não está disponível nesta conta; o livro, a ficha e as anotações continuam.',
  teto_do_dia: 'O parceiro de leitura de hoje chegou ao limite; ele volta amanhã. O livro e a ficha continuam.',
  cota_do_mes: 'O parceiro de leitura deste mês chegou ao limite; ele volta no dia 1º. O livro e a ficha continuam.',
  livro_fora_da_faixa: 'Este livro não está disponível para este perfil.',
  livro_inexistente: 'livro fora do catálogo',
} as const

export async function pedirAoParceiro(
  ctx: ContextoDeIa,
  pedido: PedidoDoParceiro,
  ganchos?: GanchosDoNucleo<ResultadoDoParceiro>,
): Promise<ResultadoDoParceiro> {
  const decidir = decisor(ganchos)
  return decidir(await atender(ctx, pedido, decidir))
}

async function atender(
  ctx: ContextoDeIa,
  pedido: PedidoDoParceiro,
  decidir: (r: ResultadoDoParceiro) => ResultadoDoParceiro,
): Promise<ResultadoDoParceiro> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { rastro } = ctx
  const plano = ctx.entitlements
  const modo: ModoDoParceiro = pedido.modo

  /* 1) A FLAG: sem quem a responda, desligada (fail-closed). */
  if (!(await ctx.flagLigada?.(FLAG_PARCEIRO_DE_LEITURA)))
    return decidir(recusaDeErro(404, 'recurso indisponível', 'recurso_indisponivel'))

  /* 2) O PLANO, antes de qualquer custo (o cache também é só de quem tem o parceiro). */
  if (!temParceiro(plano.plan)) return decidir(recusaDeErro(402, MENSAGEM.sem_plano, 'sem_plano'))

  let doDia: ReservaDoParceiro | null = null
  let provedorRespondeu = false
  let reserva: ReservaDeLlm | null = null
  let subcota: ReservaDeTokensDoParceiro | null = null
  let tokensReais = 0
  let admissao: AdmissaoDaCascata | null = null
  const t0 = Date.now()
  try {
    /* 3) O livro e quem lê. */
    const faixa = await faixaDoUsuario(ctx.userId)
    const menor = faixa !== 'adulto'
    const teto = tetoPelaFaixa(faixa)
    rastro.anotar({ menor })
    const doCatalogo = pedido.livro.origem === 'catalogo' ? livroDoCatalogo(pedido.livro.id) : null
    if (pedido.livro.origem === 'catalogo') {
      if (!doCatalogo) return decidir(recusaDeErro(404, MENSAGEM.livro_inexistente, 'livro_inexistente'))
      if (!visivelPara(doCatalogo, teto))
        return decidir(recusaDeErro(403, MENSAGEM.livro_fora_da_faixa, 'livro_fora_da_faixa'))
    }
    const ficha = doCatalogo ? fichaDoServidor(doCatalogo.id) : null
    const textoDaFicha = ficha ? fichaParaOPrompt(ficha, teto, TETOS_DO_PARCEIRO.ficha) : ''

    /* O TEXTO CONFERIDO: só o livro do catálogo cujo trecho (todos) casa com o manifesto tem o teto do catálogo e o
       cache. Senão — trecho de outro livro com o id do catálogo, ou de uma edição sem manifesto — vale o teto do livro
       trazido (recortado aqui, sem erro) e nada vai ao cache. */
    const conferido = doCatalogo ? await textoConferido(doCatalogo.id, pedido.trechos, pedido.selecao ?? '') : false
    const recorte = conferido
      ? { trechos: [...pedido.trechos], selecao: pedido.selecao ?? '' }
      : recortarParaOTrazido(pedido.trechos, pedido.selecao ?? '')
    const trechos: TrechoDoCapitulo[] = recorte.trechos
    const selecao = recorte.selecao
    const paraCitar: TrechoDoCapitulo[] = selecao ? [...trechos, { id: ID_DA_SELECAO, texto: selecao }] : trechos
    const nivel = nivelDaFuncao('leitura', plano)
    rastro.anotar({ nivel })

    const system = comInstrucaoDeMenor(
      `${systemDoParceiro(modo, pedido)}${menor ? `\n\n${COMPLEMENTO_PARA_MENOR}` : ''}`,
      menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
    )
    const messages: MensagemDeChat[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: userDoParceiro({
          modo,
          livro: doCatalogo ? { titulo: doCatalogo.titulo, autoria: doCatalogo.autoria } : null,
          ...(pedido.tituloDoCapitulo ? { tituloDoCapitulo: pedido.tituloDoCapitulo } : {}),
          ...(selecao ? { selecao } : {}),
          trechos,
          ...(pedido.pergunta ? { pergunta: pedido.pergunta } : {}),
          ficha: textoDaFicha,
          nivel: pedido.nivel,
          idiomaDoLivro: pedido.idiomaDoLivro,
          idiomaDaPessoa: pedido.idiomaDaPessoa,
        }),
      },
    ]

    /* 4) O CACHE COMPARTILHADO: só livro do catálogo COM O TEXTO CONFERIDO, nunca a pergunta livre (é texto da pessoa). */
    const chave =
      doCatalogo && conferido && modo !== 'pergunta'
        ? chaveDoParceiro({
            versaoDoPrompt: VERSAO_DO_PROMPT_DO_PARCEIRO,
            livroId: doCatalogo.id,
            modo,
            trechos,
            selecao,
            nivel: pedido.nivel,
            nivelDoModelo: nivel,
            idiomaDoLivro: pedido.idiomaDoLivro,
            idiomaDaPessoa: pedido.idiomaDaPessoa,
            menor,
            ficha: textoDaFicha,
            tituloDoCapitulo: pedido.tituloDoCapitulo ?? '',
          })
        : null
    if (chave) {
      const guardada = await lerDoCache(chave)
      rastro.anotar({ cacheHit: !!guardada })
      if (guardada) {
        /* O contador fora do ar não derruba a resposta que já existe: ela sai sem o `restanteHoje`. */
        const restanteHoje = await restanteDoParceiroHoje(ctx.userId, plano.plan).catch(() => undefined)
        return decidir({
          ok: true,
          resposta: guardada.resposta,
          origem: 'cache',
          ...(restanteHoje !== undefined ? { restanteHoje } : {}),
          textoConferido: true,
          modelo: guardada.modelo,
        })
      }
    }

    /* 5) Pernas do tutor, só com retenção zero. */
    const pernas = cascataDeNuvem({ funcao: 'leitura', nivel, modelosGrandes: plano.largerModels === true })
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para o parceiro de leitura' }))

    /* 6) O teto do dia, o portão, o custo, a admissão e as cotas. */
    const r = await reservarUsoDoParceiro(ctx.userId, plano.plan)
    if (r.ok === false)
      return decidir(
        r.motivo === 'sem_plano'
          ? recusaDeErro(402, MENSAGEM.sem_plano, 'sem_plano')
          : recusaDeErro(429, MENSAGEM.teto_do_dia, 'teto_do_parceiro'),
      )
    doDia = r

    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const { maxTokens, temperatura } = PARAMETROS_DO_PARCEIRO[modo]
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

    /* A SUBCOTA de tokens do parceiro (20% da `tokensMes`), ANTES da cota do plano: os mesmos tokens contam nas duas. */
    subcota = await reservarTokensDoParceiro(ctx.userId, plano.plan, estimativa)
    if (!subcota) return decidir(recusaDeErro(402, MENSAGEM.cota_do_mes, 'cota_do_parceiro'))

    const reservada = await reservarLlm(ctx.userId, estimativa, 'plano', plano.plan)
    if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada) // 402/429 da cota ou 503 do contador
    reserva = reservada

    /* 7) A cascata. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      {
        messages,
        temperature: temperatura,
        maxTokens,
        timeoutMs: TIMEOUT_MS,
        formatoDeSaida: SAIDA_DO_PARCEIRO,
        ...(ctx.sinal ? { sinal: ctx.sinal } : {}),
      },
      {
        evento: 'parceiro_de_leitura',
        route: ROTA_DO_PARCEIRO,
        requestId: ctx.requestId,
        funcao: 'leitura',
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
        event: 'parceiro_de_leitura_indisponivel',
        route: ROTA_DO_PARCEIRO,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'o parceiro de leitura está indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: tokens, gasto e o uso do dia contam, com ou sem JSON útil. */
    provedorRespondeu = true
    tokensReais = entregue.tokensEntrada + entregue.tokensSaida
    await reserva.consumir(tokensReais)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const resposta = lerRespostaDoParceiro(entregue.texto, modo, paraCitar, textoDaFicha)
    if (!resposta) {
      contarRespostaInvalida('leitura', entregue.model)
      log('warn', {
        event: 'parceiro_de_leitura_resposta_invalida',
        route: ROTA_DO_PARCEIRO,
        status: 502,
        requestId: ctx.requestId,
      })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu uma resposta utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    if (chave && doCatalogo)
      await gravarNoCache(chave, {
        livroId: doCatalogo.id,
        modo,
        modelo: entregue.model,
        versaoPrompt: VERSAO_DO_PROMPT_DO_PARCEIRO,
        resposta,
      })
    log('info', {
      event: 'parceiro_de_leitura',
      route: ROTA_DO_PARCEIRO,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({
      ok: true,
      resposta,
      origem: 'modelo',
      restanteHoje: doDia.restanteHoje,
      textoConferido: conferido,
      modelo: entregue.model,
    })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(
      recusar(502, {
        error: `falha no parceiro de leitura: ${erroDeRota(err, { event: 'parceiro_de_leitura_erro' })}`,
      }),
    )
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        await reserva?.estornar()
      } finally {
        if (doDia && !provedorRespondeu) await estornarUsoDoParceiro(ctx.userId, doDia)
        if (subcota) await acertarTokensDoParceiro(ctx.userId, subcota, provedorRespondeu ? tokensReais : 0)
      }
    }
  }
}
