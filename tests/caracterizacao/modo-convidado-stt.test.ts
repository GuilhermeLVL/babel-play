/**
 * MODO CONVIDADO — a transcrição de nuvem de ponta a ponta (Fase 7).
 *
 * Arquivo à parte do `modo-convidado.test.ts` porque o harness sobe UM app por arquivo. O que se
 * prova aqui é o caminho mais frágil do plano `convidado`: o corpo do STT é lido por `express.raw()`
 * DEPOIS da porta, e é depois dele que a cota de segundos resolve o plano. Se o contexto do request
 * (onde mora "este id é convidado") se perdesse na leitura do corpo, o plano cairia para `free`
 * (cota zero) e o convidado receberia 402 com a flag ligada.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { wavPcm } from '../harness/wav'
import { type AppDeTeste, subirApp } from './_app'

const CHAVES = ['GROQ_API_KEY', 'STT_API_KEY', 'LLM_API_KEY', 'OPENROUTER_API_KEY', 'LLM_RESERVA_API_KEY'] as const
const salvo: Record<string, string | undefined> = {}
let s: AppDeTeste
const fetchOriginal = globalThis.fetch

beforeAll(async () => {
  for (const k of CHAVES) {
    salvo[k] = process.env[k]
    if (k === 'OPENROUTER_API_KEY' || k === 'LLM_RESERVA_API_KEY') process.env[k] = ''
    else delete process.env[k]
  }
  s = await subirApp({ modo: 'publico' })
  const flags = await s.load('../../server/lib/flags')
  await flags.definirFlag('nuvem_convidado', { habilitada: true }, 'teste')
})
afterAll(async () => {
  vi.restoreAllMocks()
  await s.encerrar()
  for (const k of CHAVES) {
    if (salvo[k] === undefined) delete process.env[k]
    else process.env[k] = salvo[k]
  }
})

describe('STT de nuvem do convidado', () => {
  it('com a flag ligada, transcreve e conta os segundos no id anônimo', async () => {
    process.env.GROQ_API_KEY = 'chave-de-teste'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input?.url ?? input)
      if (url.startsWith(s.base)) return fetchOriginal(input, init)
      return new Response(JSON.stringify({ text: 'olá mundo', language: 'pt', segments: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const token = await s.token('conv-stt', { is_anonymous: true })
    const r = await s.chamar('POST', '/api/ai/stt', {
      token,
      raw: wavPcm(2),
      headers: { 'content-type': 'audio/wav' },
    })
    expect(r.status).toBe(200)
    const { convidadosRepo } = await s.load('../../server/db/repositories/convidados')
    const mes = new Date().toISOString().slice(0, 7)
    expect(await convidadosRepo.lerContador('conv-stt', 'stt_seconds', mes)).toBeGreaterThan(0)
  })
})
