/**
 * O REGISTRO DE PROVEDORES DE IA — quem atende cada função, declarado num lugar (B1 da Fase B,
 * 29/09/2026).
 *
 * POR QUE EXISTE. Até aqui o provedor era uma cadeia de variáveis — `LLM_API_KEY || GROQ_API_KEY`,
 * `LLM_BASE_URL || GROQ_BASE_URL || groq`, `LLM_RESERVA_*` ou o atalho `OPENROUTER_API_KEY` —, e o
 * que a Fase B precisa não cabe nela: um terceiro provedor (DeepInfra, Cerebras, Cloudflare), um
 * preço por `provedor:modelo` (o mesmo `gpt-oss-120b` custa 4× mais na Groq que na DeepInfra), o
 * mínimo faturado do STT de cada um, a retenção de dados declarada por salto. Uma variável nova por
 * dimensão seria o mesmo espalhamento que o achado A31 (`provedores.ts`) já tinha consertado uma vez.
 *
 * O FORMATO (`IA_PROVEDORES`, JSON — ou `IA_PROVEDORES_ARQUIVO`, o caminho de um arquivo com ele):
 *
 *   { "provedores": [
 *       { "id": "deepinfra", "formato": "openai", "base": "https://api.deepinfra.com/v1/openai",
 *         "chave": "DEEPINFRA_API_KEY", "retencao": "zdr", "limites": { "rpm": 60 },
 *         "modelos": [ { "id": "openai/gpt-oss-20b", "funcoes": ["traducao"],
 *                        "preco": { "entrada": 0.03, "saida": 0.14 } } ] },
 *       { "id": "groq", ..., "modelos": [ { "id": "whisper-large-v3-turbo", "funcoes": ["stt"],
 *                        "preco": { "hora": 0.04, "minimoFaturadoS": 10 } } ] } ] }
 *
 *   - A ORDEM do array é a ordem da cascata de cada função: o primeiro provedor com modelo para a
 *     função é o primário; os seguintes, reservas. `percorrerCascata` já aceita N pernas.
 *   - SEM SEGREDO. `chave` e `conta` são NOMES de variáveis de ambiente (`DEEPINFRA_API_KEY`,
 *     `CLOUDFLARE_ACCOUNT_ID`); o valor é lido do ambiente na hora da chamada. Campo com cara de
 *     segredo (`apiKey`, `token`…) e `chave` que não é nome de variável de IA são recusados.
 *   - `preco`: US$ por 1M de tokens (`entrada`, `entradaEmCache`, `saida`) ou por hora de áudio
 *     (`hora`, com o `minimoFaturadoS` por pedido). Ausente, vale a tabela embutida em
 *     `server/lib/orcamentoDeIa.ts` — e, sem ela, o preço CONSERVADOR de lá.
 *   - `niveis` (B3): os NÍVEIS da tradução e do tutor que o modelo atende — `rapida`, `nuance`,
 *     `polimento` (`src/core/nivelDeTraducao.ts`). Ausente, `["rapida"]`. A cascata de um nível
 *     começa pelos modelos DELE e desce a escada (nuance → rápida): o modelo marcado para a nuance
 *     nunca chega a quem só tem a rápida, e quem paga tem o barato de reserva. Quem decide o nível
 *     de cada plano é `server/ai/niveis.ts`, pela capacidade (`traducaoNuance`), nunca pelo nome;
 *   - `grande: true` — o PROVISÓRIO do B1, resolvido no B3: no registro declarado é sinônimo de
 *     `niveis: ["nuance"]` (o modelo melhor de quem paga), e declarar os dois no mesmo modelo é
 *     recusado. No LEGADO o `LLM_MODEL_GRANDE` continua sendo o que sempre foi — o modelo de quem tem
 *     `largerModels`, no lugar do comum do mesmo provedor —, para o ambiente de hoje não mudar.
 *
 * AS RECUSAS (o registro inteiro fica inválido, e a nuvem fica FECHADA — nunca volta ao legado em
 * silêncio, que mandaria o tráfego para um provedor que o operador acabou de tirar):
 *   - Gemini em qualquer forma: a base da Generative Language, o Vertex, o AI Gateway da Cloudflare
 *     apontando para o Google, ou um modelo `gemini`. O app atende menores e os termos do Gemini
 *     proíbem esse uso (Fase 2 do lançamento). Gemma, de pesos abertos, não é Gemini;
 *   - OpenRouter sem `roteamento` com `data_collection: 'deny'`, `zdr: true` e `ignore` com os dois
 *     provedores do Google (docs do OpenRouter, "Provider Routing", consultadas em 29/09/2026);
 *   - em PRODUÇÃO: provedor sem `retencao: 'zdr'`, e base que não é https. O boot aborta
 *     (`server.ts`), como nas outras travas de produção.
 *
 * O LEGADO. Sem `IA_PROVEDORES`, `registroLegado` monta o MESMO formato a partir do ambiente de hoje
 * e a cascata sai idêntica à de antes — o teste de equivalência (`registro-de-provedores.test.ts`)
 * compara, numa matriz de milhares de ambientes, contra a cópia literal do `provedores.ts` anterior.
 *
 * DEPENDÊNCIAS, DE PROPÓSITO: só `zod`, `node:fs`, `config`, `logger` e contratos puros. Métricas, telemetria e o
 * cliente de LLM importam ESTE módulo para rotular e endurecer o pedido; o contrário criaria ciclo.
 */
