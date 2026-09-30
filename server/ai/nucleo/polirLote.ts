/**
 * POLIR UM LOTE DA SESSÃO — o núcleo do "Polir a sessão" (`POST /api/ai/mt/polir`), sem Express (D5 da
 * Fase D; núcleo desde a Fase F).
 *
 * A legenda ao vivo traduz frase a frase, sem ver o resto da conversa. Polir reescreve a tradução da
 * sessão inteira no nível `polimento`, UM BLOCO por pedido: até 40 linhas, com as 3 anteriores de
 * contexto (os blocos, o prompt e a leitura moram em `src/lib/traducao/promptDoPolimento.ts`, que o
 * cliente também usa para contar o progresso). A polida é gravada AO LADO da original
 * (`utterances.traducao_polida`, migração 0044): o original NUNCA é sobrescrito.
 *
 * QUEM PEDE MANDA SÓ A SESSÃO E O NÚMERO DO BLOCO. As falas vêm do banco, escopadas pelo dono: o texto
 * que vai ao modelo é o que está guardado, não o que um corpo forjado diria — e sessão de outra pessoa
 * é 404, como em `/api/sessions/:id`.
 *
 * IDEMPOTENTE POR BLOCO. Só as linhas SEM polida vão ao modelo. Bloco inteiro polido devolve o que já
 * está guardado (`jaPolido: true`) antes de portão, cota ou provedor — retomar um polimento
 * interrompido não cobra de novo o que já foi polido. Resposta parcial (o modelo pulou uma linha) grava
 * o que veio; a que faltou fica pendente para o próximo pedido. Dois pedidos do mesmo bloco ao mesmo
 * tempo (duas abas) não pagam duas vezes: o segundo é 409 `polimento_em_andamento` (uma máquina só,
 * ADR 0006), e a gravação é condicional (`utterancesRepo.gravarPolimento`).
 *
 * É DA TRADUÇÃO NUANCE, pelo ENTITLEMENT (`traducaoNuance`), nunca pelo nome do plano: sem ele, 402
 * `exige_nuance` antes de ler a sessão. O teste de 14 dias (C6) tem a capacidade, e entra na admissão
 * como grátis, como na tradução.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA (`polimento` em `FUNCOES_DE_IA`): portão da nuvem, política
 * de custo (B4), admissão por provedor (ADR 0007), reserva de chamada + tokens ANTES do provedor,
 * cascata com reserva, custo da perna que respondeu no gasto do mês. Registro e variante valem como na
 * tradução (`aplicarNuance`, por linha: a sessão pode ter as duas direções), e o glossário da pessoa vai
 * como dado (`glossarioDoPedido`). SEM CACHE: o bloco é a conversa de alguém, e o glossário é dele.
 */
import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  type EntradaDoGlossarioNoPrompt,
  nomeDoIdioma,
  type OpcoesDaNuance,
  REGISTROS_DA_TRADUCAO,
  semRegiao,
  type VarianteDaTraducao,
  VARIANTES_DA_TRADUCAO,
} from '../../../src/lib/traducao/promptComunicativo'
import {
  blocosDoPolimento,
  contextoDoBloco,
  lerPolimento,
  type LinhaDoPolimento,
  type LinhaNoPrompt,
  systemDoPolimento,
  userDoPolimento,
} from '../../../src/lib/traducao/promptDoPolimento'
import { sessionsRepo } from '../../db/repositories/sessions'
import { utterancesRepo } from '../../db/repositories/utterances'
import type { UserId } from '../../lib/authContext'
import type { Entitlements } from '../../lib/entitlements'
import { erroDeRota } from '../../lib/erroDeRota'
import { log } from '../../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { estimarTokens } from '../../lib/usageQuota'
import { planoDeAdmissao } from '../admissao'
import { admitirCascata, encerrarAdmissao, percorrerCascata } from '../cascata'
import { FUNCOES_DE_IA } from '../funcoesDeIa'
import { glossarioDoPedido, MAX_GLOSSARIO_POR_PEDIDO } from '../glossario'
import { type MensagemDeChat, tamanhoDoPrompt } from '../llmClient'
import { cascataDoPlano } from '../niveis'
import { aplicarNuance } from '../nuanceDaTraducao'
import { aplicarPoliticaDeCusto } from '../politicaDeCusto'
import { ReservaDeLlm, reservarLlm } from '../reservaDeNuvem'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

const POLIMENTO = FUNCOES_DE_IA.polimento
/** O rótulo de log e de métrica é o da rota do app; a `/v1` terá o dela (change `api-e-mcp`). */
const ROTA = '/api/ai/mt/polir'
/** Ninguém espera uma legenda: um bloco de 40 linhas com raciocínio leva mais que uma frase. */
const TIMEOUT_MS = 45_000

