/**
 * "POLIR A SESSÃO" — `POST /api/ai/mt/polir` (D5 da Fase D, 30/09/2026).
 *
 * A legenda ao vivo traduz frase a frase, sem ver o resto da conversa. Polir reescreve a tradução da
 * sessão inteira no nível `polimento`, UM BLOCO por pedido: até 40 linhas, com as 3 anteriores de
 * contexto (os blocos, o prompt e a leitura moram em `src/lib/traducao/promptDoPolimento.ts`, que o
 * cliente também usa para contar o progresso). A polida é gravada AO LADO da original
 * (`utterances.traducao_polida`, migração 0044): o original NUNCA é sobrescrito.
 *
 * O CLIENTE MANDA SÓ A SESSÃO E O NÚMERO DO BLOCO. As falas vêm do banco, escopadas pelo dono: o texto
 * que vai ao modelo é o que está guardado, não o que um corpo forjado diria — e sessão de outra pessoa
 * é 404, como em `/api/sessions/:id`.
 *
 * IDEMPOTENTE POR BLOCO. Só as linhas SEM polida vão ao modelo. Bloco inteiro polido responde o que já
 * está guardado (`jaPolido: true`) antes de portão, cota ou provedor — retomar um polimento
 * interrompido não cobra de novo o que já foi polido. Resposta parcial (o modelo pulou uma linha) grava
 * o que veio; a que faltou fica pendente para o próximo pedido. Dois pedidos do mesmo bloco ao mesmo
 * tempo (duas abas) não pagam duas vezes: o segundo é 409 `polimento_em_andamento` (uma máquina só,
 * ADR 0006), e a gravação é condicional (`utterancesRepo.gravarPolimento`).
 *
 * É DA TRADUÇÃO NUANCE, pelo ENTITLEMENT (`traducaoNuance`), nunca pelo nome do plano: sem ele, 402
 * `exige_nuance` antes de ler a sessão. O teste de 14 dias (C6) tem a capacidade, e entra na admissão
 * como grátis, como no `/mt`.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA (`polimento` em `FUNCOES_DE_IA`): portão da nuvem, política
 * de custo (B4), admissão por provedor (ADR 0007), reserva de chamada + tokens ANTES do provedor,
 * cascata com reserva, custo da perna que respondeu no gasto do mês. Registro e variante valem como no
 * `/mt` (`aplicarNuance`, por linha: a sessão pode ter as duas direções), e o glossário da pessoa vai
 * como dado (`glossarioDoPedido`). SEM CACHE: o bloco é a conversa de alguém, e o glossário é dele.
 */
import { createHash } from 'node:crypto'

import type { Request, Response } from 'express'
import { z } from 'zod'

import {
  type EntradaDoGlossarioNoPrompt,
  nomeDoIdioma,
  type OpcoesDaNuance,
  REGISTROS_DA_TRADUCAO,
  semRegiao,
  type VarianteDaTraducao,
  VARIANTES_DA_TRADUCAO,
} from '../../src/lib/traducao/promptComunicativo'
import {
  blocosDoPolimento,
  contextoDoBloco,
  lerPolimento,
  type LinhaDoPolimento,
  type LinhaNoPrompt,
  systemDoPolimento,
  userDoPolimento,
} from '../../src/lib/traducao/promptDoPolimento'
import { sessionsRepo } from '../db/repositories/sessions'
import { utterancesRepo } from '../db/repositories/utterances'
import { getEntitlements, resolverPlano } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import { portaoDaNuvem, registrarGastoDeIa, responderPortaoFechado } from '../lib/orcamentoDeIa'
import { responderErro } from '../lib/respostaDeErro'
import { estimarTokens } from '../lib/usageQuota'
import { planoDeAdmissao, responderNuvemOcupada } from './admissao'
import { admitirCascata, encerrarAdmissao, percorrerCascata } from './cascata'
import { FUNCOES_DE_IA } from './funcoesDeIa'
import { glossarioDoPedido, MAX_GLOSSARIO_POR_PEDIDO } from './glossario'
import { type MensagemDeChat, tamanhoDoPrompt } from './llmClient'
import { cascataDoPlano } from './niveis'
import { aplicarNuance } from './nuanceDaTraducao'
import { aplicarPoliticaDeCusto } from './politicaDeCusto'
import { abrirReservaDeLlm, type ReservaDeLlm } from './reservaDeNuvem'
import { abrirRastro, type RastroDeIa } from './telemetriaDeIa'

