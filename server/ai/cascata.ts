/**
 * PERCORRER A CASCATA DE NUVEM — primário, depois reserva — com o disjuntor na frente de cada perna.
 *
 * O laço morava inteiro dentro do `mtProxy.ts`. Quando o tutor trocou o Gemini pela mesma cascata
 * Groq → OpenRouter (Fase 2 do lançamento), copiar o laço seria repetir o defeito que o
 * `llmClient.ts` já documenta: uma correção num lugar e o defeito continuando no outro. O que
 * difere entre os dois chamadores — o prefixo do evento de log e a rota — entra por parâmetro.
 */
import { contarAdmissaoRecusada, observarChamadaDeProvedor } from '../http/metricas'
import { log } from '../lib/logger'
import { custoDeLlm } from '../lib/orcamentoDeIa'
import {
  admitirNoBalde,
  ocuparVaga,
  type PlanoDeAdmissao,
  type Recusa,
  registrarLimiteNaAdmissao,
  type TicketDeBalde,
} from './admissao'
import { chaveDoProvedor, disjuntorPermite, registrarFalha, registrarSucesso } from './disjuntor'
import { chamarChat, parametrosDoProvedor, type PedidoDeChat } from './llmClient'
import { ehModeloDeRaciocinio } from './parametrosDoProvedor'
import type { Provedor } from './provedores'
import { nomeDoProvedor, type RastroDeIa, registrarLimiteDoProvedor, statusDaTentativa } from './telemetriaDeIa'

/** O esforço de raciocínio que `parametrosDoProvedor` pediu — metadado da geração, nunca decisão. */
function esforcoPedido(base: string, model: string): string | undefined {
  const p = parametrosDoProvedor(base, model) as { reasoning_effort?: string; reasoning?: { effort?: string } }
  return p.reasoning_effort ?? p.reasoning?.effort
}

interface EntregaDaCascata {
  texto: string
  tokensEntrada: number
  tokensSaida: number
  rotulo: string
  model: string
  /** O fornecedor que DE FATO respondeu — com o primário em 429, é o da reserva (B2). */
  fornecedor: string
  /**
   * O custo desta entrega, calculado UMA vez sobre a perna que respondeu (preço de
   * `fornecedor:modelo`, tokens do cache pelo preço de cache). É o MESMO número da métrica e do
   * Langfuse; o chamador o soma ao orçamento em vez de recalcular com o modelo planejado.
   */
  custoUsd: number
}

interface ResultadoDaCascata {
  entregue: EntregaDaCascata | null
  /** Causa da última perna que falhou — vai para o LOG, nunca para o cliente. */
  ultimaFalha: string
  /**
   * TODAS as pernas chamadas responderam 429 (Fase 4): é limite de taxa, não defeito. Leva a espera
   * que a admissão fixou (a menor entre as pernas), para o chamador responder 429 `nuvem_ocupada`
   * com `Retry-After` em vez de 502. Ausente quando alguma perna falhou por outro motivo.
   */
  limitadoPeloProvedor?: { retryAfterS: number }
}

/**
 * A ADMISSÃO DE UMA CHAMADA DE LLM (ADR 0007): a vaga em voo do usuário e o pedido no balde da
 * PRIMEIRA perna da cascata que tem saldo para o plano dele. Perna sem saldo é pulada como perna em
 * disjuntor — a reserva, quando existe, atende. As pernas seguintes são admitidas no balde delas na
 * hora de serem chamadas (`percorrerCascata`).
 */
export interface AdmissaoDaCascata {
  plano: PlanoDeAdmissao
  tokens: number
  /** Índice da perna admitida já na entrada. */
  indice: number
  ticket: TicketDeBalde
  liberar: () => void
  /** A cascata chegou a rodar? Se não, o pedido volta ao balde em `encerrarAdmissao`. */
  usada: boolean
}

/**
 * O BALDE DE UMA PERNA (B4): o fornecedor e o modelo, e os limites que o registro declarou para ela
 * — da conta no provedor (`limitesDaConta`: um balde só para os modelos dele) ou do modelo. Sem
 * limites declarados (o legado), as `IA_ADMISSAO_*` de sempre.
 */
export function alvoDaPerna(prov: Provedor): {
  provedor: string
  modelo: string
  limites?: Provedor['limites']
  compartilhado?: boolean
} {
  return {
    provedor: nomeDoProvedor(prov.base),
    modelo: prov.model,
    ...(prov.limites ? { limites: prov.limites, compartilhado: prov.limitesDaConta === true } : {}),
  }
}