/**
 * A VERSÃO DO PROMPT, gravada com cada polida (`polimento_versao`): hash do texto FIXO, com
 * marcadores no lugar do que muda por pedido. Não decide nada hoje — mudar o prompt não repolira
 * ninguém, porque o que já foi polido não é cobrado de novo —; serve à procedência e à bancada.
 */
export const VERSAO_DO_POLIMENTO = createHash('sha256')
  .update(
    [
      systemDoPolimento(),
      userDoPolimento([{ original: '§o', traducao: '§t' }], [{ original: '§o', traducao: '§t', para: '§p' }]),
    ].join('\u0000'),
  )
  .digest('hex')
  .slice(0, 16)

/** O `para` de uma linha cujo idioma de destino não foi gravado. */
const DESTINO_DESCONHECIDO = 'o mesmo idioma da tradução atual'

const VARIANTES = Object.keys(VARIANTES_DA_TRADUCAO) as [VarianteDaTraducao, ...VarianteDaTraducao[]]

const esquemaDoPedido = z
  .object({
    sessionId: z.string().min(1).max(128),
    bloco: z.number().int().min(0).max(10_000),
    /** O registro e as variantes das preferências (D6). Pedidos: sem `traducaoNuance`, nada disso vale. */
    registro: z.enum(REGISTROS_DA_TRADUCAO).optional(),
    variantes: z.array(z.enum(VARIANTES)).max(VARIANTES.length).optional(),
  })
  .strip()

/** O pedido de polimento validado — sai de `lerPedidoDoPolimento`. */
export type PedidoDePolimento = z.infer<typeof esquemaDoPedido>

/** Lê o corpo cru: o pedido validado, ou o 400 `payload_invalido`. */
export function lerPedidoDoPolimento(corpo: unknown): { ok: true; pedido: PedidoDePolimento } | RecusaDeIa {
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success) return recusaDeErro(400, 'payload inválido: sessionId e bloco obrigatórios', 'payload_invalido')
  return { ok: true, pedido: parsed.data }
}

/** As polidas do bloco como o cliente as aplica: `id` da fala → tradução polida. */
export interface PolidaDaFala {
  id: string
  traducaoPolida: string
}

/**
 * O bloco depois do pedido. `jaPolido` = nada foi ao modelo (o bloco inteiro já estava polido); sem
 * ele, `modelo` é o que de fato polia (a procedência).
 */
export type LotePolido = {
  ok: true
  bloco: number
  blocos: number
  polidas: PolidaDaFala[]
  pendentes: number
} & ({ jaPolido: true } | { jaPolido: false; modelo: string })

export type ResultadoDoPolimento = LotePolido | RecusaDeIa

/** Uma fala da sessão no que o polimento precisa, com o texto CRU (a gravação confere contra ele). */
interface FalaDoPolimento extends LinhaDoPolimento {
  sourceText: string | null
  translatedText: string | null
  src: string | null
  tgt: string | null
  traducaoPolida: string | null
}

/** Os pedidos do mesmo bloco em voo (`dono:sessão:bloco`). Uma máquina só (ADR 0006). */
const emVoo = new Set<string>()

/** As polidas do bloco como o cliente as aplica. */
const polidasDoBloco = (bloco: ReadonlyArray<FalaDoPolimento>): PolidaDaFala[] =>
  bloco.filter((l) => l.traducaoPolida).map((l) => ({ id: l.id, traducaoPolida: l.traducaoPolida as string }))

export async function polirLote(
  ctx: ContextoDeIa,
  pedido: PedidoDePolimento,
  ganchos?: GanchosDoNucleo<ResultadoDoPolimento>,
): Promise<ResultadoDoPolimento> {
  const decidir = decisor(ganchos)
  return decidir(await polir(ctx, pedido, decidir))
}

