/**
 * OS PRAZOS DA CASCATA (revisão da explicação no DeepSeek, 25/10/2026).
 *
 * Antes, cada perna tinha o MESMO relógio (`timeoutMs`), e o pior caso somava todas: três pernas de 15 s faziam a
 * pessoa esperar 45–60 s. Agora:
 *   - `timeoutDaPrimeiraPernaMs`: a primeira perna da lista tem relógio próprio (a explicação: 8 s no DeepSeek);
 *   - `prazoTotalMs`: o tempo da cascata inteira. Cada perna recebe o MENOR entre o relógio dela e o que sobra do
 *     prazo, e esgotado o prazo nenhuma perna a mais é chamada;
 *   - a repetição sem esquema (`chamarChat`) cabe DENTRO do relógio da perna, não ganha um relógio novo;
 *   - o rastro diz o esforço pedido, inclusive o raciocínio DESLIGADO do DeepSeek (`none`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { percorrerCascata } from '../../server/ai/cascata'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { chamarChat } from '../../server/ai/llmClient'
import type { Provedor } from '../../server/ai/provedores'

const BASE = 'https://openrouter.ai/api/v1'
const perna = (model: string, rotulo: string): Provedor => ({ rotulo, base: BASE, apiKey: 'falsa', model })
const DEEPSEEK = perna('deepseek/deepseek-v4.1-flash', 'llm-primario')
const GPT_OSS = perna('openai/gpt-oss-120b', 'llm-reserva')
const GEMMA = perna('google/gemma-4-26b-a4b-it', 'llm-reserva-2')

const ok = () =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
/** Só responde quando o relógio da chamada aborta: o provedor que "estoura o tempo". */
const pendurado = (init: any) =>
  new Promise<Response>((_, rejeitar) => {
    const s: AbortSignal | undefined = init?.signal
    if (s?.aborted) return rejeitar(s.reason)
    s?.addEventListener('abort', () => rejeitar(s.reason), { once: true })
  })

afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
})

describe('percorrerCascata: relógio da primeira perna e prazo total', () => {
  it('a primeira perna estoura o relógio PRÓPRIO dela e a reserva entrega com o relógio de sempre', async () => {
    const chamadas: Array<{ modelo: string; t: number }> = []
    const t0 = Date.now()
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      const modelo = JSON.parse(init.body).model
      chamadas.push({ modelo, t: Date.now() - t0 })
      return modelo === DEEPSEEK.model ? pendurado(init) : ok()
    })
    const r = await percorrerCascata(
      [DEEPSEEK, GPT_OSS],
      { messages: [{ role: 'user', content: 'oi' }], timeoutMs: 2_000 },
      { evento: 'teste', route: '/teste', timeoutDaPrimeiraPernaMs: 80, prazoTotalMs: 3_000 },
    )
    expect(r.entregue?.model).toBe(GPT_OSS.model)
    expect(chamadas.map((c) => c.modelo)).toEqual([DEEPSEEK.model, GPT_OSS.model])
    // A reserva começou logo depois dos 80 ms da primeira — não depois dos 2 s de sempre.
    expect(chamadas[1].t).toBeGreaterThanOrEqual(70)
    expect(chamadas[1].t).toBeLessThan(1_000)
  })

  it('o prazo total corta a perna em curso e não chama as seguintes', async () => {
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      chamadas.push(JSON.parse(init.body).model)
      return pendurado(init)
    })
    const t0 = Date.now()
    const r = await percorrerCascata(
      [DEEPSEEK, GPT_OSS, GEMMA],
      { messages: [{ role: 'user', content: 'oi' }], timeoutMs: 5_000 },
      { evento: 'teste', route: '/teste', timeoutDaPrimeiraPernaMs: 60, prazoTotalMs: 250 },
    )
    const decorrido = Date.now() - t0
    expect(r.entregue).toBeNull()
    // A segunda perna recebeu só o que sobrava do prazo (~190 ms), e a terceira nem foi chamada.
    expect(chamadas).toEqual([DEEPSEEK.model, GPT_OSS.model])
    expect(decorrido).toBeLessThan(1_000)
    expect(r.ultimaFalha).toMatch(/prazo/i)
  })

  it('sem os campos novos, nada muda: cada perna com o `timeoutMs` do pedido', async () => {
    const chamadas: string[] = []
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      const modelo = JSON.parse(init.body).model
      chamadas.push(modelo)
      return modelo === DEEPSEEK.model ? pendurado(init) : ok()
    })
    const r = await percorrerCascata(
      [DEEPSEEK, GPT_OSS],
      { messages: [{ role: 'user', content: 'oi' }], timeoutMs: 60 },
      { evento: 'teste', route: '/teste' },
    )
    expect(r.entregue?.model).toBe(GPT_OSS.model)
    expect(chamadas).toEqual([DEEPSEEK.model, GPT_OSS.model])
  })

  it('o rastro registra o esforço pedido: "none" no DeepSeek (raciocínio desligado), "low" no gpt-oss', async () => {
    vi.stubGlobal('fetch', async (_u: unknown, init: any) =>
      JSON.parse(init.body).model === DEEPSEEK.model ? new Response('falhou', { status: 500 }) : ok(),
    )
    const tentativas: any[] = []
    const rastro = { tentativa: (t: any) => tentativas.push(t), conteudoPermitido: false } as any
    await percorrerCascata(
      [DEEPSEEK, GPT_OSS],
      { messages: [{ role: 'user', content: 'oi' }], timeoutMs: 1_000 },
      { evento: 'teste', route: '/teste', rastro },
    )
    expect(tentativas.map((t) => [t.modelo, t.metadados.esforco])).toEqual([
      [DEEPSEEK.model, 'none'],
      [GPT_OSS.model, 'low'],
    ])
  })
})

