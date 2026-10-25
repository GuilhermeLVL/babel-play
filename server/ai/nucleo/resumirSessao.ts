/**
 * RESUMIR A SESSÃO — o núcleo do "resumo que vira cartões" (`POST /api/ai/resumir`; IA de estudo, planos v4, etapa
 * 2, Task 3), sem Express.
 *
 * A pessoa termina uma sessão e pede o resumo: 3 pontos e até 10 cartões com a frase da cena. O prompt, a leitura e
 * o filtro dos cartões moram em `src/lib/estudo/promptDoResumo.ts`.
 *
 * QUEM PEDE MANDA SÓ A SESSÃO (e, se quiser, o idioma em que lê). As falas vêm do BANCO, escopadas pelo dono, como
 * no polimento (`polirLote.ts`): o texto que vai ao modelo é o que está guardado, e a sessão de outra pessoa é o
 * MESMO 404 `sessao_inexistente` da sessão que não existe — nada diz se ela existe.
 *
 * A ORDEM (o molde de `explicarFrase.ts`):
 *   1. quem pede e a FLAG `ia_de_estudo` (desligada: 404 `recurso_indisponivel`);
 *   2. a SESSÃO do dono (404) e o tamanho dela (menos de 4 falas finais: 400 `sessao_curta`) — antes de gastar;
 *   3. a FRANQUIA (`reservarUsoDeEstudo(…, 'resumo')`): `resumosMes` no plano, 1 por semana na amostra do Grátis;
 *   4. menor (ou idade não declarada): `INSTRUCAO_DE_SEGURANCA_PARA_MENORES` no fim do system;
 *   5. RETENÇÃO ZERO (só pernas `zdr`, `cascataDoPlano`), portão, política de custo, admissão e — só no plano — a
 *      reserva de chamada + tokens;
 *   6. a cascata, o custo, a leitura estrita do topo (502 `resposta_invalida`, com o uso CONSUMIDO: o provedor cobrou)
 *      e o FILTRO dos cartões: o candidato que `avaliarFrase`/`LIMITES_DO_BULK_ADD` reprovam nunca é proposto. O uso
 *      de estudo só volta quando nenhum provedor respondeu.
 *
 * ENTRADA: só as últimas falas que cabem em `FUNCOES_DE_IA.resumo.tetoEntrada`. SEM CACHE: a sessão é de alguém.
 */
import { z } from 'zod'

import { FLAG_IA_DE_ESTUDO } from '../../../src/core/planos'
import { SAIDA_DO_RESUMO } from '../../../src/lib/esquemasDeSaida'
import { MIN_FALAS_DO_RESUMO } from '../../../src/lib/estudo/constantes'
import {
  type CartaoDoResumo,
  cartoesDoResumo,
  type FalaDoResumo,
  falasQueCabem,
  lerResumo,
  systemDoResumo,
  userDoResumo,
} from '../../../src/lib/estudo/promptDoResumo'
import { sessionsRepo } from '../../db/repositories/sessions'
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

const RESUMO = FUNCOES_DE_IA.resumo
const ROTA = '/api/ai/resumir'
/** A sessão inteira de uma vez, com a pessoa olhando a revisão: mais que uma frase, menos que um bloco polido. */
const TIMEOUT_MS = 30_000

const esquemaDoPedido = z
  .object({
    sessionId: z.string().trim().min(1).max(128),
    /** O idioma de quem estuda (os pontos e os versos são escritos nele). Ausente: o das traduções da sessão. */
    lang: z
      .string()
      .max(20)
      .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
      .optional(),
  })
  .strip()

export type PedidoDeResumo = z.infer<typeof esquemaDoPedido>

/** Lê o corpo cru: o pedido validado, ou o 400 `invalido`. */
export function lerPedidoDeResumo(corpo: unknown): { ok: true; pedido: PedidoDeResumo } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success)
    return recusaDeErro(400, 'pedido inválido: sessionId obrigatório; lang opcional, em BCP-47', 'invalido')
  return { ok: true, pedido: parsed.data }
}

/** O resumo entregue: 3 pontos, os cartões já filtrados, de que franquia saiu e quanto sobra na amostra. */
export interface ResumoEntregue {
  ok: true
  pontos: string[]
  cartoes: CartaoDoResumo[]
  origem: OrigemDoEstudo
  restanteNaAmostra: number | null
  modelo: string
}

export type ResultadoDoResumo = ResumoEntregue | RecusaDeIa

/** As recusas da franquia de estudo: 402, com o código que o cliente decide (nunca venda no servidor). */
const MENSAGEM_SEM_ESTUDO = {
  sem_plano: 'O resumo da sessão não está disponível nesta conta; a transcrição e as palavras continuam.',
  amostra_acabou: 'O resumo desta semana já foi usado; a transcrição e as palavras continuam.',
  cota_do_mes: 'Os resumos deste mês acabaram; a transcrição e as palavras continuam, e eles voltam no dia 1º.',
} as const

/** O idioma mais frequente entre os destinos das falas (as traduções que a pessoa leu). */
function idiomaDasTraducoes(falas: ReadonlyArray<FalaDoResumo>): string | null {
  const conta = new Map<string, number>()
  for (const f of falas) if (f.tgtLang) conta.set(f.tgtLang, (conta.get(f.tgtLang) ?? 0) + 1)
  let melhor: string | null = null
  let n = 0
  for (const [lang, q] of conta)
    if (q > n) {
      melhor = lang
      n = q
    }
  return melhor
}

/**
 * As falas FINAIS da sessão do dono, na ordem, ou `null` (sessão inexistente ou de outra pessoa — a mesma
 * resposta). Final = não apagada e com texto.
 */
