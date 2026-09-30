/**
 * OS PARÂMETROS QUE DEPENDEM DE QUEM ATENDE (24/09/2026) — raciocínio e retenção de dados.
 *
 * Mora num módulo SEM IMPORTS desde o B5 (29/09/2026): a bancada de provedores
 * (`scripts/eval-fala/bancada/nuvem.mjs`) monta o pedido do candidato com esta MESMA função, para
 * medir o que a produção mandaria — e a bancada roda fora do servidor, sem `config`, `metricas` e
 * `admissao`, que o `llmClient.ts` puxa. Uma cópia na bancada seria a duplicação que o A31 tirou:
 * a produção muda o parâmetro e a bancada continua medindo o antigo. `llmClient.ts` reexporta.
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
 * RETENÇÃO. No OpenRouter a requisição vai com `provider: { zdr: true }` SEMPRE, qualquer que seja
 * o modelo: o OpenRouter é um roteador, e sem isso a fala do usuário pode cair num provedor que
 * guarda o prompt. O app é aberto a menores (LGPD art. 14); retenção zero não é opcional.
 *
 * O provedor é reconhecido pelo HOST da base, não pelo rótulo: a reserva configurada por
 * `LLM_RESERVA_*` pode apontar para o OpenRouter sem usar o atalho `OPENROUTER_API_KEY`.
 */
function hostDe(base: string): string {
  try {
    return new URL(base).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function parametrosDoProvedor(base: string, model: string): Record<string, unknown> {
  const host = hostDe(base)
  const raciocinio = /gpt-oss/i.test(model)
  if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) {
    return { provider: { zdr: true }, ...(raciocinio ? { reasoning: { effort: 'low', exclude: true } } : {}) }
  }
  if (!raciocinio) return {}
  if (host === 'api.groq.com') return { reasoning_effort: 'low', include_reasoning: false }
  return { reasoning_effort: 'low' }
}