import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { NIVEIS_DA_TRADUCAO, niveisAtendidos, type NivelDaTraducao } from '../../src/core/nivelDeTraducao'
import { type PrecoDeModelo, sttGerenciadoDoEnv } from '../lib/config'
import { log } from '../lib/logger'
import {
  ehBaseDoOpenRouter,
  PROVEDORES_DO_GOOGLE_NO_OPENROUTER,
  ROTEAMENTO_OPENROUTER,
  type RoteamentoOpenRouter,
} from './parametrosDoProvedor'

/* ─────────────────────────────── o vocabulário ─────────────────────────────── */

/** Como o provedor fala. `cloudflare` = Workers AI (o LLM pelo endpoint OpenAI dela; o STT em base64, no B6). */
export const FORMATOS_DE_PROVEDOR = ['openai', 'cloudflare'] as const
export type FormatoDeProvedor = (typeof FORMATOS_DE_PROVEDOR)[number]

/** As funções que o registro distribui. O `corretor` usa os modelos do `tutor` (a mesma rota). */
export const FUNCOES_DO_REGISTRO = ['traducao', 'tutor', 'stt'] as const
export type FuncaoDoRegistro = (typeof FUNCOES_DO_REGISTRO)[number]

/**
 * Limites da conta do app naquele provedor (ou modelo), quando conhecidos — a capacidade dos baldes
 * da admissão (`admissao.ts`, B4). Dimensão ausente = sem teto nela.
 */
export interface LimitesDeclarados {
  rpm?: number
  rpd?: number
  tpm?: number
  tpd?: number
}

export interface ModeloDeclarado {
  id: string
  funcoes: FuncaoDoRegistro[]
  preco?: PrecoDeModelo
  limites?: LimitesDeclarados
  /** Depois da validação, só no LEGADO: o `LLM_MODEL_GRANDE`, de quem tem `largerModels`. */
  grande?: boolean
  /** Os níveis da tradução/tutor que o modelo atende (B3). Ausente = `["rapida"]`. */
  niveis?: NivelDaTraducao[]
}

export interface ProvedorDeclarado {
  /** O nome NEUTRO do fornecedor — rótulo de métrica, chave de preço (`id:modelo`) e de telemetria. */
  id: string
  formato: FormatoDeProvedor
  /** A raiz da API (`…/v1`). Na Cloudflare pode faltar (é derivada da conta) ou trazer `{conta}`. */
  base?: string
  /** NOME da variável com a chave. */
  chave: string
  /** NOME da variável com a conta (Cloudflare). */
  conta?: string
  retencao: 'zdr' | 'desconhecida'
  limites?: LimitesDeclarados
  roteamento?: RoteamentoOpenRouter
  modelos: ModeloDeclarado[]
  /** Só no legado: o papel fixo de sempre (`llm-primario`, `llm-reserva`, `stt-gerenciado`). */
  rotulo?: string
}

export interface RegistroDeProvedores {
  origem: 'declarado' | 'legado' | 'invalido'
  provedores: ProvedorDeclarado[]
}

/**
 * UMA PERNA RESOLVIDA — um provedor e um modelo, com o segredo já lido do ambiente. É o `Provedor`
 * que a cascata percorre (`server/ai/provedores.ts` o reexporta com esse nome). Os campos depois de
 * `model` são opcionais porque o Ollama local (`llmLocal`) e os testes montam pernas à mão.
 */
export interface Provedor {
  rotulo: string
  base: string
  apiKey?: string | null
  model: string
  fornecedor?: string
  formato?: FormatoDeProvedor
  preco?: PrecoDeModelo
  roteamento?: RoteamentoOpenRouter
  limites?: LimitesDeclarados
  /** Os `limites` são da CONTA no provedor (declarados nele, não no modelo): um balde só na admissão (B4). */
  limitesDaConta?: boolean
  /** Os níveis que a perna atende, como declarados (B3). Ausente = `["rapida"]`. */
  niveis?: NivelDaTraducao[]
}

/* ─────────────────────────────── os fornecedores que o código conhece ─────────────────────────────── */

const BASE_GROQ = 'https://api.groq.com/openai/v1'
/** A base do OpenRouter, para o atalho `OPENROUTER_API_KEY` da reserva legada. */
export const BASE_OPENROUTER = 'https://openrouter.ai/api/v1'
const BASE_CLOUDFLARE = 'https://api.cloudflare.com/client/v4/accounts/{conta}/ai/v1'
/** O default do LLM de nuvem. Medido no gold set (docs/auditoria/eval-producao-v1.md). */
export const MODELO_LLM_PADRAO = 'openai/gpt-oss-120b'

/* O roteamento mínimo do OpenRouter e o reconhecimento da base moram em `parametrosDoProvedor.ts`
   (módulo sem imports, que a bancada também carrega); daqui, o repasse para quem já importava. */
export { ehBaseDoOpenRouter, PROVEDORES_DO_GOOGLE_NO_OPENROUTER, ROTEAMENTO_OPENROUTER, type RoteamentoOpenRouter }

const semBarra = (u: string) => u.replace(/\/+$/, '')

