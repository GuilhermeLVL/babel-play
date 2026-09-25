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
 * OS PARÂMETROS QUE DEPENDEM DE QUEM ATENDE (24/09/2026) — raciocínio e retenção de dados.
 *
 * RACIOCÍNIO. O `gpt-oss` (o default de `provedores.ts`) é modelo de raciocínio, e sem instrução
 * ele pensa no esforço MÉDIO: o pensamento sai do `max_tokens` (a "resposta vazia" explicada logo
 * abaixo) e entra na conta como saída — a parte cara. Traduzir uma fala ou responder o tutor em
 * quatro frases não precisa disso; "low" basta. Cada provedor escreve o pedido de um jeito:
 *
 *   - Groq: `reasoning_effort: "low"` e `include_reasoning: false` — o segundo tira o raciocínio da
 *     resposta, que ninguém aqui lê (docs da Groq, "Reasoning", 2026-09);
 *   - OpenRouter: `reasoning: { effort: "low", exclude: true }`, o formato unificado dele — o
 *     `reasoning_effort` solto não é o contrato de lá (docs do OpenRouter, "Reasoning Tokens");
 *   - qualquer outro OpenAI-compatible (Ollama, BYOK): só `reasoning_effort`, que é o parâmetro da
 *     própria API da OpenAI. `include_reasoning` é extensão da Groq e um provedor estrito recusaria.
 *
 * RETENÇÃO. No OpenRouter a requisição vai com `provider: { zdr: true }` SEMPRE, qualquer que seja
 * o modelo: o OpenRouter é um roteador, e sem isso a fala do usuário pode cair num provedor que
 * guarda o prompt. O app é aberto a menores (LGPD art. 14); retenção zero não é opcional.
 *
 * O provedor é reconhecido pelo HOST da base, não pelo rótulo: a reserva configurada por
 * `LLM_RESERVA_*` pode apontar para o OpenRouter sem usar o atalho `OPENROUTER_API_KEY`.
 */
function hostDe(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function parametrosDoProvedor(base: string, model: string): Record<string, unknown> {
  const host = hostDe(base)
  const raciocinio = /gpt-oss/i.test(model)
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) {
    return { provider: { zdr: true }, ...(raciocinio ? { reasoning: { effort: 'low', exclude: true } } : {}) }
  }
  if (!raciocinio) return {}
  if (host === 'api.groq.com') return { reasoning_effort: 'low', include_reasoning: false }
  return { reasoning_effort: 'low' }
}

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
export async function chamarChat(p: PedidoDeChat): Promise<RespostaDeChat> {
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
        ...parametrosDoProvedor(p.base, p.model),
      }),
      signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_PADRAO_MS),
    })

    if (!r.ok) {
      const retryAfterS = r.status === 429 ? segundosDoRetryAfter(r.headers?.get?.('retry-after')) : undefined
      return {
        ok: false,
        status: r.status,
        causa: `HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`,
        ...(retryAfterS !== undefined ? { retryAfterS } : {}),
      }
    }

    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
        completion_tokens?: number
        completion_tokens_details?: { reasoning_tokens?: number }
      }
    }
    const texto = data.choices?.[0]?.message?.content?.trim()
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
    const tokensEntrada = data.usage?.prompt_tokens ?? 0
    const tokensSaida = data.usage?.completion_tokens ?? 0
    const tokensEmCache = data.usage?.prompt_tokens_details?.cached_tokens ?? 0
    return { ok: true, texto, tokens: tokensEntrada + tokensSaida, tokensEntrada, tokensSaida, tokensEmCache }
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    // `TimeoutError` do `AbortSignal.timeout` vira uma causa legível: "falhou" e "demorou demais"
    // levam a investigações diferentes.
    const causa = /abort|timeout/i.test(msg)
      ? `sem resposta em ${p.timeoutMs ?? TIMEOUT_PADRAO_MS} ms`
      : msg.slice(0, 160)
    return { ok: false, status: 0, causa }
  }
}
