/**
 * OS PARÂMETROS QUE O LLM DE NUVEM RECEBE — raciocínio, retenção de dados e cache de prompt.
 *
 * O `gpt-oss` é modelo de RACIOCÍNIO: sem `reasoning_effort` ele pensa no esforço padrão (médio), e
 * o pensamento sai do `max_tokens` e da conta. Para traduzir uma fala de 6 s, "low" basta. Cada
 * provedor escreve isso de um jeito:
 *
 *   - Groq: `reasoning_effort: "low"` + `include_reasoning: false` (não devolve o raciocínio);
 *   - OpenRouter: `reasoning: { effort: "low", exclude: true }` — e SEMPRE `provider: { zdr: true }`,
 *     que só roteia para provedores com retenção zero de dados (o app é aberto a menores).
 *
 * E o cache de prompt dos provedores é por PREFIXO: o `system` precisa começar pelo texto fixo e
 * terminar pelo que muda (idioma), senão cada par de idiomas é um prefixo novo e o cache nunca acerta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { maxTokensDaTraducao } from '../server/ai/funcoesDeIa'
import { chamarChat } from '../server/ai/llmClient'
import { systemComunicativo } from '../src/lib/traducao/promptComunicativo'

let corpos: any[] = []

function stubFetch() {
  corpos = []
  vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
    corpos.push(JSON.parse(init.body))
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
}
afterEach(() => vi.unstubAllGlobals())

const mensagens = [{ role: 'user' as const, content: 'oi' }]

describe('parâmetros de raciocínio e retenção por provedor', () => {
  it('Groq + gpt-oss: reasoning_effort low e include_reasoning false, sem campos do OpenRouter', async () => {
    stubFetch()
    await chamarChat({ base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', messages: mensagens })
    expect(corpos[0]).toMatchObject({ reasoning_effort: 'low', include_reasoning: false })
    expect(corpos[0]).not.toHaveProperty('reasoning')
    expect(corpos[0]).not.toHaveProperty('provider')
  })

  it('OpenRouter + gpt-oss: reasoning {effort, exclude} e provider {zdr}', async () => {
    stubFetch()
    await chamarChat({ base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b', messages: mensagens })
    expect(corpos[0].reasoning).toEqual({ effort: 'low', exclude: true })
    expect(corpos[0].provider).toEqual({ zdr: true })
    expect(corpos[0]).not.toHaveProperty('reasoning_effort')
    expect(corpos[0]).not.toHaveProperty('include_reasoning')
  })

  it('OpenRouter com outro modelo: zdr SEMPRE, raciocínio não', async () => {
    stubFetch()
    await chamarChat({ base: 'https://openrouter.ai/api/v1/', model: 'mistralai/mistral-small', messages: mensagens })
    expect(corpos[0].provider).toEqual({ zdr: true })
    expect(corpos[0]).not.toHaveProperty('reasoning')
  })

  it('Groq com modelo que não é de raciocínio: nada a mais', async () => {
    stubFetch()
    await chamarChat({ base: 'https://api.groq.com/openai/v1', model: 'moonshotai/kimi-k2', messages: mensagens })
    expect(corpos[0]).not.toHaveProperty('reasoning_effort')
    expect(corpos[0]).not.toHaveProperty('include_reasoning')
    expect(corpos[0]).not.toHaveProperty('provider')
  })

  it('outro provedor OpenAI-compatible com gpt-oss: só o reasoning_effort padrão da API', async () => {
    stubFetch()
    await chamarChat({ base: 'http://localhost:11434/v1', model: 'gpt-oss:20b', messages: mensagens })
    expect(corpos[0].reasoning_effort).toBe('low')
    expect(corpos[0]).not.toHaveProperty('include_reasoning')
    expect(corpos[0]).not.toHaveProperty('provider')
  })
})

/**
 * O MÓDULO PURO (B5): a bancada de provedores importa `parametrosDoProvedor` para mandar ao candidato
 * EXATAMENTE o que a produção mandaria — e a bancada roda fora do servidor, sem `config`/`metricas`.
 * Estes casos também registram o que a produção mandaria HOJE aos provedores novos, se o B7 os
 * configurar como base OpenAI-compatible: só o `reasoning_effort` padrão da API.
 */
describe('parametrosDoProvedor (módulo puro, sem dependências do servidor)', () => {
  it('é a mesma função que o chamarChat usa', async () => {
    const puro = await import('../server/ai/parametrosDoProvedor')
    const doCliente = await import('../server/ai/llmClient')
    expect(doCliente.parametrosDoProvedor).toBe(puro.parametrosDoProvedor)
  })

  it('DeepInfra, Cerebras e Cloudflare com gpt-oss: só reasoning_effort low', async () => {
    const { parametrosDoProvedor } = await import('../server/ai/parametrosDoProvedor')
    for (const base of [
      'https://api.deepinfra.com/v1/openai',
      'https://api.cerebras.ai/v1',
      'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1',
    ]) {
      expect(parametrosDoProvedor(base, 'openai/gpt-oss-20b')).toEqual({ reasoning_effort: 'low' })
    }
  })

  it('modelo sem raciocínio fora do OpenRouter: nada a mais', async () => {
    const { parametrosDoProvedor } = await import('../server/ai/parametrosDoProvedor')
    expect(parametrosDoProvedor('https://api.deepinfra.com/v1/openai', 'google/gemma-4-26B-A4B-it')).toEqual({})
  })

  it('base inválida não lança: cai no caso genérico', async () => {
    const { parametrosDoProvedor } = await import('../server/ai/parametrosDoProvedor')
    expect(parametrosDoProvedor('não é url', 'gpt-oss-120b')).toEqual({ reasoning_effort: 'low' })
  })
})

describe('max_tokens da tradução: proporcional à fonte, com piso e com o teto de sempre', () => {
  it('fala curta tem piso com folga para o raciocínio "low"', () => {
    expect(maxTokensDaTraducao(20)).toBeGreaterThanOrEqual(400)
  })
  it('cresce com a fonte', () => {
    expect(maxTokensDaTraducao(900)).toBeGreaterThan(maxTokensDaTraducao(100))
  })
  it('nunca passa do teto da função (1.200)', () => {
    expect(maxTokensDaTraducao(4000)).toBe(1200)
  })
})

describe('prefixo estável para o cache de prompt', () => {
  it('o system da fala começa IGUAL para qualquer par de idiomas; o idioma vai no fim', () => {
    const a = systemComunicativo('en', 'pt')
    const b = systemComunicativo('ja', null)
    let comum = 0
    while (comum < a.length && a[comum] === b[comum]) comum++
    // O texto fixo (instruções + segurança) tem bem mais de 500 caracteres.
    expect(comum).toBeGreaterThan(500)
    expect(a.indexOf('inglês')).toBeGreaterThan(comum - 1)
  })
})
