/**
 * OS PARÂMETROS QUE DEPENDEM DE QUEM ATENDE (24/09/2026) — raciocínio e retenção de dados.
 *
 * Mora num módulo SEM IMPORTS desde o B5 (29/09/2026): a bancada de provedores
 * (`scripts/eval-fala/bancada/nuvem.mjs`) monta o pedido do candidato com esta MESMA função, para
 * medir o que a produção mandaria — e a bancada roda fora do servidor, sem `config`, `metricas` e
 * `admissao`, que o `llmClient.ts` puxa. Uma cópia na bancada seria a duplicação que o A31 tirou:
 * a produção muda o parâmetro e a bancada continua medindo o antigo. `llmClient.ts` reexporta, e o
 * `registroDeProvedores.ts` reexporta as constantes do OpenRouter (que valida com elas).
 *
 * RACIOCÍNIO. O `gpt-oss` (o default de `provedores.ts`) é modelo de raciocínio, e sem instrução
 * ele pensa no esforço MÉDIO: o pensamento sai do `max_tokens` (a "resposta vazia" explicada em
 * `chamarChat`) e entra na conta como saída — a parte cara. Traduzir uma fala ou responder o tutor
 * em quatro frases não precisa disso; "low" basta. Cada provedor escreve o pedido de um jeito:
 *
 *   - Groq: `reasoning_effort: "low"` e `include_reasoning: false` — o segundo tira o raciocínio da
 *     resposta, que ninguém aqui lê (docs da Groq, "Reasoning", 2026-09);
 *   - OpenRouter: `reasoning: { effort: "low", exclude: true }`, o formato unificado dele — o
 *     `reasoning_effort` solto não é o contrato de lá (docs do OpenRouter, "Reasoning Tokens");
 *   - qualquer outro OpenAI-compatible (Ollama, BYOK): só `reasoning_effort`, que é o parâmetro da
 *     própria API da OpenAI. `include_reasoning` é extensão da Groq e um provedor estrito recusaria.
 *
 * RETENÇÃO. No OpenRouter a requisição vai com `provider` de retenção zero SEMPRE, qualquer que seja
 * o modelo: o OpenRouter é um roteador, e sem isso a fala do usuário pode cair num provedor que
 * guarda o prompt. O app é aberto a menores (LGPD art. 14); retenção zero não é opcional. Desde o B1
 * da Fase B o mínimo é `{ data_collection: 'deny', zdr: true, ignore: ['google-ai-studio',
 * 'google-vertex'] }` (docs do OpenRouter, "Provider Routing", 29/09/2026): nem o provedor que coleta
 * dados, nem o Google — o Gemini é proibido para menores, e o `ignore` fecha a porta mesmo que um
 * modelo aberto passe a ser servido por lá. O roteamento DECLARADO no registro pode acrescentar
 * (`only`, `order`, mais `ignore`), nunca afrouxar: `roteamentoEndurecido` reimpõe o mínimo.
 *
 * O provedor é reconhecido pela BASE, não pelo rótulo: a reserva configurada por `LLM_RESERVA_*`
 * pode apontar para o OpenRouter sem usar o atalho `OPENROUTER_API_KEY` — e, desde o B1, também
 * pelo AI Gateway da Cloudflare (`ehBaseDoOpenRouter`).
 */

/** O `provider` do OpenRouter (docs "Provider Routing"). Os três primeiros campos são obrigatórios. */
export interface RoteamentoOpenRouter {
  data_collection: 'deny'
  zdr: true
  ignore: string[]
  only?: string[]
  order?: string[]
  allow_fallbacks?: boolean
  /** Só os endpoints que aceitam TODOS os parâmetros do pedido (o `response_format`, aqui). */
  require_parameters?: boolean
  /** `price`: o endpoint mais barato primeiro (a legenda ao vivo, com o teto de latência abaixo). */
  sort?: 'latency' | 'price' | 'throughput'
  /** Endpoints com latência (p50, em segundos) acima disto vão para o fim da fila — não saem dela. */
  preferred_max_latency?: { p50?: number; p90?: number }
}

/**
 * A LEGENDA AO VIVO: o mais BARATO primeiro, desde que responda em até 1,5 s no p50 (o SLO da legenda no plano de
 * qualidade da IA paga). Diretriz do dono (24/10/2026): "modelos baratos sempre que possível, pensando na
 * experiência do usuário". `sort: 'latency'` puro mandaria a legenda ao endpoint mais rápido — e, no Gemma 4 com
 * retenção zero, o mais rápido custa até ~1,8× o mais barato (`/api/v1/endpoints/zdr`, 24/10/2026). Com o preço
 * na frente e a latência como preferência, o barato lento demais cai para o fim, sem que o caro passe à frente
 * de um barato que responde a tempo.
 */
