/**
 * O CLIENTE DA BANCADA DE IA PAGA — retenção zero no corpo, preço-teto ZDR, teto do livro-caixa ANTES da chamada e a
 * regra do mais barato não-inferior. Sem rede: `fetch` é simulado com um fluxo SSE.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as moduloLivro from '../../scripts/eval-fala/bancada/livroCaixa.mjs'
import * as estatistica from '../../scripts/eval-ia/estatistica.mjs'
import * as cliente from '../../scripts/eval-ia/openrouter.mjs'

const { armazemEmMemoria, LivroCaixa, TetoDeGasto } = moduloLivro as any
const { chamar, interpretarSistema, lerEventoSse, montarCorpo, piorCasoUsd, RecusaDoProvedor, tetoDePrecoZdr } =
  cliente as any
const { decidirFuncao, TETO_USD_POR_MILHAO_DE_TOKENS } = estatistica as any

const livro = (teto: number) => new LivroCaixa({ tetoUsd: teto, armazem: armazemEmMemoria() })

describe('sistemas e política', () => {
  it('interpreta esforço e restrição de provedor', () => {
    expect(interpretarSistema('openai/gpt-oss-120b~groq+cerebras')).toMatchObject({
      modelo: 'openai/gpt-oss-120b',
      only: ['groq', 'cerebras'],
      esforco: null,
    })
    expect(interpretarSistema('deepseek/deepseek-v4.1-flash@none')).toMatchObject({ esforco: 'none', only: null })
  })

  it('Gemini e modelo gratuito são recusados antes de qualquer chamada', () => {
    expect(() => interpretarSistema('google/gemini-3-flash')).toThrow(/Gemini/)
    expect(() => interpretarSistema('minimax/minimax-m3:free')).toThrow(/gratuito/)
  })

  it('o corpo leva a retenção zero e o ignore do Google da PRODUÇÃO, o raciocínio low do gpt-oss e o custo', () => {
    const { corpo, parametros } = montarCorpo({
      sis: interpretarSistema('openai/gpt-oss-120b'),
      mensagens: [{ role: 'user', content: 'x' }],
      temperatura: 0.3,
      maxTokens: 100,
    })
    expect(corpo.provider).toMatchObject({ zdr: true, data_collection: 'deny' })
    expect(corpo.provider.ignore).toEqual(expect.arrayContaining(['google-vertex', 'google-ai-studio']))
    expect(corpo.reasoning).toEqual({ effort: 'low', exclude: true })
    expect(corpo.usage).toEqual({ include: true })
    expect(corpo.stream).toBe(true)
    expect(parametros.foraDaProducao).toBe(false)
  })

  it('ajuste de candidato (@none, ~provedor) fica marcado como fora da produção e mantém a retenção zero', () => {
    const { corpo, parametros } = montarCorpo({
      sis: interpretarSistema('openai/gpt-oss-120b~groq'),
      mensagens: [],
      temperatura: 0,
      maxTokens: 10,
    })
    expect(corpo.provider.only).toEqual(['groq'])
    expect(corpo.provider.zdr).toBe(true)
    expect(parametros.foraDaProducao).toBe(true)
    const semPensar = montarCorpo({
      sis: interpretarSistema('deepseek/x@none'),
      mensagens: [],
      temperatura: 0,
      maxTokens: 10,
    })
    expect(semPensar.corpo.reasoning).toEqual({ enabled: false })
    expect(semPensar.parametros.foraDaProducao).toBe(true)
  })

  it('preço-teto = o MAIOR entre os endpoints ZDR sem Google; sem endpoint = null (não chama)', () => {
    const endpoints = [
      {
        model_id: 'm/a',
        provider_name: 'Barato',
        tag: 'barato',
        pricing: { prompt: '0.0000001', completion: '0.0000002' },
      },
      {
        model_id: 'm/a',
        provider_name: 'Caro',
        tag: 'caro/fp8',
        pricing: { prompt: '0.0000003', completion: '0.000001' },
      },
      {
        model_id: 'm/a',
        provider_name: 'Google',
        tag: 'google-vertex/global',
        pricing: { prompt: '0.00001', completion: '0.00001' },
      },
    ]
    const p = tetoDePrecoZdr(endpoints, interpretarSistema('m/a'))
    expect(p.entrada).toBeCloseTo(0.3)
    expect(p.saida).toBeCloseTo(1)
    expect(p.endpoints).toBe(2)
    expect(tetoDePrecoZdr(endpoints, interpretarSistema('m/a~barato')).saida).toBeCloseTo(0.2)
    expect(tetoDePrecoZdr(endpoints, interpretarSistema('m/b'))).toBeNull()
  })
})

/** Um `Response` com corpo SSE, como o OpenRouter devolve com `stream: true`. */
function respostaSse(eventos: unknown[]) {
  const texto = eventos.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + ': comentário\n\ndata: [DONE]\n\n'
  return new Response(texto, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('chamada com teto do livro-caixa', () => {
  afterEach(() => vi.unstubAllGlobals())

  const PRECO = { entrada: 1, saida: 2 }
  const corpo = { model: 'm/a', messages: [{ role: 'user', content: 'x'.repeat(100) }], max_tokens: 1000 }

  it('o teto para ANTES de chamar: a reserva do pior caso que não cabe nem sai', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const pior = piorCasoUsd(corpo, PRECO) // (100 + 256) · 1 + 1000 · 2, por 1M
    expect(pior).toBeCloseTo(0.002356)
    await expect(chamar({ corpo, preco: PRECO, livro: livro(0.002), rotulo: 'x', chave: 'k' })).rejects.toBeInstanceOf(
      TetoDeGasto,
    )
    expect(f).not.toHaveBeenCalled()
  })

  it('acerta pelo usage.cost real e mede TTFT e total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaSse([
          { choices: [{ delta: { content: 'Olá' } }] },
          { choices: [{ delta: { content: ', mundo' }, finish_reason: 'stop' }], provider: 'P' },
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 3, cost: 0.0001 } },
        ]),
      ),
    )
    const l = livro(1)
    const r = await chamar({ corpo, preco: PRECO, livro: l, rotulo: 'x', chave: 'k' })
    expect(r.texto).toBe('Olá, mundo')
    expect(r.usd).toBe(0.0001)
    expect(r.ttftMs).not.toBeNull()
    expect(r.totalMs).toBeGreaterThanOrEqual(r.ttftMs)
    expect(r.provedor).toBe('P')
    expect(l.totalUsd).toBeCloseTo(0.0001)
    expect(l.reservadoUsd).toBe(0)
  })

  it('sem usage.cost cobra o reservado (o lado seguro); 4xx não é cobrado e não é repetido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaSse([{ choices: [{ delta: { content: 'x' } }] }])),
    )
    const l = livro(1)
    await chamar({ corpo, preco: PRECO, livro: l, rotulo: 'x', chave: 'k' })
    expect(l.totalUsd).toBeCloseTo(piorCasoUsd(corpo, PRECO))

    const f = vi.fn(async () => new Response('{"error":"bad"}', { status: 400 }))
    vi.stubGlobal('fetch', f)
    const l2 = livro(1)
    await expect(chamar({ corpo, preco: PRECO, livro: l2, rotulo: 'x', chave: 'k' })).rejects.toBeInstanceOf(
      RecusaDoProvedor,
    )
    expect(f).toHaveBeenCalledTimes(1)
    expect(l2.totalUsd).toBe(0)
    expect(l2.reservadoUsd).toBe(0)
  })

  it('lê eventos SSE: conteúdo, uso, erro no meio do fluxo; ignora comentário e [DONE]', () => {
    const e = { texto: '', uso: null, provedor: null, erro: null, fim: null, primeiroConteudo: null }
    lerEventoSse(': OPENROUTER PROCESSING', e)
    lerEventoSse('data: [DONE]', e)
    lerEventoSse('data: {"choices":[{"delta":{"content":"a"}}]}', e)
    lerEventoSse('data: {"error":{"message":"caiu"}}', e)
    expect(e.texto).toBe('a')
    expect(e.erro).toBe('caiu')
  })
})

