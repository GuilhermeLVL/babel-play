/**
 * Tipos de LLM puros, compartilhados pelos adapters de navegador (`src/gateway`)
 * e pelo proxy do servidor (`server/ai`). Lift do formato do `llmClient` do desktop.
 */

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  text: string
  usage: Usage
}
