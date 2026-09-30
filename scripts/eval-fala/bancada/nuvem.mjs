/**
 * PROVEDORES DE NUVEM DA BANCADA (B5, 29/09/2026) — endereço, formato, chave, preço e retenção de
 * cada um, e a montagem do pedido de tradução e de transcrição. Tudo PURO: nada aqui chama a rede.
 * `mt.mjs`, `stt.mjs` e `sondar-contratos.mjs` chamam; `tests/eval/bancada-nuvem.test.ts` confere o
 * pedido de cada formato com respostas simuladas.
 *
 * O PEDIDO É O DA PRODUÇÃO. Sem sufixo, o sistema recebe exatamente o que `mtProxy.ts` mandaria para
 * aquela base e aquele modelo: o prompt comunicativo (`promptComunicativo.ts`), a temperatura da fala
 * (0,2), o `max_tokens` proporcional à fonte (`maxTokensDaTraducao`) e o raciocínio/retenção de
 * `parametrosDoProvedor` — as MESMAS funções, importadas, não copiadas. O sufixo `@esforço` é um
 * AJUSTE DE CANDIDATO que a produção ainda não manda (ex.: `deepinfra:Qwen/Qwen3.5-9B@none`, sem
 * pensamento): o bruto registra `foraDaProducao`, e o B7 só troca o padrão levando o ajuste para
 * `parametrosDoProvedor` junto. Sem isso a bancada aprovaria um sistema que o usuário não recebe.
 *
 * CHAVES só por variável de ambiente literal (`GROQ_API_KEY`, `DEEPINFRA_API_KEY`,
 * `CEREBRAS_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, `OPENROUTER_API_KEY`). Sem a
 * chave, quem chama PULA o provedor com aviso (`chavesAusentes`): a bancada inteira roda em ensaio
 * sem nenhuma.
 *
 * PREÇO É CONDIÇÃO PARA CHAMAR. Todo modelo chamável está na tabela, com fonte e data: é dela que
 * sai o pior caso que o livro-caixa reserva ANTES da chamada (`livroCaixa.mjs`). Modelo fora da
 * tabela não sai — sem preço não há teto garantido. A tabela também fecha a porta para um id de
 * modelo arbitrário ir parar no caminho da URL (Cloudflare põe o modelo no caminho).
 *
 * NUNCA A API DO GEMINI (o app atende menores; os termos do Gemini proíbem): qualquer modelo
 * `gemini` é recusado em qualquer provedor. No OpenRouter, além do `zdr` da produção, a bancada
 * manda `ignore` dos provedores do Google (Vertex e AI Studio): um Gemma pedido lá não cai na API do
 * Google. Esse `ignore` ainda não está na produção — é item do B1 (registro de provedores).
 */
/* global FormData, Blob */
import { maxTokensDaTraducao } from '../../../server/ai/funcoesDeIa.ts'
import { parametrosDoProvedor } from '../../../server/ai/parametrosDoProvedor.ts'
import { systemComunicativo, userComunicativo } from '../../../src/lib/traducao/promptComunicativo.ts'

/** = `mtProxy.ts` (`temperature: falada ? 0.2 : …`). O teste de deriva lê o fonte de lá. */
export const TEMPERATURA_DA_FALA = 0.2
/** = `mtProxy.ts` (`timeoutMs: 12_000`): acima disso a produção desiste e o cliente traduz local. */
export const TIMEOUT_DE_PRODUCAO_MS = 12_000
/**
 * Folga de ENTRADA do pior caso, em tokens: o cabeçalho que o provedor põe em volta das mensagens
 * (papéis, o cabeçalho "harmony" do gpt-oss com data e nível de raciocínio). Medido na Groq: ~100.
 */
export const CABECALHO_DO_CHAT_TOKENS = 256

/** As duas portas do Google no OpenRouter (docs "Provider Routing", 29/09/2026). */
export const GOOGLE_NO_OPENROUTER = ['google-vertex', 'google-ai-studio']

const preco = (entrada, saida, extra = {}) => ({ entrada, saida, ...extra })

