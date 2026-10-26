/**
 * UM CLIENTE PARA `POST /chat/completions` (auditoria de 2026-09-07, achado A31).
 *
 * Havia SETE implementações da mesma chamada, cada uma com a sua política:
 *
 *   `server.ts:tryOllamaChat`   60 s, sem teto de saída, URL cravada
 *   `server.ts:tryGroqChat`     30 s, temperatura 0.7 default
 *   `server.ts` (Gemini SDK)    modelo cravado, outro formato de mensagem
 *   `server/ai/proxy.ts`        60 s, repassa o corpo do cliente inteiro (BYOK)
 *   `server/ai/mtProxy.ts`      12 s, cascata com reserva
 *   `src/gateway/adapters/openaiCompatible.ts`  sem timeout nenhum
 *   `serverLlmMt.ts`            mais uma
 *
 * O custo não é a duplicação em si: é que uma correção acontece num lugar e o defeito continua nos
 * outros seis. Foi assim que o `llama-3.3-70b-versatile` — que a Groq moveu para enterprise e que
 * responde `model_not_found` — ficou registrado como morto em `mtProxy.ts` e continuou sendo
 * sugerido pelo onboarding. E foi assim que o timeout apareceu em cinco lugares com cinco valores.
 *
 * ESTE MÓDULO É O SERVIDOR. O gateway do navegador é outra fronteira (roda no cliente, com a
 * chave da pessoa) e continua onde está.
 *
 * FALHA VIRA VALOR, nunca exceção. Toda chamada aqui está numa cascata — Groq falha, tenta o
 * local; primário falha, tenta a reserva —, e cascata feita de `try/catch` esconde qual perna
 * quebrou. O resultado carrega a causa em texto, que é o que vai para o log e para a decisão.
 */
import { segundosDoRetryAfter } from './admissao'
import { clienteDesistiu, comTempoLimite } from './cancelamento'
import {
  ehBaseDoOpenRouter,
  type OpcoesDoPedido,
  parametrosDoProvedor,
  registrarRaciocinioObservado,
  type RoteamentoOpenRouter,
} from './parametrosDoProvedor'

