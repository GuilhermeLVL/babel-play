/**
 * O "RESTAM X" DA NUVEM DE ALÍVIO PELO PREÇO DA PERNA QUE TRANSCREVE (risco listado na Fase B).
 *
 * O dólar que sobra na franquia vira tempo pelo custo de um segundo de fala. A conta usava o preço do
 * `STT_MODEL` legado (a Groq), e não a perna que a cascata do STT (B6) de fato chama — a mais barata
 * para uma fala típica, pelo registro (`IA_PROVEDORES`). Com uma perna mais cara na frente, a pessoa
 * via mais tempo do que a franquia paga; com uma mais barata, menos.
 *
 * O fator do faturado (1,08, o mínimo de 10 s por pedido medido na bancada) só vale para perna com
 * mínimo por pedido: quem cobra por segundo fatura o que foi falado.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { esquecerRegistro } from '../server/ai/registroDeProvedores'
import { custoPorSegundoDoAlivio } from '../server/lib/nuvemDeAlivio'
import { custoDeStt } from '../server/lib/orcamentoDeIa'
import { FATOR_FATURADO_DO_STT } from '../src/core/planos'

const CHAVES = [
  'IA_PROVEDORES',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
  'GROQ_API_KEY',
  'BARATO_API_KEY',
  'CARO_API_KEY',
]
const salvo: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of CHAVES) {
    salvo[k] = process.env[k]
    delete process.env[k]
  }
  esquecerRegistro()
})
afterEach(() => {
  for (const k of CHAVES) {
    if (salvo[k] === undefined) delete process.env[k]
    else process.env[k] = salvo[k]
  }
  esquecerRegistro()
})

describe('custoPorSegundoDoAlivio', () => {
  it('sem registro (o legado): o preço do STT_MODEL, com o fator do faturado — como antes', () => {
    process.env.GROQ_API_KEY = 'k'
    expect(custoPorSegundoDoAlivio()).toBeCloseTo(
      (custoDeStt('whisper-large-v3-turbo', 3600) * FATOR_FATURADO_DO_STT) / 3600,
      12,
    )
  })

  it('com o registro: a perna que a cascata chama primeiro para uma fala típica, e sem fator se cobra por segundo', () => {
    process.env.IA_PROVEDORES = JSON.stringify({
      provedores: [
        {
          id: 'caro',
          formato: 'openai',
          base: 'https://api.deepinfra.com/v1/openai',
          chave: 'CARO_API_KEY',
          retencao: 'zdr',
          modelos: [{ id: 'openai/whisper-large-v3', funcoes: ['stt'], preco: { hora: 0.3, minimoFaturadoS: 0 } }],
        },
        {
          id: 'barato',
          formato: 'openai',
          base: 'https://api.deepinfra.com/v1/openai',
          chave: 'BARATO_API_KEY',
          retencao: 'zdr',
          modelos: [
            { id: 'openai/whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.06, minimoFaturadoS: 0 } },
          ],
        },
      ],
    })
    process.env.CARO_API_KEY = 'k'
    process.env.BARATO_API_KEY = 'k'
    expect(custoPorSegundoDoAlivio()).toBeCloseTo(0.06 / 3600, 12)
  })

  it('perna com mínimo por pedido leva o fator do faturado', () => {
    process.env.IA_PROVEDORES = JSON.stringify({
      provedores: [
        {
          id: 'groq',
          formato: 'openai',
          base: 'https://api.groq.com/openai/v1',
          chave: 'GROQ_API_KEY',
          retencao: 'zdr',
          modelos: [{ id: 'whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.05, minimoFaturadoS: 10 } }],
        },
      ],
    })
    process.env.GROQ_API_KEY = 'k'
    expect(custoPorSegundoDoAlivio()).toBeCloseTo((0.05 * FATOR_FATURADO_DO_STT) / 3600, 12)
  })
})
