/**
 * O "AJUSTAR NÍVEL" NO DEEPSEEK (decisão do dono, 27/11/2026; bancada D1 em
 * `docs/auditoria/2026-11-27-ajustar-nivel-bancada.md`): com o registro REAL, o DeepSeek vem primeiro e o Gemma e o
 * Llama ficam de reserva; as outras funções do tutor não mudam.
 */
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parametrosDoProvedor } from '../../server/ai/parametrosDoProvedor'
import { esquecerRegistro, pernasDaFuncao } from '../../server/ai/registroDeProvedores'

const ARQUIVO = resolve(__dirname, '../../ops/ia-provedores.openrouter.json')
const DEEPSEEK = 'deepseek/deepseek-v4.1-flash'
const GPT_OSS = 'openai/gpt-oss-120b'
const GEMMA = 'google/gemma-4-26b-a4b-it'
const LLAMA = 'meta-llama/llama-3.3-70b-instruct'

const env = () =>
  ({ IA_PROVEDORES_ARQUIVO: ARQUIVO, OPENROUTER_API_KEY: 'chave-openrouter-falsa' }) as NodeJS.ProcessEnv
const modelos = (f: Parameters<typeof pernasDaFuncao>[0], nivel?: 'rapida' | 'nuance') =>
  pernasDaFuncao(f, nivel ? { nivel } : {}, env()).map((p) => p.model)

describe('a cascata do Ajustar nível no registro real', () => {
  afterEach(() => esquecerRegistro())

  it('rápida (o nível da função): DeepSeek primeiro, Gemma e Llama de reserva', () => {
    expect(modelos('ajustarNivel', 'rapida')).toEqual([DEEPSEEK, GEMMA, LLAMA])
    expect(modelos('ajustarNivel')).toEqual([DEEPSEEK, GEMMA, LLAMA])
  })

  it('o DeepSeek vai sem raciocínio, como na bancada', () => {
    const [perna] = pernasDaFuncao('ajustarNivel', { nivel: 'rapida' }, env())
    expect(parametrosDoProvedor(perna.base, perna.model, perna.roteamento)).toMatchObject({
      reasoning: { enabled: false },
    })
  })

  it('tutor, corretor e resumo seguem sem o DeepSeek', () => {
    for (const f of ['tutor', 'corretor', 'resumo'] as const)
      expect(modelos(f, 'nuance'), f).toEqual([GPT_OSS, GEMMA, LLAMA])
  })
})