/**
 * O REGISTRO. `token` é a variável do Bearer; `chaves`, tudo o que precisa existir para chamar.
 * Preços em US$ por 1M tokens (MT) e por hora de áudio (STT), com o mínimo faturado por pedido.
 * `rpm*` é o ritmo padrão da bancada (ajustável por `BANCADA_RPM_<ROTULO>`), abaixo do limite da
 * camada de entrada de cada um — espaçar custa menos que apanhar 429 em rajada.
 */
export const PROVEDORES = {
  groq: {
    nome: 'Groq',
    token: 'GROQ_API_KEY',
    chaves: ['GROQ_API_KEY'],
    base: () => 'https://api.groq.com/openai/v1',
    rpmMt: 16,
    rpmStt: 19,
    retencao: {
      declarada:
        'não retém entrada/saída por padrão; logs de até 30 dias só para abuso/erro, desligáveis com ZDR em Data Controls',
      fonte: 'console.groq.com/docs/your-data',
      consultadoEm: '2026-09-29',
    },
    mt: {
      fonte: 'console.groq.com/docs/models',
      consultadoEm: '2026-09-24',
      modelos: {
        'openai/gpt-oss-20b': preco(0.075, 0.3),
        'openai/gpt-oss-120b': preco(0.15, 0.6),
        'qwen/qwen3.8-27b': preco(0.8, 4),
      },
    },
    stt: {
      formato: 'openai',
      fonte: 'console.groq.com/docs/speech-to-text ("Minimum Billed Length: 10 seconds")',
      consultadoEm: '2026-09-29',
      modelos: {
        'whisper-large-v3-turbo': { usdPorHora: 0.04, minimoS: 10 },
        'whisper-large-v3': { usdPorHora: 0.111, minimoS: 10 },
      },
    },
  },
  deepinfra: {
    nome: 'DeepInfra',
    token: 'DEEPINFRA_API_KEY',
    chaves: ['DEEPINFRA_API_KEY'],
    base: () => 'https://api.deepinfra.com/v1/openai',
    rpmMt: 120,
    rpmStt: 120,
    retencao: {
      declarada: '"Zero retention" na página de cada modelo usado aqui',
      fonte: 'deepinfra.com/<modelo> (gpt-oss-20b/120b, Qwen3.5-9B, gemma-4-26B-A4B-it, whisper-large-v3-turbo)',
      consultadoEm: '2026-09-29',
    },
    mt: {
      fonte: 'deepinfra.com/pricing e páginas dos modelos',
      consultadoEm: '2026-09-29',
      modelos: {
        'openai/gpt-oss-20b': preco(0.03, 0.14),
        'openai/gpt-oss-120b': preco(0.037, 0.17),
        // Pensa por padrão: sem `@none` gasta o max_tokens raciocinando (página do modelo).
        'Qwen/Qwen3.5-9B': preco(0.1, 0.15),
        // Não pensa por padrão (só com o token <|think|> no system); Apache-2.0.
        'google/gemma-4-26B-A4B-it': preco(0.07, 0.34),
      },
    },
    stt: {
      formato: 'openai',
      // US$ 0,0002/min; mínimo por pedido não publicado — cobrado por segundo aqui.
      fonte: 'deepinfra.com/openai/whisper-large-v3-turbo',
      consultadoEm: '2026-09-29',
      modelos: { 'openai/whisper-large-v3-turbo': { usdPorHora: 0.012, minimoS: 0 } },
    },
  },
  cerebras: {
    nome: 'Cerebras',
    token: 'CEREBRAS_API_KEY',
    chaves: ['CEREBRAS_API_KEY'],
    base: () => 'https://api.cerebras.ai/v1',
    // A camada gratuita aceita 5 pedidos/min no gpt-oss-120b; a paga, bem mais.
    rpmMt: 30,
    retencao: {
      declarada: 'não retém prompts, pedidos, respostas nem logs de conteúdo',
      fonte: 'support.cerebras.net/articles/1811589793-does-cerebras-retain-my-data',
      consultadoEm: '2026-09-29',
    },
    mt: {
      fonte: 'inference-docs.cerebras.ai/models/overview; preço em pricepertoken.com/endpoints/cerebras',
      consultadoEm: '2026-09-29',
      // Só o 120b no catálogo público (sem 20b, Qwen3.5 ou Gemma 4).
      modelos: { 'gpt-oss-120b': preco(0.35, 0.75) },
    },
    stt: null,
  },
  cloudflare: {
    nome: 'Cloudflare Workers AI',
    token: 'CLOUDFLARE_API_TOKEN',
    chaves: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
    base: (env) => `https://api.cloudflare.com/client/v4/accounts/${contaCloudflare(env)}/ai/v1`,
    rpmMt: 120,
    rpmStt: 120,
    retencao: {
      declarada:
        'Customer Content (entrada e saída) não é armazenado nem usado para treino, salvo combinado com R2/KV/etc.',
      fonte: 'developers.cloudflare.com/workers-ai/privacy',
      consultadoEm: '2026-09-29',
    },
    mt: {
      // Cobrado em neurons (US$ 0,011/1.000); o US$/token é o da tabela. A cota grátis diária
      // (10 mil neurons) não entra: o custo da bancada é o de preço cheio.
      fonte: 'developers.cloudflare.com/workers-ai/platform/pricing',
      consultadoEm: '2026-09-29',
      modelos: {
        '@cf/openai/gpt-oss-120b': preco(0.35, 0.75),
        '@cf/openai/gpt-oss-20b': preco(0.2, 0.3),
        '@cf/google/gemma-4-26b-a4b-it': preco(0.1, 0.3),
      },
    },
    stt: {
      // Formato PRÓPRIO: JSON com o áudio em base64 na rota nativa `ai/run/<modelo>` (o
      // OpenAI-compatible do Workers AI não tem /audio/transcriptions). US$ 0,0005 por minuto.
      formato: 'cloudflare',
      fonte: 'developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo (schema-input.json)',
      consultadoEm: '2026-09-29',
      modelos: { '@cf/openai/whisper-large-v3-turbo': { usdPorHora: 0.03, minimoS: 0 } },
    },
  },
  openrouter: {
    nome: 'OpenRouter',
    token: 'OPENROUTER_API_KEY',
    chaves: ['OPENROUTER_API_KEY'],
    base: () => 'https://openrouter.ai/api/v1',
    rpmMt: 16,
    retencao: {
      declarada: 'provider.zdr = true em todo pedido (só endpoints ZDR) + ignore dos provedores do Google',
      fonte: 'openrouter.ai/docs/guides/routing/provider-selection',
      consultadoEm: '2026-09-29',
    },
    mt: {
      // O custo REAL vem em `usage.cost`; a tabela é o TETO de reserva (o provedor ZDR mais caro).
      fonte: 'openrouter.ai/<modelo>/providers — teto entre os provedores ZDR',
      consultadoEm: '2026-09-29',
      modelos: {
        'openai/gpt-oss-120b': preco(0.35, 0.75),
        'openai/gpt-oss-20b': preco(0.2, 0.3),
      },
    },
    stt: null,
  },
  hf: {
    nome: 'Hugging Face Inference Providers',
    token: 'HF_TOKEN',
    chaves: ['HF_TOKEN'],
    base: () => 'https://router.huggingface.co/v1',
    rpmMt: 16,
    retencao: {
      declarada: 'depende do provedor do sufixo (:deepinfra, :novita…) — a política é a dele',
      fonte: 'huggingface.co/docs/inference-providers',
      consultadoEm: '2026-09-24',
    },
    mt: {
      fonte: 'router.huggingface.co/v1/models',
      consultadoEm: '2026-09-24',
      modelos: {
        'google/gemma-3-27b-it:deepinfra': preco(0.08, 0.16),
        'google/gemma-3-12b-it:deepinfra': preco(0.05, 0.15),
        'Qwen/Qwen3-235B-A22B-Instruct-2507:deepinfra': preco(0.09, 0.55),
        'openai/gpt-oss-120b:novita': preco(0.05, 0.25),
        'openai/gpt-oss-20b:novita': preco(0.04, 0.15),
      },
    },
    stt: null,
  },
}