function hostDe(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const ehOpenRouter = (host: string) => host === 'openrouter.ai' || host.endsWith('.openrouter.ai')

/**
 * O nome neutro pelo HOST: `groq`, `openrouter`, `deepinfra`, `cerebras`, `cloudflare`, `ollama` ou
 * `outro`. Nunca a URL — no BYOK ela é escolha do usuário, e mesmo no gerenciado não vai a terceiro.
 */
export function fornecedorDoHost(base: string): string {
  const host = hostDe(base)
  if (!host) return 'outro'
  if (host === 'api.groq.com') return 'groq'
  if (ehOpenRouter(host)) return 'openrouter'
  if (host === 'api.deepinfra.com') return 'deepinfra'
  if (host === 'api.cerebras.ai') return 'cerebras'
  if (host === 'api.cloudflare.com' || host === 'gateway.ai.cloudflare.com') return 'cloudflare'
  if (host === 'localhost' || host === '127.0.0.1' || host === 'ollama') return 'ollama'
  return 'outro'
}

/** A lista FECHADA de fornecedores que o código conhece — base dos rótulos de métrica. */
export const FORNECEDORES_CONHECIDOS: readonly string[] = [
  'groq',
  'openrouter',
  'deepinfra',
  'cerebras',
  'cloudflare',
  'ollama',
  'outro',
]

/**
 * É Gemini? Pela BASE (a API Generative Language, o Vertex — onde o Gemini mora no Google Cloud — e
 * o AI Gateway da Cloudflare apontando para um dos dois) ou pelo MODELO. `gemma` não casa: são pesos
 * abertos (Apache), servidos por terceiros, e estão entre os candidatos da bancada.
 */
export function ehGemini(base: string | undefined, modelo?: string): boolean {
  if (modelo && /gemini|learnlm/i.test(modelo)) return true
  if (!base) return false
  const host = hostDe(base.replace('{conta}', 'conta'))
  if (host === 'generativelanguage.googleapis.com' || host.endsWith('.generativelanguage.googleapis.com')) return true
  if (host === 'aiplatform.googleapis.com' || host.endsWith('-aiplatform.googleapis.com')) return true
  if (host.endsWith('.googleapis.com') && /\/(gemini|models\/gemini)/i.test(base)) return true
  return /\/(google-ai-studio|google-vertex-ai|google-vertex)(\/|$)/i.test(base)
}

/* ─────────────────────────────── a validação ─────────────────────────────── */

/** Chave de IA: nome de variável terminado em `_API_KEY` ou `_API_TOKEN`, e não o de outro serviço. */
const CHAVE_DE_IA = /^[A-Z][A-Z0-9_]{1,60}_API_(KEY|TOKEN)$/
/** Segredos do app que casariam o padrão acima e nunca podem virar `Bearer` de um provedor de IA. */
const CHAVES_QUE_NAO_SAO_DE_IA = new Set(['ASAAS_API_KEY', 'RESEND_API_KEY'])
const CONTA_DE_IA = /^[A-Z][A-Z0-9_]{1,60}_ACCOUNT_ID$/
/** Nome de campo com cara de segredo: o registro guarda nomes de variáveis, nunca valores. */
const CAMPO_DE_SEGREDO = /^(api[-_]?key|apikey|key|token|secret|segredo|senha|password|bearer|authorization)$/i

const limitesSchema = z.strictObject({
  rpm: z.number().int().nonnegative().optional(),
  rpd: z.number().int().nonnegative().optional(),
  tpm: z.number().int().nonnegative().optional(),
  tpd: z.number().int().nonnegative().optional(),
})

const precoSchema = z.strictObject({
  entrada: z.number().nonnegative().optional(),
  entradaEmCache: z.number().nonnegative().optional(),
  saida: z.number().nonnegative().optional(),
  hora: z.number().nonnegative().optional(),
  minimoFaturadoS: z.number().int().nonnegative().optional(),
})

const modeloSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9@._:/+-]+$/, 'id de modelo com caractere fora de [A-Za-z0-9@._:/+-]'),
  funcoes: z.array(z.enum(FUNCOES_DO_REGISTRO)).min(1),
  preco: precoSchema.optional(),
  limites: limitesSchema.optional(),
  grande: z.boolean().optional(),
  niveis: z.array(z.enum(NIVEIS_DA_TRADUCAO)).min(1).max(NIVEIS_DA_TRADUCAO.length).optional(),
})

const roteamentoSchema = z.strictObject({
  data_collection: z.literal('deny', { error: 'roteamento do OpenRouter exige data_collection: "deny"' }),
  zdr: z.literal(true, { error: 'roteamento do OpenRouter exige zdr: true' }),
  ignore: z.array(z.string().min(1).max(64)).max(32),
  only: z.array(z.string().min(1).max(64)).max(32).optional(),
  order: z.array(z.string().min(1).max(64)).max(32).optional(),
  allow_fallbacks: z.boolean().optional(),
})

const provedorSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/, 'id do provedor: minúsculas, dígitos e hífen (2 a 32)'),
  formato: z.enum(FORMATOS_DE_PROVEDOR),
  base: z.string().min(8).max(300).optional(),
  chave: z
    .string()
    .regex(CHAVE_DE_IA, 'o NOME de uma variável terminada em _API_KEY ou _API_TOKEN, nunca o valor')
    .refine((n) => !CHAVES_QUE_NAO_SAO_DE_IA.has(n), 'essa variável é de outro serviço, não de IA'),
  conta: z.string().regex(CONTA_DE_IA, 'o NOME de uma variável terminada em _ACCOUNT_ID').optional(),
  retencao: z.enum(['zdr', 'desconhecida']),
  limites: limitesSchema.optional(),
  roteamento: roteamentoSchema.optional(),
  modelos: z.array(modeloSchema).min(1).max(16),
})

const registroSchema = z.strictObject({
  provedores: z.array(provedorSchema).min(1).max(12),
})

/** Procura campo com cara de segredo em qualquer nível — antes do schema, para a mensagem dizer o porquê. */
function camposDeSegredo(v: unknown, caminho = ''): string[] {
  if (!v || typeof v !== 'object') return []
  const achados: string[] = []
  for (const [k, filho] of Object.entries(v as Record<string, unknown>)) {
    const aqui = caminho ? `${caminho}.${k}` : k
    if (CAMPO_DE_SEGREDO.test(k)) achados.push(aqui)
    achados.push(...camposDeSegredo(filho, aqui))
  }
  return achados
}

/** As regras que olham mais de um campo: base, Gemini, OpenRouter, Cloudflare e produção. */
function errosDeNegocio(reg: z.infer<typeof registroSchema>, producao: boolean): string[] {
  const erros: string[] = []
  const vistos = new Set<string>()
  reg.provedores.forEach((p, i) => {
    const onde = `provedores[${i}] (${p.id})`
    if (vistos.has(p.id)) erros.push(`${onde}: id repetido`)
    vistos.add(p.id)

    if (p.formato === 'cloudflare' && !p.conta)
      erros.push(`${onde}: formato cloudflare exige "conta" (ex.: CLOUDFLARE_ACCOUNT_ID)`)
    if (p.formato !== 'cloudflare' && !p.base) erros.push(`${onde}: base obrigatória`)
    const base = p.base ?? (p.formato === 'cloudflare' ? BASE_CLOUDFLARE : undefined)
    if (base) {
      let url: URL | null = null
      try {
        url = new URL(base.replace('{conta}', 'conta'))
      } catch {
        erros.push(`${onde}: base não é uma URL`)
      }
      if (url) {
        if (url.username || url.password || url.search || url.hash)
          erros.push(`${onde}: base sem usuário, senha, query ou fragmento — a chave vai no cabeçalho, nunca na URL`)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') erros.push(`${onde}: base precisa ser http(s)`)
        if (producao && url.protocol !== 'https:') erros.push(`${onde}: em produção a base precisa ser https`)
      }
    }

    if (ehGemini(base)) erros.push(`${onde}: base do Gemini/Google recusada — o app atende menores`)
    for (const m of p.modelos) {
      if (ehGemini(undefined, m.id)) erros.push(`${onde}: modelo "${m.id}" é Gemini — recusado (o app atende menores)`)
      /* B3: `grande` é o sinônimo provisório da nuance; os dois juntos deixariam a dúvida de qual vale. */
      if (m.grande && m.niveis)
        erros.push(`${onde}: modelo "${m.id}" declara "grande" e "niveis" — use só "niveis" (grande = ["nuance"])`)
      if (m.niveis && !m.funcoes.some((f) => f !== 'stt'))
        erros.push(`${onde}: modelo "${m.id}" declara "niveis", que só valem para traducao/tutor (o STT não tem nível)`)
    }

    if (base && ehBaseDoOpenRouter(base)) {
      if (!p.roteamento) {
        erros.push(
          `${onde}: OpenRouter exige "roteamento": { "data_collection": "deny", "zdr": true, "ignore": ["google-ai-studio", "google-vertex"] }`,
        )
      } else {
        for (const g of PROVEDORES_DO_GOOGLE_NO_OPENROUTER) {
          if (!p.roteamento.ignore.includes(g)) erros.push(`${onde}: roteamento.ignore precisa ter "${g}"`)
        }
        const google = [...(p.roteamento.only ?? []), ...(p.roteamento.order ?? [])].filter((s) => /^google/i.test(s))
        if (google.length) erros.push(`${onde}: roteamento não pode pedir provedor do Google (${google.join(', ')})`)
      }
    } else if (p.roteamento) {
      erros.push(`${onde}: "roteamento" só vale para o OpenRouter`)
    }

    if (producao && p.retencao !== 'zdr')
      erros.push(`${onde}: em produção todo provedor declara retencao "zdr" (retenção zero; o app atende menores)`)
  })
  return erros
}

function mensagensDoZod(e: z.ZodError): string[] {
  return e.issues.map((i) => {
    const caminho = i.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('')
    return `${caminho.replace(/^\./, '') || 'registro'}: ${i.message}`
  })
}

export type ResultadoDaValidacao = { ok: true; registro: RegistroDeProvedores } | { ok: false; erros: string[] }