export function admitirCascata(
  provedores: Provedor[],
  p: { userId: string; plano: PlanoDeAdmissao; tokens: number },
): { ok: true; admissao: AdmissaoDaCascata } | { ok: false; recusa: Recusa } {
  const liberar = ocuparVaga(p.userId, 'llm')
  if (!liberar) {
    contarAdmissaoRecusada('em_voo', p.plano)
    return { ok: false, recusa: { motivo: 'em_voo', retryAfterS: 1 } }
  }
  let recusa: Recusa | null = null
  for (let i = 0; i < provedores.length; i++) {
    const prov = provedores[i]
    const r = admitirNoBalde({
      tipo: 'llm',
      ...alvoDaPerna(prov),
      plano: p.plano,
      tokens: p.tokens,
      silenciosa: true,
    })
    if (r.ok === true) {
      return {
        ok: true,
        admissao: { plano: p.plano, tokens: p.tokens, indice: i, ticket: r.ticket, liberar, usada: false },
      }
    }
    // A espera que vale é a MENOR: a primeira perna que voltar atende.
    if (!recusa || r.recusa.retryAfterS < recusa.retryAfterS) recusa = r.recusa
  }
  liberar()
  const final = recusa ?? { motivo: 'minuto' as const, retryAfterS: 1 }
  contarAdmissaoRecusada(final.motivo, p.plano)
  return { ok: false, recusa: final }
}

/** Fecha a admissão: solta a vaga e, se a cascata nem rodou, devolve o pedido ao balde. Idempotente. */
export function encerrarAdmissao(a: AdmissaoDaCascata | null | undefined): void {
  if (!a) return
  if (!a.usada) a.ticket.devolver()
  a.usada = true
  a.liberar()
}

/**
 * O `max_tokens` DE UMA PERNA: o do pedido, e — com a saída econômica da política de custo (B4) — 75%
 * dele, SÓ se o modelo não raciocina. Num gpt-oss o pensamento sai do mesmo teto, e cortá-lo
 * devolveria a resposta vazia (`chamarChat`); o corte vale para o modelo que só escreve a resposta.
 */
function maxTokensDaPerna(
  maxTokens: number | undefined,
  modelo: string,
  fator: number | undefined,
): number | undefined {
  if (maxTokens === undefined || fator === undefined || !(fator > 0 && fator < 1)) return maxTokens
  if (ehModeloDeRaciocinio(modelo)) return maxTokens
  return Math.max(1, Math.floor(maxTokens * fator))
}

