import type { AdapterCost, AdapterRuntime, ChatMessage, ChatResult } from '@core'
import type { LlmOptions, LlmProvider } from '../capabilities'
import { apiFetch } from '../../data/api'

/**
 * Adapter OpenAI-compatible — o MESMO protocolo `/chat/completions` do desktop
 * (`llmClient.ts`), agora client-side. Serve três destinos com o mesmo código:
 *  - Ollama/LM Studio do usuário em `localhost` (runtime browser, cost local);
 *  - o proxy do servidor `/api/ai/llm` (runtime proxy, o server injeta o segredo
 *    via `x-credential-id`);
 *  - um provedor de nuvem direto (com apiKey no navegador — opção BYO).
 */
export interface OpenAiCompatibleConfig {
  id: string
  label: string
  runtime: AdapterRuntime
  cost: AdapterCost
  /** Endpoint base (sem `/chat/completions`). */
  baseUrl: string
  model: string
  /** Chave só em chamada DIRETA do navegador; no proxy o server injeta. */
  apiKey?: string
  /** Referência de credencial p/ o proxy resolver o segredo (header x-credential-id). */
  credentialId?: string
}

export class OpenAiCompatibleLlm implements LlmProvider {
  readonly id: string
  readonly label: string
  readonly runtime: AdapterRuntime
  readonly cost: AdapterCost

  constructor(private cfg: OpenAiCompatibleConfig) {
    this.id = cfg.id
    this.label = cfg.label
    this.runtime = cfg.runtime
    this.cost = cfg.cost
  }

  private endpoint(): string {
    return this.cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  }

  /**
   * Proxy do servidor (`/api/ai/llm`) vai pelo funil `apiFetch` — Bearer, 401 e, sem conta, o
   * servidor em memória (501). URL própria (Ollama, LM Studio, OpenAI direto) é `fetch` cru: não é
   * rota nossa, e o segredo é do usuário.
   */
  private enviar(url: string, init: RequestInit): Promise<Response> {
    return url.startsWith('/api/') ? apiFetch(url, init) : fetch(url, init)
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.cfg.apiKey) h['Authorization'] = 'Bearer ' + this.cfg.apiKey
    if (this.cfg.credentialId) h['x-credential-id'] = this.cfg.credentialId
    return h
  }

  private body(system: string, messages: ChatMessage[], stream: boolean, opts?: LlmOptions): string {
    return JSON.stringify({
      model: this.cfg.model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: opts?.maxTokens ?? 1024,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      stream,
    })
  }

  async chat(system: string, messages: ChatMessage[], opts?: LlmOptions): Promise<ChatResult> {
    const res = await this.enviar(this.endpoint(), {
      method: 'POST',
      headers: this.headers(),
      body: this.body(system, messages, false, opts),
      signal: opts?.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${this.id} HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const o = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = o.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) throw new Error(`${this.id} devolveu resposta vazia`)
    return {
      text,
      usage: { inputTokens: o.usage?.prompt_tokens ?? 0, outputTokens: o.usage?.completion_tokens ?? 0 },
    }
  }

  async chatStream(
    system: string,
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    opts?: LlmOptions
  ): Promise<ChatResult> {
    const res = await this.enviar(this.endpoint(), {
      method: 'POST',
      headers: this.headers(),
      body: this.body(system, messages, true, opts),
      signal: opts?.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`${this.id} HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    if (!res.body) throw new Error(`${this.id}: resposta sem corpo p/ streaming`)

    // SSE: chunks chegam com linhas partidas — buffer por linha (lift do llmClient).
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let text = ''
    let usage = { inputTokens: 0, outputTokens: 0 }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      for (;;) {
        const nl = buf.indexOf('\n')
        if (nl < 0) break
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const o = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          const delta = o.choices?.[0]?.delta?.content
          if (delta) {
            text += delta
            onDelta(delta)
          }
          if (o.usage) {
            usage = {
              inputTokens: o.usage.prompt_tokens ?? 0,
              outputTokens: o.usage.completion_tokens ?? 0,
            }
          }
        } catch {
          /* linha SSE não-JSON (keep-alive): ignora */
        }
      }
    }
    if (!text.trim()) throw new Error(`${this.id} não devolveu texto no stream`)
    return { text: text.trim(), usage }
  }
}