/** Recusa por política de dados — não é falha do modelo, é erro de USO: para a bancada. */
export class PoliticaDeDados extends Error {
  constructor(mensagem) {
    super(mensagem)
    this.name = 'PoliticaDeDados'
  }
}

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function provedorOuErro(nome) {
  if (!Object.hasOwn(PROVEDORES, nome)) throw new Error(`provedor de nuvem desconhecido: ${nome}`)
  return PROVEDORES[nome]
}

export const ehDeNuvem = (nome) => Object.hasOwn(PROVEDORES, nome)

/**
 * `provedor:modelo[@esforço]` → partes. O provedor vai até o PRIMEIRO `:` (o modelo pode ter `:`,
 * como `…:deepinfra` no router do HF); o esforço vem depois do ÚLTIMO `@`, desde que não seja o
 * primeiro caractere — `@cf/…` é o prefixo dos modelos do Cloudflare, não esforço.
 */
export function interpretarSistema(spec) {
  const i = spec.indexOf(':')
  if (i <= 0) throw new Error(`sistema sem provedor (esperado provedor:modelo): ${spec}`)
  let modelo = spec.slice(i + 1)
  let esforco = null
  const arroba = modelo.lastIndexOf('@')
  if (arroba > 0) {
    esforco = modelo.slice(arroba + 1) || null
    modelo = modelo.slice(0, arroba)
  }
  return { id: spec, provedor: spec.slice(0, i), modelo, esforco }
}

