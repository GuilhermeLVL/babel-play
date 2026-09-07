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
import { MAX_PROMPT_CHARS } from './llmRequest'

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
  tokens?: number
  /** Presentes quando falhou: o código HTTP (0 = rede/timeout) e a causa legível. */
  status?: number
  causa?: string
}

/** Teto de saída. Sem ele um provedor caro decide sozinho quanto gastar. */
export const MAX_TOKENS_PADRAO = 1200

/**
 * Timeout padrão. 30 s é o meio-termo entre os três que existiam (12 s na tradução, 30 s na nuvem,
 * 60 s no local): quem precisa de outro valor passa `timeoutMs`, e a tradução passa — ela responde
 * enquanto alguém espera legenda na tela, e 12 s lá é decisão de produto, não descuido.
 */
export const TIMEOUT_PADRAO_MS = 30_000

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
      }),
      signal: AbortSignal.timeout(p.timeoutMs ?? TIMEOUT_PADRAO_MS),
    })

    if (!r.ok) {
      return { ok: false, status: r.status, causa: `HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}` }
    }

    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
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
        causa: raciocinio > 0
          ? `resposta vazia — gastou ${raciocinio} tokens raciocinando dentro do teto de ${p.maxTokens ?? MAX_TOKENS_PADRAO}`
          : 'resposta vazia do provedor',
      }
    }
    return {
      ok: true,
      texto,
      tokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
    }
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
