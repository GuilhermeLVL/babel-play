/**
 * B0 (Fase B) — O AVISO NO BOOT QUANDO A NUVEM NÃO TEM RESERVA (ADR 0008).
 *
 * O ADR 0008 decidiu a Groq como principal e a OpenRouter com ZDR como reserva, e disse como isso é
 * cobrado: "aviso no boot em produção quando não há reserva configurada". O aviso não existia — e a
 * reserva de produção está justamente fora (a chave da OpenRouter expirou, pendência do dono). Sem
 * reserva, um 429 ou uma queda da Groq derruba a tradução e o tutor de TODO assinante ao mesmo tempo,
 * e ninguém sabe disso até a reclamação chegar.
 *
 * A função é pura (recebe o ambiente) e o `server.ts` a chama no boot; o evento entra na lista de
 * avisos que chegam ao Sentry (`AVISOS_QUE_ALERTAM`).
 */
import { describe, expect, it } from 'vitest'

import { avisoDeIaSemReserva } from '../../server/ai/provedores'
import { AVISOS_QUE_ALERTAM } from '../../server/lib/logger'

const PRODUCAO = { NODE_ENV: 'production', LLM_API_KEY: 'chave-llm-falsa' } as NodeJS.ProcessEnv

describe('aviso de IA sem reserva no boot', () => {
  it('produção com primário e SEM reserva: avisa, dizendo o que configurar', () => {
    const aviso = avisoDeIaSemReserva(PRODUCAO)
    expect(aviso).toMatch(/reserva/i)
    expect(aviso).toMatch(/LLM_RESERVA_|OPENROUTER_API_KEY/)
  })

  it('com a reserva completa, ou com o atalho da OpenRouter: não avisa', () => {
    expect(
      avisoDeIaSemReserva({
        ...PRODUCAO,
        LLM_RESERVA_BASE_URL: 'https://reserva.exemplo/v1',
        LLM_RESERVA_API_KEY: 'chave-reserva-falsa',
        LLM_RESERVA_MODEL: 'modelo-da-reserva',
      }),
    ).toBeNull()
    expect(avisoDeIaSemReserva({ ...PRODUCAO, OPENROUTER_API_KEY: 'chave-or-falsa' })).toBeNull()
  })

  it('meia reserva (duas das três LLM_RESERVA_*) conta como sem reserva — é o que a cascata faz', () => {
    const aviso = avisoDeIaSemReserva({
      ...PRODUCAO,
      LLM_RESERVA_BASE_URL: 'https://reserva.exemplo/v1',
      LLM_RESERVA_API_KEY: 'chave-reserva-falsa',
    })
    expect(aviso).not.toBeNull()
  })

  it('fora de produção, ou sem nuvem nenhuma configurada: não avisa', () => {
    expect(avisoDeIaSemReserva({ NODE_ENV: 'development', LLM_API_KEY: 'k' } as NodeJS.ProcessEnv)).toBeNull()
    expect(avisoDeIaSemReserva({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull()
  })

  it('o evento do aviso chega ao Sentry', () => {
    expect(AVISOS_QUE_ALERTAM.has('ia_sem_reserva')).toBe(true)
  })
})