export function conferirPolitica(sis) {
  if (/gemini/i.test(sis.modelo))
    throw new PoliticaDeDados(`${sis.id}: a API do Gemini não entra na bancada (o app atende menores)`)
}

/** As variáveis que faltam para chamar o provedor — vazio = pode chamar. */
export function chavesAusentes(provedor, env) {
  return provedorOuErro(provedor).chaves.filter((k) => !String(env?.[k] ?? '').trim())
}

/** A conta do Cloudflare vai no CAMINHO da URL: 32 hex, e nada mais. */
function contaCloudflare(env) {
  const conta = String(env?.CLOUDFLARE_ACCOUNT_ID ?? '').trim()
  if (!/^[0-9a-f]{32}$/i.test(conta)) throw new Error('CLOUDFLARE_ACCOUNT_ID ausente ou fora do formato (32 hex)')
  return conta
}

function tokenDe(p, env) {
  const t = String(env?.[p.token] ?? '').trim()
  if (!t) throw new Error(`${p.nome}: falta ${p.token}`)
  return t
}

/** O preço de MT do modelo. Lança sem preço: sem ele o teto do livro-caixa não é garantido. */
export function precoDeMt(sis) {
  const p = provedorOuErro(sis.provedor)
  const pr = p.mt?.modelos?.[sis.modelo]
  if (!pr) throw new Error(`${sis.id}: modelo sem preço na tabela de ${p.nome} (nuvem.mjs) — sem preço não há teto`)
  return pr
}

/** O preço de STT do modelo, com o mínimo faturado. */
export function precoDeStt(sis) {
  const p = provedorOuErro(sis.provedor)
  if (!p.stt) throw new Error(`${p.nome} não oferece STT na bancada`)
  const pr = p.stt.modelos[sis.modelo]
  if (!pr) throw new Error(`${sis.id}: modelo sem preço na tabela de STT de ${p.nome} (nuvem.mjs)`)
  return pr
}

/**
 * O AJUSTE DE CANDIDATO pedido por `@esforço`, no dialeto de cada provedor. `none`/`off` = sem
 * pensamento: cada um escreve de um jeito (a Cerebras avisa para NÃO mandar `enable_thinking`).
 */
