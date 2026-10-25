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
