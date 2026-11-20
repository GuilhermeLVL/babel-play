/**
 * O CLIENTE DA BANCADA DE IA PAGA — retenção zero no corpo, preço-teto ZDR, teto do livro-caixa ANTES da chamada e a
 * regra do mais barato não-inferior. Sem rede: `fetch` é simulado com um fluxo SSE.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as moduloLivro from '../../scripts/eval-fala/bancada/livroCaixa.mjs'
import * as estatistica from '../../scripts/eval-ia/estatistica.mjs'
import * as funcoes from '../../scripts/eval-ia/funcoes.mjs'
import * as golds from '../../scripts/eval-ia/golds.mjs'
import * as cliente from '../../scripts/eval-ia/openrouter.mjs'
import * as relatorio from '../../scripts/eval-ia/relatorio.mjs'
import { chamarChat } from '../../server/ai/llmClient'

const { pedidoDaProducao } = funcoes as any
const { carregarGold } = golds as any

const { armazemEmMemoria, LivroCaixa, TetoDeGasto } = moduloLivro as any
const {
  chamar,
  interpretarSistema,
  LimiteDaChave,
  lerEventoSse,
  montarCorpo,
  piorCasoUsd,
  RecusaDoProvedor,
  tetoDePrecoZdr,
} = cliente as any
const { casosNecessarios, decidirFuncao, passouDoTimeout } = estatistica as any
const { efeitoNaMargem, gerarRelatorio } = relatorio as any

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

describe('o pedido da bancada é o da produção (deriva)', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** O corpo que `chamarChat` (o servidor) manda, capturado no `fetch`. */
  async function corpoDoServidor(p: Record<string, unknown>) {
    let corpo: any = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: any) => {
        corpo = JSON.parse(init.body)
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: {} }), { status: 200 })
      }),
    )
    await chamarChat({ base: 'https://openrouter.ai/api/v1', apiKey: 'k', ...p } as any)
    return corpo
  }
  const semBancada = (c: any) => Object.fromEntries(Object.entries(c).filter(([k]) => !['stream', 'usage'].includes(k)))

  for (const funcao of ['explicacao', 'resumo', 'alternativas', 'legenda']) {
    it(`${funcao}: o corpo da bancada é byte a byte o do servidor (fora streaming e custo)`, async () => {
      const caso = carregarGold(funcao)[0]
      const p = pedidoDaProducao(funcao, caso)
      for (const modelo of ['openai/gpt-oss-120b', 'google/gemma-4-26b-a4b-it']) {
        const { corpo, parametros } = montarCorpo({ sis: interpretarSistema(modelo), ...p })
        expect(parametros.foraDaProducao).toBe(false)
        const servidor = await corpoDoServidor({
          model: modelo,
          messages: p.mensagens,
          temperature: p.temperatura,
          maxTokens: p.maxTokens,
          formatoDeSaida: p.formato,
          legenda: p.legenda,
        })
        expect(semBancada(corpo)).toEqual(semBancada(servidor))
      }
    })
  }

  it('a explicação leva json_schema estrito + require_parameters; a legenda, sort por preço', () => {
    const exp = pedidoDaProducao('explicacao', carregarGold('explicacao')[0])
    const { corpo } = montarCorpo({ sis: interpretarSistema('openai/gpt-oss-120b'), ...exp })
    expect(corpo.response_format.type).toBe('json_schema')
    expect(corpo.response_format.json_schema.strict).toBe(true)
    expect(corpo.provider.require_parameters).toBe(true)
    const leg = pedidoDaProducao('legenda', carregarGold('legenda')[0])
    expect(montarCorpo({ sis: interpretarSistema('google/gemma-4-26b-a4b-it'), ...leg }).corpo.provider.sort).toBe(
      'price',
    )
  })

  it('@none tira do roteamento quem ignora o raciocínio desligado e fica marcado como ajuste', () => {
    const exp = pedidoDaProducao('explicacao', carregarGold('explicacao')[0])
    const { corpo, parametros } = montarCorpo({
      sis: interpretarSistema('deepseek/deepseek-v4.1-flash@none'),
      ...exp,
    })
    expect(corpo.provider.ignore).toEqual(expect.arrayContaining(['novita', 'google-vertex', 'google-ai-studio']))
    expect(corpo.reasoning).toEqual({ enabled: false })
    expect(corpo.provider.require_parameters).toBe(true)
    expect(parametros.foraDaProducao).toBe(true)
  })
})

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

  it('limite da chave (403 "Key limit exceeded") para a bancada sem repetir e sem cobrar', async () => {
    const f = vi.fn(
      async () => new Response('{"error":{"message":"Key limit exceeded (total limit)"}}', { status: 403 }),
    )
    vi.stubGlobal('fetch', f)
    const l = livro(1)
    await expect(chamar({ corpo, preco: PRECO, livro: l, rotulo: 'x', chave: 'k' })).rejects.toBeInstanceOf(
      LimiteDaChave,
    )
    expect(f).toHaveBeenCalledTimes(1)
    expect(l.totalUsd).toBe(0)
    expect(l.reservadoUsd).toBe(0)
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

describe('regra: o mais barato que não piora a experiência (referência = produção)', () => {
  /** Um bruto sintético: n casos, nota por sistema (fração de critérios) e custo por uso. */
  function bruto(
    spec: Record<string, { notas: number[]; usd: number; tokens?: number; quebraCritico?: boolean; ms?: number }>,
  ) {
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
          totalMs: v.ms ?? 1000,
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

  const situacao = (d: any, s: string) => d.avaliacoes.find((a: any) => a.sistema === s)

  it('a referência é a PRODUÇÃO: o mais barato que não piora é recomendado (o mais barato entre os que passam)', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.001 },
        'x/barato': {
          notas: Array(n)
            .fill(1)
            .map((v, i) => (i === 0 ? 6 / 7 : v)),
          usd: 0.0002,
        },
        'y/baratissimo': { notas: Array(n).fill(1), usd: 0.0001 },
        'z/ruim': { notas: Array(n).fill(4 / 7), usd: 0.00001 },
      }),
    )
    expect(situacao(d, 'x/barato').situacao).toBe('pode-trocar')
    expect(situacao(d, 'z/ruim').situacao).toBe('piora')
    expect(d.recomendado).toBe('y/baratissimo')
  })

  it('mais caro e melhor na nota, mas sem ganho em critério crítico: não entra nem como opção', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(5 / 7), usd: 0.0001 },
        'x/caro': { notas: Array(n).fill(6 / 7), usd: 0.001 },
      }),
    )
    // 6/7 atende até 'adequada_aprendiz' (não crítico); os críticos ficam iguais.
    expect(situacao(d, 'x/caro').situacao).toBe('mais-caro-sem-ganho-critico')
    expect(d.recomendado).toBe('openai/producao')
    expect(d.opcoesMaisCaras).toEqual([])
  })

  it('mais caro com ganho num critério CRÍTICO (gramática) vira OPÇÃO que depende do dono — nunca recomendado', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.0001, quebraCritico: true },
        'x/caro': { notas: Array(n).fill(1), usd: 0.001 },
      }),
    )
    const a = situacao(d, 'x/caro')
    expect(a.melhoras).toContain('gramatica_correta')
    expect(a.situacao).toBe('opcao-mais-cara')
    expect(d.opcoesMaisCaras).toEqual(['x/caro'])
    expect(d.recomendado).toBe('openai/producao')
  })

  it('o barato com piora num critério crítico não troca, mesmo com nota parecida', () => {
    const n = 40
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.001 },
        'x/barato': { notas: Array(n).fill(1), usd: 0.0001, quebraCritico: true },
      }),
    )
    expect(situacao(d, 'x/barato').pioras.join(' ')).toMatch(/gramatica_correta/)
    expect(d.recomendado).toBe('openai/producao')
  })

  it('não piorar a experiência: passar do timeout (inclusive abortado pelo relógio) ou latência 20% pior reprova', () => {
    const n = 20
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.0002, ms: 2_000 },
        'x/estoura': { notas: Array(n).fill(1), usd: 0.0001, ms: 20_000 },
        'y/lento': { notas: Array(n).fill(1), usd: 0.0001, ms: 3_000 },
      }),
    )
    expect(situacao(d, 'x/estoura').chegaNoTempo).toBe(false)
    expect(situacao(d, 'y/lento').latenciaNaoPiora).toBe(false)
    expect(d.recomendado).toBe('openai/producao')
    // A chamada abortada pelo relógio da bancada também passou do timeout da produção.
    expect(passouDoTimeout({ semResposta: true, erro: 'rede: The operation was aborted due to timeout' }, 15_000)).toBe(
      true,
    )
    expect(passouDoTimeout({ semResposta: true, erro: 'HTTP 429: rate limited' }, 15_000)).toBe(false)
    expect(passouDoTimeout({ totalMs: 16_000 }, 15_000)).toBe(true)
  })

  it('economia de menos de 5% não é "mais barato"; mais de 5% sem resposta do provedor piora a experiência', () => {
    const n = 40
    const quase = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.0001 },
        'x/quase': { notas: Array(n).fill(1), usd: 0.000097 },
      }),
    )
    expect(situacao(quase, 'x/quase').maisBarato).toBe(false)
    expect(quase.recomendado).toBe('openai/producao')
    const b = bruto({
      'openai/producao': { notas: Array(n).fill(1), usd: 0.001 },
      'x/instavel': { notas: Array(n).fill(1), usd: 0.0001 },
    })
    for (const c of b.casos.slice(0, 4)) b.geracoes['x/instavel'][c] = { semResposta: true, erro: 'HTTP 429' }
    const d = decidirFuncao(b)
    expect(situacao(d, 'x/instavel').disponivel).toBe(false)
    expect(d.recomendado).toBe('openai/producao')
  })

  it('análise de poder: n pareado para não-inferioridade e superioridade; null quando aponta para o outro lado', () => {
    // σ = 0,2, δ = 0, margem 0,05: ((1,96 + 0,84)·0,2/0,05)² ≈ 126
    expect(casosNecessarios({ dp: 0.2, delta: 0 }, 'nao-inferioridade', 0.05)).toBe(126)
    // superioridade com δ = 0,05 e σ = 0,2: o mesmo número
    expect(casosNecessarios({ dp: 0.2, delta: 0.05 }, 'superioridade')).toBe(126)
    expect(casosNecessarios({ dp: 0.2, delta: -0.06 }, 'nao-inferioridade', 0.05)).toBeNull()
    expect(casosNecessarios({ dp: 0.2, delta: -0.01 }, 'superioridade')).toBeNull()
  })

  it('efeito na margem: custo por 1M acima do modelo sobe a IA de texto de cada plano pela cota de tokens', () => {
    const e = efeitoNaMargem({
      usdPorMilhao: 0.3,
      cambio: 5.6,
      brlPorMilhaoDoModelo: 1.4,
      planos: [{ plano: 'plus', rotulo: 'Plus', tokensMes: 2_000_000, margemAnualBrl: 30 }],
      misturasSoPlus: [{ fracao: 0.08, pagantes: 80, margemPiorCasoUsd: 35 }],
    })
    expect(e.deltaBrlPorMilhao).toBeCloseTo(0.28)
    expect(e.porPlano[0].extraMensal).toBeCloseTo(0.56)
    expect(e.porPlano[0].margemAnualAjustada).toBeCloseTo(30 - 0.56 * 12)
    expect(e.misturas[0].margemAjustadaUsd).toBeCloseTo(35 - (80 * 0.56) / 5.6)
  })

  it('o relatório sai do bruto: os números da tabela são os da decisão', () => {
    const n = 20
    const d = decidirFuncao(
      bruto({
        'openai/producao': { notas: Array(n).fill(1), usd: 0.0001, quebraCritico: true },
        'x/caro': { notas: Array(n).fill(1), usd: 0.001 },
      }),
    )
    const md = gerarRelatorio({
      decisoes: { explicacao: d },
      robustez: { explicacao: { 'mistralai/juiz': d, 'deepseek/juiz': d } },
      concordancia: {},
      juizes: [],
      gasto: { totalUsd: 1.234, tetoUsd: 5 },
      custo: null,
      calibracao: null,
      geradoEm: '2026-10-24',
      commit: null,
    })
    expect(md).toContain('US$ 1,23')
    expect(md).toContain('manter `openai/producao`')
    expect(md).toContain('gramatica_correta 0% → 100%')
    expect(md).toContain('Provisória')
  })

  it('mede a autopreferência: o juiz que dá a mais só para a própria família aparece positivo', () => {
    const n = 10
    const b = bruto({
      'openai/base': { notas: Array(n).fill(5 / 7), usd: 0.0001 },
      'mistralai/candidato': { notas: Array(n).fill(5 / 7), usd: 0.0001 },
    })
    // O juiz Mistral dá nota cheia ao Mistral; o DeepSeek não.
    for (const c of b.casos)
      b.rubrica['mistralai/juiz']['mistralai/candidato'][c] = Object.fromEntries(
        Object.keys(b.rubrica['mistralai/juiz']['mistralai/candidato'][c]).map((k) => [k, { veredito: true }]),
      )
    const d = decidirFuncao(b)
    expect(d.autopreferencia['mistralai/juiz']).toBeCloseTo(2 / 7)
    expect(d.autopreferencia['deepseek/juiz']).toBeNull()
  })
})
