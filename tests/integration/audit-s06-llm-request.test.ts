/**
 * REGRESSÃO — S-06 / M-02: o tutor sem teto (systemInstruction livre + maxTokens ilimitado).
 *
 * S-06 pôs teto de tamanho do prompt e clamp de `max_tokens` no servidor. A Fase 2 do lançamento
 * foi além: o cliente não escreve mais prompt nenhum (ver `funcoes-de-ia.test.ts`). O que este
 * arquivo guarda é o contrato de S-06 sob a regra nova — teto e clamp continuam valendo, agora POR
 * FUNÇÃO, e o M-02 (temperatura do cliente preservada) foi REVERTIDO de propósito: temperatura é
 * decisão de produto por função, não parâmetro de quem chama.
 */
import { describe, expect, it } from 'vitest'

import { FUNCOES_DE_IA } from '../../server/ai/funcoesDeIa'
import { MAX_PROMPT_CHARS } from '../../server/ai/llmClient'
import { prepareLlmRequest } from '../../server/ai/llmRequest'

describe('S-06 — preparo do /api/tutor/chat', () => {
  it('rejeita corpo sem array de mensagens (400)', () => {
    const r = prepareLlmRequest({ messages: 'não é array' })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
  })

  it('max_tokens pedido pelo cliente não passa do teto da função', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: 'oi' }], maxTokens: 999999 })
    expect(r.ok).toBe(true)
    expect(r.maxTokens).toBe(FUNCOES_DE_IA.tutor.maxTokens)
  })

  it('rejeita prompt gigante (413) — teto de tamanho da função', () => {
    const huge = 'x'.repeat(FUNCOES_DE_IA.tutor.tetoEntrada + 1)
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: huge }] })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(413)
  })

  it('o teto absoluto do cliente de LLM cobre o maior pedido legítimo (conteúdo + system)', () => {
    const cheio = prepareLlmRequest({
      messages: [{ role: 'user', content: 'x'.repeat(FUNCOES_DE_IA.tutor.tetoEntrada) }],
    })
    const total = cheio.messages.reduce((n, m) => n + m.content.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_PROMPT_CHARS)
  })

  it('M-02 revertido: a temperatura é a da função, não a do cliente', () => {
    const r = prepareLlmRequest({ messages: [{ role: 'user', content: 'oi' }], temperature: 0 })
    expect(r.temperature).toBe(FUNCOES_DE_IA.tutor.temperatura)
  })

  it('normaliza role e content (assistant/user; content não-string → vazio)', () => {
    const r = prepareLlmRequest({
      messages: [
        { role: 'assistant', content: 'a' },
        { role: 'x', content: 42 },
      ],
    })
    expect(r.ok).toBe(true)
    // [0] é o system do servidor.
    expect(r.messages[1]).toEqual({ role: 'assistant', content: 'a' })
    expect(r.messages[2]).toEqual({ role: 'user', content: '' })
  })
})
