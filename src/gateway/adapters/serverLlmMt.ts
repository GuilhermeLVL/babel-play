import { apiFetch } from '../../data/api'
import type { MtResult, TranslationProvider } from '../capabilities'

/**
 * Tradução via LLM no SERVIDOR (Groq) — o elo de qualidade da cadeia de MT quando os
 * motores locais falham e o MyMemory estoura a cota. Sem chave no servidor, o endpoint
 * responde 501 e a cadeia segue (honesto: nunca inventa tradução).
 *
 * Diferencial: NÃO exige o idioma de origem — o LLM detecta. É o motor que sustenta o
 * modo multi-idioma (detecção automática) da captura. E é o único motor que traduz o
 * SENTIDO de fala informal (prompt comunicativo + contexto das falas anteriores).
 */
export class ServerLlmMt implements TranslationProvider {
  readonly id = 'server-llm-mt'
  readonly runtime = 'browser' as const
  readonly cost = 'byo-cloud' as const
  readonly label = 'Tradutor IA (servidor)'

  // Falha de configuração (501) ou de plano (402) é PERMANENTE na sessão — evita bater no endpoint a cada frase.
  private unavailable = false

  supports(src: string | null, tgt: string): boolean {
    void src // origem é opcional (o LLM detecta)
    return !this.unavailable && !!tgt && tgt !== src
  }

  async translate(
    text: string,
    src: string | null,
    tgt: string,
    opts?: { signal?: AbortSignal; contexto?: ReadonlyArray<string>; falada?: boolean }
  ): Promise<MtResult> {
    // Pelo funil: sem conta o servidor em memória responde 501 (a nuvem gerenciada exige conta) e
    // este adaptador se marca indisponível — a tradução cai para o caminho local, como deve.
    const res = await apiFetch('/api/ai/mt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, src: src || undefined, tgt, contexto: opts?.contexto?.slice(-3), falada: opts?.falada === true }),
      signal: opts?.signal,
    })
    /* 501 (sem chave) OU qualquer 5xx (API fora do ar, Pages sem API_ORIGIN → 503) OU 402 (plano
       sem a nuvem gerenciada): o adaptador se desliga para a sessão. O 402 não desligava e um
       usuário sem plano pagava uma ida ao servidor por frase, para receber sempre a mesma recusa. */
    if (res.status === 501 || res.status === 402 || res.status >= 500) {
      this.unavailable = true
      throw new Error(`tradução por LLM de nuvem indisponível (HTTP ${res.status})`)
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = ((await res.json()) as { error?: string }).error || msg } catch { /* corpo não-JSON */ }
      throw new Error(`Tradutor IA: ${msg}`)
    }
    const data = (await res.json()) as { text?: string }
    if (!data.text) throw new Error('Tradutor IA devolveu resposta vazia')
    // O id neutro do próprio adaptador (A5): o servidor pode servir por qualquer provedor da cascata.
    return { text: data.text, detectedSourceLang: src || undefined, engine: 'server-llm-mt' }
  }
}