export interface MensagemDeChat {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PedidoDeChat {
  base: string
  apiKey?: string | null
  model: string
  messages: MensagemDeChat[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** O `provider` do OpenRouter que o registro declarou para esta perna (sempre endurecido aqui). */
  roteamento?: RoteamentoOpenRouter
  /** Quem pediu desistiu (`cancelamento.ts`): aborta a chamada junto com o relógio. Opcional. */
  sinal?: AbortSignal
  /**
   * A SAÍDA ESTRUTURADA (`src/lib/esquemasDeSaida.ts`): no OpenRouter vira `response_format` `json_schema` estrito
   * com `provider.require_parameters`; nos outros provedores é ignorada (ver `parametrosDoProvedor`).
   */
  formatoDeSaida?: OpcoesDoPedido['formato']
  /** A legenda ao vivo (a tradução rápida): no OpenRouter, o endpoint mais barato que responde a tempo. */
  legenda?: boolean
}

/**
 * O RESULTADO — um tipo só, com campos opcionais, e não uma união discriminada.
 *
 * A união seria mais precisa, e foi a primeira versão. Só que o `tsconfig.json` da raiz (que
 * checa `server/`) não liga `strict`, e sem `strictNullChecks` o TypeScript NÃO estreita união por
 * discriminante: `if (r.ok)` não faz o compilador esquecer o outro membro, e todo acesso a
 * `r.causa` vira erro. Um tipo que só funciona sob configuração que este projeto não usa é um tipo
 * que não funciona — melhor um contrato honesto sobre o compilador real.
 *
 * `ok` continua sendo a pergunta que quem chama faz; os campos do outro lado vêm indefinidos.
 */
export interface RespostaDeChat {
  ok: boolean
  /** Presente quando `ok`. */
  texto?: string
  /** Entrada + saída — o que a cota do usuário conta. */
  tokens?: number
  /** Separados porque o PREÇO é separado: saída custa 4× a entrada nos `gpt-oss`. */
  tokensEntrada?: number
  tokensSaida?: number
  /**
   * Tokens de entrada servidos do CACHE de prompt do provedor (`prompt_tokens_details.cached_tokens`
   * no formato OpenAI, que a Groq e o OpenRouter repetem). Já estão DENTRO de `tokensEntrada`; o
   * número separado é para a telemetria medir quanto o prefixo fixo dos prompts está economizando.
   */
  tokensEmCache?: number
  /** Presentes quando falhou: o código HTTP (0 = rede/timeout) e a causa legível. */
  status?: number
  causa?: string
  /** No 429: o `Retry-After` do provedor, em segundos — alimenta a admissão (`admissao.ts`). */
  retryAfterS?: number
  /** A chamada foi abortada porque quem pediu desistiu: não é falha do provedor, e a cascata para. */
  cancelado?: boolean
  /**
   * Pediu saída estruturada, nenhum endpoint do modelo a aceitava, e a resposta veio da SEGUNDA tentativa, sem o
   * esquema (`chamarChat`). O texto ainda passa pelo `ler*` defensivo de quem chamou.
   */
  semEsquema?: boolean
}

/**
 * Teto ABSOLUTO do prompt (system + mensagens), em caracteres — a rede de segurança abaixo dos tetos
 * por função (`funcoesDeIa.ts`). Era 100 mil e morava em `llmRequest.ts`, quando o cliente escrevia
 * o prompt; hoje o maior pedido legítimo é o tutor (10 mil de conteúdo + ~3 mil de `system` e cerca).
 */
export const MAX_PROMPT_CHARS = 16_000

/** Teto de saída. Sem ele um provedor caro decide sozinho quanto gastar. */
export const MAX_TOKENS_PADRAO = 1200

/**
 * Timeout padrão. 30 s é o meio-termo entre os três que existiam (12 s na tradução, 30 s na nuvem,
 * 60 s no local): quem precisa de outro valor passa `timeoutMs`, e a tradução passa — ela responde
 * enquanto alguém espera legenda na tela, e 12 s lá é decisão de produto, não descuido.
 */
export const TIMEOUT_PADRAO_MS = 30_000

/**
 * OS PARÂMETROS QUE DEPENDEM DE QUEM ATENDE — raciocínio e retenção de dados. Moram em
 * `parametrosDoProvedor.ts`, um módulo sem imports, para a bancada de provedores medir o candidato com
 * o MESMO pedido da produção (B5); a explicação de cada campo está lá.
 */
export { parametrosDoProvedor }

/** O texto inteiro que vai no prompt — para o teto ser conferido em um lugar só. */
export function tamanhoDoPrompt(messages: MensagemDeChat[]): number {
  return messages.reduce((n, m) => n + (m.content?.length ?? 0), 0)
}

/**
 * Uma tentativa contra UM provedor OpenAI-compatible.
 *
 * `base` é a raiz da API (`.../v1`); o caminho é acrescentado aqui, porque era outro detalhe
 * repetido — e um dos lugares o guardava já concatenado, o que fazia a mesma variável significar
 * coisas diferentes em arquivos vizinhos.
 */
/**
 * O OpenRouter recusou o pedido PELO ESQUEMA: com `require_parameters`, nenhum endpoint do modelo aceita o
 * `response_format` — 404 "No endpoints found…" ou um 400 que cita o response_format/json_schema. É a única falha que a segunda tentativa sem esquema conserta; as outras seguem para a reserva.
 */
function recusouOEsquema(status: number, corpo: string): boolean {
  /* SÓ a recusa do esquema. Um 400 de outro parâmetro (temperature, top_p, max_tokens) ou um 404 de modelo
     inexistente seria repetido à toa — e a mesma falha voltaria. */
  if (status === 404) return /no endpoints found/i.test(corpo)
  return status === 400 && /response_format|json_schema|structured|require_parameters/i.test(corpo)
}

export async function chamarChat(p: PedidoDeChat): Promise<RespostaDeChat> {
  const inicio = Date.now()
  const r = await chamarUmaVez(p)
  /* SAÍDA ESTRUTURADA SEM QUEBRAR A CASCATA. O modelo da perna pode não ter, entre os endpoints de retenção zero,
     nenhum que aceite o esquema; o `require_parameters` então recusa o pedido inteiro. Repetir a MESMA perna sem o
     esquema devolve o comportamento de antes (JSON pelo prompt + leitura defensiva), em vez de gastar a perna. */
  const { recusouEsquema, ...resposta } = r
  if (!resposta.ok && !resposta.cancelado && recusouEsquema && ehBaseDoOpenRouter(p.base)) {
    /* A repetição cabe no RELÓGIO DA PERNA (o `timeoutMs` é da perna, não de cada tentativa): sem isso uma perna de
       15 s viraria 30 s, e o prazo da cascata (`percorrerCascata`) não fecharia. O resto do pedido — raciocínio,
       `provider` com retenção zero e os `ignore` — é o mesmo: só o esquema sai. */
    const restante = (p.timeoutMs ?? TIMEOUT_PADRAO_MS) - (Date.now() - inicio)
    if (restante <= 0) return { ok: false, status: 0, causa: `sem resposta em ${p.timeoutMs ?? TIMEOUT_PADRAO_MS} ms` }
    const { recusouEsquema: _ignorado, ...sem } = await chamarUmaVez({
      ...p,
      formatoDeSaida: undefined,
      timeoutMs: restante,
    })
    return sem.ok ? { ...sem, semEsquema: true } : sem
  }
  return resposta
}

async function chamarUmaVez(p: PedidoDeChat): Promise<RespostaDeChat & { recusouEsquema?: boolean }> {
  const caracteres = tamanhoDoPrompt(p.messages)
  if (caracteres > MAX_PROMPT_CHARS) {
    return { ok: false, status: 413, causa: `prompt de ${caracteres} caracteres acima do teto de ${MAX_PROMPT_CHARS}` }
  }

  const url = `${p.base.replace(/\/+$/, '')}/chat/completions`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        stream: false,
        ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
        max_tokens: p.maxTokens ?? MAX_TOKENS_PADRAO,
        ...parametrosDoProvedor(p.base, p.model, p.roteamento, { formato: p.formatoDeSaida, legenda: p.legenda }),
      }),
      signal: comTempoLimite(p.timeoutMs ?? TIMEOUT_PADRAO_MS, p.sinal),
    })

    if (!r.ok) {
      const retryAfterS = r.status === 429 ? segundosDoRetryAfter(r.headers?.get?.('retry-after')) : undefined
      const corpo = await r.text().catch(() => '')
      return {
        ok: false,
        status: r.status,
        causa: `HTTP ${r.status}: ${corpo.slice(0, 160)}`,
        ...(retryAfterS !== undefined ? { retryAfterS } : {}),
        ...(p.formatoDeSaida && recusouOEsquema(r.status, corpo) ? { recusouEsquema: true } : {}),
      }
    }

    return respostaDoCorpo((await r.json()) as CorpoDoChat, p)
  } catch (err) {
    /* Quem abortou foi o cliente, não o relógio: dito à parte, para a cascata parar em vez de
       tentar a reserva e para o disjuntor não contar como falha do provedor. */
    if (clienteDesistiu(p.sinal)) return { ok: false, status: 0, causa: 'cancelado por quem pediu', cancelado: true }
    const msg = String((err as Error)?.message ?? err)
    // `TimeoutError` do `AbortSignal.timeout` vira uma causa legível: "falhou" e "demorou demais"
    // levam a investigações diferentes.
    const causa = /abort|timeout/i.test(msg)
      ? `sem resposta em ${p.timeoutMs ?? TIMEOUT_PADRAO_MS} ms`
      : msg.slice(0, 160)
    return { ok: false, status: 0, causa }
  }
}

