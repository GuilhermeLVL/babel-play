/**
 * OS PROVEDORES DE NUVEM DA BANCADA (B5) — o pedido montado para cada formato, com respostas
 * simuladas: nenhuma chamada de rede, nenhuma chave de verdade.
 *
 * O que estes testes seguram:
 *   - o candidato recebe o MESMO pedido que a produção mandaria (prompt, temperatura da fala,
 *     `max_tokens` proporcional, raciocínio/retenção de `parametrosDoProvedor`) — senão a bancada
 *     mede um sistema que o usuário nunca vê;
 *   - o ajuste de candidato (`@none`) fica marcado como FORA da produção, para o B7 levar junto;
 *   - a API do Gemini nunca entra, e o OpenRouter vai com `zdr` e `ignore` do Google;
 *   - o pior caso reservado no livro-caixa cobre o custo real;
 *   - o mínimo faturado de cada STT (os 10 s da Groq) entra no custo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import * as moduloNuvem from '../../scripts/eval-fala/bancada/nuvem.mjs'
import { maxTokensDaTraducao } from '../../server/ai/funcoesDeIa'
import { systemComunicativo, userComunicativo } from '../../src/lib/traducao/promptComunicativo'

/** O .mjs não tem tipos (o tsc infere do JS): a borda é `any`, como em `bancada-etapa5.test.ts`. */
const {
  chavesAusentes,
  custoDeMt,
  custoDeStt,
  estimarCustoMaximoDeMt,
  interpretarSistema,
  lerRespostaDeMt,
  lerRespostaDeStt,
  montarPedidoDeMt,
  montarPedidoDeStt,
  PoliticaDeDados,
  PROVEDORES,
  TEMPERATURA_DA_FALA,
  TIMEOUT_DE_PRODUCAO_MS,
} = moduloNuvem as any

const CONTA = '0123456789abcdef0123456789abcdef'
const ENV = {
  GROQ_API_KEY: 'gsk-falsa',
  DEEPINFRA_API_KEY: 'di-falsa',
  CEREBRAS_API_KEY: 'csk-falsa',
  CLOUDFLARE_ACCOUNT_ID: CONTA,
  CLOUDFLARE_API_TOKEN: 'cf-falsa',
  OPENROUTER_API_KEY: 'or-falsa',
}
const CASO = { origem: 'Hey, what is up? I was out all day.', contexto: ['Where were you?'] }
const pedido = (spec: string) =>
  montarPedidoDeMt({ sis: interpretarSistema(spec), caso: CASO, src: 'en', tgt: 'pt', env: ENV })

describe('interpretarSistema', () => {
  it('provedor antes do primeiro ":", esforço depois do último "@"', () => {
    expect(interpretarSistema('deepinfra:Qwen/Qwen3.5-9B@none')).toMatchObject({
      provedor: 'deepinfra',
      modelo: 'Qwen/Qwen3.5-9B',
      esforco: 'none',
    })
  })
  it('o "@" inicial do Cloudflare é parte do modelo, não esforço', () => {
    expect(interpretarSistema('cloudflare:@cf/openai/gpt-oss-120b')).toMatchObject({
      modelo: '@cf/openai/gpt-oss-120b',
      esforco: null,
    })
    expect(interpretarSistema('cloudflare:@cf/openai/gpt-oss-20b@low')).toMatchObject({
      modelo: '@cf/openai/gpt-oss-20b',
      esforco: 'low',
    })
  })
  it('sem provedor é erro de uso', () => {
    expect(() => interpretarSistema('gpt-oss-20b')).toThrow()
  })
})