export const ROTEAMENTO_DA_LEGENDA = { sort: 'price', preferred_max_latency: { p50: 1.5 } } as const

/**
 * O QUE O PEDIDO QUER ALÉM DO TEXTO (Fase B do plano de qualidade da IA paga, itens 2 e 3). Estrutural, sem import
 * (este módulo não importa nada — ver o topo): o `FormatoDeSaida` de `src/lib/esquemasDeSaida.ts` cabe aqui.
 *
 *   - `formato`: a SAÍDA ESTRUTURADA. No OpenRouter vira `response_format: { type: 'json_schema', json_schema:
 *     { name, strict: true, schema } }` com `provider.require_parameters: true` — sem o segundo, o roteador pode
 *     mandar o pedido a um endpoint que IGNORA o esquema. Fora do OpenRouter, nada: cada perna da cascata monta o
 *     seu pedido, e a reserva de outro provedor segue como sempre (o `ler*` defensivo continua valendo).
 *   - `legenda: true`: a tradução RÁPIDA (a legenda ao vivo) pede o endpoint mais barato que responde a tempo
 *     (`ROTEAMENTO_DA_LEGENDA`). Só no OpenRouter; com `order` declarado no registro, a ordem declarada manda.
 */
export interface OpcoesDoPedido {
  formato?: { nome: string; esquema: Readonly<Record<string, unknown>> }
  legenda?: boolean
}

/** Os dois provedores do Google no OpenRouter — `google-vertex` casa também as regiões dele. */
export const PROVEDORES_DO_GOOGLE_NO_OPENROUTER = ['google-ai-studio', 'google-vertex'] as const

/**
 * OS MODELOS QUE VÃO SEM RACIOCÍNIO NO OPENROUTER (25/10/2026). O DeepSeek V4.1 Flash pensa por padrão — na bancada
 * gastou até 1.111 tokens raciocinando, com p95 de 9 s na explicação — e SEM raciocínio (`reasoning: { enabled:
 * false }`, o formato unificado do OpenRouter, docs "Reasoning Tokens") explica melhor e mais rápido
 * (`docs/auditoria/eval-ia-paga-v1.md`: gramática 50% → 91%, p95 3,0 s). A lista é dos modelos MEDIDOS assim; outro
 * modelo só entra com a bancada.
 */
export const MODELOS_SEM_RACIOCINIO_NO_OPENROUTER: ReadonlySet<string> = new Set(['deepseek/deepseek-v4.1-flash'])

/**
 * Provedores que dizem aceitar `reasoning` mas IGNORAM `reasoning.enabled: false` (o modelo pensa do mesmo jeito,
 * achado da bancada — `scripts/eval-ia/openrouter.mjs`). Saem do roteamento de quem vai sem raciocínio, senão o
 * "sem raciocínio" vira sorteio de provedor (e a conta e a latência voltam).
 */
export const IGNORAM_RACIOCINIO_DESLIGADO = ['novita'] as const

/** O mínimo que todo pedido ao OpenRouter leva, declarado ou não. */
export const ROTEAMENTO_OPENROUTER: RoteamentoOpenRouter = {
  data_collection: 'deny',
  zdr: true,
  ignore: [...PROVEDORES_DO_GOOGLE_NO_OPENROUTER],
}