/** O uso que o provedor declara (formato OpenAI; a Groq e o OpenRouter repetem). */
interface UsoDoChat {
  prompt_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens?: number
  completion_tokens_details?: { reasoning_tokens?: number }
}

interface CorpoDoChat {
  choices?: Array<{ message?: { content?: string } }>
  usage?: UsoDoChat
}

/** O texto e o uso de uma resposta inteira — o mesmo para o corpo JSON e para o fluxo já acumulado. */
function respostaDoTexto(bruto: string | undefined, uso: UsoDoChat | undefined, p: PedidoDeChat): RespostaDeChat {
  const data = { usage: uso }
  const texto = bruto?.trim()
  /* O provedor disse que o modelo pensou: a política de custo não corta mais o teto dele, com ou
     sem o nome na lista (`ehModeloDeRaciocinio`). */
  if ((data.usage?.completion_tokens_details?.reasoning_tokens ?? 0) > 0) registrarRaciocinioObservado(p.model)
  if (!texto) {
    /* RESPOSTA VAZIA TEM UMA CAUSA COMUM E NADA ÓBVIA: modelo de raciocínio que gasta o
       `max_tokens` inteiro PENSANDO — o provedor devolve HTTP 200 sem conteúdo e sem erro para
       ler. Medido: o `qwen3.7-flash` gasta 593 tokens para responder "Boa sorte!". Dizer o
       número de raciocínio aponta direto para o teto, em vez de mandar procurar no provedor.
       Esta explicação existia só dentro do `mtProxy`; agora vale para as sete chamadas. */
    const raciocinio = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0
    return {
      ok: false,
      status: 200,
      causa:
        raciocinio > 0
          ? `resposta vazia — gastou ${raciocinio} tokens raciocinando dentro do teto de ${p.maxTokens ?? MAX_TOKENS_PADRAO}`
          : 'resposta vazia do provedor',
    }
  }
  const { tokensEntrada, tokensSaida } = tokensDaChamada(uso, tamanhoDoPrompt(p.messages), bruto?.length ?? 0)
  const tokensEmCache = data.usage?.prompt_tokens_details?.cached_tokens ?? 0
  return { ok: true, texto, tokens: tokensEntrada + tokensSaida, tokensEntrada, tokensSaida, tokensEmCache }
}