describe('política de dados', () => {
  it('a API do Gemini é recusada em qualquer provedor', () => {
    expect(() => pedido('openrouter:google/gemini-2.5-flash-lite')).toThrow(PoliticaDeDados)
    expect(() => pedido('deepinfra:google/gemini-3-flash')).toThrow(PoliticaDeDados)
  })
  it('OpenRouter: o roteamento da produção (sem coleta, zdr, sem o Google); o custo vem na resposta', () => {
    const { corpo } = pedido('openrouter:openai/gpt-oss-120b')
    expect(corpo.provider).toEqual({
      data_collection: 'deny',
      zdr: true,
      ignore: ['google-ai-studio', 'google-vertex'],
    })
    expect(corpo.usage).toEqual({ include: true })
    // O raciocínio é o da produção (formato unificado do OpenRouter).
    expect(corpo.reasoning).toEqual({ effort: 'low', exclude: true })
  })
  it('todo provedor declara a retenção com fonte e data', () => {
    for (const [nome, p] of Object.entries<any>(PROVEDORES)) {
      expect(p.retencao?.declarada, nome).toBeTruthy()
      expect(p.retencao?.fonte, nome).toBeTruthy()
      expect(p.retencao?.consultadoEm, nome).toMatch(/^2026-/)
    }
  })
})

describe('chaves: só variáveis de ambiente literais; sem chave, pula', () => {
  it('diz exatamente o que falta', () => {
    expect(chavesAusentes('cloudflare', { CLOUDFLARE_ACCOUNT_ID: CONTA })).toEqual(['CLOUDFLARE_API_TOKEN'])
    expect(chavesAusentes('deepinfra', {})).toEqual(['DEEPINFRA_API_KEY'])
    expect(chavesAusentes('cerebras', ENV)).toEqual([])
    expect(chavesAusentes('groq', { GROQ_API_KEY: '   ' })).toEqual(['GROQ_API_KEY'])
  })
  it('provedor desconhecido é erro, não pulo silencioso', () => {
    expect(() => chavesAusentes('gemini', ENV)).toThrow()
  })
})

