/**
 * Preparo + validação do corpo de `/api/gemini/chat` (S-06 / M-02).
 *
 * S-06: a rota aceitava `messages`/`systemInstruction`/`maxTokens` do corpo sem NENHUM teto — qualquer
 * chamador (a rota usa a chave do dono, sem auth) podia ditar prompt gigante e `max_tokens` ilimitado
 * (custo/DoS). Aqui impomos teto de TAMANHO do prompt e clamp de `max_tokens` no servidor. A exposição
 * do `systemInstruction` em si é, no fundo, um problema de AUTENTICAÇÃO (S-02, fora deste escopo) — o
 * teto de custo é a mitigação possível sem auth.
 *
 * Extraído de server.ts para ser testável de forma pura, sem subir o servidor.
 */
export const MAX_OUTPUT_TOKENS = 4096
/** Teto de tamanho do prompt (system + todas as mensagens), em caracteres. */
export const MAX_PROMPT_CHARS = 100_000

export interface LlmChatBody {
  messages?: unknown
  systemInstruction?: unknown
  temperature?: unknown
  maxTokens?: unknown
}

/**
 * Interface PLANA (não union discriminada) de propósito: o tsconfig raiz não é strict e sem
 * `strictNullChecks` o narrowing de union por `ok` não funciona em server.ts. Com todos os campos
 * sempre presentes, o caller só olha `ok`/`status`/`error` sem depender de narrowing.
 */
export interface PreparedLlm {
  ok: boolean
  /** 400/413 no erro; 200 quando ok. */
  status: number
  error?: string
  messages: Array<{ role: 'assistant' | 'user'; content: string }>
  systemInstruction: string
  temperature?: number
  maxTokens: number
}

const err = (status: number, error: string): PreparedLlm =>
  ({ ok: false, status, error, messages: [], systemInstruction: '', maxTokens: 0 })

export function prepareLlmRequest(body: LlmChatBody | undefined): PreparedLlm {
  const raw = body?.messages
  if (!Array.isArray(raw)) {
    return err(400, 'O array de mensagens é obrigatório.')
  }
  const messages = raw.map((m: any) => ({
    role: (m?.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
    content: typeof m?.content === 'string' ? m.content : '',
  }))
  const systemInstruction = typeof body?.systemInstruction === 'string' ? body.systemInstruction : ''

  // S-06: teto de tamanho do prompt (custo/DoS) — o corpo global já é 5mb, mas 5mb de texto num
  // prompt é caro e abusivo; 100k chars é folgado para o contexto de tela real do iChat.
  const totalChars = systemInstruction.length + messages.reduce((n, m) => n + m.content.length, 0)
  if (totalChars > MAX_PROMPT_CHARS) {
    return err(413, 'prompt grande demais (teto de tamanho no servidor)')
  }

  const temperature = typeof body?.temperature === 'number' ? body.temperature : undefined
  // S-06: clamp de max_tokens no servidor — o cliente não dita custo ilimitado. Ausência/valor inválido → o teto.
  const maxTokens = Math.min(Number(body?.maxTokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)

  return { ok: true, status: 200, messages, systemInstruction, temperature, maxTokens }
}
