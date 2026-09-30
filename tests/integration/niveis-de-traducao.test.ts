/**
 * B3 (Fase B, 29/09/2026) — NÍVEIS POR PLANO × FUNÇÃO, e o cache pelo modelo que DE FATO respondeu.
 *
 * O QUE MUDA. Até aqui o plano escolhia o modelo por um booleano — `largerModels`, lido no servidor
 * desde a Fase 4 para trocar o `LLM_MODEL` pelo `LLM_MODEL_GRANDE`. A decisão do dono (29/09) é por
 * NÍVEL: o Grátis e o convidado recebem a *rápida* (o modelo barato), quem paga recebe a *nuance*
 * (o modelo que o registro marca para a nuance, com o mais barato como reserva). O nível sai do
 * entitlement `traducaoNuance` — a CAPACIDADE do plano, não o nome dele: a Fase C renomeia os planos.
 *
 * O LEGADO NÃO MUDA: sem `IA_PROVEDORES` nenhum modelo declara nível, a nuance cai inteira na rápida,
 * e o `LLM_MODEL_GRANDE` continua indo para quem tem `largerModels` — o mesmo de antes, conferido
 * contra a cascata antiga numa matriz de ambientes.
 *
 * A rota (o nível na tradução e no tutor, e o cache pelo modelo que respondeu) está em
 * `niveis-na-rota.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { FUNCOES_DE_IA } from '../../server/ai/funcoesDeIa'
import { cascataDoPlano, IA_NIVEIS, nivelDaFuncao } from '../../server/ai/niveis'
import { cascataDeNuvem } from '../../server/ai/provedores'
import { erroDoRegistroDeIa, esquecerRegistro, pernasDaFuncao } from '../../server/ai/registroDeProvedores'
import { getEntitlements } from '../../server/lib/entitlements'
import { PLANOS_DE_ASSINATURA } from '../../src/core/planos'

const DEEPINFRA = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'https://deepinfra.exemplo/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [
    { id: 'openai/gpt-oss-20b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.03, saida: 0.14 } },
    {
      id: 'openai/gpt-oss-120b',
      funcoes: ['traducao', 'tutor'],
      niveis: ['nuance'],
      preco: { entrada: 0.04, saida: 0.2 },
    },
  ],
}
const GROQ = {
  id: 'groq',
  formato: 'openai',
  base: 'https://groq.exemplo/openai/v1',
  chave: 'GROQ_API_KEY',
  retencao: 'zdr',
  modelos: [{ id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'] }],
}
const CHAVES = { DEEPINFRA_API_KEY: 'chave-deepinfra-falsa', GROQ_API_KEY: 'chave-groq-falsa' }
const declarado = (provedores: unknown[]) =>
  ({ IA_PROVEDORES: JSON.stringify({ provedores }), ...CHAVES }) as NodeJS.ProcessEnv
const nomes = (pernas: Array<{ fornecedor?: string; model: string }>) => pernas.map((p) => `${p.fornecedor}:${p.model}`)

afterEach(() => esquecerRegistro())

describe('IA_NIVEIS: o nível de cada função, pela capacidade do plano', () => {
  it('toda função de IA tem linha, e sem a nuance ela é sempre a rápida', () => {
    for (const f of Object.keys(FUNCOES_DE_IA)) {
      expect(IA_NIVEIS[f as keyof typeof IA_NIVEIS], f).toBeDefined()
      expect(IA_NIVEIS[f as keyof typeof IA_NIVEIS].semNuance, f).toBe('rapida')
    }
  })

  it('Grátis e convidado: rápida; os pagos e o selfhost: nuance — na tradução e no tutor', () => {
    for (const funcao of ['traducao', 'tutor'] as const) {
      expect(nivelDaFuncao(funcao, getEntitlements('free'))).toBe('rapida')
      expect(nivelDaFuncao(funcao, getEntitlements('convidado'))).toBe('rapida')
      for (const p of PLANOS_DE_ASSINATURA.filter((x) => x !== 'free')) {
        expect(nivelDaFuncao(funcao, getEntitlements(p)), `${funcao}/${p}`).toBe('nuance')
      }
    }
  })

  it('a decisão lê o entitlement, não o nome: um plano qualquer com traducaoNuance recebe a nuance', () => {
    expect(nivelDaFuncao('traducao', { traducaoNuance: true })).toBe('nuance')
    expect(nivelDaFuncao('traducao', { traducaoNuance: false })).toBe('rapida')
  })
})

describe('registro declarado: o modelo marcado para a nuance, com o mais barato de reserva', () => {
  it('rápida: só os modelos da rápida — o da nuance nunca chega a quem não paga', () => {
    const { nivel, pernas } = cascataDoPlano('traducao', getEntitlements('free'), declarado([DEEPINFRA, GROQ]))
    expect(nivel).toBe('rapida')
    expect(nomes(pernas)).toEqual(['deepinfra:openai/gpt-oss-20b', 'groq:openai/gpt-oss-120b'])
  })

  it('nuance: primeiro o modelo da nuance, depois a cascata da rápida inteira', () => {
    const { nivel, pernas } = cascataDoPlano('traducao', getEntitlements('essencial'), declarado([DEEPINFRA, GROQ]))
    expect(nivel).toBe('nuance')
    expect(nomes(pernas)).toEqual([
      'deepinfra:openai/gpt-oss-120b',
      'deepinfra:openai/gpt-oss-20b',
      'groq:openai/gpt-oss-120b',
    ])
    // Os papéis são por POSIÇÃO na cascata do nível, como sempre.
    expect(pernas.map((p) => p.rotulo)).toEqual(['llm-primario', 'llm-reserva', 'llm-reserva'])
  })

  it('o tutor segue a mesma regra, com os modelos declarados para o tutor', () => {
    const { pernas } = cascataDoPlano('tutor', getEntitlements('pro'), declarado([DEEPINFRA, GROQ]))
    expect(nomes(pernas)[0]).toBe('deepinfra:openai/gpt-oss-120b')
  })

  it('sem modelo marcado para a nuance, a nuance é a própria rápida', () => {
    const semNuance = { ...DEEPINFRA, modelos: [DEEPINFRA.modelos[0]] }
    const env = declarado([semNuance, GROQ])
    expect(nomes(cascataDoPlano('traducao', getEntitlements('pro'), env).pernas)).toEqual(
      nomes(cascataDoPlano('traducao', getEntitlements('free'), env).pernas),
    )
  })

  it('um modelo em duas faixas (rápida e nuance) aparece uma vez só', () => {
    const duplo = { ...GROQ, modelos: [{ ...GROQ.modelos[0], niveis: ['rapida', 'nuance'] }] }
    const pernas = pernasDaFuncao('traducao', { nivel: 'nuance' }, declarado([duplo]))
    expect(nomes(pernas)).toEqual(['groq:openai/gpt-oss-120b'])
  })

  it('polimento (Fase D) desce a escada: polimento, nuance, rápida', () => {
    const polimento = {
      ...GROQ,
      modelos: [{ id: 'modelo-do-polimento', funcoes: ['traducao'], niveis: ['polimento'] }],
    }
    const pernas = pernasDaFuncao('traducao', { nivel: 'polimento' }, declarado([polimento, DEEPINFRA]))
    expect(nomes(pernas)).toEqual([
      'groq:modelo-do-polimento',
      'deepinfra:openai/gpt-oss-120b',
      'deepinfra:openai/gpt-oss-20b',
    ])
  })

  it('"grande: true" (o provisório do B1) é a nuance: vale para quem tem traducaoNuance', () => {
    const comGrande = {
      ...DEEPINFRA,
      modelos: [DEEPINFRA.modelos[0], { id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'], grande: true }],
    }
    const env = declarado([comGrande, GROQ])
    expect(nomes(cascataDoPlano('traducao', getEntitlements('essencial'), env).pernas)[0]).toBe(
      'deepinfra:openai/gpt-oss-120b',
    )
    expect(nomes(cascataDoPlano('traducao', getEntitlements('free'), env).pernas)).not.toContain(
      'deepinfra:openai/gpt-oss-120b',
    )
  })

  it('"grande" e "niveis" no mesmo modelo é ambíguo — o registro é recusado', () => {
    const ambos = { ...GROQ, modelos: [{ ...GROQ.modelos[0], grande: true, niveis: ['nuance'] }] }
    expect(erroDoRegistroDeIa(declarado([ambos]))).toMatch(/grande.*niveis|niveis.*grande/)
  })

  it('"niveis" num modelo só de STT não quer dizer nada — recusado', () => {
    const stt = { ...GROQ, modelos: [{ id: 'whisper-large-v3-turbo', funcoes: ['stt'], niveis: ['nuance'] }] }
    expect(erroDoRegistroDeIa(declarado([stt]))).toMatch(/niveis/)
  })

  it('nível desconhecido no registro é recusado', () => {
    const errado = { ...GROQ, modelos: [{ ...GROQ.modelos[0], niveis: ['premium'] }] }
    expect(erroDoRegistroDeIa(declarado([errado]))).not.toBeNull()
  })
})

describe('legado: sem IA_PROVEDORES, a cascata de cada plano é a de antes', () => {
  const ambientes: NodeJS.ProcessEnv[] = []
  for (const grande of [undefined, 'modelo-caro']) {
    for (const reserva of [undefined, 'chave-or']) {
      ambientes.push({
        LLM_API_KEY: 'chave-llm',
        LLM_MODEL: 'modelo-de-todo-dia',
        ...(grande ? { LLM_MODEL_GRANDE: grande } : {}),
        ...(reserva ? { OPENROUTER_API_KEY: reserva } : {}),
      } as NodeJS.ProcessEnv)
    }
  }

  it('cada plano recebe exatamente as pernas que o largerModels dava', () => {
    for (const env of ambientes) {
      for (const p of [...PLANOS_DE_ASSINATURA, 'convidado' as const]) {
        const e = getEntitlements(p)
        for (const funcao of ['traducao', 'tutor', 'corretor'] as const) {
          const antes = cascataDeNuvem({ modelosGrandes: e.largerModels, funcao }, env)
          expect(cascataDoPlano(funcao, e, env).pernas, JSON.stringify({ env, p, funcao })).toEqual(antes)
        }
      }
    }
  })

  it('o Essencial (nuance, sem largerModels) continua no modelo comum; o Pro no grande', () => {
    const env = ambientes[2] // com LLM_MODEL_GRANDE, sem reserva
    expect(cascataDoPlano('traducao', getEntitlements('essencial'), env).pernas[0].model).toBe('modelo-de-todo-dia')
    expect(cascataDoPlano('traducao', getEntitlements('pro'), env).pernas[0].model).toBe('modelo-caro')
  })
})