describe('pedido de tradução = o da produção', () => {
  it('DeepInfra gpt-oss-20b: prompt, temperatura da fala, max_tokens proporcional, reasoning low', () => {
    const { url, corpo, init, parametros } = pedido('deepinfra:openai/gpt-oss-20b')
    expect(url).toBe('https://api.deepinfra.com/v1/openai/chat/completions')
    expect(corpo).toMatchObject({
      model: 'openai/gpt-oss-20b',
      stream: false,
      temperature: TEMPERATURA_DA_FALA,
      max_tokens: maxTokensDaTraducao(CASO.origem.length),
      reasoning_effort: 'low',
    })
    expect(corpo.messages).toEqual([
      { role: 'system', content: systemComunicativo('pt', 'en') },
      { role: 'user', content: userComunicativo(CASO.origem, CASO.contexto) },
    ])
    expect(init.headers.Authorization).toBe('Bearer di-falsa')
    expect(JSON.parse(init.body)).toEqual(corpo)
    expect(parametros.foraDaProducao).toBe(false)
  })

  it('Groq gpt-oss-120b: o raciocínio da produção (low + include_reasoning false)', () => {
    const { url, corpo } = pedido('groq:openai/gpt-oss-120b')
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(corpo).toMatchObject({ reasoning_effort: 'low', include_reasoning: false })
    expect(corpo).not.toHaveProperty('provider')
  })

  it('Qwen3.5-9B@none na DeepInfra: pensamento desligado, marcado FORA da produção', () => {
    const { corpo, parametros } = pedido('deepinfra:Qwen/Qwen3.5-9B@none')
    expect(corpo.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(corpo).not.toHaveProperty('reasoning_effort')
    expect(parametros.foraDaProducao).toBe(true)
    expect(parametros.ajuste).toEqual({ chat_template_kwargs: { enable_thinking: false } })
  })

  it('esforço igual ao da produção não conta como ajuste', () => {
    expect(pedido('groq:openai/gpt-oss-120b@low').parametros.foraDaProducao).toBe(false)
  })

  it('Cerebras: base própria e o nome curto do modelo', () => {
    const { url, corpo, init } = pedido('cerebras:gpt-oss-120b')
    expect(url).toBe('https://api.cerebras.ai/v1/chat/completions')
    expect(corpo.reasoning_effort).toBe('low')
    expect(init.headers.Authorization).toBe('Bearer csk-falsa')
  })

  it('Cloudflare: a conta vai no caminho e o token no Bearer; conta malformada é recusada', () => {
    const { url, corpo, init } = pedido('cloudflare:@cf/google/gemma-4-26b-a4b-it')
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/v1/chat/completions`)
    expect(corpo.model).toBe('@cf/google/gemma-4-26b-a4b-it')
    expect(init.headers.Authorization).toBe('Bearer cf-falsa')
    expect(() =>
      montarPedidoDeMt({
        sis: interpretarSistema('cloudflare:@cf/openai/gpt-oss-20b'),
        caso: CASO,
        src: 'en',
        tgt: 'pt',
        env: { ...ENV, CLOUDFLARE_ACCOUNT_ID: '../../outra-coisa' },
      }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/)
  })

  it('modelo fora da tabela de preço não sai: sem preço não há teto garantido', () => {
    expect(() => pedido('deepinfra:meta-llama/Llama-3.3-70B-Instruct')).toThrow(/preço/)
  })
})

describe('custo da tradução', () => {
  it('o pior caso reservado cobre o custo de uma resposta que usa o max_tokens inteiro', () => {
    const { corpo } = pedido('cerebras:gpt-oss-120b')
    const sis = interpretarSistema('cerebras:gpt-oss-120b')
    const max = estimarCustoMaximoDeMt(sis, corpo)
    const caracteres = corpo.messages.reduce((n: number, m: { content: string }) => n + m.content.length, 0)
    // Entrada realista (~1 token a cada 3 caracteres + o cabeçalho do chat) e saída no teto.
    const real = custoDeMt(sis, {
      tokensEntrada: Math.ceil(caracteres / 3) + 120,
      tokensSaida: corpo.max_tokens,
      tokensEmCache: 0,
    })
    expect(max).toBeGreaterThan(real)
    expect(max).toBeLessThan(0.01)
  })

  it('custo por usage × tabela; o custo informado pelo provedor vence', () => {
    const sis = interpretarSistema('deepinfra:openai/gpt-oss-20b')
    expect(custoDeMt(sis, { tokensEntrada: 1_000_000, tokensSaida: 1_000_000, tokensEmCache: 0 })).toBeCloseTo(
      0.03 + 0.14,
    )
    expect(custoDeMt(sis, { tokensEntrada: 10, tokensSaida: 10 }, 0.5)).toBe(0.5)
    // Sem usage, NaN: o livro-caixa cobra o reservado.
    expect(custoDeMt(sis, { tokensEntrada: null, tokensSaida: null })).toBeNaN()
  })

  it('lerRespostaDeMt: texto sem aspas, tokens, cache, raciocínio e custo informado', () => {
    const r = lerRespostaDeMt({
      choices: [{ message: { content: ' "Oi, e aí?" ' } }],
      usage: {
        prompt_tokens: 300,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 256 },
        completion_tokens_details: { reasoning_tokens: 12 },
        estimated_cost: 0.00002,
      },
    })
    expect(r).toMatchObject({
      texto: 'Oi, e aí?',
      tokensEntrada: 300,
      tokensSaida: 40,
      tokensEmCache: 256,
      tokensDeRaciocinio: 12,
      custoInformado: 0.00002,
    })
    expect(lerRespostaDeMt({}).texto).toBe('')
  })
})

describe('pedido de transcrição', () => {
  const wav = Buffer.from('RIFF....WAVEfmt ')

  it('formato OpenAI (Groq, DeepInfra): o formulário do sttProxy — verbose_json, idioma, temperatura 0', async () => {
    const { url, init } = montarPedidoDeStt({
      sis: interpretarSistema('deepinfra:openai/whisper-large-v3-turbo'),
      wav,
      idioma: 'pt',
      t0: true,
      env: ENV,
    })
    expect(url).toBe('https://api.deepinfra.com/v1/openai/audio/transcriptions')
    expect(init.headers.Authorization).toBe('Bearer di-falsa')
    const fd = init.body as FormData
    expect(fd.get('model')).toBe('openai/whisper-large-v3-turbo')
    expect(fd.get('language')).toBe('pt')
    expect(fd.get('temperature')).toBe('0')
    expect(fd.get('response_format')).toBe('verbose_json')
    expect(Buffer.from(await (fd.get('file') as Blob).arrayBuffer())).toEqual(wav)
    const groq = montarPedidoDeStt({
      sis: interpretarSistema('groq:whisper-large-v3-turbo'),
      wav,
      idioma: 'en',
      env: ENV,
    })
    expect(groq.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect((groq.init.body as FormData).get('temperature')).toBeNull()
  })

  it('formato Cloudflare: JSON com o áudio em base64, na rota ai/run do modelo', () => {
    const { url, init } = montarPedidoDeStt({
      sis: interpretarSistema('cloudflare:@cf/openai/whisper-large-v3-turbo'),
      wav,
      idioma: 'pt',
      prompt: 'frase anterior',
      env: ENV,
    })
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${CONTA}/ai/run/@cf/openai/whisper-large-v3-turbo`)
    expect(init.headers).toMatchObject({ Authorization: 'Bearer cf-falsa', 'Content-Type': 'application/json' })
    const corpo = JSON.parse(init.body)
    expect(Buffer.from(corpo.audio, 'base64')).toEqual(wav)
    expect(corpo).toMatchObject({ task: 'transcribe', language: 'pt', initial_prompt: 'frase anterior' })
  })

  it('Cerebras não tem STT; modelo fora da tabela não sai', () => {
    expect(() =>
      montarPedidoDeStt({ sis: interpretarSistema('cerebras:whisper-large-v3-turbo'), wav, idioma: 'pt', env: ENV }),
    ).toThrow(/STT/)
    expect(() =>
      montarPedidoDeStt({ sis: interpretarSistema('deepinfra:openai/whisper-large-v3'), wav, idioma: 'pt', env: ENV }),
    ).toThrow(/preço/)
  })

  it('lerRespostaDeStt normaliza o envelope do Cloudflare e o verbose_json', () => {
    const seg = { text: ' Olá.', no_speech_prob: 0.1, avg_logprob: -0.2, compression_ratio: 1.1 }
    expect(
      lerRespostaDeStt('cloudflare', {
        success: true,
        result: { text: 'Olá.', segments: [seg], transcription_info: { language: 'pt', duration: 1.5 } },
      }),
    ).toEqual({ texto: 'Olá.', segmentos: [seg], idioma: 'pt', duracaoS: 1.5 })
    expect(lerRespostaDeStt('openai', { text: 'Hi.', segments: [seg], language: 'english', duration: 2 })).toEqual({
      texto: 'Hi.',
      segmentos: [seg],
      idioma: 'english',
      duracaoS: 2,
    })
  })

  it('custo: o mínimo de 10 s da Groq; DeepInfra e Cloudflare por segundo', () => {
    const custo = (spec: string, s: number) => custoDeStt(interpretarSistema(spec), s)
    expect(custo('groq:whisper-large-v3-turbo', 3)).toEqual({ usd: (10 / 3600) * 0.04, segundosFaturados: 10 })
    expect(custo('groq:whisper-large-v3-turbo', 12).segundosFaturados).toBe(12)
    expect(custo('deepinfra:openai/whisper-large-v3-turbo', 3).usd).toBeCloseTo((3 / 60) * 0.0002)
    expect(custo('cloudflare:@cf/openai/whisper-large-v3-turbo', 3).usd).toBeCloseTo((3 / 60) * 0.0005)
  })
})

/**
 * DERIVA: a temperatura da fala e o timeout da tradução são literais em `mtProxy.ts` (o B5 não mexe
 * no servidor além do `parametrosDoProvedor`). Se a produção mudar, a bancada tem de mudar junto.
 */
describe('deriva contra a produção', () => {
  it('mtProxy.ts: temperatura da fala e timeout', () => {
    const fonte = readFileSync('server/ai/mtProxy.ts', 'utf8')
    expect(fonte).toContain(`temperature: falada ? ${TEMPERATURA_DA_FALA} :`)
    expect(fonte).toContain('timeoutMs: 12_000')
    expect(TIMEOUT_DE_PRODUCAO_MS).toBe(12_000)
  })
  it('sttProxy.ts: temperatura 0 e verbose_json', () => {
    const fonte = readFileSync('server/ai/sttProxy.ts', 'utf8')
    expect(fonte).toContain("f.append('temperature', '0')")
    expect(fonte).toContain("f.append('response_format', formato)")
    expect(fonte).toContain("enviar('verbose_json')")
  })
})