/** Valida um registro já parseado. Pura: `producao` decide as travas de produção. */
export function validarRegistro(bruto: unknown, opcoes: { producao: boolean }): ResultadoDaValidacao {
  const segredos = camposDeSegredo(bruto)
  if (segredos.length) {
    return {
      ok: false,
      erros: [`o registro não guarda segredo — campo(s) ${segredos.join(', ')}; use "chave" com o NOME da variável`],
    }
  }
  const r = registroSchema.safeParse(bruto)
  if (!r.success) return { ok: false, erros: mensagensDoZod(r.error) }
  const erros = errosDeNegocio(r.data, opcoes.producao)
  if (erros.length) return { ok: false, erros }
  return {
    ok: true,
    registro: {
      origem: 'declarado',
      provedores: r.data.provedores.map((p) => ({
        ...p,
        base: p.base ? semBarra(p.base) : undefined,
        modelos: p.modelos.map(normalizarGrande),
      })),
    },
  }
}

/**
 * O `grande` DECLARADO vira a nuance (B3). No B1 ele copiava a regra do `LLM_MODEL_GRANDE` — o modelo
 * de quem tem `largerModels` — e ficou marcado como provisório: a decisão do dono é por NÍVEL, e o
 * modelo melhor de quem paga é o da nuance (`traducaoNuance`, verdadeiro em todo plano pago). Um
 * registro escrito com `grande` continua dizendo o que queria dizer: "este é o de quem paga".
 */
function normalizarGrande(m: ModeloDeclarado): ModeloDeclarado {
  if (!m.grande) return m
  const { grande: _grande, ...resto } = m
  return { ...resto, niveis: ['nuance'] }
}

/* ─────────────────────────────── o legado ─────────────────────────────── */

/**
 * A retenção do legado, pelo host. A Groq e a OpenRouter são as do `.env.production.example`, com a
 * retenção zero ligada NA CONTA (docs/LANCAMENTO.md, passo 5) e, na OpenRouter, também em cada pedido
 * (`llmClient.ts`). Qualquer outro endereço é `desconhecida`: em produção isso vira AVISO no boot, e
 * não recusa — recusar mudaria o comportamento de quem já opera assim; o lugar de declarar é o
 * `IA_PROVEDORES`, e lá a recusa vale.
 */
function retencaoLegada(base: string): 'zdr' | 'desconhecida' {
  const f = fornecedorDoHost(base)
  return f === 'groq' || f === 'openrouter' ? 'zdr' : 'desconhecida'
}

const FUNCOES_DO_LLM: FuncaoDoRegistro[] = ['traducao', 'tutor']

/**
 * O REGISTRO DERIVADO DO AMBIENTE DE HOJE — a mesma resolução que `provedores.ts` fazia antes do B1,
 * agora no formato do registro. Cada linha abaixo corresponde a uma linha do código antigo; o teste
 * de equivalência compara as duas. A única diferença, e de propósito: chave com espaço em volta é
 * aparada (uma chave com espaço nunca autentica).
 */
export function registroLegado(env: NodeJS.ProcessEnv = process.env): RegistroDeProvedores {
  const provedores: ProvedorDeclarado[] = []

  /* O primário: `LLM_API_KEY || GROQ_API_KEY`, na base `LLM_BASE_URL || GROQ_BASE_URL || groq`. */
  const chavePrimaria = env.LLM_API_KEY?.trim() ? 'LLM_API_KEY' : env.GROQ_API_KEY?.trim() ? 'GROQ_API_KEY' : null
  if (chavePrimaria) {
    const base = semBarra(env.LLM_BASE_URL || env.GROQ_BASE_URL || BASE_GROQ)
    const comum = env.LLM_MODEL || env.GROQ_LLM_MODEL || env.GROQ_MODEL || MODELO_LLM_PADRAO
    const grande = env.LLM_MODEL_GRANDE?.trim() || null
    provedores.push({
      id: fornecedorDoHost(base),
      rotulo: 'llm-primario',
      formato: 'openai',
      base,
      chave: chavePrimaria,
      retencao: retencaoLegada(base),
      modelos: [
        { id: comum, funcoes: FUNCOES_DO_LLM },
        ...(grande ? [{ id: grande, funcoes: FUNCOES_DO_LLM, grande: true }] : []),
      ],
    })
  }

  /* A reserva: as TRÊS `LLM_RESERVA_*` vencem o atalho `OPENROUTER_API_KEY`. Não segue `largerModels`. */
  const { LLM_RESERVA_BASE_URL, LLM_RESERVA_API_KEY, LLM_RESERVA_MODEL, OPENROUTER_API_KEY } = env
  if (LLM_RESERVA_BASE_URL && LLM_RESERVA_API_KEY?.trim() && LLM_RESERVA_MODEL) {
    const base = semBarra(LLM_RESERVA_BASE_URL)
    provedores.push({
      id: fornecedorDoHost(base),
      rotulo: 'llm-reserva',
      formato: 'openai',
      base,
      chave: 'LLM_RESERVA_API_KEY',
      retencao: retencaoLegada(base),
      modelos: [{ id: LLM_RESERVA_MODEL, funcoes: FUNCOES_DO_LLM }],
    })
  } else if (OPENROUTER_API_KEY?.trim()) {
    provedores.push({
      id: 'openrouter',
      rotulo: 'llm-reserva',
      formato: 'openai',
      base: BASE_OPENROUTER,
      chave: 'OPENROUTER_API_KEY',
      retencao: 'zdr',
      modelos: [{ id: LLM_RESERVA_MODEL || MODELO_LLM_PADRAO, funcoes: FUNCOES_DO_LLM }],
    })
  }

  /* O STT: a fonte única do B0 (`sttGerenciadoDoEnv`), sem segunda leitura. */
  const stt = sttGerenciadoDoEnv(env)
  if (stt) {
    provedores.push({
      id: fornecedorDoHost(stt.baseUrl),
      rotulo: 'stt-gerenciado',
      formato: 'openai',
      base: stt.baseUrl,
      chave: stt.chave,
      retencao: retencaoLegada(stt.baseUrl),
      modelos: [{ id: stt.model, funcoes: ['stt'] }],
    })
  }
  return { origem: 'legado', provedores }
}