describe('chamarChat: a repetição sem esquema', () => {
  const formato = { nome: 'explicacao', esquema: { type: 'object' } }

  it('no DeepSeek mantém o raciocínio desligado e o Novita fora; só o esquema sai', async () => {
    const corpos: any[] = []
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      corpos.push(JSON.parse(init.body))
      return corpos.length === 1 ? new Response('No endpoints found matching your data policy', { status: 404 }) : ok()
    })
    const r = await chamarChat({
      base: BASE,
      model: DEEPSEEK.model,
      messages: [{ role: 'user', content: 'oi' }],
      formatoDeSaida: formato,
    })
    expect(r.ok).toBe(true)
    expect(r.semEsquema).toBe(true)
    expect(corpos).toHaveLength(2)
    expect(corpos[1]).not.toHaveProperty('response_format')
    expect(corpos[1].reasoning).toEqual({ enabled: false })
    expect(corpos[1].provider.ignore).toEqual(expect.arrayContaining(['google-ai-studio', 'google-vertex', 'novita']))
    expect(corpos[1].provider).toMatchObject({ zdr: true, data_collection: 'deny' })
  })

  it('a repetição cabe no relógio da perna: não ganha um relógio novo', async () => {
    let n = 0
    let duracaoDaRepeticao = 0
    vi.stubGlobal('fetch', async (_u: unknown, init: any) => {
      n += 1
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 300))
        return new Response('No endpoints found', { status: 404 })
      }
      const t = Date.now()
      return pendurado(init).finally(() => (duracaoDaRepeticao = Date.now() - t))
    })
    const r = await chamarChat({
      base: BASE,
      model: DEEPSEEK.model,
      messages: [{ role: 'user', content: 'oi' }],
      formatoDeSaida: formato,
      timeoutMs: 600,
    })
    expect(r.ok).toBe(false)
    expect(n).toBe(2)
    // A repetição teve só o que sobrava (~300 ms dos 600), e não um relógio novo de 600.
    expect(duracaoDaRepeticao).toBeLessThan(500)
  })
})
