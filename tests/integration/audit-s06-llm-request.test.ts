/**
 * REGRESSÃO — S-06 / M-02: /api/gemini/chat sem teto (systemInstruction livre + maxTokens ilimitado).
 *
 * S-06: qualquer chamador (a rota usa a chave do dono, sem auth) ditava prompt gigante e max_tokens
 * ilimitado — custo/DoS. Correção: teto de tamanho do prompt + clamp de max_tokens no servidor.
 * M-02: o caminho Gemini fixava temperature 0.7 e ignorava maxTokens; agora prepareLlmRequest entrega
 * os valores (clampados) para os dois caminhos.
 *
 * A lógica foi extraída para server/ai/llmRequest.ts — testável sem subir o servidor.
 */
import { describe, it, expect } from 'vitest'
import { prepareLlmRequest, MAX_OUTPUT_TOKENS, MAX_PROMPT_CHARS } from '../../server/ai/llmRequest'

describe('S-06/M-02 — preparo do /api/gemini/chat', () => {
  it('rejeita corpo sem array de mensagens (400)', () => {
    const r = prepareLlmRequest({ messages: 'não é array' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('CORRIGIDO (S-06): clampa max_tokens no servidor mesmo pedindo muito', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: 'oi' }], maxTokens: 999999 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.maxTokens).toBeLessThanOrEqual(MAX_OUTPUT_TOKENS)
  })

  it('CORRIGIDO (S-06): sem max_tokens → cai no teto do servidor (não ilimitado)', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: 'oi' }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.maxTokens).toBe(MAX_OUTPUT_TOKENS)
  })

  it('CORRIGIDO (S-06): rejeita prompt gigante (413) — teto de tamanho', () => {
    const huge = 'x'.repeat(MAX_PROMPT_CHARS + 1)
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: huge }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(413)
  })

  it('CORRIGIDO (M-02): a temperature do cliente é preservada (não fixada em 0.7)', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: 'oi' }], temperature: 0 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.temperature).toBe(0)
  })

  it('normaliza role e content (assistant/user; content não-string → vazio)', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'assistant', content: 'a' }, { role: 'x', content: 42 }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.messages[0]).toEqual({ role: 'assistant', content: 'a' })
      expect(r.messages[1]).toEqual({ role: 'user', content: '' })
    }
  })
})
