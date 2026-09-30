/**
 * B1 (Fase B, 29/09/2026) — O REGISTRO DECLARATIVO DE PROVEDORES DE IA (`IA_PROVEDORES`).
 *
 * O que muda: quem atende cada função de IA (tradução, tutor, STT) passa a ser DECLARADO num JSON
 * sem segredo — provedor, formato, retenção, limites, modelos por função com preço e o NOME da
 * variável da chave —, em vez de uma cadeia de `LLM_* || GROQ_*` espalhada. O que NÃO muda: sem
 * `IA_PROVEDORES`, um registro LEGADO é derivado do ambiente de hoje e reproduz o comportamento de
 * antes. Este arquivo prende as duas metades:
 *
 *   1. EQUIVALÊNCIA — o `oraculo` abaixo é a cópia literal de `server/ai/provedores.ts` antes do B1
 *      (commit e1a468b), só com o ambiente por parâmetro. Numa matriz de ambientes, a cascata nova
 *      tem de devolver exatamente as mesmas pernas (rótulo, base, chave, modelo) que o oráculo;
 *   2. AS RECUSAS — Gemini em qualquer forma (o app atende menores), OpenRouter sem o roteamento de
 *      retenção zero que ignora o Google, provedor sem `retencao: 'zdr'` em produção, segredo dentro
 *      do JSON, variável de chave que não é de IA.
 *
 * Nenhuma chave de verdade aqui: todo segredo é um valor falso óbvio, lido de um `env` montado no teste.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parametrosDoProvedor } from '../../server/ai/llmClient'
import { avisoDeIaSemReserva, cascataDeNuvem, llmDeNuvem, llmDeReserva } from '../../server/ai/provedores'
import {
  avisosDoRegistroDeIa,
  erroDoRegistroDeIa,
  esquecerRegistro,
  fornecedorDaBase,
  pernasDaFuncao,
  registroAtivo,
  rotulosDoRegistro,
  sttDeNuvemConfigurado,
  sttGerenciado,
} from '../../server/ai/registroDeProvedores'
import { nomeDoProvedor } from '../../server/ai/telemetriaDeIa'
import { sttGerenciadoDoEnv } from '../../server/lib/config'

afterEach(() => esquecerRegistro())

/* ─────────────────────────── 1. o oráculo: provedores.ts antes do B1 ─────────────────────────── */