/* ─────────────────────────────── o registro ativo ─────────────────────────────── */

/** Teto do JSON: um registro de verdade tem poucos KB; 64 KB é folga, não convite. */
const TAMANHO_MAXIMO = 64 * 1024

type Leitura = { ok: true; registro: RegistroDeProvedores } | { ok: false; erro: string }

/** Memória das leituras do declarado, pelo texto: o JSON é parseado e validado uma vez por conteúdo. */
const memoria = new Map<string, Leitura>()
const arquivos = new Map<string, string>()
const errosJaLogados = new Set<string>()

/** Só para os testes: esquece o que foi lido e logado. */
export function esquecerRegistro(): void {
  memoria.clear()
  arquivos.clear()
  errosJaLogados.clear()
}

function textoDoArquivo(caminho: string): string {
  const guardado = arquivos.get(caminho)
  if (guardado !== undefined) return guardado
  const texto = readFileSync(caminho, 'utf8')
  arquivos.set(caminho, texto)
  return texto
}

/** O texto do registro declarado → leitura: tamanho, JSON e validação, cada um com a sua mensagem. */
function validarTexto(texto: string, producao: boolean): Leitura {
  if (texto.length > TAMANHO_MAXIMO) return { ok: false, erro: `IA_PROVEDORES acima de ${TAMANHO_MAXIMO} bytes` }
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    return { ok: false, erro: 'IA_PROVEDORES não é JSON válido' }
  }
  const v = validarRegistro(json, { producao })
  if (v.ok === false) return { ok: false, erro: `IA_PROVEDORES inválido: ${v.erros.join('; ')}` }
  return { ok: true, registro: v.registro }
}

/** Lê e valida o registro do ambiente: declarado (`IA_PROVEDORES`/`_ARQUIVO`) ou legado. */
function lerRegistro(env: NodeJS.ProcessEnv): Leitura {
  const inline = env.IA_PROVEDORES?.trim()
  const arquivo = env.IA_PROVEDORES_ARQUIVO?.trim()
  if (!inline && !arquivo) {
    const legado = registroLegado(env)
    /* No legado a única recusa é o Gemini: o resto reproduz o comportamento de antes. */
    const gemini = legado.provedores.filter(
      (p) => ehGemini(p.base, undefined) || p.modelos.some((m) => ehGemini(undefined, m.id)),
    )
    if (gemini.length) {
      return {
        ok: false,
        erro: `configuração de IA aponta para o Gemini (${gemini.map((p) => p.rotulo).join(', ')}) — recusado: o app atende menores`,
      }
    }
    return { ok: true, registro: legado }
  }
  if (inline && arquivo) return { ok: false, erro: 'declare IA_PROVEDORES OU IA_PROVEDORES_ARQUIVO, não as duas' }

  let texto: string
  try {
    texto = inline ?? textoDoArquivo(arquivo!)
  } catch (err) {
    return {
      ok: false,
      erro: `IA_PROVEDORES_ARQUIVO ilegível: ${String((err as Error)?.message ?? err).slice(0, 120)}`,
    }
  }
  const producao = env.NODE_ENV === 'production'
  const chave = `${producao ? 'p' : 'd'}\u0000${texto}`
  const guardada = memoria.get(chave)
  if (guardada) return guardada

  const leitura = validarTexto(texto, producao)
  if (memoria.size > 16) memoria.clear()
  memoria.set(chave, leitura)
  return leitura
}

/**
 * O registro que vale AGORA. Inválido = nenhum provedor (a nuvem fecha e o cliente usa o aparelho),
 * com UM `error` no log por erro distinto — e não o legado: voltar ao ambiente antigo em silêncio
 * mandaria o tráfego exatamente para onde o operador acabou de decidir não mandar.
 */
export function registroAtivo(env: NodeJS.ProcessEnv = process.env): RegistroDeProvedores {
  const l = lerRegistro(env)
  if (l.ok === true) return l.registro
  if (!errosJaLogados.has(l.erro)) {
    errosJaLogados.add(l.erro)
    log('error', { event: 'ia_provedores_invalido', error: l.erro.slice(0, 600) })
  }
  return { origem: 'invalido', provedores: [] }
}

/** A mensagem de erro do registro, ou `null` — para o boot (`server.ts` aborta em produção). */
export function erroDoRegistroDeIa(env: NodeJS.ProcessEnv = process.env): string | null {
  const l = lerRegistro(env)
  return l.ok === true ? null : l.erro
}