async function polir(
  ctx: ContextoDeIa,
  pedido: PedidoDePolimento,
  decidir: (r: ResultadoDoPolimento) => ResultadoDoPolimento,
): Promise<ResultadoDoPolimento> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { sessionId, bloco: k, registro, variantes } = pedido
  const plano = ctx.entitlements

  /* A CAPACIDADE: a Tradução Nuance, pelo entitlement — antes de ler a sessão. */
  if (!plano.managedCloudLlm || plano.traducaoNuance !== true)
    return decidir(
      recusar(402, {
        error: 'polir a tradução da sessão é da Tradução Nuance',
        code: 'exige_nuance',
        entitlement: 'traducaoNuance',
      }),
    )

  /* AS FALAS DO BANCO, escopadas pelo dono. */
  const sessao = await sessionsRepo.getWithUtterances(ctx.userId, sessionId)
  if (!sessao) return decidir(recusaDeErro(404, 'sessão não encontrada', 'sessao_inexistente'))
  const falas: FalaDoPolimento[] = [...sessao.utterances]
    .filter((u) => u.deletedAt == null)
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((u) => ({
      id: u.id,
      original: u.sourceText ?? '',
      traducao: u.translatedText ?? '',
      sourceText: u.sourceText,
      translatedText: u.translatedText,
      src: u.sourceLang ?? sessao.session.sourceLang,
      tgt: u.targetLang ?? sessao.session.targetLang,
      traducaoPolida: u.traducaoPolida,
    }))
  const blocos = blocosDoPolimento(falas)
  const bloco = blocos[k]
  if (!bloco)
    return decidir(recusar(404, { error: 'bloco inexistente', code: 'bloco_inexistente', blocos: blocos.length }))

  /* IDEMPOTENTE: o bloco inteiro já polido não custa nada a ninguém. */
  const pendentes = bloco.filter((l) => !l.traducaoPolida)
  if (!pendentes.length)
    return decidir({
      ok: true,
      bloco: k,
      blocos: blocos.length,
      polidas: polidasDoBloco(bloco),
      pendentes: 0,
      jaPolido: true,
    })

  const chave = `${ctx.userId}:${sessionId}:${k}`
  if (emVoo.has(chave)) return decidir(recusaDeErro(409, 'este bloco já está sendo polido', 'polimento_em_andamento'))
  emVoo.add(chave)
  try {
    return await polirPendentes(ctx, decidir, {
      plano,
      sessionId,
      k,
      blocos,
      bloco,
      pendentes,
      registro,
      variantes: variantes ?? [],
    })
  } finally {
    emVoo.delete(chave)
  }
}

/** As entradas do glossário que aparecem no bloco, por par de idiomas, até o teto por pedido. */
async function glossarioDoBloco(
  userId: UserId,
  pendentes: ReadonlyArray<FalaDoPolimento>,
): Promise<EntradaDoGlossarioNoPrompt[]> {
  const porPar = new Map<string, { src: string | null; tgt: string; textos: string[] }>()
  for (const l of pendentes) {
    if (!l.tgt) continue // sem o destino, não há par para escolher entradas
    const par = `${l.src ? semRegiao(l.src) : ''}>${semRegiao(l.tgt)}`
    const grupo = porPar.get(par) ?? { src: l.src, tgt: l.tgt, textos: [] }
    grupo.textos.push(l.original)
    porPar.set(par, grupo)
  }
  const vistas = new Set<string>()
  const escolhidas: EntradaDoGlossarioNoPrompt[] = []
  for (const g of porPar.values()) {
    for (const e of await glossarioDoPedido(userId, { texto: g.textos.join('\n'), src: g.src, tgt: g.tgt })) {
      if (vistas.has(e.termo) || escolhidas.length >= MAX_GLOSSARIO_POR_PEDIDO) continue
      vistas.add(e.termo)
      escolhidas.push(e)
    }
  }
  return escolhidas
}

