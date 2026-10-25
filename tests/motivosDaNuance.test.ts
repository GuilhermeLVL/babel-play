/**
 * AS MENSAGENS CERTAS NA NUANCE (Fase B do plano de qualidade da IA paga, item 1) — o mapeamento de recusas.
 *
 * Antes, `apiDaNuance` transformava TODO 402 em `exige_nuance` ("faz parte da Tradução Nuance", dito a quem já
 * tem a Nuance e só gastou a cota do mês) e TODO 429 em `nuvem_ocupada` (inclusive o uso justo do dia). Agora a
 * Nuance usa o mesmo `motivoDeCota` da IA de estudo, e o 402 de capacidade continua `exige_nuance`.
 * E o cliente do feedback manda só listas fechadas; a explicação e o resumo leem o modelo do cabeçalho.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rede = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../src/data/funil', async (orig) => ({
  ...(await orig<typeof import('../src/data/funil')>()),
  apiFetch: rede.apiFetch,
}))

import { motivoDaFalha, pedirAlternativas, polirBloco, traduzirComNuance } from '../src/data/apiDaNuance'
import { explicarFrase, resumirSessao } from '../src/data/apiDoEstudo'
import { enviarFeedback } from '../src/data/apiDoFeedback'
import { motivoDeCota } from '../src/data/motivoDeCota'

const json = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

beforeEach(() => rede.apiFetch.mockReset())

describe('motivoDeCota (o mapeamento único)', () => {
  it('402 da cota do mês, em qualquer dos três códigos', () => {
    for (const code of ['quota_exceeded', 'cota_do_mes', 'teto_usd_da_conta'])
      expect(motivoDeCota(402, code)).toBe('cota_do_mes')
  })
  it('429 uso_justo_do_dia é o limite de HOJE; outro 429 é a nuvem ocupada', () => {
    expect(motivoDeCota(429, 'uso_justo_do_dia')).toBe('uso_justo')
    expect(motivoDeCota(429, 'nuvem_ocupada')).toBe('nuvem_ocupada')
    expect(motivoDeCota(429, undefined)).toBe('nuvem_ocupada')
  })
  it('o resto não é de cota', () => {
    expect(motivoDeCota(402, 'exige_nuance')).toBeNull()
    expect(motivoDeCota(402, undefined)).toBeNull()
    expect(motivoDeCota(502, 'provedor_indisponivel')).toBeNull()
  })
})

describe('motivoDaFalha da Nuance', () => {
  it('402 quota_exceeded NÃO é mais exige_nuance: é a cota do mês', () => {
    expect(motivoDaFalha(402, 'quota_exceeded')).toBe('cota_do_mes')
    expect(motivoDaFalha(402, 'teto_usd_da_conta')).toBe('cota_do_mes')
  })
  it('429 uso_justo_do_dia NÃO é mais nuvem ocupada', () => {
    expect(motivoDaFalha(429, 'uso_justo_do_dia')).toBe('uso_justo')
    expect(motivoDaFalha(429, 'nuvem_ocupada')).toBe('nuvem_ocupada')
  })
  it('402 pela capacidade continua exige_nuance (com o code ou só o entitlement)', () => {
    expect(motivoDaFalha(402, 'exige_nuance')).toBe('exige_nuance')
    expect(motivoDaFalha(402, undefined)).toBe('exige_nuance')
  })
  it('os outros de sempre', () => {
    expect(motivoDaFalha(401, undefined)).toBe('sem_conta')
    expect(motivoDaFalha(409, 'glossario_cheio')).toBe('glossario_cheio')
    expect(motivoDaFalha(409, 'polimento_em_andamento')).toBe('em_andamento')
    expect(motivoDaFalha(400, undefined)).toBe('invalido')
    expect(motivoDaFalha(502, 'resposta_invalida')).toBe('indisponivel')
  })
})

describe('as chamadas da Nuance, pela resposta HTTP', () => {
  const pedido = { texto: 'see you later', tgt: 'pt' }

  it('traduzir: 402 da cota vira cota_do_mes; 429 do dia vira uso_justo', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(402, { error: 'limite', code: 'quota_exceeded' }))
    expect(await traduzirComNuance(pedido)).toEqual({ ok: false, motivo: 'cota_do_mes', status: 402 })
    rede.apiFetch.mockResolvedValueOnce(json(429, { error: 'hoje', code: 'uso_justo_do_dia' }))
    expect(await traduzirComNuance(pedido)).toEqual({ ok: false, motivo: 'uso_justo', status: 429 })
  })

  it('traduzir e outras formas trazem o modelo da procedência (para o 👍/👎)', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(200, { text: 'até logo', provenance: { origin: 'openai/gpt-oss-120b' } }))
    expect(await traduzirComNuance(pedido)).toEqual({
      ok: true,
      valor: { texto: 'até logo', modelo: 'openai/gpt-oss-120b' },
    })
    rede.apiFetch.mockResolvedValueOnce(json(200, { opcoes: ['a'], nota: '', provenance: { origin: 'm/x' } }))
    expect(await pedirAlternativas(pedido)).toEqual({ ok: true, valor: { opcoes: ['a'], nota: '', modelo: 'm/x' } })
  })

  it('polir: 402 da cota e 429 do dia também (a tela do polimento diz quando volta)', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(402, { code: 'quota_exceeded' }))
    expect(await polirBloco({ sessionId: 's', bloco: 0 })).toMatchObject({ ok: false, motivo: 'cota_do_mes' })
    rede.apiFetch.mockResolvedValueOnce(json(429, { code: 'uso_justo_do_dia' }))
    expect(await polirBloco({ sessionId: 's', bloco: 0 })).toMatchObject({ ok: false, motivo: 'uso_justo' })
  })
})

describe('o modelo da explicação e do resumo vem do cabeçalho x-ia-modelo', () => {
  it('explicação', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(
        200,
        {
          explicacao: { porQue: 'p', gramatica: '', registro: '', girias: [] },
          origem: 'plano',
          restanteNaAmostra: null,
        },
        { 'x-ia-modelo': 'openai/gpt-oss-120b' },
      ),
    )
    const r = await explicarFrase({ texto: 't', traducao: 't', lang: 'en', langDaTraducao: 'pt' })
    expect(r.ok && r.valor.modelo).toBe('openai/gpt-oss-120b')
  })
  it('resumo sem o cabeçalho: sem modelo, e o resto igual', async () => {
    rede.apiFetch.mockResolvedValueOnce(
      json(200, { pontos: ['a', 'b', 'c'], cartoes: [], origem: 'plano', restanteNaAmostra: null }),
    )
    const r = await resumirSessao({ sessionId: 's' })
    expect(r).toEqual({
      ok: true,
      valor: { pontos: ['a', 'b', 'c'], cartoes: [], origem: 'plano', restanteNaAmostra: null },
    })
  })
})

describe('enviarFeedback', () => {
  it('manda só as listas fechadas, e nunca lança', async () => {
    rede.apiFetch.mockResolvedValueOnce(json(202, { ok: true }))
    expect(
      await enviarFeedback({ funcao: 'nuance', nota: 'down', motivo: 'nao_ajudou', modelo: 'm/x', nivel: 'nuance' }),
    ).toBe(true)
    const [caminho, init] = rede.apiFetch.mock.calls[0]
    expect(caminho).toBe('/api/ai/feedback')
    expect(JSON.parse(init.body)).toEqual({
      funcao: 'nuance',
      nota: 'down',
      motivo: 'nao_ajudou',
      modelo: 'm/x',
      nivel: 'nuance',
    })

    rede.apiFetch.mockRejectedValueOnce(new Error('rede caiu'))
    expect(await enviarFeedback({ funcao: 'tutor', nota: 'up' })).toBe(false)
    expect(JSON.parse(rede.apiFetch.mock.calls[1][1].body)).toEqual({ funcao: 'tutor', nota: 'up' })
  })
})
