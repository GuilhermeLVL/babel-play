/**
 * A SONDA DE CONTRATO (B5) — um pedido mínimo por provedor para pegar mudança de API ANTES da
 * produção. O caso que motivou: a Groq tirou o Llama 3.x do catálogo em 16/08/2026 e o modelo passou
 * a responder `model_not_found`; o `mtProxy` só descobriu em produção. Aqui, com respostas simuladas:
 * o formato da resposta, o `usage`, os cabeçalhos de limite, o campo de retenção quando existe, e o
 * que é violação (quebra o contrato) versus o que é só aviso (429 agora, 5xx de passagem).
 */
import { describe, expect, it } from 'vitest'

import {
  camposDeRetencao,
  classificarFalhaHttp,
  conferirContratoMt,
  conferirContratoStt,
  limitesDosCabecalhos,
  planoDaSonda,
} from '../../scripts/eval-fala/bancada/sondar-contratos.mjs'

const cabecalhos = (o: Record<string, string>) => new Headers(o)

describe('conferirContratoMt', () => {
  const ok = {
    choices: [{ message: { content: 'Oi, e aí?' } }],
    usage: { prompt_tokens: 320, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 256 } },
  }

  it('resposta completa: sem violação, e registra o que a telemetria usa', () => {
    const r = conferirContratoMt(ok)
    expect(r.violacoes).toEqual([])
    expect(r.observado).toMatchObject({ tokensEntrada: 320, tokensSaida: 12, cacheInformado: true })
  })

  it('sem usage: violação — a cota e o custo dependem dele', () => {
    const r = conferirContratoMt({ choices: [{ message: { content: 'Oi' } }] })
    expect(r.violacoes.join(' ')).toMatch(/usage\.prompt_tokens/)
    expect(r.violacoes.join(' ')).toMatch(/usage\.completion_tokens/)
  })

  it('conteúdo vazio e pensamento vazando são violações', () => {
    expect(conferirContratoMt({ ...ok, choices: [{ message: { content: '' } }] }).violacoes.join(' ')).toMatch(/vazio/)
    const vazou = conferirContratoMt({ ...ok, choices: [{ message: { content: '<think>hmm</think>Oi' } }] })
    expect(vazou.violacoes.join(' ')).toMatch(/pensamento/)
  })
})

describe('conferirContratoStt', () => {
  const seg = { text: ' Olá.', no_speech_prob: 0.02, avg_logprob: -0.3, compression_ratio: 1.2 }

  it('verbose_json completo: sem violação', () => {
    const r = conferirContratoStt('openai', { text: ' Olá.', language: 'portuguese', duration: 1.5, segments: [seg] })
    expect(r.violacoes).toEqual([])
    expect(r.observado).toMatchObject({ segmentos: 1, idioma: 'portuguese' })
  })

  it('sem segments: a triagem da produção fica cega — violação', () => {
    expect(conferirContratoStt('openai', { text: 'Olá.' }).violacoes.join(' ')).toMatch(/segments/)
  })

  it('segmento sem os três números da triagem: violação', () => {
    const r = conferirContratoStt('openai', { text: 'x', language: 'pt', segments: [{ text: 'x' }] })
    expect(r.violacoes.join(' ')).toMatch(/no_speech_prob/)
  })

  it('lista vazia (áudio sem fala) não é violação, é observação', () => {
    const r = conferirContratoStt('openai', { text: '', language: 'pt', segments: [] })
    expect(r.violacoes).toEqual([])
    expect(r.observacoes.join(' ')).toMatch(/nenhum segmento/)
  })

  it('Cloudflare: o envelope { success, result } e o transcription_info', () => {
    expect(
      conferirContratoStt('cloudflare', {
        success: true,
        result: { text: 'Olá.', segments: [seg], transcription_info: { language: 'pt', duration: 1.5 } },
      }).violacoes,
    ).toEqual([])
    expect(conferirContratoStt('cloudflare', { success: false, errors: [{ message: 'x' }] }).violacoes).not.toEqual([])
    expect(
      conferirContratoStt('cloudflare', { success: true, result: { text: 'Olá.', segments: [seg] } }).violacoes.join(
        ' ',
      ),
    ).toMatch(/transcription_info/)
  })
})

