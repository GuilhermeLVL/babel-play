/**
 * O MODELO PENSA? A LISTA DE NOMES E O QUE O PROVEDOR DIZ (risco de 4.4, 30/09/2026).
 *
 * A política de custo (B4) corta o `max_tokens` para 75% quando degrada — só em modelo que NÃO
 * raciocina, porque num pensador o pensamento sai do mesmo teto e o corte devolve resposta vazia. A
 * pergunta "pensa?" era só uma lista de nomes. Conferida:
 *
 *   - o Qwen3 FICA FORA DO CORTE, e está certo: pensa por padrão, e o app não manda o
 *     `enable_thinking: false` que a bancada usa (é parâmetro do pedido, não do nome);
 *   - o buraco era o pensador que a lista não conhece — GPT-5, a série o, GLM 4.5+, MiniMax M. Com
 *     o orçamento a 70%, a primeira chamada dele sairia vazia e a cascata pagaria a perna seguinte.
 *
 * Agora a lista é o PALPITE INICIAL, e o provedor confirma: toda resposta que traz
 * `completion_tokens_details.reasoning_tokens > 0` marca o modelo como pensador daí em diante.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { chamarChat } from '../server/ai/llmClient'
import { ehModeloDeRaciocinio, esquecerRaciocinioObservado } from '../server/ai/parametrosDoProvedor'

afterEach(() => {
  vi.unstubAllGlobals()
  esquecerRaciocinioObservado()
})

function respostaDoProvedor(conteudo: string, raciocinio: number) {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: conteudo } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5 + raciocinio,
            completion_tokens_details: { reasoning_tokens: raciocinio },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  )
}

const mensagens = [{ role: 'user' as const, content: 'oi' }]
const BASE = 'https://provedor.exemplo/v1'

describe('a lista de nomes: o palpite inicial', () => {
  it('o Qwen3 fica fora do corte — pensa por padrão, e o app não desliga o pensamento', () => {
    for (const m of ['Qwen/Qwen3.5-9B', 'qwen/qwen3.8-27b', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'qwen3.7-flash'])
      expect(ehModeloDeRaciocinio(m), m).toBe(true)
  })

  it('os pensadores que a lista não conhecia: GPT-5, série o, GLM 4.5+ e MiniMax M', () => {
    for (const m of [
      'openai/gpt-5-nano',
      'gpt-5-mini',
      'openai/o4-mini',
      'o3',
      'openai/o1-preview',
      'zai-org/GLM-4.5-Air',
      'z-ai/glm-4.6',
      'MiniMaxAI/MiniMax-M2',
      'minimax/minimax-m1',
    ])
      expect(ehModeloDeRaciocinio(m), m).toBe(true)
  })

  it('e não confunde quem só escreve a resposta', () => {
    for (const m of [
      'openai/gpt-4o-mini',
      'gpt-4.1-nano',
      'google/gemma-4-26b-a4b-it',
      'meta-llama/Llama-3.3-70B-Instruct',
      'mistralai/mistral-small',
      'zai-org/GLM-4-9B-0414',
    ])
      expect(ehModeloDeRaciocinio(m), m).toBe(false)
  })
})

describe('o provedor confirma: reasoning_tokens > 0 marca o modelo', () => {
  it('um modelo fora da lista que devolve tokens de raciocínio passa a contar como pensador', async () => {
    const modelo = 'laboratorio/modelo-novo-7b'
    expect(ehModeloDeRaciocinio(modelo)).toBe(false)

    respostaDoProvedor('Olá', 42)
    const r = await chamarChat({ base: BASE, model: modelo, messages: mensagens })

    expect(r.ok).toBe(true)
    expect(ehModeloDeRaciocinio(modelo)).toBe(true)
  })

  it('a resposta VAZIA por ter pensado o teto inteiro também marca — é o caso que o corte provoca', async () => {
    const modelo = 'laboratorio/outro-modelo'
    respostaDoProvedor('', 300)
    const r = await chamarChat({ base: BASE, model: modelo, messages: mensagens, maxTokens: 300 })

    expect(r.ok).toBe(false)
    expect(ehModeloDeRaciocinio(modelo)).toBe(true)
  })

  it('zero tokens de raciocínio não marca nada', async () => {
    const modelo = 'laboratorio/so-escreve'
    respostaDoProvedor('Olá', 0)
    await chamarChat({ base: BASE, model: modelo, messages: mensagens })

    expect(ehModeloDeRaciocinio(modelo)).toBe(false)
  })

  it('a memória tem teto: nomes demais não crescem o processo sem fim', async () => {
    respostaDoProvedor('Olá', 1)
    for (let i = 0; i < 300; i++) await chamarChat({ base: BASE, model: `lab/m-${i}`, messages: mensagens })

    const lembrados = Array.from({ length: 300 }, (_, i) => ehModeloDeRaciocinio(`lab/m-${i}`)).filter(Boolean)
    expect(lembrados.length).toBeLessThanOrEqual(256)
    expect(lembrados.length).toBeGreaterThan(0)
  })
})
