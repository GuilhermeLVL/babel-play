/**
 * REGRESSÃO — M-01 (mínimo): logger estruturado com ALLOWLIST de campos. Garante que transcrição /
 * chave / prompt NUNCA vão para o log, mesmo que um caller passe por engano. (server/lib/logger.ts)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { log } from '../../server/lib/logger'

afterEach(() => vi.restoreAllMocks())

describe('M-01 — logger com allowlist', () => {
  it('emite só os campos permitidos e DESCARTA os proibidos (PII)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // campos proibidos passados de propósito (transcrição, chave, prompt do usuário)
    log('error', { event: 'x', route: '/api/ai', error: 'HTTP 502',
      // @ts-expect-error — de propósito: o logger deve descartar
      transcript: 'texto secreto do usuário', apiKey: 'sk-ABCDEF', prompt: 'system prompt' })
    const line = spy.mock.calls[0][0] as string
    const obj = JSON.parse(line)
    expect(obj.event).toBe('x')
    expect(obj.route).toBe('/api/ai')
    expect(obj.error).toBe('HTTP 502')
    // nada de PII vazou
    expect(line).not.toContain('texto secreto')
    expect(line).not.toContain('sk-ABCDEF')
    expect(line).not.toContain('system prompt')
    expect(obj).not.toHaveProperty('transcript')
    expect(obj).not.toHaveProperty('apiKey')
  })

  it('roteia por nível (warn/info/error)', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log('warn', { event: 'y' })
    expect(w).toHaveBeenCalledOnce()
  })
})