async function falasDaSessao(
  ctx: ContextoDeIa,
  sessionId: string,
): Promise<{ falas: FalaDoResumo[]; destino: string | null } | null> {
  const sessao = await sessionsRepo.getWithUtterances(ctx.userId, sessionId)
  if (!sessao) return null
  const falas = [...sessao.utterances]
    .filter((u) => u.deletedAt == null && (u.sourceText ?? '').trim())
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((u) => ({
      texto: (u.sourceText ?? '').trim(),
      traducao: (u.translatedText ?? '').trim(),
      srcLang: u.sourceLang ?? sessao.session.sourceLang ?? '',
      tgtLang: u.targetLang ?? sessao.session.targetLang ?? '',
    }))
  return { falas, destino: sessao.session.targetLang ?? null }
}

export async function resumirSessao(
  ctx: ContextoDeIa,
  pedido: PedidoDeResumo,
  ganchos?: GanchosDoNucleo<ResultadoDoResumo>,
): Promise<ResultadoDoResumo> {
  const decidir = decisor(ganchos)
  return decidir(await resumir(ctx, pedido, decidir))
}

async function resumir(
  ctx: ContextoDeIa,
  pedido: PedidoDeResumo,
  decidir: (r: ResultadoDoResumo) => ResultadoDoResumo,
): Promise<ResultadoDoResumo> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const rastro: RastroDeIa = ctx.rastro
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
    /* 2) A SESSÃO DO DONO, antes de qualquer custo. Alheia e inexistente: a mesma resposta. */
    const lida = await falasDaSessao(ctx, pedido.sessionId)
    if (!lida) return decidir(recusaDeErro(404, 'sessão não encontrada', 'sessao_inexistente'))
    if (lida.falas.length < MIN_FALAS_DO_RESUMO)
      return decidir(
        recusaDeErro(400, `a sessão precisa de pelo menos ${MIN_FALAS_DO_RESUMO} falas para o resumo`, 'sessao_curta'),
      )
    const langDaPessoa = pedido.lang ?? idiomaDasTraducoes(lida.falas) ?? lida.destino ?? 'pt'
    const falas = falasQueCabem(lida.falas, RESUMO.tetoEntrada)
    rastro.anotar({ parDeIdiomas: `${codigoDeIdioma(falas[0]?.srcLang ?? '')}-${codigoDeIdioma(langDaPessoa)}` })

    /* 3) A FRANQUIA: o plano ou a amostra da semana. */
    const r = await reservarUsoDeEstudo(ctx.userId, plano.plan, 'resumo')
    if (r.ok === false) return decidir(recusaDeErro(402, MENSAGEM_SEM_ESTUDO[r.motivo], r.motivo))
    estudo = r

    /* 4) Público menor. */
    const menor = await ehMenor(ctx.userId)
    rastro.anotar({ menor })

    /* 5) Pernas do tutor, só com retenção zero; portão, custo, admissão. */
    const { nivel, pernas } = cascataDoPlano('resumo', plano)
    if (pernas.length === 0)
      return decidir(recusar(501, { error: 'IA de nuvem não configurada no servidor para o resumo' }))
    rastro.anotar({ nivel })

    const portao = await portaoDaNuvem()
    if (!portao.ok) return decidir(recusaPortaoFechado(portao))

    const messages: MensagemDeChat[] = [
      {
        role: 'system',
        content: comInstrucaoDeMenor(
          systemDoResumo(langDaPessoa),
          menor ? INSTRUCAO_DE_SEGURANCA_PARA_MENORES : undefined,
        ),
      },
      { role: 'user', content: userDoResumo(falas) },
    ]
    const maxTokens = RESUMO.maxTokens
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
      if (!(reservada instanceof ReservaDeLlm)) return decidir(reservada)
      reserva = reservada
    }

    /* 6) A cascata. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      {
        messages,
        temperature: RESUMO.temperatura,
        maxTokens,
        timeoutMs: TIMEOUT_MS,
        formatoDeSaida: SAIDA_DO_RESUMO,
      },
      {
        evento: 'resumo',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'resumo',
        rastro,
        admissao,
        fatorDeSaida: custo.fatorDeSaida,
      },
    )
    if (!entregue && limitadoPeloProvedor)
      return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS }))
    if (!entregue) {
      log('error', {
        event: 'resumo_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'resumo indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: tokens, gasto e o uso de estudo contam, com ou sem JSON útil. */
    provedorRespondeu = true
    await reserva?.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const lido = lerResumo(entregue.texto)
    if (!lido) {
      contarRespostaInvalida('resumo', entregue.model)
      log('warn', { event: 'resumo_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu um resumo utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    const cartoes = cartoesDoResumo(lido.candidatos, falas, langDaPessoa)
    log('info', {
      event: 'resumo',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({
      ok: true,
      pontos: lido.pontos,
      cartoes,
      origem: estudo.origem,
      restanteNaAmostra: estudo.restanteNaAmostra,
      modelo: entregue.model,
    })
  } catch (err) {
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: `falha no resumo: ${erroDeRota(err, { event: 'resumo_erro' })}` }))
  } finally {
    try {
      await encerrarAdmissao(admissao)
    } finally {
      try {
        await reserva?.estornar()
      } finally {
        /* O uso de estudo só volta quando NENHUM provedor respondeu (a resposta inválida foi cobrada e consome). */
        if (estudo && !provedorRespondeu) await estornarUsoDeEstudo(ctx.userId, estudo)
      }
    }
  }
}