/** Tokens de um texto quando o provedor não disse o uso: ~4 caracteres por token. */
const tokensDoTexto = (caracteres: number): number => Math.ceil(Math.max(0, caracteres) / 4)

/** O número que o provedor declarou, se for um número de tokens plausível (positivo e finito). */
const declarado = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.ceil(n) : null

/**
 * OS TOKENS QUE A COTA COBRA. O provedor que omite o `usage` (ou um lado dele: o fluxo sem o último pedaço, um proxy,
 * um provedor que não manda `prompt_tokens`) NÃO pode fazer a chamada sair de graça — era o caminho para gastar a
 * nuvem sem a cota contar. O lado que falta (ou vem zero, negativo, não numérico) vira a estimativa pelo texto: a
 * entrada pelo prompt, a saída pelo que o modelo escreveu. O lado declarado vale como veio (é o real que a cota
 * acerta); a estimativa fica dentro da reserva (`estimarTokens` reserva ~2 caracteres por token de entrada mais o
 * `max_tokens` inteiro).
 */
export function tokensDaChamada(
  uso: UsoDoChat | undefined,
  caracteresDoPrompt: number,
  caracteresDaSaida: number,
): { tokensEntrada: number; tokensSaida: number } {
  return {
    tokensEntrada: declarado(uso?.prompt_tokens) ?? tokensDoTexto(caracteresDoPrompt),
    tokensSaida: declarado(uso?.completion_tokens) ?? tokensDoTexto(caracteresDaSaida),
  }
}

function respostaDoCorpo(data: CorpoDoChat, p: PedidoDeChat): RespostaDeChat {
  return respostaDoTexto(data.choices?.[0]?.message?.content, data.usage, p)
}

/* ─────────────────────────────── a chamada em fluxo ─────────────────────────────── */

/**
 * O FLUXO DE UMA CHAMADA (o "Como respondo?" em fluxo; `docs/specs/2026-10-25-assistente-ao-vivo.md`). Quem chama lê
 * o texto aos pedaços e diz quando COMPROMETEU a resposta — mandou o primeiro byte a quem pediu. Até ali, a chamada
 * é uma perna como outra qualquer (falhou, a cascata tenta a reserva); depois, não há reserva: a falha vem com
 * `comprometido` e os tokens do que já saiu.
 */
export interface FluxoDoChat {
  /**
   * O texto acumulado a cada pedaço, e quanto falta (ms) até o prazo que vale depois do compromisso; `true` = a
   * resposta foi comprometida (o primeiro byte saiu para quem pediu). Com pouco tempo sobrando, quem chama pode não
   * comprometer (o núcleo não manda 1 sugestão para logo depois mandar o erro do prazo).
   */
  aoTexto: (acumulado: string, restanteMs: number) => boolean
  /**
   * O instante (`Date.now()`) em que a leitura para DEPOIS do compromisso: o prazo da cascata. Antes do compromisso
   * vale o `timeoutMs` da perna, como numa chamada inteira. Ausente (a cascata sem prazo total): o prazo da PERNA
   * (início + `timeoutMs`) — nunca "agora".
   */
  prazoFinal?: number
}

