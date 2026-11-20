/**
 * SAÍDA ESTRUTURADA E ROTEAMENTO DO OPENROUTER (Fase B do plano de qualidade da IA paga, itens 2 e 3).
 *
 * O que se prova no CORPO que sai para o provedor:
 *   - com `formatoDeSaida`, o OpenRouter recebe `response_format: json_schema` estrito e `provider.require_parameters`,
 *     sem perder o mínimo de retenção zero (`zdr`, `data_collection: deny`, Google ignorado);
 *   - fora do OpenRouter (Groq, DeepInfra), nada disso vai — a reserva de outro provedor segue como sempre;
 *   - se nenhum endpoint aceita o esquema (404 do OpenRouter), a MESMA perna é repetida sem ele, e a cascata não
 *     perde a perna;
 *   - a legenda ao vivo (tradução rápida) pede o endpoint mais BARATO com teto de latência (`sort: 'price'` +
 *     `preferred_max_latency`), nunca `sort: 'latency'` (que levaria ao caro); com `order` declarado, a ordem manda;
 *   - Gemma no OpenRouter nunca vai ao Google (`ignore` com os dois provedores dele) e leva `zdr: true` explícito.
 * E os esquemas: modo estrito de verdade (todas as chaves exigidas, nada a mais) e compatíveis com os leitores.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { chamarChat } from '../server/ai/llmClient'
import { parametrosDoProvedor } from '../server/ai/parametrosDoProvedor'
import {
  type FormatoDeSaida,
  SAIDA_DA_EXPLICACAO,
  SAIDA_DAS_ALTERNATIVAS,
  SAIDA_DO_POLIMENTO,
  SAIDA_DO_RESUMO,
} from '../src/lib/esquemasDeSaida'
import { lerExplicacao } from '../src/lib/estudo/promptDaExplicacao'
import { lerResumo } from '../src/lib/estudo/promptDoResumo'
import { lerAlternativas } from '../src/lib/traducao/promptDasAlternativas'
import { lerPolimento } from '../src/lib/traducao/promptDoPolimento'

const OPENROUTER = 'https://openrouter.ai/api/v1'
const mensagens = [{ role: 'user' as const, content: 'oi' }]

let corpos: any[] = []

/** O provedor responde, em ordem, os status pedidos (200 por padrão). */
function stubFetch(
  statuses: number[] = [],
  corpoDoErro = 'No endpoints found that can handle the requested parameters.',
) {
  corpos = []
  vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
    corpos.push(JSON.parse(init.body))
    const status = statuses[corpos.length - 1] ?? 200
    if (status !== 200) return new Response(corpoDoErro, { status })
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"opcoes":["a"],"nota":""}' } }],
        usage: { prompt_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
}
afterEach(() => vi.unstubAllGlobals())