export async function percorrerCascata(
  provedores: Provedor[],
  pedido: Omit<PedidoDeChat, 'base' | 'apiKey' | 'model'>,
  /** `funcao` rotula a métrica do provedor (`traducao`, `tutor`, `corretor`) — valor fixo do código. */
  contexto: {
    evento: string
    route: string
    requestId?: string
    funcao?: string
    rastro?: RastroDeIa
    /** A admissão aberta por `admitirCascata`. Ausente = sem admissão (chamador que não gasta a conta do app). */
    admissao?: AdmissaoDaCascata
    /**
     * A saída econômica da política de custo (B4, `politicaDeCusto.ts`): multiplica o `max_tokens`
     * das pernas SEM raciocínio. Ausente ou 1 = o teto inteiro.
     */
    fatorDeSaida?: number
  },
): Promise<ResultadoDaCascata> {
  const rastro = contexto.rastro
  const adm = contexto.admissao
  if (adm) adm.usada = true
  let ultimaFalha = 'sem provedor'
  /* Pernas CHAMADAS e quantas delas foram 429; `esperaDoLimite` é a menor espera fixada. */
  let chamadas = 0
  let limitadas = 0
  let esperaDoLimite = Infinity
  for (let i = 0; i < provedores.length; i++) {
    const prov = provedores[i]
    /* A ADMISSÃO DA PERNA (ADR 0007). Antes da perna admitida na entrada: estava sem saldo, pula.
       A admitida: já tem o pedido. Depois dela (a reserva, quando o primário falhou): pede ao
       balde DELA agora — sem saldo, pula sem abrir socket. */
    let ticket: TicketDeBalde | null = null
    if (adm) {
      if (i < adm.indice) {
        ultimaFalha = `sem saldo na admissão para ${prov.rotulo} (${prov.model})`
        continue
      }
      if (i === adm.indice) ticket = adm.ticket
      else {
        const r = admitirNoBalde({ tipo: 'llm', ...alvoDaPerna(prov), plano: adm.plano, tokens: adm.tokens })
        if (r.ok === false) {
          ultimaFalha = `sem saldo na admissão para ${prov.rotulo} (${prov.model})`
          continue
        }
        ticket = r.ticket
      }
    }
    /* O DISJUNTOR ANTES DA CHAMADA (Fase 5): com o primário fora do ar, cada pedido pagava o
       timeout dele antes de chegar à reserva. Aberto, a perna é pulada sem abrir socket. */
    const chave = chaveDoProvedor(prov)
    if (!disjuntorPermite(chave)) {
      ticket?.devolver() // o provedor não foi chamado: o pedido volta ao balde
      ultimaFalha = `disjuntor aberto para ${prov.rotulo} (${prov.model})`
      log('warn', {
        event: `${contexto.evento}_provedor_em_disjuntor`,
        route: contexto.route,
        provider: prov.rotulo,
        error: ultimaFalha,
        requestId: contexto.requestId,
      })
      /* A perna PULADA também é geração (latência zero, status `disjuntor`): sem ela o painel
         mostraria a reserva servindo sem dizer por quê. */
      const agora = Date.now()
      rastro?.tentativa({
        inicio: agora,
        fim: agora,
        provedor: nomeDoProvedor(prov.base),
        modelo: prov.model,
        status: 'disjuntor',
        metadados: { rotulo: prov.rotulo },
      })
      continue
    }
    const inicio = Date.now()
    const r = await chamarChat({
      ...pedido,
      maxTokens: maxTokensDaPerna(pedido.maxTokens, prov.model, contexto.fatorDeSaida),
      base: prov.base,
      apiKey: prov.apiKey,
      model: prov.model,
      roteamento: prov.roteamento,
    })
    const fim = Date.now()
    const provedor = nomeDoProvedor(prov.base)
    const fornecedor = prov.fornecedor ?? provedor
    /* O CUSTO DA PERNA (B2 da Fase B): preço de `fornecedor:modelo` — o declarado no registro, se
       houver —, com os tokens do cache de prompt pelo preço de cache. Calculado aqui, uma vez, e usado
       no rastro, na métrica e no orçamento: os três nunca discordam. Perna que falhou não custa. */
    const custoUsd = r.ok
      ? custoDeLlm(prov.model, r.tokensEntrada ?? 0, r.tokensSaida ?? 0, {
          fornecedor,
          preco: prov.preco,
          emCache: r.tokensEmCache ?? 0,
        })
      : undefined
    chamadas += 1
    if (r.status === 429) {
      registrarLimiteDoProvedor(provedor, prov.model)
      /* O 429 do provedor fecha o balde até o `Retry-After` dele: a próxima fala nem tenta. */
      const espera = registrarLimiteNaAdmissao(
        'llm',
        provedor,
        prov.model,
        r.retryAfterS,
        Date.now(),
        alvoDaPerna(prov),
      )
      limitadas += 1
      esperaDoLimite = Math.min(esperaDoLimite, espera)
    }
    /* Os tokens do dia saem da estimativa para o REAL; perna que falhou não gerou tokens. */
    ticket?.acertarTokens(r.ok ? (r.tokensEntrada ?? 0) + (r.tokensSaida ?? 0) : 0)
    /* UMA GERAÇÃO POR PERNA, inclusive a que falhou — é assim que o fallback aparece no painel. O
       custo é o `custoUsd` acima, o mesmo do orçamento e da métrica. O texto só entra quando o
       rastro permite (dev, `LANGFUSE_CONTEUDO=1`); em produção nem é montado. */
    rastro?.tentativa({
      inicio,
      fim,
      provedor,
      modelo: prov.model,
      status: r.ok ? 'ok' : statusDaTentativa(r.status, r.causa),
      uso: r.ok
        ? { input: r.tokensEntrada ?? 0, output: r.tokensSaida ?? 0, cached_input: r.tokensEmCache ?? 0 }
        : undefined,
      custoUsd,
      metadados: {
        rotulo: prov.rotulo,
        esforco: esforcoPedido(prov.base, prov.model),
        statusHttp: r.status,
      },
      ...(rastro?.conteudoPermitido
        ? { entrada: JSON.stringify(pedido.messages), saida: r.texto ?? r.causa ?? '' }
        : {}),
    })
    /* A latência de CADA perna, inclusive a que falhou: um primário que demora 12 s para cair é
       exatamente o que a p95 da tradução precisa mostrar. Custo só de quem entregou. Fornecedor e
       modelo como rótulos desde o B2 — lista fechada, vinda do registro (`server/http/metricas.ts`). */
    observarChamadaDeProvedor({
      provedor: prov.rotulo,
      funcao: contexto.funcao ?? contexto.evento,
      ms: fim - inicio,
      custoUsd,
      fornecedor,
      modelo: prov.model,
    })
    if (r.ok) {
      registrarSucesso(chave)
      return {
        entregue: {
          texto: r.texto ?? '',
          tokensEntrada: r.tokensEntrada ?? 0,
          tokensSaida: r.tokensSaida ?? 0,
          rotulo: prov.rotulo,
          model: prov.model,
          fornecedor,
          custoUsd: custoUsd ?? 0,
        },
        ultimaFalha: '',
      }
    }
    registrarFalha(chave, r.status)
    ultimaFalha = r.causa ?? 'falha sem causa declarada'
    /* Todo tipo de falha do primário tenta a reserva — inclusive 4xx: chave revogada ou modelo
       aposentado são exatamente os casos em que a reserva salva o assinante. */
    log('warn', {
      event: `${contexto.evento}_provedor_falhou`,
      route: contexto.route,
      provider: prov.rotulo,
      status: r.status,
      error: ultimaFalha.slice(0, 120),
      requestId: contexto.requestId,
    })
  }
  return {
    entregue: null,
    ultimaFalha,
    ...(chamadas > 0 && limitadas === chamadas ? { limitadoPeloProvedor: { retryAfterS: esperaDoLimite } } : {}),
  }
}
