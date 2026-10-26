/**
 * O CLIENTE DO ASSISTENTE AO VIVO (`src/data/apiDoAssistente.ts`): os corpos que vão ao servidor (só o texto da
 * própria pessoa e os idiomas), a leitura defensiva das respostas, o cache da aba das glosas e os motivos das recusas
 * (`motivoDeCota`, com o teto do dia do assistente).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rede = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../src/data/funil', async (orig) => ({
  ...(await orig<typeof import('../src/data/funil')>()),
  apiFetch: rede.apiFetch,
}))

import {
  comoRespondo,
  corrigirMinhaFala,
  destacarExpressoes,
  esquecerCacheDoAssistente,
  explicarTermos,
} from '../src/data/apiDoAssistente'
import { motivoDeCota } from '../src/data/motivoDeCota'

const json = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })
const corpoEnviado = (i = 0) => JSON.parse(rede.apiFetch.mock.calls[i][1].body)
const I = { lang: 'en', langDaPessoa: 'pt-BR' }

beforeEach(() => {
  rede.apiFetch.mockReset()
  esquecerCacheDoAssistente()
})

describe('motivoDeCota: o teto do dia do assistente', () => {
  it('429 teto_do_assistente é o limite de HOJE (volta amanhã)', () => {
    expect(motivoDeCota(429, 'teto_do_assistente')).toBe('uso_justo')
  })
  it('402 cota_do_assistente (a subcota de tokens do mês) é a cota do MÊS', () => {
    expect(motivoDeCota(402, 'cota_do_assistente')).toBe('cota_do_mes')
  })
})

describe('as recusas viram motivos que a tela entende', () => {
  for (const [status, code, motivo] of [
    [404, 'recurso_indisponivel', 'fora'],
    [402, 'sem_plano', 'sem_plano'],
    [429, 'teto_do_assistente', 'uso_justo'],
    [429, 'uso_justo_do_dia', 'uso_justo'],
    [402, 'quota_exceeded', 'cota_do_mes'],
    [429, 'assistente_demais', 'nuvem_ocupada'],
    [429, 'nuvem_ocupada', 'nuvem_ocupada'],
    [400, 'invalido', 'invalido'],
    [401, undefined, 'sem_conta'],
    [502, 'resposta_invalida', 'indisponivel'],
  ] as const)
    it(`${status} ${code ?? ''} → ${motivo}`, async () => {
      rede.apiFetch.mockResolvedValueOnce(json(status, { error: 'x', code }))
      const r = await comoRespondo({ ...I, frase: 'Can you hear me?' })
      expect(r).toEqual({ ok: false, motivo, status })
    })

  it('a rede caiu: indisponivel, sem lançar', async () => {
    rede.apiFetch.mockRejectedValueOnce(new Error('offline'))
    expect(await corrigirMinhaFala({ ...I, minhaFala: 'he go' })).toEqual({
      ok: false,
      motivo: 'indisponivel',
      status: 0,
    })
  })
})

describe('as quatro chamadas', () => {
  it('expressões: corpo só com frase e idiomas; a mesma linha volta do cache sem rede', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(
        200,
        { expressoes: [{ trecho: 'break a leg', sentido: 'boa sorte', tipo: 'idiomatica' }], restanteHoje: 199 },
        { 'x-ia-modelo': 'google/gemma-4-26b-a4b-it' },
      ),
    )
    const r1 = await destacarExpressoes({ ...I, frase: 'Break a leg!' })
    expect(r1).toEqual({
      ok: true,
      valor: {
        expressoes: [{ trecho: 'break a leg', sentido: 'boa sorte', tipo: 'idiomatica' }],
        restanteHoje: 199,
        modelo: 'google/gemma-4-26b-a4b-it',
      },
    })
    expect(rede.apiFetch.mock.calls[0][0]).toBe('/api/ai/assistente/expressoes')
    expect(corpoEnviado()).toEqual({ frase: 'Break a leg!', lang: 'en', langDaPessoa: 'pt-BR' })
    const r2 = await destacarExpressoes({ ...I, frase: '  break a  LEG! ' })
    expect(r2.ok && r2.valor.expressoes).toHaveLength(1)
    // Do cache: o último restanteHoje conhecido, nunca null.
    expect(r2.ok && r2.valor.restanteHoje).toBe(199)
    expect(rede.apiFetch).toHaveBeenCalledTimes(1)
  })

  it('termos: só os que faltam no cache vão à rede, e a resposta junta os dois', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(200, { termos: [{ termo: 'KPI', explicacao: 'indicador' }], restanteHoje: 10 }),
    )
    await explicarTermos({ ...I, frase: 'Our KPI', termos: ['KPI'] })
    rede.apiFetch.mockResolvedValueOnce(
      json(200, { termos: [{ termo: 'ROI', explicacao: 'retorno' }], restanteHoje: 9 }),
    )
    const r = await explicarTermos({ ...I, frase: 'KPI and ROI', termos: ['KPI', 'ROI'] })
    expect(corpoEnviado(1)).toEqual({ frase: 'KPI and ROI', termos: ['ROI'], lang: 'en', langDaPessoa: 'pt-BR' })
    expect(r.ok && r.valor.termos).toEqual([
      { termo: 'KPI', explicacao: 'indicador' },
      { termo: 'ROI', explicacao: 'retorno' },
    ])
    const tudoNoCache = await explicarTermos({ ...I, frase: 'ROI KPI', termos: ['ROI', 'KPI'] })
    expect(tudoNoCache.ok).toBe(true)
    expect(rede.apiFetch).toHaveBeenCalledTimes(2)
  })

  it('como respondo: até 2 linhas de contexto; menos de 2 sugestões válidas é indisponivel', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(200, {
        sugestoes: [
          { texto: 'Sure.', traducao: 'Claro.', tom: 'neutro' },
          { texto: 'Yep!', traducao: 'Sim!', tom: 'informal' },
        ],
        restanteHoje: 5,
      }),
    )
    const r = await comoRespondo({ ...I, frase: 'Can you?', contexto: ['a', ' ', 'b', 'c'] })
    expect(corpoEnviado()).toEqual({ frase: 'Can you?', contexto: ['b', 'c'], lang: 'en', langDaPessoa: 'pt-BR' })
    expect(r.ok && r.valor.sugestoes).toHaveLength(2)
    rede.apiFetch.mockResolvedValueOnce(
      json(200, { sugestoes: [{ texto: 'Sure.', traducao: 'Claro.', tom: 'neutro' }] }),
    )
    expect(await comoRespondo({ ...I, frase: 'Can you?' })).toEqual({ ok: false, motivo: 'indisponivel', status: 200 })
  })

  it('correção: lê a correção e manda só a minha fala', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(200, { correcao: { ok: false, corrigida: 'He goes.', dica: 'Com he, goes.' }, restanteHoje: 3 }),
    )
    const r = await corrigirMinhaFala({ ...I, minhaFala: 'he go' })
    expect(corpoEnviado()).toEqual({ minhaFala: 'he go', lang: 'en', langDaPessoa: 'pt-BR' })
    expect(r).toEqual({
      ok: true,
      valor: { correcao: { ok: false, corrigida: 'He goes.', dica: 'Com he, goes.' }, restanteHoje: 3 },
    })
  })
})

describe('"Como respondo?" em fluxo (NDJSON)', () => {
  const S1 = { texto: 'Sure.', traducao: 'Claro.', tom: 'neutro' }
  const S2 = { texto: 'Yeah!', traducao: 'Sim!', tom: 'informal' }
  const ndjson = (linhas: unknown[]) =>
    new Response(linhas.map((l) => JSON.stringify(l)).join('\n') + '\n', {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'x-ia-modelo': 'gemma' },
    })
  const codificar = (s: string) => new TextEncoder().encode(s)

  it('pede NDJSON, entrega a lista a cada sugestão e devolve a lista final do fim', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      ndjson([
        { tipo: 'sugestao', sugestao: S1 },
        { tipo: 'sugestao', sugestao: { texto: '', traducao: 'x', tom: 'neutro' } }, // fora do formato: ignorada
        { tipo: 'sugestao', sugestao: S2 },
        { tipo: 'fim', sugestoes: [S1, S2], restanteHoje: 150 },
      ]),
    )
    const vistas: unknown[] = []
    const r = await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: (s) => vistas.push(s) })
    expect(rede.apiFetch.mock.calls[0][1].headers.Accept).toContain('application/x-ndjson')
    expect(corpoEnviado()).toEqual({ frase: 'Can you?', lang: 'en', langDaPessoa: 'pt-BR' })
    expect(vistas).toEqual([[S1], [S1, S2]])
    expect(r).toEqual({ ok: true, valor: { sugestoes: [S1, S2], restanteHoje: 150, modelo: 'gemma' } })
  })

  it('a sugestão chega antes do fim do corpo (o corpo é lido aos pedaços)', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    const corpo = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) })
    rede.apiFetch.mockResolvedValueOnce(
      new Response(corpo, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    )
    const vistas: unknown[] = []
    const pendente = comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: (s) => vistas.push(s) })
    ctrl.enqueue(codificar(`${JSON.stringify({ tipo: 'sugestao', sugestao: S1 })}\n{"tipo":"sug`))
    await vi.waitFor(() => expect(vistas).toEqual([[S1]]))
    ctrl.enqueue(codificar(`estao","sugestao":${JSON.stringify(S2)}}\n`))
    ctrl.enqueue(codificar(`${JSON.stringify({ tipo: 'fim', sugestoes: [S1, S2], restanteHoje: 1 })}\n`))
    ctrl.close()
    expect(await pendente).toMatchObject({ ok: true, valor: { sugestoes: [S1, S2] } })
    expect(vistas).toEqual([[S1], [S1, S2]])
  })

  it('o erro depois da primeira sugestão e o fluxo que acaba sem fim são indisponivel', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      ndjson([
        { tipo: 'sugestao', sugestao: S1 },
        { tipo: 'erro', code: 'provedor_indisponivel', error: 'parou' },
      ]),
    )
    expect(await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: () => {} })).toEqual({
      ok: false,
      motivo: 'indisponivel',
      status: 200,
    })
    rede.apiFetch.mockResolvedValueOnce(ndjson([{ tipo: 'sugestao', sugestao: S1 }]))
    expect(await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: () => {} })).toMatchObject({
      ok: false,
      motivo: 'indisponivel',
    })
  })

  it('o fim com menos de 2 sugestões não é a ajuda pedida', async () => {
    rede.apiFetch.mockResolvedValueOnce(ndjson([{ tipo: 'fim', sugestoes: [S1], restanteHoje: 1 }]))
    expect(await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: () => {} })).toMatchObject({
      ok: false,
      motivo: 'indisponivel',
    })
  })

  it('um servidor com o contrato antigo (JSON inteiro) também serve', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(200, { sugestoes: [S1, S2], restanteHoje: 9 }))
    const vistas: unknown[] = []
    const r = await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: (s) => vistas.push(s) })
    expect(r).toEqual({ ok: true, valor: { sugestoes: [S1, S2], restanteHoje: 9 } })
    expect(vistas).toEqual([])
  })

  it('a recusa antes do fluxo é a de sempre; o sinal de quem pede vai junto com o teto de tempo', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(429, { error: 'x', code: 'teto_do_assistente' }))
    const controle = new AbortController()
    const r = await comoRespondo({ ...I, frase: 'Can you?' }, { aoSugerir: () => {}, sinal: controle.signal })
    expect(r).toEqual({ ok: false, motivo: 'uso_justo', status: 429 })
    const sinal: AbortSignal = rede.apiFetch.mock.calls[0][1].signal
    expect(sinal.aborted).toBe(false)
    controle.abort()
    expect(sinal.aborted).toBe(true)
  })

  it('cancelado no meio do corpo: indisponivel, sem lançar', async () => {
    const controle = new AbortController()
    const corpo = new ReadableStream<Uint8Array>({
      start: (c) => {
        c.enqueue(codificar(`${JSON.stringify({ tipo: 'sugestao', sugestao: S1 })}\n`))
        controle.signal.addEventListener('abort', () => c.error(new DOMException('abortado', 'AbortError')))
      },
    })
    rede.apiFetch.mockResolvedValueOnce(
      new Response(corpo, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    )
    const r = await comoRespondo(
      { ...I, frase: 'Can you?' },
      { aoSugerir: () => controle.abort(), sinal: controle.signal },
    )
    expect(r).toEqual({ ok: false, motivo: 'indisponivel', status: 0 })
  })

  it('sem opções, o pedido é o de sempre (sem Accept de fluxo)', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(200, { sugestoes: [S1, S2], restanteHoje: 9 }))
    await comoRespondo({ ...I, frase: 'Can you?' })
    expect(rede.apiFetch.mock.calls[0][1].headers.Accept).toBeUndefined()
  })
})