function ajusteDeEsforco(provedor, esforco) {
  const desligar = esforco === 'none' || esforco === 'off'
  switch (provedor) {
    case 'groq':
      return { reasoning_effort: esforco, include_reasoning: false }
    case 'openrouter':
      return { reasoning: desligar ? { enabled: false } : { effort: esforco, exclude: true } }
    case 'deepinfra':
      return desligar ? { chat_template_kwargs: { enable_thinking: false } } : { reasoning_effort: esforco }
    case 'cerebras':
      return { reasoning_effort: desligar ? 'none' : esforco }
    default:
      return { reasoning_effort: esforco }
  }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * O PEDIDO DE TRADUÇÃO de um caso, pronto para o `fetch` — o corpo de `chamarChat` (`llmClient.ts`)
 * com as mensagens de `mtProxy.ts`. `parametros` diz o que veio da produção, o que é ajuste de
 * candidato e se o ajuste muda o pedido (`foraDaProducao`).
 */
export function montarPedidoDeMt({ sis, caso, src, tgt, env }) {
  conferirPolitica(sis)
  const p = provedorOuErro(sis.provedor)
  precoDeMt(sis)
  const base = p.base(env).replace(/\/+$/, '')
  const producao = parametrosDoProvedor(base, sis.modelo)
  const ajuste = sis.esforco ? ajusteDeEsforco(sis.provedor, sis.esforco) : {}
  const foraDaProducao = Object.entries(ajuste).some(([k, v]) => !igual(producao[k], v))
  // Só no OpenRouter: rotear sem o Google e pedir o custo na resposta. Não muda o que o modelo gera.
  const daBancada =
    sis.provedor === 'openrouter'
      ? {
          provider: { ...(producao.provider ?? {}), zdr: true, ignore: GOOGLE_NO_OPENROUTER },
          usage: { include: true },
        }
      : {}
  const corpo = {
    model: sis.modelo,
    messages: [
      { role: 'system', content: systemComunicativo(tgt, src) },
      { role: 'user', content: userComunicativo(caso.origem, caso.contexto) },
    ],
    stream: false,
    temperature: TEMPERATURA_DA_FALA,
    max_tokens: maxTokensDaTraducao(caso.origem.length),
    ...producao,
    ...ajuste,
    ...daBancada,
  }
  return {
    url: `${base}/chat/completions`,
    corpo,
    init: {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenDe(p, env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    parametros: { producao, ajuste, foraDaProducao, daBancada: Object.keys(daBancada) },
  }
}

/**
 * O PIOR CASO de uma tradução, para a reserva: entrada ≤ 1 token por caractere (texto latino dá
 * ~1 token a cada 4) mais o cabeçalho do chat, e saída = o `max_tokens` inteiro (o raciocínio
 * conta dentro dele nos provedores medidos).
 */
export function estimarCustoMaximoDeMt(sis, corpo) {
  const pr = precoDeMt(sis)
  const caracteres = corpo.messages.reduce((n, m) => n + String(m.content ?? '').length, 0)
  return ((caracteres + CABECALHO_DO_CHAT_TOKENS) * pr.entrada + corpo.max_tokens * pr.saida) / 1e6
}

/**
 * O CUSTO REAL: o informado pelo provedor quando existe (`usage.cost` do OpenRouter,
 * `usage.estimated_cost` da DeepInfra); senão `usage` × tabela, com a entrada em cache no preço de
 * cache quando a tabela o tem. Sem `usage` → NaN, e o livro-caixa cobra o reservado.
 */
export function custoDeMt(sis, uso, custoInformado = null) {
  if (Number.isFinite(custoInformado) && custoInformado >= 0) return custoInformado
  const pr = precoDeMt(sis)
  const entrada = numero(uso?.tokensEntrada)
  const saida = numero(uso?.tokensSaida)
  if (entrada === null || saida === null) return Number.NaN
  const emCache = Math.min(entrada, numero(uso?.tokensEmCache) ?? 0)
  const pCache = pr.entradaEmCache ?? pr.entrada
  return ((entrada - emCache) * pr.entrada + emCache * pCache + saida * pr.saida) / 1e6
}

/** A resposta OpenAI-compatible (os seis provedores daqui falam esse formato no chat). */
export function lerRespostaDeMt(json) {
  const u = json?.usage ?? {}
  return {
    texto: String(json?.choices?.[0]?.message?.content ?? '')
      .trim()
      .replace(/^["“]|["”]$/g, '')
      .trim(),
    tokensEntrada: numero(u.prompt_tokens),
    tokensSaida: numero(u.completion_tokens),
    tokensEmCache: numero(u.prompt_tokens_details?.cached_tokens),
    tokensDeRaciocinio: numero(u.completion_tokens_details?.reasoning_tokens),
    custoInformado: numero(u.cost ?? u.estimated_cost),
    provedorReal: typeof json?.provider === 'string' ? json.provider : null,
  }
}

/**
 * O PEDIDO DE TRANSCRIÇÃO de um trecho (WAV 16 kHz).
 *
 *   - `openai` (Groq, DeepInfra): o MESMO formulário do `sttProxy.ts` (`montarForm`): `file`,
 *     `model`, `language`, `prompt`, `temperature: 0` (com `t0`) e `response_format: verbose_json`
 *     — é o `verbose_json` que traz, por segmento, os sinais da triagem de silêncio e repetição;
 *   - `cloudflare`: JSON `{ audio: base64, task, language, initial_prompt }` na rota nativa. Não há
 *     temperatura (o decode é o do faster-whisper do provedor, feixe 5), e os segmentos vêm com os
 *     mesmos três números — a triagem da produção funciona igual.
 *
 * `FormData` é de uso único: cada tentativa monta o seu pedido.
 */
export function montarPedidoDeStt({ sis, wav, idioma, prompt = null, t0 = false, env }) {
  conferirPolitica(sis)
  const p = provedorOuErro(sis.provedor)
  precoDeStt(sis)
  const autorizacao = `Bearer ${tokenDe(p, env)}`
  if (p.stt.formato === 'cloudflare') {
    const corpo = {
      audio: Buffer.from(wav).toString('base64'),
      task: 'transcribe',
      ...(idioma ? { language: idioma } : {}),
      ...(prompt ? { initial_prompt: prompt } : {}),
    }
    return {
      formato: 'cloudflare',
      url: `https://api.cloudflare.com/client/v4/accounts/${contaCloudflare(env)}/ai/run/${sis.modelo}`,
      init: {
        method: 'POST',
        headers: { Authorization: autorizacao, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      },
    }
  }
  const fd = new FormData()
  fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
  fd.append('model', sis.modelo)
  if (idioma) fd.append('language', idioma)
  if (prompt) fd.append('prompt', prompt)
  if (t0) fd.append('temperature', '0')
  fd.append('response_format', 'verbose_json')
  return {
    formato: 'openai',
    url: `${p.base(env).replace(/\/+$/, '')}/audio/transcriptions`,
    init: { method: 'POST', headers: { Authorization: autorizacao }, body: fd },
  }
}

/** O formato de STT do provedor (`openai` | `cloudflare`). */
export const formatoDeStt = (provedor) => provedorOuErro(provedor).stt?.formato ?? null

/** Resposta de STT normalizada: o Cloudflare embrulha em `{ result }` e põe idioma/duração em `transcription_info`. */
export function lerRespostaDeStt(formato, json) {
  if (formato === 'cloudflare') {
    const r = json?.result ?? json ?? {}
    return {
      texto: typeof r.text === 'string' ? r.text : '',
      segmentos: Array.isArray(r.segments) ? r.segments : null,
      idioma: r.transcription_info?.language ?? null,
      duracaoS: numero(r.transcription_info?.duration),
    }
  }
  return {
    texto: typeof json?.text === 'string' ? json.text : '',
    segmentos: Array.isArray(json?.segments) ? json.segments : null,
    idioma: typeof json?.language === 'string' ? json.language : null,
    duracaoS: numero(json?.duration),
  }
}

/**
 * O CUSTO de um pedido de STT com o MÍNIMO FATURADO do provedor: a Groq cobra 10 s por pedido, e
 * com o VAD mandando falas curtas isso pesa (bancada de 24/09: 1,08× o tempo real com 800 ms de
 * redenção, 2,06× com 450 ms). É também o pior caso da reserva: o custo de STT é exato.
 */
export function custoDeStt(sis, duracaoS) {
  const pr = precoDeStt(sis)
  const segundosFaturados = Math.max(pr.minimoS, duracaoS)
  return { usd: (segundosFaturados / 3600) * pr.usdPorHora, segundosFaturados }
}
