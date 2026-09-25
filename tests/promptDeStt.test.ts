/**
 * O PROMPT DO STT DE NUVEM: a última fala FINAL da MESMA fonte, no MESMO idioma.
 *
 * O Whisper aceita um `prompt` com o texto que veio antes; com ele o modelo mantém grafia de nomes,
 * pontuação e o fio da frase entre um trecho e outro (o corte do VAD parte frases). O contrato com o
 * servidor: cabeçalho `x-stt-prompt` com `encodeURIComponent(texto)`, no máximo 224 caracteres (o
 * FIM do texto, que é o que encosta no trecho novo), e só quando existe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

import { ContextoDoStt, cortarPrompt, MAX_PROMPT_STT } from '../src/gateway/promptDeStt'

describe('cortarPrompt', () => {
  it('texto curto passa inteiro', () => {
    expect(cortarPrompt('  Olá, tudo bem?  ')).toBe('Olá, tudo bem?')
  })

  it('texto longo fica com o FIM, até 224 caracteres, sem começar no meio de uma palavra', () => {
    const longo = Array.from({ length: 80 }, (_, i) => `palavra${i}`).join(' ')
    const p = cortarPrompt(longo)
    expect(MAX_PROMPT_STT).toBe(224)
    expect(p.length).toBeLessThanOrEqual(224)
    expect(longo.endsWith(p)).toBe(true)
    expect(p.startsWith('palavra')).toBe(true)
  })
})

describe('ContextoDoStt', () => {
  it('devolve a última final da mesma fonte, no mesmo idioma', () => {
    const c = new ContextoDoStt()
    c.registrar('system', 'Primeira frase do vídeo.', 'es')
    c.registrar('system', 'Segunda frase do vídeo.', 'es')
    c.registrar('mic', 'Minha fala.', 'pt')
    expect(c.promptPara('system', 'es')).toBe('Segunda frase do vídeo.')
    expect(c.promptPara('mic', 'pt-BR')).toBe('Minha fala.')
  })

  it('idioma diferente, idioma desconhecido ou fonte sem histórico: sem prompt', () => {
    const c = new ContextoDoStt()
    c.registrar('system', 'Hello there.', 'en')
    expect(c.promptPara('system', 'es')).toBeUndefined()
    expect(c.promptPara('system', '')).toBeUndefined()
    expect(c.promptPara('mic', 'en')).toBeUndefined()
    c.registrar('mic', 'sem idioma', '')
    expect(c.promptPara('mic', 'en')).toBeUndefined()
  })

  it('limpar esquece tudo (sessão nova)', () => {
    const c = new ContextoDoStt()
    c.registrar('system', 'Algo.', 'pt')
    c.limpar()
    expect(c.promptPara('system', 'pt')).toBeUndefined()
  })
})

describe('adaptador groq-whisper', () => {
  beforeEach(() => vi.resetModules())

  async function adaptador() {
    const { apiFetch } = await import('../src/data/api')
    const api = apiFetch as unknown as ReturnType<typeof vi.fn>
    api.mockReset()
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'ok', language: 'pt' }), { status: 200 }))
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    return { stt: new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }), api }
  }

  it('manda x-stt-prompt codificado quando há prompt', async () => {
    const { stt, api } = await adaptador()
    await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt', prompt: 'Ação: "já é", né?' })
    const headers = api.mock.calls[0][1].headers as Record<string, string>
    expect(headers['x-stt-prompt']).toBe(encodeURIComponent('Ação: "já é", né?'))
  })

  it('corta o prompt no fim mesmo se o chamador mandar mais de 224 caracteres', async () => {
    const { stt, api } = await adaptador()
    const longo = 'a '.repeat(300) + 'final'
    await stt.transcribePcm(new Float32Array(1600), 16000, { prompt: longo })
    const enviado = decodeURIComponent((api.mock.calls[0][1].headers as Record<string, string>)['x-stt-prompt'])
    expect(enviado.length).toBeLessThanOrEqual(224)
    expect(enviado.endsWith('final')).toBe(true)
  })

  it('sem prompt, sem cabeçalho', async () => {
    const { stt, api } = await adaptador()
    await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })
    expect('x-stt-prompt' in (api.mock.calls[0][1].headers as Record<string, string>)).toBe(false)
  })
})