/** Avisos do registro válido: em produção, salto de nuvem sem retenção zero DECLARADA (só o legado chega aqui). */
export function avisosDoRegistroDeIa(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return []
  return registroAtivo(env)
    .provedores.filter((p) => p.retencao !== 'zdr')
    .map(
      (p) =>
        `${p.rotulo ?? p.id} (${p.id}) sem retenção zero declarada: migre para IA_PROVEDORES com retencao "zdr" depois de conferir o provedor`,
    )
}

/* ─────────────────────────────── a resolução ─────────────────────────────── */

/** A base efetiva, com a conta da Cloudflare no lugar de `{conta}`. `null` quando a conta falta. */
function baseEfetiva(p: ProvedorDeclarado, env: NodeJS.ProcessEnv): string | null {
  const molde = p.base ?? (p.formato === 'cloudflare' ? BASE_CLOUDFLARE : null)
  if (!molde) return null
  if (!molde.includes('{conta}')) return molde
  const conta = p.conta ? env[p.conta]?.trim() : undefined
  if (!conta || !/^[A-Za-z0-9_-]{1,64}$/.test(conta)) return null
  return semBarra(molde.replace('{conta}', conta))
}

/** O rótulo da perna: o papel fixo do legado ou, no declarado, a POSIÇÃO na cascata (primário, reserva). */
function rotuloDaPerna(p: ProvedorDeclarado | undefined, funcao: FuncaoDoRegistro, indice: number): string {
  if (p?.rotulo) return p.rotulo
  if (funcao === 'stt') return indice === 0 ? 'stt-gerenciado' : 'stt-reserva'
  return indice === 0 ? 'llm-primario' : 'llm-reserva'
}

/** Uma perna possível da função, antes do nível: de que provedor veio e que níveis atende. */
interface Candidata {
  provedor: ProvedorDeclarado
  modelo: ModeloDeclarado
  perna: Omit<Provedor, 'rotulo'>
}

/** Todas as pernas da função, na ordem do registro, com o `grande` do legado já aplicado. */
function candidatasDaFuncao(f: FuncaoDoRegistro, modelosGrandes: boolean, env: NodeJS.ProcessEnv): Candidata[] {
  const candidatas: Candidata[] = []
  for (const p of registroAtivo(env).provedores) {
    const apiKey = env[p.chave]?.trim()
    if (!apiKey) continue
    const base = baseEfetiva(p, env)
    if (!base || ehGemini(base)) continue
    const daFuncao = p.modelos.filter((m) => m.funcoes.includes(f) && !ehGemini(undefined, m.id))
    const grandes = daFuncao.filter((m) => m.grande)
    const escolhidos = modelosGrandes && grandes.length ? grandes : daFuncao.filter((m) => !m.grande)
    for (const m of escolhidos) {
      candidatas.push({
        provedor: p,
        modelo: m,
        perna: {
          base,
          apiKey,
          model: m.id,
          fornecedor: p.id,
          formato: p.formato,
          ...(m.preco ? { preco: m.preco } : {}),
          ...(p.roteamento ? { roteamento: p.roteamento } : {}),
          /* B4: os limites do MODELO são do balde dele; os do PROVEDOR, da conta inteira — um balde
             só para todos os modelos dele (`limitesDaConta`), senão dois modelos somariam o dobro. */
          ...(m.limites ? { limites: m.limites } : p.limites ? { limites: p.limites, limitesDaConta: true } : {}),
          ...(m.niveis ? { niveis: m.niveis } : {}),
        },
      })
    }
  }
  return candidatas
}

/**
 * As pernas de UMA função, com o segredo lido do ambiente. Provedor sem chave (ou sem conta) no
 * ambiente não vira perna; Gemini nunca vira perna, nem no legado.
 *
 * A ORDEM (B3): os níveis na ordem da cadeia do pedido (`niveisAtendidos`: nuance → rápida) e, dentro
 * de cada nível, a ordem do registro. Sem `nivel`, a rápida — o padrão seguro: quem não diz o nível
 * recebe o barato. No legado nenhum modelo declara nível, então todo nível dá a mesma cascata de
 * antes. O STT não tem nível: vale a ordem do registro (a cascata do STT reordena pelo custo, B6).
 */
export function pernasDaFuncao(
  funcao: FuncaoDoRegistro | 'corretor',
  opcoes: { modelosGrandes?: boolean; nivel?: NivelDaTraducao } = {},
  env: NodeJS.ProcessEnv = process.env,
): Provedor[] {
  const f: FuncaoDoRegistro = funcao === 'corretor' ? 'tutor' : funcao
  const candidatas = candidatasDaFuncao(f, opcoes.modelosGrandes === true, env)
  const ordem: Candidata[] = []
  if (f === 'stt') ordem.push(...candidatas)
  else {
    for (const nivel of niveisAtendidos(opcoes.nivel ?? 'rapida')) {
      for (const c of candidatas) {
        if ((c.modelo.niveis ?? ['rapida']).includes(nivel) && !ordem.includes(c)) ordem.push(c)
      }
    }
  }
  /* O papel de cada perna: o fixo do legado ou a POSIÇÃO na cascata do nível — o primeiro é o primário. */
  return ordem.map((c, i) => ({ rotulo: rotuloDaPerna(c.provedor, f, i), ...c.perna }))
}

/** Segmento de caminho de modelo aceitável numa URL: nada de vazio, `.`, `..` nem caractere de fora. */
const SEGMENTO_DE_MODELO = /^[A-Za-z0-9@._:+-]+$/