describe('response_format json_schema estrito no OpenRouter', () => {
  it('leva o esquema estrito e require_parameters, mantendo zdr, data_collection e o Google de fora', async () => {
    stubFetch()
    const r = await chamarChat({
      base: OPENROUTER,
      model: 'openai/gpt-oss-120b',
      messages: mensagens,
      formatoDeSaida: SAIDA_DAS_ALTERNATIVAS,
    })
    expect(r.ok).toBe(true)
    expect(r.semEsquema).toBeUndefined()
    expect(corpos[0].response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'alternativas', strict: true, schema: SAIDA_DAS_ALTERNATIVAS.esquema },
    })
    expect(corpos[0].provider).toMatchObject({
      require_parameters: true,
      zdr: true,
      data_collection: 'deny',
      ignore: expect.arrayContaining(['google-ai-studio', 'google-vertex']),
    })
    // O raciocínio continua no formato do OpenRouter.
    expect(corpos[0].reasoning).toEqual({ effort: 'low', exclude: true })
  })

  it('pelo AI Gateway da Cloudflare até o OpenRouter: o esquema vai junto', () => {
    const p = parametrosDoProvedor('https://gateway.ai.cloudflare.com/v1/conta/gw/openrouter', 'x/y', undefined, {
      formato: SAIDA_DO_RESUMO,
    })
    expect(p.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'resumo', strict: true } })
    expect(p.provider).toMatchObject({ require_parameters: true, zdr: true })
  })

  it('sem formatoDeSaida não há response_format nem require_parameters (a tradução e o tutor seguem iguais)', async () => {
    stubFetch()
    await chamarChat({ base: OPENROUTER, model: 'openai/gpt-oss-120b', messages: mensagens })
    expect(corpos[0]).not.toHaveProperty('response_format')
    expect(corpos[0].provider).not.toHaveProperty('require_parameters')
  })

  it('fora do OpenRouter (Groq, DeepInfra) o esquema NÃO vai: a reserva de outro provedor segue como sempre', async () => {
    stubFetch()
    await chamarChat({
      base: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-120b',
      messages: mensagens,
      formatoDeSaida: SAIDA_DA_EXPLICACAO,
    })
    await chamarChat({
      base: 'https://api.deepinfra.com/v1/openai',
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      messages: mensagens,
      formatoDeSaida: SAIDA_DA_EXPLICACAO,
    })
    for (const c of corpos) {
      expect(c).not.toHaveProperty('response_format')
      expect(c).not.toHaveProperty('provider')
    }
  })

  it('404 do OpenRouter (nenhum endpoint aceita o esquema): repete a MESMA perna sem o esquema', async () => {
    stubFetch([404])
    const r = await chamarChat({
      base: OPENROUTER,
      model: 'meta-llama/llama-3.3-70b-instruct',
      messages: mensagens,
      formatoDeSaida: SAIDA_DAS_ALTERNATIVAS,
    })
    expect(r.ok).toBe(true)
    expect(r.semEsquema).toBe(true)
    expect(corpos).toHaveLength(2)
    expect(corpos[1].model).toBe('meta-llama/llama-3.3-70b-instruct')
    expect(corpos[1]).not.toHaveProperty('response_format')
    expect(corpos[1].provider).not.toHaveProperty('require_parameters')
    // A retenção zero não afrouxa na segunda tentativa.
    expect(corpos[1].provider).toMatchObject({ zdr: true, data_collection: 'deny' })
  })

  it('400 que cita o response_format também cai na segunda tentativa; outro 400, 429 e 5xx não', async () => {
    stubFetch([400], '{"error":"response_format json_schema is not supported"}')
    expect(
      (await chamarChat({ base: OPENROUTER, model: 'm', messages: mensagens, formatoDeSaida: SAIDA_DO_POLIMENTO })).ok,
    ).toBe(true)
    expect(corpos).toHaveLength(2)

    for (const [status, corpo] of [
      [400, 'max_tokens too large'],
      [400, '{"error":{"message":"temperature is not supported with this model","param":"temperature"}}'],
      [400, 'invalid parameters: top_p'],
      [404, '{"error":{"message":"Model not found"}}'],
      [429, 'rate limited'],
      [503, 'upstream down'],
    ] as const) {
      stubFetch([status], corpo)
      const r = await chamarChat({
        base: OPENROUTER,
        model: 'm',
        messages: mensagens,
        formatoDeSaida: SAIDA_DO_POLIMENTO,
      })
      expect(r.ok, String(status)).toBe(false)
      expect(r.status).toBe(status)
      expect(corpos, String(status)).toHaveLength(1)
    }
  })

  it('a segunda tentativa que também falha devolve a falha dela (a cascata segue para a reserva)', async () => {
    stubFetch([404, 502]) // o 404 é o "No endpoints found" padrão do stub; o 502 vem com o mesmo corpo
    const r = await chamarChat({ base: OPENROUTER, model: 'm', messages: mensagens, formatoDeSaida: SAIDA_DO_RESUMO })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(502)
    expect(corpos).toHaveLength(2)
  })

  it('fora do OpenRouter um 404 não é repetido', async () => {
    stubFetch([404])
    const r = await chamarChat({
      base: 'https://api.groq.com/openai/v1',
      model: 'm',
      messages: mensagens,
      formatoDeSaida: SAIDA_DO_RESUMO,
    })
    expect(r.ok).toBe(false)
    expect(corpos).toHaveLength(1)
  })
})