describe('cabeçalhos e retenção', () => {
  it('limites: x-ratelimit-*, ratelimit-* e retry-after; nada mais', () => {
    expect(
      limitesDosCabecalhos(
        cabecalhos({
          'x-ratelimit-remaining-requests': '99',
          'x-ratelimit-limit-tokens-minute': '60000',
          'retry-after': '2',
          'content-type': 'application/json',
          'set-cookie': 'nao=vaza',
        }),
      ),
    ).toEqual({
      'x-ratelimit-remaining-requests': '99',
      'x-ratelimit-limit-tokens-minute': '60000',
      'retry-after': '2',
    })
  })

  it('retenção: campos da resposta e cabeçalhos que falam de retenção/ZDR/coleta', () => {
    expect(
      camposDeRetencao(
        { id: 'x', provider: 'Fireworks', meta: { data_retention: 'none', zdr: true } },
        cabecalhos({ 'x-data-retention': 'zero' }),
      ),
    ).toEqual({ 'meta.data_retention': 'none', 'meta.zdr': true, 'cabeçalho x-data-retention': 'zero' })
    expect(camposDeRetencao({ choices: [] }, cabecalhos({}))).toEqual({})
  })
})

describe('classificarFalhaHttp: violação × aviso', () => {
  it('modelo fora do catálogo e chave recusada são violações', () => {
    expect(classificarFalhaHttp(404, '{"error":{"code":"model_not_found"}}').violacao).toMatch(/catálogo/)
    expect(classificarFalhaHttp(400, 'The model `x` has been decommissioned').violacao).toMatch(/catálogo/)
    expect(classificarFalhaHttp(401, 'invalid api key').violacao).toMatch(/chave/)
  })
  it('429 e 5xx são avisos: o provedor está ocupado agora, o contrato não mudou', () => {
    expect(classificarFalhaHttp(429, 'rate limit').violacao).toBeNull()
    expect(classificarFalhaHttp(429, 'rate limit').aviso).toMatch(/429/)
    expect(classificarFalhaHttp(503, '').violacao).toBeNull()
  })
  it('outro 4xx é violação (o pedido que a produção manda foi recusado)', () => {
    expect(classificarFalhaHttp(422, 'unknown field chat_template_kwargs').violacao).toMatch(/422/)
  })
})

describe('planoDaSonda: sem chave, pula e diz', () => {
  it('só com a chave da DeepInfra, o resto sai pulado com o motivo', () => {
    const plano = planoDaSonda({ DEEPINFRA_API_KEY: 'x' })
    const deep = plano.filter((p: { sis: { provedor: string } }) => p.sis.provedor === 'deepinfra')
    expect(deep.length).toBeGreaterThanOrEqual(3)
    expect(deep.every((p: { pulado: unknown }) => !p.pulado)).toBe(true)
    expect(deep.some((p: { funcao: string }) => p.funcao === 'stt')).toBe(true)
    const cf = plano.find((p: { sis: { provedor: string } }) => p.sis.provedor === 'cloudflare')
    expect(cf.pulado).toMatch(/CLOUDFLARE_ACCOUNT_ID/)
  })
  it('sonda os candidatos do B5 e as linhas de base', () => {
    const ids = planoDaSonda({}).map((p: { sis: { id: string } }) => p.sis.id)
    for (const id of [
      'groq:openai/gpt-oss-120b',
      'deepinfra:openai/gpt-oss-20b',
      'deepinfra:Qwen/Qwen3.5-9B@none',
      'deepinfra:google/gemma-4-26B-A4B-it',
      'cerebras:gpt-oss-120b',
      'cloudflare:@cf/openai/gpt-oss-20b',
      'groq:whisper-large-v3-turbo',
      'deepinfra:openai/whisper-large-v3-turbo',
      'cloudflare:@cf/openai/whisper-large-v3-turbo',
    ])
      expect(ids).toContain(id)
    expect(ids.some((id: string) => /gemini/i.test(id))).toBe(false)
  })
})