function hostDe(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const ehOpenRouter = (host: string) => host === 'openrouter.ai' || host.endsWith('.openrouter.ai')

/**
 * A base FALA com o OpenRouter? Direto, ou pelo AI Gateway da Cloudflare (`…/<gateway>/openrouter`):
 * pelos dois caminhos o pedido chega ao mesmo roteador, e o roteamento de retenção zero tem de ir
 * junto. Usada pela validação do registro (que exige o `roteamento`) e aqui (que o manda sempre).
 */
export function ehBaseDoOpenRouter(base: string): boolean {
  let url: URL
  try {
    url = new URL(base.replace('{conta}', 'conta'))
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (ehOpenRouter(host)) return true
  return host === 'gateway.ai.cloudflare.com' && /\/openrouter(\/|$)/i.test(url.pathname)
}

/** O roteamento que vai no pedido: o declarado, com o mínimo de retenção zero e sem o Google reimposto. */
function roteamentoEndurecido(declarado?: RoteamentoOpenRouter): RoteamentoOpenRouter {
  const r = declarado ?? ROTEAMENTO_OPENROUTER
  const semGoogle = (l: string[]) => l.filter((s) => !/^google/i.test(s))
  return {
    ...r,
    ...(r.only ? { only: semGoogle(r.only) } : {}),
    ...(r.order ? { order: semGoogle(r.order) } : {}),
    data_collection: 'deny',
    zdr: true,
    ignore: [...new Set([...(r.ignore ?? []), ...PROVEDORES_DO_GOOGLE_NO_OPENROUTER])],
  }
}

export function parametrosDoProvedor(
  base: string,
  model: string,
  roteamento?: RoteamentoOpenRouter,
  opcoes: OpcoesDoPedido = {},
): Record<string, unknown> {
  const host = hostDe(base)
  const raciocinio = /gpt-oss/i.test(model)
  /* Direto ou pelo AI Gateway da Cloudflare: o roteamento de retenção zero vai nos dois caminhos. */
  if (ehBaseDoOpenRouter(base)) {
    const provider = roteamentoEndurecido(roteamento)
    const semRaciocinio = MODELOS_SEM_RACIOCINIO_NO_OPENROUTER.has(model.toLowerCase())
    if (semRaciocinio) provider.ignore = [...new Set([...provider.ignore, ...IGNORAM_RACIOCINIO_DESLIGADO])]
    if (opcoes.formato) provider.require_parameters = true
    if (opcoes.legenda && !provider.order?.length) {
      provider.sort = ROTEAMENTO_DA_LEGENDA.sort
      provider.preferred_max_latency = { ...ROTEAMENTO_DA_LEGENDA.preferred_max_latency }
    }
    return {
      provider,
      ...(raciocinio ? { reasoning: { effort: 'low', exclude: true } } : {}),
      ...(semRaciocinio ? { reasoning: { enabled: false } } : {}),
      ...(opcoes.formato
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: opcoes.formato.nome, strict: true, schema: opcoes.formato.esquema },
            },
          }
        : {}),
    }
  }
  if (!raciocinio) return {}
  if (host === 'api.groq.com') return { reasoning_effort: 'low', include_reasoning: false }
  return { reasoning_effort: 'low' }
}

/** Os modelos que o provedor já mostrou pensando, por processo. O teto é folga sobre o registro (uma
 *  dúzia de modelos): nomes demais descartam o mais antigo, e ele volta na próxima resposta. */
const RACIOCINIO_OBSERVADO = new Set<string>()
const TETO_DO_OBSERVADO = 256

/**
 * O MODELO PENSA ANTES DE RESPONDER? Pergunta da política de custo (B4, `politicaDeCusto.ts`): num
 * modelo de raciocínio o pensamento sai do MESMO `max_tokens` da resposta, e cortar o teto produz a
 * "resposta vazia" que `chamarChat` explica. Na dúvida, SIM — errar para esse lado só deixa de
 * economizar uns tokens; errar para o outro devolve legenda vazia. Por isso a lista é larga: o
 * `gpt-oss` (o padrão), a família R1, o QwQ, o Qwen3 (pensa por padrão; a bancada roda o 3.5 "sem
 * thinking", mas isso é parâmetro do pedido, não do nome), o GPT-5 e a série o, o GLM 4.5 em diante
 * e o Z1, o MiniMax M e quem se anuncia pensador.
 *
 * A LISTA É SÓ O PALPITE INICIAL. O provedor confirma: toda resposta com
 * `completion_tokens_details.reasoning_tokens > 0` marca o modelo (`registrarRaciocinioObservado`,
 * chamado por `chamarChat`). A degradação só começa a 70% do orçamento; até lá o modelo já respondeu
 * muitas vezes, e o pensador que a lista não conhece não chega ao corte sem ter se denunciado.
 *
 * NÃO muda o que `parametrosDoProvedor` manda: lá o `reasoning_effort` continua só no `gpt-oss`, o
 * único que a bancada mediu com ele — mandar o campo a outro modelo seria outro pedido, sem medição.
 */
export function ehModeloDeRaciocinio(model: string): boolean {
  if (RACIOCINIO_OBSERVADO.has(model.toLowerCase())) return true
  return /gpt-oss|deepseek-r1|(^|[/-])r1([-_.]|$)|qwq|qwen3|gpt-5|(^|\/)o[134]([-_.]|$)|glm-4\.[5-9]|glm-[5-9]|glm-z1|minimax-m\d|thinking|reason|magistral/i.test(
    model,
  )
}

export function registrarRaciocinioObservado(model: string): void {
  const chave = model.toLowerCase()
  if (RACIOCINIO_OBSERVADO.has(chave)) return
  if (RACIOCINIO_OBSERVADO.size >= TETO_DO_OBSERVADO) {
    const maisAntigo = RACIOCINIO_OBSERVADO.values().next().value
    if (maisAntigo !== undefined) RACIOCINIO_OBSERVADO.delete(maisAntigo)
  }
  RACIOCINIO_OBSERVADO.add(chave)
}

/** Testes: esquece o que o provedor mostrou. */
export function esquecerRaciocinioObservado(): void {
  RACIOCINIO_OBSERVADO.clear()
}