describe('roteamento: latência na tradução rápida, Gemma longe do Google, zdr explícito', () => {
  it('legenda: preço primeiro com teto de latência p50 no OpenRouter, sem afrouxar a retenção zero', async () => {
    stubFetch()
    await chamarChat({ base: OPENROUTER, model: 'google/gemma-4-26b-a4b-it', messages: mensagens, legenda: true })
    expect(corpos[0].provider).toEqual({
      data_collection: 'deny',
      zdr: true,
      ignore: ['google-ai-studio', 'google-vertex'],
      sort: 'price',
      preferred_max_latency: { p50: 1.5 },
    })
  })

  it('com order declarado no registro, a ordem declarada manda (sem sort)', () => {
    const p = parametrosDoProvedor(
      OPENROUTER,
      'google/gemma-4-26b-a4b-it',
      { data_collection: 'deny', zdr: true, ignore: [], order: ['deepinfra'] },
      { legenda: true },
    )
    expect(p.provider).not.toHaveProperty('sort')
    expect(p.provider).not.toHaveProperty('preferred_max_latency')
  })

  it('Gemma nunca vai ao Google: mesmo pedindo o Google no only/order, ele sai e o ignore volta', () => {
    const p = parametrosDoProvedor(OPENROUTER, 'google/gemma-4-26b-a4b-it', {
      data_collection: 'deny',
      zdr: true,
      ignore: [],
      only: ['google-vertex', 'deepinfra'],
      order: ['google-ai-studio', 'parasail'],
    }) as { provider: Record<string, unknown> }
    expect(p.provider.only).toEqual(['deepinfra'])
    expect(p.provider.order).toEqual(['parasail'])
    expect(p.provider.ignore).toEqual(expect.arrayContaining(['google-ai-studio', 'google-vertex']))
    expect(p.provider.zdr).toBe(true)
  })

  it('fora do OpenRouter, a legenda não manda nada', async () => {
    stubFetch()
    await chamarChat({
      base: 'https://api.groq.com/openai/v1',
      model: 'llama',
      messages: mensagens,
      legenda: true,
    })
    expect(corpos[0]).not.toHaveProperty('provider')
  })
})

/** O modo estrito do OpenAI/OpenRouter: todo objeto fecha `additionalProperties` e exige TODAS as chaves. */
function conferirEstrito(no: any, caminho: string): void {
  if (no.type === 'object') {
    expect(no.additionalProperties, caminho).toBe(false)
    expect([...no.required].sort(), caminho).toEqual(Object.keys(no.properties).sort())
    for (const [k, v] of Object.entries(no.properties)) conferirEstrito(v, `${caminho}.${k}`)
  } else if (no.type === 'array') {
    conferirEstrito(no.items, `${caminho}[]`)
  } else {
    expect(['string', 'integer'], caminho).toContain(no.type)
  }
  for (const proibida of ['minItems', 'maxItems', 'pattern', 'format']) expect(no, caminho).not.toHaveProperty(proibida)
}

describe('os esquemas', () => {
  const todos: FormatoDeSaida[] = [SAIDA_DA_EXPLICACAO, SAIDA_DO_RESUMO, SAIDA_DAS_ALTERNATIVAS, SAIDA_DO_POLIMENTO]

  it('estão no modo estrito, com nome válido', () => {
    for (const f of todos) {
      expect(f.nome).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
      conferirEstrito(f.esquema, f.nome)
    }
  })

  it('uma resposta no formato do esquema passa pelo leitor defensivo de cada função', () => {
    expect(
      lerExplicacao(
        JSON.stringify({ porQue: 'p', gramatica: 'g', registro: 'r', girias: [{ termo: 't', sentido: 's' }] }),
      ),
    ).not.toBeNull()
    expect(
      lerResumo(JSON.stringify({ pontos: ['a', 'b', 'c'], cartoes: [{ fala: 1, palavra: 'x', verso: 'y' }] })),
    ).not.toBeNull()
    expect(lerAlternativas(JSON.stringify({ opcoes: ['um', 'dois'], nota: '' }))).not.toBeNull()
    expect(lerPolimento(JSON.stringify({ linhas: [{ n: 1, traducao: 'oi' }] }), [{ traducao: 'olá' }])).not.toBeNull()
  })

  it('as chaves do esquema são as que o leitor aceita (o leitor recusa chave a mais)', () => {
    const exp = SAIDA_DA_EXPLICACAO.esquema as any
    expect(Object.keys(exp.properties)).toEqual(['porQue', 'gramatica', 'registro', 'girias'])
    expect(Object.keys(exp.properties.girias.items.properties)).toEqual(['termo', 'sentido'])
    const res = SAIDA_DO_RESUMO.esquema as any
    expect(Object.keys(res.properties)).toEqual(['pontos', 'cartoes'])
    expect(Object.keys(res.properties.cartoes.items.properties)).toEqual(['fala', 'palavra', 'verso'])
  })
})