export interface RespostaDoFluxo extends RespostaDeChat {
  /** A falha veio DEPOIS do compromisso: a cascata não tenta a reserva, e os tokens já gerados contam. */
  comprometido?: boolean
  /**
   * Quem pediu desistiu ANTES do compromisso: a pessoa não paga (nada lhe foi entregue), mas o provedor cobrou o que
   * já tinha lido e escrito — a estimativa vai ao orçamento GLOBAL, para o portão da nuvem ver o gasto real.
   */
  descartado?: { tokensEntrada: number; tokensSaida: number }
}

/** O pedido recusou o FLUXO (`stream`) — o 400 que o cita. A mesma perna é repetida sem fluxo. */
const recusouOFluxo = (status: number, corpo: string): boolean => status === 400 && /\bstream/i.test(corpo)

interface PedacoDoFluxo {
  error?: { message?: string } | string
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
  usage?: UsoDoChat
}

/**
 * UMA chamada com `stream: true`, lida aos pedaços (SSE do formato OpenAI). Falha vira valor, como em `chamarChat`.
 *
 * VOLTA AO CAMINHO DE SEMPRE: se o provedor recusa o esquema ou o fluxo (o mesmo `recusouOEsquema` do `chamarChat`,
 * ou um 400 que cita `stream`), a MESMA perna é repetida pelo `chamarChat` (inteira, com a segunda tentativa sem
 * esquema), dentro do relógio da perna. Uma resposta que chega sem `text/event-stream` (um proxy, um provedor que
 * ignora o `stream`) é lida como o JSON inteiro.
 */