/**
 * O ENDPOINT DE TRANSCRIÇÃO de uma perna de STT (B6), ou `null` quando o proxy não sabe chamá-la:
 *
 *   - `openai`: `<base>/audio/transcriptions`, multipart — Groq, DeepInfra, OpenAI;
 *   - `cloudflare`: a rota NATIVA do Workers AI, `…/ai/run/<modelo>` (o endpoint OpenAI-compatible
 *     dela não tem `/audio/transcriptions`), derivada da base da API (`…/accounts/<conta>/ai/v1`) ou
 *     do AI Gateway (`…/<gateway>/workers-ai/v1` → `…/workers-ai/<modelo>`). O modelo vai no CAMINHO,
 *     então cada segmento dele é conferido: `@cf/../../x` subiria de rota.
 */
export function endpointDaTranscricao(p: Pick<Provedor, 'base' | 'model' | 'formato'>): string | null {
  const base = semBarra(p.base)
  if ((p.formato ?? 'openai') === 'openai') return `${base}/audio/transcriptions`
  const segmentos = p.model.split('/')
  if (!segmentos.every((s) => SEGMENTO_DE_MODELO.test(s) && s !== '.' && s !== '..')) return null
  if (/\/ai\/v1$/.test(base)) return `${base.replace(/\/v1$/, '')}/run/${p.model}`
  if (/\/workers-ai\/v1$/.test(base)) return `${base.replace(/\/v1$/, '')}/${p.model}`
  return null
}

/** A perna de STT que o `sttProxy` sabe chamar — a primeira (na ordem do registro) com endpoint. */
export interface SttGerenciado {
  secret: string
  baseUrl: string
  model: string
  fornecedor: string
  formato: FormatoDeProvedor
  preco?: PrecoDeModelo
}

/**
 * O STT GERENCIADO, PELO REGISTRO — a fonte que `GET /api/ai/stt/available` e a porta da
 * transcrição consultam (B0: eram duas leituras, e discordavam). No legado é exatamente o
 * `sttGerenciadoDoEnv`. Desde o B6 a porta percorre TODAS as pernas (`cascataDeStt.ts`), e a
 * Cloudflare (base64) entra: a pergunta "há STT de nuvem?" é "há perna com endpoint?".
 */
export function sttGerenciado(env: NodeJS.ProcessEnv = process.env): SttGerenciado | null {
  const perna = pernasDaFuncao('stt', {}, env).find((p) => endpointDaTranscricao(p) !== null)
  if (!perna?.apiKey) return null
  return {
    secret: perna.apiKey,
    baseUrl: perna.base,
    model: perna.model,
    fornecedor: perna.fornecedor ?? fornecedorDoHost(perna.base),
    formato: perna.formato ?? 'openai',
    ...(perna.preco ? { preco: perna.preco } : {}),
  }
}

/** A nuvem de STT está configurada? É, por construção, a MESMA pergunta da porta da transcrição. */
export function sttDeNuvemConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  return sttGerenciado(env) !== null
}

/**
 * As funções SEM RESERVA: com pernas, mas todas no MESMO endereço (uma queda leva todas). No legado
 * o STT fica de fora — ele nunca teve reserva, e o aviso diário seria ruído até o B6; no declarado,
 * o operador escreveu as pernas do STT, e a falta de uma segunda é dele para saber.
 */
export function funcoesSemReserva(env: NodeJS.ProcessEnv = process.env): FuncaoDoRegistro[] {
  const reg = registroAtivo(env)
  const funcoes: FuncaoDoRegistro[] = reg.origem === 'declarado' ? ['traducao', 'tutor', 'stt'] : ['traducao', 'tutor']
  return funcoes.filter((f) => {
    const pernas = pernasDaFuncao(f, {}, env)
    return pernas.length > 0 && new Set(pernas.map((p) => p.base)).size < 2
  })
}

/**
 * O nome do fornecedor para a telemetria: o `id` DECLARADO quando a base é de um provedor do
 * registro; senão, o nome pelo host (`fornecedorDoHost`).
 */
export function fornecedorDaBase(base: string, env: NodeJS.ProcessEnv = process.env): string {
  const alvo = semBarra(base)
  const reg = registroAtivo(env)
  if (reg.origem === 'declarado') {
    for (const p of reg.provedores) {
      const b = baseEfetiva(p, env)
      if (b && semBarra(b) === alvo) return p.id
    }
  }
  return fornecedorDoHost(alvo)
}

/**
 * Os rótulos FECHADOS de métrica: os fornecedores conhecidos mais os ids declarados, e os modelos
 * do registro ativo. Um rótulo fora destas listas vira `outro` em `server/http/metricas.ts` — é o
 * que impede a cardinalidade de crescer com o que não foi declarado.
 */
export function rotulosDoRegistro(env: NodeJS.ProcessEnv = process.env): {
  fornecedores: Set<string>
  modelos: Set<string>
} {
  const reg = registroAtivo(env)
  return {
    fornecedores: new Set([...FORNECEDORES_CONHECIDOS, ...reg.provedores.map((p) => p.id)]),
    modelos: new Set(reg.provedores.flatMap((p) => p.modelos.map((m) => m.id))),
  }
}
