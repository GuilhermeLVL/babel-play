import type { MtResult, TranslationProvider } from '../capabilities'
import { apiFetch } from '../../data/api'

/**
 * Tradução via LLM no SERVIDOR (Groq) — o elo de qualidade da cadeia de MT quando os
 * motores locais falham e o MyMemory estoura a cota. Sem chave no servidor, o endpoint
 * responde 501 e a cadeia segue (honesto: nunca inventa tradução).
 *
 * Diferencial: NÃO exige o idioma de origem — o LLM detecta. É o motor que sustenta o
 * modo multi-idioma (detecção automática) da captura.
 */
export class ServerLlmMt implements TranslationProvider {
  readonly id = 'server-llm-mt'
  readonly runtime = 'browser' as const
  readonly cost = 'byo-cloud' as const
  readonly label = 'Tradutor IA (servidor)'

  // Falha de configuração (501) é PERMANENTE na sessão — evita bater no endpoint a cada frase.
  private unavailable = false

  supports(src: string | null, tgt: string): boolean {
    void src // origem é opcional (o LLM detecta)
    return !this.unavailable && !!tgt && tgt !== src
  }

  async translate(
    text: string,
    src: string | null,
    tgt: string,
    opts?: { signal?: AbortSignal }
  ): Promise<MtResult> {
    // Pelo funil: sem conta o servidor em memória responde 501 (a nuvem gerenciada exige conta) e
    // este adaptador se marca indisponível — a tradução cai para o caminho local, como deve.
    const res = await apiFetch('/api/ai/mt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, src: src || undefined, tgt }),
      signal: opts?.signal,
    })
    if (res.status === 501) {
      this.unavailable = true
      throw new Error('tradução por LLM de nuvem indisponível (sem conta ou não configurada no servidor)')
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { msg = ((await res.json()) as { error?: string }).error || msg } catch { /* corpo não-JSON */ }
      throw new Error(`Tradutor IA: ${msg}`)
    }
    const data = (await res.json()) as { text?: string }
    if (!data.text) throw new Error('Tradutor IA devolveu resposta vazia')
    return { text: data.text, detectedSourceLang: src || undefined, engine: 'groq-llm' }
  }
}
