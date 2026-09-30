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
}

/** Os dois provedores do Google no OpenRouter — `google-vertex` casa também as regiões dele. */
export const PROVEDORES_DO_GOOGLE_NO_OPENROUTER = ['google-ai-studio', 'google-vertex'] as const

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
): Record<string, unknown> {
  const host = hostDe(base)
  const raciocinio = /gpt-oss/i.test(model)
  /* Direto ou pelo AI Gateway da Cloudflare: o roteamento de retenção zero vai nos dois caminhos. */
  if (ehBaseDoOpenRouter(base)) {
    return {
      provider: roteamentoEndurecido(roteamento),
      ...(raciocinio ? { reasoning: { effort: 'low', exclude: true } } : {}),
    }
  }
  if (!raciocinio) return {}
  if (host === 'api.groq.com') return { reasoning_effort: 'low', include_reasoning: false }
  return { reasoning_effort: 'low' }
}