async function polirPendentes(
  ctx: ContextoDeIa,
  decidir: (r: ResultadoDoPolimento) => ResultadoDoPolimento,
  p: {
    plano: Entitlements
    sessionId: string
    k: number
    blocos: FalaDoPolimento[][]
    bloco: FalaDoPolimento[]
    pendentes: FalaDoPolimento[]
    registro?: (typeof REGISTROS_DA_TRADUCAO)[number]
    variantes: VarianteDaTraducao[]
  },
): Promise<ResultadoDoPolimento> {
  const { plano, k, blocos, bloco, pendentes } = p
  const { rastro } = ctx
  const { nivel, pernas } = cascataDoPlano('polimento', plano)
  if (pernas.length === 0)
    return decidir(recusar(501, { error: 'tradução por LLM não configurada no servidor (defina LLM_API_KEY)' }))
  rastro.anotar({ nivel })

  const portao = await portaoDaNuvem()
  if (!portao.ok) return decidir(recusaPortaoFechado(portao))

  /* O REGISTRO E A VARIANTE, por linha (a sessão pode ter as duas direções): a variante pedida só vale
     para a linha cujo destino é o idioma dela — pt-PT não quer dizer nada numa linha para o inglês. */
  const linhasNoPrompt: LinhaNoPrompt[] = pendentes.map((l) => {
    const de = l.src ? { de: nomeDoIdioma(l.src) } : {}
    /* Fala sem idioma de destino gravado (nem na fala, nem na sessão): o da tradução que ela tem. */
    if (!l.tgt) return { original: l.original, traducao: l.traducao, para: DESTINO_DESCONHECIDO, ...de }
    const tgt = l.tgt
    const variante = p.variantes.find((v) => semRegiao(v) === semRegiao(tgt))
    const nuance = aplicarNuance({ tgt, src: l.src ?? undefined, variante }, plano)
    return { original: l.original, traducao: l.traducao, para: nomeDoIdioma(nuance.tgt), ...de }
  })
  const glossario = await glossarioDoBloco(ctx.userId, pendentes)
  if (glossario.length) rastro.anotar({ glossario: glossario.length })
  const opcoes: OpcoesDaNuance = {
    ...(p.registro ? { registro: p.registro } : {}),
    ...(glossario.length ? { glossario } : {}),
  }
  /* O CONTEXTO: as 3 linhas antes do bloco, com a polida quando já existe — coerência com o que a
     pessoa vai ler, não com a legenda crua. */
  const contexto = contextoDoBloco(blocos, k).map((l) => ({
    original: l.original,
    traducao: l.traducaoPolida ?? l.traducao,
  }))
  const messages: MensagemDeChat[] = [
    { role: 'system', content: systemDoPolimento(opcoes) },
    { role: 'user', content: userDoPolimento(contexto, linhasNoPrompt, opcoes) },
  ]
  const maxTokens = POLIMENTO.maxTokens
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
    // O teste de 14 dias (C6) tem a Nuance nos entitlements, mas entra na faixa grátis da admissão.
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

    /* PONTO DE EXTENSÃO — o Batch da Groq (−50% no preço) fica para depois (plano da Fase D): o
       polimento não tem pressa, então os blocos pendentes de uma sessão poderiam ir num lote só e o
       núcleo gravaria quando o lote voltasse. Aqui é a chamada síncrona de sempre, um bloco por pedido. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      { messages, temperature: POLIMENTO.temperatura, maxTokens, timeoutMs: TIMEOUT_MS },
      {
        evento: 'mt_polimento',
        route: ROTA,
        requestId: ctx.requestId,
        funcao: 'polimento',
        rastro,
        admissao: admitida.admissao,
        fatorDeSaida: custo.fatorDeSaida,
      },
    )
    if (!entregue && limitadoPeloProvedor)
      return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: limitadoPeloProvedor.retryAfterS }))
    if (!entregue) {
      log('error', {
        event: 'mt_polimento_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: ctx.requestId,
      })
      return decidir(recusaDeErro(502, 'o polimento está indisponível agora', 'provedor_indisponivel'))
    }

    /* O provedor respondeu e cobrou: a cota e o gasto contam o que foi gasto, com ou sem JSON útil. */
    await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(entregue.custoUsd)

    const lidas = lerPolimento(entregue.texto, pendentes)
    if (!lidas) {
      log('warn', { event: 'mt_polimento_resposta_invalida', route: ROTA, status: 502, requestId: ctx.requestId })
      return decidir(
        recusaDeErro(502, 'o modelo não devolveu uma tradução polida utilizável; tente de novo', 'resposta_invalida'),
      )
    }
    const itens = [...lidas.entries()].map(([i, polida]) => ({
      id: pendentes[i].id,
      sourceText: pendentes[i].sourceText,
      translatedText: pendentes[i].translatedText,
      polida,
    }))
    const gravadas = await utterancesRepo.gravarPolimento(ctx.userId, p.sessionId, itens, {
      modelo: entregue.model,
      versao: VERSAO_DO_POLIMENTO,
      em: Date.now(),
    })
    /* O que ficou no bloco: as que já estavam e as de agora. Linha que o modelo pulou (ou que mudou
       enquanto polia) continua sem polida — pendente para o próximo pedido. */
    const agora = new Map(itens.filter((it) => gravadas.includes(it.id)).map((it) => [it.id, it.polida]))
    const depois = bloco.map((l) => ({ ...l, traducaoPolida: l.traducaoPolida ?? agora.get(l.id) ?? null }))
    log('info', {
      event: 'mt_polimento',
      route: ROTA,
      provider: entregue.rotulo,
      status: 200,
      latencyMs: Date.now() - t0,
      requestId: ctx.requestId,
    })
    return decidir({
      ok: true,
      bloco: k,
      blocos: blocos.length,
      polidas: polidasDoBloco(depois),
      pendentes: depois.filter((l) => !l.traducaoPolida).length,
      jaPolido: false,
      modelo: entregue.model,
    })
  } catch (err) {
    return decidir(recusar(502, { error: `falha no polimento: ${erroDeRota(err, { event: 'mt_polimento_erro' })}` }))
  } finally {
    encerrarAdmissao(admitida.admissao)
    // Todo caminho que NÃO consumiu devolve chamada e tokens.
    await reserva?.estornar()
  }
}