describe('regra do mais barato não-inferior', () => {
  /** Um bruto sintético: n casos, nota por sistema (fração de critérios) e custo por uso. */
  function bruto(spec: Record<string, { notas: number[]; usd: number; tokens?: number; quebraCritico?: boolean }>) {
    const juizes = ['mistralai/juiz', 'deepseek/juiz']
    const ids = spec[Object.keys(spec)[0]].notas.map((_, i) => `c${i}`)
    const criterios = [
      'sentido_correto',
      'gramatica_correta',
      'registro_correto',
      'girias_corretas',
      'idioma_certo',
      'adequada_aprendiz',
      'segura',
    ]
    const b: any = {
      funcao: 'explicacao',
      base: Object.keys(spec)[0],
      juizes,
      sistemas: Object.keys(spec).map((id) => ({ id, modelo: id, parametros: {} })),
      casos: ids,
      geracoes: {},
      rubrica: { [juizes[0]]: {}, [juizes[1]]: {} },
      pareado: {},
    }
    for (const [s, v] of Object.entries(spec)) {
      b.geracoes[s] = {}
      for (const j of juizes) b.rubrica[j][s] = {}
      ids.forEach((c, i) => {
        b.geracoes[s][c] = {
          valida: true,
          usd: v.usd,
          tokensEntrada: v.tokens ?? 1000,
          tokensSaida: 0,
          totalMs: 1000,
          ttftMs: 500,
          experiencia: { valida: true, caracteres: 300, cabeSemRolar: true, palavrasPorFrase: 10, idiomaOk: true },
        }
        // nota = fração de critérios atendidos: atende os primeiros round(nota·7)
        const quantos = Math.round(v.notas[i] * criterios.length)
        const ver = Object.fromEntries(
          criterios.map((cr, k) => [
            cr,
            { veredito: v.quebraCritico && cr === 'gramatica_correta' ? false : k < quantos },
          ]),
        )
        for (const j of juizes) b.rubrica[j][s][c] = ver
      })
    }
    return b
  }

  it('recomenda o MAIS BARATO entre os não-inferiores ao melhor', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/caro': { notas: Array(n).fill(1), usd: 0.001 },
        'x/barato': {
          notas: Array(n)
            .fill(1)
            .map((v, i) => (i === 0 ? 6 / 7 : v)),
          usd: 0.0001,
        },
        'y/ruim': { notas: Array(n).fill(4 / 7), usd: 0.00001 },
      }),
    )
    expect(d.melhor).toBe('openai/caro')
    expect(d.recomendado).toBe('x/barato')
    expect(d.avaliacoes.find((a: any) => a.sistema === 'y/ruim').naoInferior).toBe(false)
  })

  it('o barato com FALHA CRÍTICA (gramática) não é recomendado, mesmo com nota parecida', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/caro': { notas: Array(n).fill(6 / 7), usd: 0.001 },
        'x/barato': { notas: Array(n).fill(6 / 7), usd: 0.0001, quebraCritico: true },
      }),
    )
    const barato = d.avaliacoes.find((a: any) => a.sistema === 'x/barato')
    expect(barato.falhasCriticas.join(' ')).toMatch(/gramatica_correta/)
    expect(d.recomendado).toBe('openai/caro')
  })

  it('custo acima do que o modelo de custo cobra por 1M de tokens não passa', () => {
    const n = 20
    const d = decidirFuncao(
      bruto({
        'openai/base': { notas: Array(n).fill(1), usd: 0.0001, tokens: 1000 },
        'x/caro': { notas: Array(n).fill(1), usd: 0.01, tokens: 1000 },
      }),
    )
    expect(TETO_USD_POR_MILHAO_DE_TOKENS).toBeCloseTo(0.25)
    expect(d.avaliacoes.find((a: any) => a.sistema === 'x/caro').custoCabe).toBe(false)
    expect(d.recomendado).toBe('openai/base')
  })
})