export async function chamarChatEmFluxo(p: PedidoDeChat, fluxo: FluxoDoChat): Promise<RespostaDoFluxo> {
  const inicio = Date.now()
  const caracteres = tamanhoDoPrompt(p.messages)
  if (caracteres > MAX_PROMPT_CHARS) {
    return { ok: false, status: 413, causa: `prompt de ${caracteres} caracteres acima do teto de ${MAX_PROMPT_CHARS}` }
  }
  const timeoutMs = p.timeoutMs ?? TIMEOUT_PADRAO_MS
  const prazoFinal = Number.isFinite(fluxo.prazoFinal) ? (fluxo.prazoFinal as number) : inicio + timeoutMs
  /* O RELÓGIO É TROCADO NO COMPROMISSO: até o primeiro byte, o da perna; depois, o prazo da cascata. */
  const controle = new AbortController()
  let motivo: 'relogio' | 'prazo' | null = null
  let relogio = setTimeout(() => {
    motivo = 'relogio'
    controle.abort()
  }, timeoutMs)
  const desistiu = () => controle.abort()
  if (p.sinal?.aborted) controle.abort()
  else p.sinal?.addEventListener('abort', desistiu, { once: true })

  let acumulado = ''
  let comprometido = false
  let uso: UsoDoChat | undefined
  const falha = (status: number, causa: string): RespostaDoFluxo => {
    if (!comprometido) return { ok: false, status, causa }
    const { tokensEntrada, tokensSaida } = tokensDaChamada(uso, caracteres, acumulado.length)
    return {
      ok: false,
      status,
      causa,
      comprometido: true,
      tokens: tokensEntrada + tokensSaida,
      tokensEntrada,
      tokensSaida,
      tokensEmCache: uso?.prompt_tokens_details?.cached_tokens ?? 0,
    }
  }
  const lerPedaco = (j: PedacoDoFluxo): string | null => {
    if (j.usage) uso = j.usage
    const delta = j.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) {
      acumulado += delta
      if (fluxo.aoTexto(acumulado, prazoFinal - Date.now()) && !comprometido) {
        comprometido = true
        clearTimeout(relogio)
        relogio = setTimeout(
          () => {
            motivo = 'prazo'
            controle.abort()
          },
          Math.max(0, prazoFinal - Date.now()),
        )
      }
    }
    if (j.error) return String((typeof j.error === 'object' ? j.error.message : j.error) ?? 'erro no fluxo')
    if (j.choices?.[0]?.finish_reason === 'error') return 'o provedor encerrou o fluxo com erro'
    return null
  }
  try {
    const url = `${p.base.replace(/\/+$/, '')}/chat/completions`
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        stream: true,
        /* O uso vem no último pedaço: no OpenRouter pelo `usage`, nos outros pelo `stream_options` do OpenAI. */
        ...(ehBaseDoOpenRouter(p.base) ? { usage: { include: true } } : { stream_options: { include_usage: true } }),
        ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
        max_tokens: p.maxTokens ?? MAX_TOKENS_PADRAO,
        ...parametrosDoProvedor(p.base, p.model, p.roteamento, { formato: p.formatoDeSaida, legenda: p.legenda }),
      }),
      signal: controle.signal,
    })

    if (!r.ok) {
      const retryAfterS = r.status === 429 ? segundosDoRetryAfter(r.headers?.get?.('retry-after')) : undefined
      const corpo = await r.text().catch(() => '')
      const semEsquema = Boolean(p.formatoDeSaida) && recusouOEsquema(r.status, corpo)
      if (semEsquema || recusouOFluxo(r.status, corpo)) {
        clearTimeout(relogio)
        const restante = timeoutMs - (Date.now() - inicio)
        if (restante <= 0) return { ok: false, status: 0, causa: `sem resposta em ${timeoutMs} ms` }
        /* Recusou o ESQUEMA: UMA tentativa inteira, já sem ele (repetir com o esquema daria a mesma recusa). Recusou
           só o fluxo: o caminho inteiro de sempre, com o esquema (e a segunda tentativa dele). */
        if (semEsquema) {
          const { recusouEsquema: _ignorado, ...sem } = await chamarUmaVez({
            ...p,
            formatoDeSaida: undefined,
            timeoutMs: restante,
          })
          return sem.ok ? { ...sem, semEsquema: true } : sem
        }
        return await chamarChat({ ...p, timeoutMs: restante })
      }
      return {
        ok: false,
        status: r.status,
        causa: `HTTP ${r.status}: ${corpo.slice(0, 160)}`,
        ...(retryAfterS !== undefined ? { retryAfterS } : {}),
      }
    }

    const tipo = r.headers?.get?.('content-type') ?? ''
    if (!/text\/event-stream/i.test(tipo) || !r.body) return respostaDoCorpo((await r.json()) as CorpoDoChat, p)

    const leitor = r.body.getReader()
    const decodificador = new TextDecoder()
    let pendente = ''
    let erroNoFluxo: string | null = null
    const lerLinha = (linha: string): void => {
      const l = linha.trim()
      if (!l.startsWith('data:')) return // `: OPENROUTER PROCESSING` e linhas vazias
      const dado = l.slice(5).trim()
      if (!dado || dado === '[DONE]') return
      let j: PedacoDoFluxo
      try {
        j = JSON.parse(dado) as PedacoDoFluxo
      } catch {
        return
      }
      erroNoFluxo ??= lerPedaco(j)
    }
    while (!erroNoFluxo) {
      const { done, value } = await leitor.read()
      if (done) break
      pendente += decodificador.decode(value, { stream: true })
      let i: number
      while (!erroNoFluxo && (i = pendente.indexOf('\n')) >= 0) {
        lerLinha(pendente.slice(0, i))
        pendente = pendente.slice(i + 1)
      }
    }
    if (!erroNoFluxo && pendente) lerLinha(pendente)
    if (erroNoFluxo) {
      controle.abort()
      return falha(502, `erro no fluxo: ${String(erroNoFluxo).slice(0, 140)}`)
    }
    return respostaDoTexto(acumulado, uso, p)
  } catch (err) {
    if (clienteDesistiu(p.sinal)) {
      const r = { ...falha(0, 'cancelado por quem pediu'), cancelado: true }
      return comprometido ? r : { ...r, descartado: tokensDaChamada(uso, caracteres, acumulado.length) }
    }
    if (motivo === 'relogio') return falha(0, `sem resposta em ${timeoutMs} ms`)
    if (motivo === 'prazo') return falha(0, 'prazo da cascata esgotado no meio do fluxo')
    return falha(0, `fluxo interrompido: ${String((err as Error)?.message ?? err).slice(0, 140)}`)
  } finally {
    clearTimeout(relogio)
    p.sinal?.removeEventListener('abort', desistiu)
  }
}