const POLIMENTO = FUNCOES_DE_IA.polimento
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

const bodySchema = z
  .object({
    sessionId: z.string().min(1).max(128),
    bloco: z.number().int().min(0).max(10_000),
    /** O registro e as variantes das preferências (D6). Pedidos: sem `traducaoNuance`, nada disso vale. */
    registro: z.enum(REGISTROS_DA_TRADUCAO).optional(),
    variantes: z.array(z.enum(VARIANTES)).max(VARIANTES.length).optional(),
  })
  .strip()

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

export async function polirProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'mt-polimento')
  try {
    await polir(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

/** As polidas do bloco como o cliente as aplica: `id` da fala → tradução polida. */
const polidasDoBloco = (bloco: ReadonlyArray<FalaDoPolimento>) =>
  bloco.filter((l) => l.traducaoPolida).map((l) => ({ id: l.id, traducaoPolida: l.traducaoPolida as string }))

async function polir(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    responderErro(res, 400, 'payload inválido: sessionId e bloco obrigatórios', 'payload_invalido')
    return
  }
  const { sessionId, bloco: k, registro, variantes } = parsed.data

  /* A CAPACIDADE, fail-closed: erro ao ler o plano é 502, nunca uma chamada que passou direto. */
  let plano
  let emTeste: boolean
  try {
    const resolvido = await resolverPlano(req.userId)
    plano = getEntitlements(resolvido.plano)
    emTeste = resolvido.teste !== null
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'mt_polimento_erro' })}` })
    return
  }
  if (!plano.managedCloudLlm || plano.traducaoNuance !== true) {
    res.status(402).json({
      error: 'polir a tradução da sessão é da Tradução Nuance',
      code: 'exige_nuance',
      entitlement: 'traducaoNuance',
    })
    return
  }

  /* AS FALAS DO BANCO, escopadas pelo dono. */
  const sessao = await sessionsRepo.getWithUtterances(req.userId, sessionId)
  if (!sessao) {
    responderErro(res, 404, 'sessão não encontrada', 'sessao_inexistente')
    return
  }
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
  if (!bloco) {
    res.status(404).json({ error: 'bloco inexistente', code: 'bloco_inexistente', blocos: blocos.length })
    return
  }

  /* IDEMPOTENTE: o bloco inteiro já polido não custa nada a ninguém. */
  const pendentes = bloco.filter((l) => !l.traducaoPolida)
  if (!pendentes.length) {
    res.json({ bloco: k, blocos: blocos.length, polidas: polidasDoBloco(bloco), pendentes: 0, jaPolido: true })
    return
  }

  const chave = `${req.userId}:${sessionId}:${k}`
  if (emVoo.has(chave)) {
    responderErro(res, 409, 'este bloco já está sendo polido', 'polimento_em_andamento')
    return
  }
  emVoo.add(chave)
  try {
    await polirPendentes(req, res, rastro, {
      plano,
      emTeste,
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
  req: Request,
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
    for (const e of await glossarioDoPedido(req.userId, { texto: g.textos.join('\n'), src: g.src, tgt: g.tgt })) {
      if (vistas.has(e.termo) || escolhidas.length >= MAX_GLOSSARIO_POR_PEDIDO) continue
      vistas.add(e.termo)
      escolhidas.push(e)
    }
  }
  return escolhidas
}

async function polirPendentes(
  req: Request,
  res: Response,
  rastro: RastroDeIa,
  p: {
    plano: ReturnType<typeof getEntitlements>
    emTeste: boolean
    sessionId: string
    k: number
    blocos: FalaDoPolimento[][]
    bloco: FalaDoPolimento[]
    pendentes: FalaDoPolimento[]
    registro?: (typeof REGISTROS_DA_TRADUCAO)[number]
    variantes: VarianteDaTraducao[]
  },
): Promise<void> {
  const { plano, k, blocos, bloco, pendentes } = p
  const { nivel, pernas } = cascataDoPlano('polimento', plano)
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
  const glossario = await glossarioDoBloco(req, pendentes)
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
    userId: req.userId,
    // O teste de 14 dias (C6) tem a Nuance nos entitlements, mas entra na faixa grátis da admissão.
    plano: planoDeAdmissao(plano.plan, false, p.emTeste),
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

    /* PONTO DE EXTENSÃO — o Batch da Groq (−50% no preço) fica para depois (plano da Fase D): o
       polimento não tem pressa, então os blocos pendentes de uma sessão poderiam ir num lote só e a
       rota gravaria quando o lote voltasse. Aqui é a chamada síncrona de sempre, um bloco por pedido. */
    const { entregue, ultimaFalha, limitadoPeloProvedor } = await percorrerCascata(
      custo.pernas,
      { messages, temperature: POLIMENTO.temperatura, maxTokens, timeoutMs: TIMEOUT_MS },
      {
        evento: 'mt_polimento',
        route: ROTA,
        requestId: req.requestId,
        funcao: 'polimento',
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
        event: 'mt_polimento_indisponivel',
        route: ROTA,
        status: 502,
        error: ultimaFalha.slice(0, 300),
        latencyMs: Date.now() - t0,
        requestId: req.requestId,
      })
      responderErro(res, 502, 'o polimento está indisponível agora', 'provedor_indisponivel')
      return
    }

    /* O provedor respondeu e cobrou: a cota e o gasto contam o que foi gasto, com ou sem JSON útil. */
    await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
    await registrarGastoDeIa(entregue.custoUsd, { userId: req.userId, plano: plano.plan })

    const lidas = lerPolimento(entregue.texto, pendentes)
    if (!lidas) {
      log('warn', { event: 'mt_polimento_resposta_invalida', route: ROTA, status: 502, requestId: req.requestId })
      responderErro(
        res,
        502,
        'o modelo não devolveu uma tradução polida utilizável; tente de novo',
        'resposta_invalida',
      )
      return
    }
    const itens = [...lidas.entries()].map(([i, polida]) => ({
      id: pendentes[i].id,
      sourceText: pendentes[i].sourceText,
      translatedText: pendentes[i].translatedText,
      polida,
    }))
    const gravadas = await utterancesRepo.gravarPolimento(req.userId, p.sessionId, itens, {
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
      requestId: req.requestId,
    })
    res.json({
      bloco: k,
      blocos: blocos.length,
      polidas: polidasDoBloco(depois),
      pendentes: depois.filter((l) => !l.traducaoPolida).length,
      jaPolido: false,
      provenance: {
        kind: 'ai',
        origin: entregue.model,
        method: 'tradução polida por LLM',
        limits:
          'Tradução revisada por modelo de linguagem com o contexto da sessão — pode mudar um termo ou o tom. ' +
          'A original continua guardada: alterne entre as duas.',
      },
    })
  } catch (err) {
    if (!res.headersSent)
      res.status(502).json({ error: `falha no polimento: ${erroDeRota(err, { event: 'mt_polimento_erro' })}` })
  } finally {
    encerrarAdmissao(admitida.admissao)
    // Todo caminho que NÃO consumiu devolve chamada e tokens.
    await reserva?.estornar()
  }
}