const ORACULO_MODELO_PADRAO = 'openai/gpt-oss-120b'
const semBarra = (u: string) => u.replace(/\/+$/, '')
interface PernaDoOraculo {
  rotulo: string
  base: string
  apiKey?: string | null
  model: string
}
function oraculoPrimario(env: NodeJS.ProcessEnv, modelosGrandes?: boolean): PernaDoOraculo | null {
  const apiKey = env.LLM_API_KEY || env.GROQ_API_KEY
  if (!apiKey) return null
  const padrao = env.LLM_MODEL || env.GROQ_LLM_MODEL || env.GROQ_MODEL || ORACULO_MODELO_PADRAO
  return {
    rotulo: 'llm-primario',
    base: semBarra(env.LLM_BASE_URL || env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'),
    apiKey,
    model: (modelosGrandes && (env.LLM_MODEL_GRANDE?.trim() || null)) || padrao,
  }
}
function oraculoReserva(env: NodeJS.ProcessEnv): PernaDoOraculo | null {
  const { LLM_RESERVA_BASE_URL, LLM_RESERVA_API_KEY, LLM_RESERVA_MODEL, OPENROUTER_API_KEY } = env
  if (LLM_RESERVA_BASE_URL && LLM_RESERVA_API_KEY && LLM_RESERVA_MODEL) {
    return {
      rotulo: 'llm-reserva',
      base: semBarra(LLM_RESERVA_BASE_URL),
      apiKey: LLM_RESERVA_API_KEY,
      model: LLM_RESERVA_MODEL,
    }
  }
  if (OPENROUTER_API_KEY) {
    return {
      rotulo: 'llm-reserva',
      base: 'https://openrouter.ai/api/v1',
      apiKey: OPENROUTER_API_KEY,
      model: LLM_RESERVA_MODEL || ORACULO_MODELO_PADRAO,
    }
  }
  return null
}
function oraculoCascata(env: NodeJS.ProcessEnv, modelosGrandes?: boolean): PernaDoOraculo[] {
  const p = oraculoPrimario(env, modelosGrandes)
  const r = oraculoReserva(env)
  return [...(p ? [p] : []), ...(r ? [r] : [])]
}
const projetar = (p: PernaDoOraculo | null) =>
  p ? { rotulo: p.rotulo, base: p.base, apiKey: p.apiKey, model: p.model } : null

/** O produto cartesiano das opções — cada chave assume um dos valores (ou fica ausente). */
function matriz(opcoes: Record<string, Array<string | undefined>>): NodeJS.ProcessEnv[] {
  let envs: Record<string, string>[] = [{}]
  for (const [nome, valores] of Object.entries(opcoes)) {
    envs = envs.flatMap((e) => valores.map((v) => (v === undefined ? { ...e } : { ...e, [nome]: v })))
  }
  return envs as NodeJS.ProcessEnv[]
}

describe('registro legado — sem IA_PROVEDORES, a cascata é a de antes', () => {
  const ambientes = matriz({
    LLM_API_KEY: [undefined, 'chave-llm-falsa'],
    GROQ_API_KEY: [undefined, 'chave-groq-falsa', ''],
    LLM_BASE_URL: [undefined, 'https://primario.exemplo/v1/'],
    GROQ_BASE_URL: [undefined, 'http://203.0.113.20/v1'],
    LLM_MODEL: [undefined, 'modelo-de-todo-dia'],
    GROQ_LLM_MODEL: [undefined, 'modelo-groq-antigo'],
    LLM_MODEL_GRANDE: [undefined, 'modelo-caro', '   '],
    LLM_RESERVA_BASE_URL: [undefined, 'https://reserva.exemplo/v1//'],
    LLM_RESERVA_API_KEY: [undefined, 'chave-reserva-falsa'],
    LLM_RESERVA_MODEL: [undefined, 'modelo-da-reserva'],
    OPENROUTER_API_KEY: [undefined, 'chave-or-falsa'],
  })

  it(`a matriz tem ambientes de sobra (${ambientes.length}) — incluindo primário só, reserva só e nenhum`, () => {
    expect(ambientes.length).toBeGreaterThan(1000)
  })

  it('cascataDeNuvem devolve as MESMAS pernas que o oráculo, com e sem modelos grandes', () => {
    for (const env of ambientes) {
      for (const grandes of [undefined, false, true]) {
        const nova = cascataDeNuvem({ modelosGrandes: grandes }, env).map(projetar)
        expect(nova, JSON.stringify({ env, grandes })).toEqual(oraculoCascata(env, grandes).map(projetar))
      }
    }
  })

  it('llmDeNuvem e llmDeReserva também', () => {
    for (const env of ambientes) {
      expect(projetar(llmDeNuvem({ modelosGrandes: true }, env)), JSON.stringify(env)).toEqual(
        projetar(oraculoPrimario(env, true)),
      )
      expect(projetar(llmDeReserva(env)), JSON.stringify(env)).toEqual(projetar(oraculoReserva(env)))
    }
  })

  it('o fornecedor de cada perna é o nome neutro que a telemetria já usava (groq, openrouter, outro)', () => {
    const env = { LLM_API_KEY: 'k', OPENROUTER_API_KEY: 'k2' } as NodeJS.ProcessEnv
    expect(cascataDeNuvem({}, env).map((p) => p.fornecedor)).toEqual(['groq', 'openrouter'])
    const outro = { LLM_API_KEY: 'k', LLM_BASE_URL: 'https://primario.exemplo/v1' } as NodeJS.ProcessEnv
    expect(cascataDeNuvem({}, outro)[0].fornecedor).toBe('outro')
  })

  it('o STT legado é exatamente o `sttGerenciadoDoEnv` do B0', () => {
    const sttAmbientes = matriz({
      LLM_API_KEY: [undefined, 'chave-llm-falsa'],
      LLM_BASE_URL: [undefined, 'https://api.groq.com/openai/v1', 'http://llm-falso.local/v1'],
      GROQ_API_KEY: [undefined, '', 'chave-groq-falsa'],
      STT_API_KEY: [undefined, 'chave-stt-falsa'],
      STT_BASE_URL: [undefined, 'http://203.0.113.20/v1'],
      STT_MODEL: [undefined, 'whisper-large-v3'],
    })
    for (const env of sttAmbientes) {
      const b0 = sttGerenciadoDoEnv(env)
      const r = sttGerenciado(env)
      expect(r ? { secret: r.secret, baseUrl: r.baseUrl, model: r.model } : null, JSON.stringify(env)).toEqual(
        b0 ? { secret: b0.secret, baseUrl: b0.baseUrl, model: b0.model } : null,
      )
      expect(sttDeNuvemConfigurado(env)).toBe(b0 !== null)
    }
  })

  it('em produção, o legado fora da Groq/OpenRouter AVISA (retenção zero não declarada) — sem recusar', () => {
    const outro = { NODE_ENV: 'production', LLM_API_KEY: 'k', LLM_BASE_URL: 'https://primario.exemplo/v1' }
    expect(avisosDoRegistroDeIa(outro as NodeJS.ProcessEnv)).toEqual([expect.stringMatching(/retenção zero/)])
    expect(cascataDeNuvem({}, outro as NodeJS.ProcessEnv)).toHaveLength(1)
    const doLancamento = { NODE_ENV: 'production', LLM_API_KEY: 'k', OPENROUTER_API_KEY: 'k2' } as NodeJS.ProcessEnv
    expect(avisosDoRegistroDeIa(doLancamento)).toEqual([])
    expect(avisosDoRegistroDeIa({ ...outro, NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toEqual([])
  })

  it('a base do Gemini no legado é RECUSADA: nenhuma perna, e o boot acusa', () => {
    const env = {
      LLM_API_KEY: 'chave-llm-falsa',
      LLM_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    } as NodeJS.ProcessEnv
    expect(cascataDeNuvem({}, env)).toEqual([])
    expect(erroDoRegistroDeIa(env)).toMatch(/gemini/i)
  })
})

/* ─────────────────────────── 2. o registro declarado ─────────────────────────── */

const GROQ = {
  id: 'groq',
  formato: 'openai',
  base: 'https://api.groq.com/openai/v1',
  chave: 'GROQ_API_KEY',
  retencao: 'zdr',
  limites: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  modelos: [
    {
      id: 'openai/gpt-oss-120b',
      funcoes: ['traducao', 'tutor'],
      preco: { entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 },
    },
    {
      id: 'whisper-large-v3-turbo',
      funcoes: ['stt'],
      preco: { hora: 0.04, minimoFaturadoS: 10 },
      limites: { rpm: 20 },
    },
  ],
}
const DEEPINFRA = {
  id: 'deepinfra',
  formato: 'openai',
  base: 'https://api.deepinfra.com/v1/openai',
  chave: 'DEEPINFRA_API_KEY',
  retencao: 'zdr',
  modelos: [
    { id: 'openai/gpt-oss-20b', funcoes: ['traducao'], preco: { entrada: 0.03, saida: 0.14 } },
    { id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.037, saida: 0.17 }, grande: true },
  ],
}
const OPENROUTER = {
  id: 'openrouter',
  formato: 'openai',
  base: 'https://openrouter.ai/api/v1',
  chave: 'OPENROUTER_API_KEY',
  retencao: 'zdr',
  roteamento: { data_collection: 'deny', zdr: true, ignore: ['google-ai-studio', 'google-vertex'] },
  modelos: [{ id: 'openai/gpt-oss-120b', funcoes: ['traducao', 'tutor'] }],
}
const CLOUDFLARE = {
  id: 'cloudflare',
  formato: 'cloudflare',
  conta: 'CLOUDFLARE_ACCOUNT_ID',
  chave: 'CLOUDFLARE_API_TOKEN',
  retencao: 'zdr',
  modelos: [{ id: '@cf/openai/whisper-large-v3-turbo', funcoes: ['stt'], preco: { hora: 0.0306, minimoFaturadoS: 0 } }],
}
const CHAVES = {
  GROQ_API_KEY: 'chave-groq-falsa',
  DEEPINFRA_API_KEY: 'chave-deepinfra-falsa',
  OPENROUTER_API_KEY: 'chave-or-falsa',
  CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  CLOUDFLARE_API_TOKEN: 'token-cf-falso',
}
const declarado = (provedores: unknown[], extra: Record<string, string> = {}) =>
  ({ IA_PROVEDORES: JSON.stringify({ provedores }), ...CHAVES, ...extra }) as NodeJS.ProcessEnv

describe('registro declarado — IA_PROVEDORES', () => {
  it('a cascata segue a ORDEM do registro, e a chave sai da variável NOMEADA', () => {
    const env = declarado([DEEPINFRA, GROQ, OPENROUTER])
    const pernas = cascataDeNuvem({}, env)
    expect(pernas.map((p) => [p.fornecedor, p.model, p.apiKey])).toEqual([
      ['deepinfra', 'openai/gpt-oss-20b', 'chave-deepinfra-falsa'],
      ['groq', 'openai/gpt-oss-120b', 'chave-groq-falsa'],
      ['openrouter', 'openai/gpt-oss-120b', 'chave-or-falsa'],
    ])
    // Rótulos por POSIÇÃO: os mesmos papéis que o painel e o log já conhecem.
    expect(pernas.map((p) => p.rotulo)).toEqual(['llm-primario', 'llm-reserva', 'llm-reserva'])
    expect(registroAtivo(env).origem).toBe('declarado')
  })

  it('o tutor só recebe os modelos declarados para o tutor (o corretor vai junto)', () => {
    const env = declarado([DEEPINFRA, GROQ])
    expect(pernasDaFuncao('tutor', {}, env).map((p) => `${p.fornecedor}:${p.model}`)).toEqual([
      'groq:openai/gpt-oss-120b',
    ])
    expect(pernasDaFuncao('corretor', {}, env).map((p) => p.model)).toEqual(['openai/gpt-oss-120b'])
  })

  it('o modelo "grande" de um provedor substitui o comum dele para quem tem o entitlement', () => {
    const env = declarado([DEEPINFRA, GROQ])
    expect(cascataDeNuvem({ modelosGrandes: false }, env).map((p) => `${p.fornecedor}:${p.model}`)).toEqual([
      'deepinfra:openai/gpt-oss-20b',
      'groq:openai/gpt-oss-120b',
    ])
    expect(cascataDeNuvem({ modelosGrandes: true }, env).map((p) => `${p.fornecedor}:${p.model}`)).toEqual([
      'deepinfra:openai/gpt-oss-120b',
      'groq:openai/gpt-oss-120b',
    ])
  })

  it('provedor sem a chave no ambiente é pulado (a perna não existe sem segredo)', () => {
    const { DEEPINFRA_API_KEY: _fora, ...semDeepinfra } = CHAVES
    const env = { IA_PROVEDORES: JSON.stringify({ provedores: [DEEPINFRA, GROQ] }), ...semDeepinfra }
    expect(cascataDeNuvem({}, env as NodeJS.ProcessEnv).map((p) => p.fornecedor)).toEqual(['groq'])
  })

  it('cada perna carrega o preço, o roteamento e os limites que o registro declarou', () => {
    const env = declarado([GROQ, OPENROUTER])
    const [groq, or] = cascataDeNuvem({}, env)
    expect(groq.preco).toEqual({ entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 })
    expect(groq.limites).toEqual({ rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 })
    expect(or.roteamento).toEqual({ data_collection: 'deny', zdr: true, ignore: ['google-ai-studio', 'google-vertex'] })
  })

  it('STT: a primeira perna no formato openai; Cloudflare (base64) só entra com o B6', () => {
    expect(sttGerenciado(declarado([GROQ, CLOUDFLARE]))).toMatchObject({
      secret: 'chave-groq-falsa',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'whisper-large-v3-turbo',
      fornecedor: 'groq',
      preco: { hora: 0.04, minimoFaturadoS: 10 },
    })
    expect(sttGerenciado(declarado([CLOUDFLARE]))).toBeNull()
    expect(sttDeNuvemConfigurado(declarado([CLOUDFLARE]))).toBe(false)
    // As pernas do registro existem mesmo assim: é o que o B6 vai percorrer.
    expect(pernasDaFuncao('stt', {}, declarado([CLOUDFLARE, GROQ])).map((p) => [p.fornecedor, p.formato])).toEqual([
      ['cloudflare', 'cloudflare'],
      ['groq', 'openai'],
    ])
  })

  it('Cloudflare: a conta entra na base, e sem a conta no ambiente a perna não existe', () => {
    const [cf] = pernasDaFuncao('stt', {}, declarado([CLOUDFLARE]))
    expect(cf.base).toBe('https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1')
    expect(pernasDaFuncao('stt', {}, declarado([CLOUDFLARE], { CLOUDFLARE_ACCOUNT_ID: '' }))).toEqual([])
  })

  it('IA_PROVEDORES_ARQUIVO: o mesmo JSON, lido de um arquivo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registro-ia-'))
    try {
      const arquivo = join(dir, 'provedores.json')
      writeFileSync(arquivo, JSON.stringify({ provedores: [GROQ] }))
      const env = { IA_PROVEDORES_ARQUIVO: arquivo, ...CHAVES } as NodeJS.ProcessEnv
      expect(cascataDeNuvem({}, env).map((p) => p.fornecedor)).toEqual(['groq'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a telemetria rotula pelo id DECLARADO, e os rótulos formam uma lista fechada', () => {
    const env = declarado([{ ...GROQ, id: 'groq-prod' }, DEEPINFRA])
    expect(fornecedorDaBase('https://api.groq.com/openai/v1', env)).toBe('groq-prod')
    const r = rotulosDoRegistro(env)
    expect([...r.fornecedores]).toEqual(expect.arrayContaining(['groq-prod', 'deepinfra']))
    expect([...r.modelos]).toEqual(
      expect.arrayContaining(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'whisper-large-v3-turbo']),
    )
  })

  it('sem registro, os hosts conhecidos ganham nome: DeepInfra, Cerebras e Cloudflare, além dos de antes', () => {
    expect(nomeDoProvedor('https://api.deepinfra.com/v1/openai')).toBe('deepinfra')
    expect(nomeDoProvedor('https://api.cerebras.ai/v1')).toBe('cerebras')
    expect(nomeDoProvedor('https://api.cloudflare.com/client/v4/accounts/x/ai/v1')).toBe('cloudflare')
    expect(nomeDoProvedor('https://api.groq.com/openai/v1')).toBe('groq')
    expect(nomeDoProvedor('https://openrouter.ai/api/v1')).toBe('openrouter')
    expect(nomeDoProvedor('https://primario.exemplo/v1')).toBe('outro')
  })

  it('aviso de reserva: com um provedor só, as funções dele ficam sem reserva — o STT incluído', () => {
    const aviso = avisoDeIaSemReserva({ ...declarado([GROQ]), NODE_ENV: 'production' })
    expect(aviso).toMatch(/tradução/)
    expect(aviso).toMatch(/STT/)
    expect(
      avisoDeIaSemReserva({ ...declarado([GROQ, DEEPINFRA, OPENROUTER, CLOUDFLARE]), NODE_ENV: 'production' }),
    ).toBeNull()
  })
})

/* ─────────────────────────── 3. as recusas ─────────────────────────── */

describe('registro declarado — o que é RECUSADO', () => {
  /** Recusado = registro inválido: o boot acusa e a nuvem fica FECHADA (nenhuma perna), nunca o legado. */
  function recusado(env: NodeJS.ProcessEnv, motivo: RegExp) {
    expect(erroDoRegistroDeIa(env)).toMatch(motivo)
    expect(registroAtivo(env).provedores).toEqual([])
    expect(cascataDeNuvem({}, { ...env, LLM_API_KEY: 'chave-legada-falsa' })).toEqual([])
  }

  it('Gemini pela base (Generative Language, Vertex, AI Gateway da Cloudflare) ou pelo modelo', () => {
    const gemini = { ...GROQ, id: 'google', base: 'https://generativelanguage.googleapis.com/v1beta/openai' }
    recusado(declarado([gemini]), /gemini/i)
    const vertex = {
      ...GROQ,
      id: 'vertex',
      base: 'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/l/endpoints/openapi',
    }
    recusado(declarado([vertex]), /gemini/i)
    const gateway = { ...GROQ, id: 'gateway', base: 'https://gateway.ai.cloudflare.com/v1/conta/gw/google-ai-studio' }
    recusado(declarado([gateway]), /gemini/i)
    const modelo = { ...OPENROUTER, modelos: [{ id: 'google/gemini-3.8-flash', funcoes: ['traducao'] }] }
    recusado(declarado([modelo]), /gemini/i)
  })

  it('Gemma (pesos abertos, Apache) NÃO é Gemini: pode', () => {
    const gemma = { ...DEEPINFRA, modelos: [{ id: 'google/gemma-4-26b-a4b-it', funcoes: ['traducao'] }] }
    expect(erroDoRegistroDeIa(declarado([gemma]))).toBeNull()
  })

  it('OpenRouter exige o roteamento de retenção zero que ignora os provedores do Google', () => {
    const { roteamento: _r, ...semRoteamento } = OPENROUTER
    recusado(declarado([semRoteamento]), /roteamento|openrouter/i)
    recusado(
      declarado([{ ...OPENROUTER, roteamento: { ...OPENROUTER.roteamento, data_collection: 'allow' } }]),
      /data_collection|roteamento/i,
    )
    recusado(declarado([{ ...OPENROUTER, roteamento: { ...OPENROUTER.roteamento, zdr: false } }]), /zdr|roteamento/i)
    recusado(
      declarado([{ ...OPENROUTER, roteamento: { ...OPENROUTER.roteamento, ignore: ['google-vertex'] } }]),
      /google-ai-studio/,
    )
    recusado(
      declarado([{ ...OPENROUTER, roteamento: { ...OPENROUTER.roteamento, only: ['google-vertex'] } }]),
      /google/i,
    )
    // O mesmo roteador pelo AI Gateway da Cloudflare: a mesma exigência.
    const { roteamento: _g, ...pelaCloudflare } = {
      ...OPENROUTER,
      base: 'https://gateway.ai.cloudflare.com/v1/c/gw/openrouter',
    }
    recusado(declarado([pelaCloudflare]), /roteamento/i)
  })

  it('em produção, provedor sem retencao "zdr" é recusado — e a base precisa ser https', () => {
    const semZdr = { ...DEEPINFRA, retencao: 'desconhecida' }
    expect(erroDoRegistroDeIa(declarado([semZdr]))).toBeNull() // fora de produção, passa (com aviso)
    recusado({ ...declarado([semZdr]), NODE_ENV: 'production' }, /zdr|retenção/i)
    const http = { ...DEEPINFRA, base: 'http://api.deepinfra.com/v1/openai' }
    expect(erroDoRegistroDeIa(declarado([http]))).toBeNull()
    recusado({ ...declarado([http]), NODE_ENV: 'production' }, /https/i)
  })

  it('segredo dentro do JSON é recusado — o registro guarda o NOME da variável, nunca o valor', () => {
    recusado(declarado([{ ...GROQ, apiKey: 'sk-falsa-1234' }]), /segredo/i)
    recusado(declarado([{ ...GROQ, chave: 'gsk_falsa_1234' }]), /chave/i)
    recusado(declarado([{ ...GROQ, base: 'https://api.groq.com/openai/v1?key=falsa' }]), /base/i)
  })

  it('a chave precisa ser uma variável de IA: nada de apontar para o segredo do Supabase ou do Asaas', () => {
    recusado(declarado([{ ...GROQ, chave: 'SUPABASE_SERVICE_ROLE_KEY' }]), /chave/i)
    recusado(declarado([{ ...GROQ, chave: 'ASAAS_API_KEY' }]), /chave/i)
  })

  it('JSON quebrado, id repetido, campo desconhecido e Cloudflare sem conta', () => {
    recusado({ IA_PROVEDORES: '{ provedores: [' } as NodeJS.ProcessEnv, /JSON/i)
    recusado(declarado([GROQ, GROQ]), /repetido/i)
    recusado(declarado([{ ...GROQ, modelo: 'x' }]), /modelo/i)
    const { conta: _c, ...semConta } = CLOUDFLARE
    recusado(declarado([semConta]), /conta/i)
  })

  it('IA_PROVEDORES e IA_PROVEDORES_ARQUIVO juntos: ambíguo, recusado', () => {
    recusado({ ...declarado([GROQ]), IA_PROVEDORES_ARQUIVO: '/tmp/x.json' }, /IA_PROVEDORES_ARQUIVO/)
  })
})

/* ─────────────────────────── 4. o roteamento do OpenRouter no pedido ─────────────────────────── */

describe('o pedido ao OpenRouter sai SEMPRE com retenção zero e sem o Google', () => {
  it('sem roteamento declarado (o legado): o mínimo obrigatório', () => {
    expect(parametrosDoProvedor('https://openrouter.ai/api/v1', 'openai/gpt-oss-120b').provider).toEqual({
      data_collection: 'deny',
      zdr: true,
      ignore: ['google-ai-studio', 'google-vertex'],
    })
  })

  it('com roteamento declarado: o operador acrescenta (only/order), nunca afrouxa', () => {
    const p = parametrosDoProvedor('https://openrouter.ai/api/v1', 'openai/gpt-oss-120b', {
      data_collection: 'deny',
      zdr: true,
      ignore: ['google-ai-studio', 'google-vertex', 'provedor-x'],
      order: ['deepinfra', 'groq'],
    }).provider as Record<string, unknown>
    expect(p).toMatchObject({ data_collection: 'deny', zdr: true, order: ['deepinfra', 'groq'] })
    expect(p.ignore).toEqual(expect.arrayContaining(['google-ai-studio', 'google-vertex', 'provedor-x']))
  })

  it('pelo AI Gateway da Cloudflare o pedido ao OpenRouter leva o mesmo roteamento', () => {
    expect(
      parametrosDoProvedor('https://gateway.ai.cloudflare.com/v1/c/gw/openrouter', 'openai/gpt-oss-120b').provider,
    ).toMatchObject({ data_collection: 'deny', zdr: true })
  })
})
