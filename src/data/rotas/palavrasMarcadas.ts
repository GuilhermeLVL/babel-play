/**
 * O CLIENTE DAS PALAVRAS MARCADAS SEM CARTÃO — "Já sei" e "Ignorar" (openspec `vocab-conhecidas-e-ignoradas`).
 *
 * Rotas: GET `/api/vocab/marcadas[?lang=]`, PUT `/api/vocab/marcadas` (`{ lang, chave, estado }`) e
 * DELETE `/api/vocab/marcadas?lang=&chave=`.
 *
 * TÊM PAR no modo sem conta (`src/data/efemero/rotas/palavrasMarcadas.ts`, no `localStorage` do aparelho), como as
 * configurações: as mesmas funções servem aos dois modos.
 */
import { ehEstadoDaMarcacao, type EstadoDaMarcacao, type PalavraMarcada } from '../../core/vocabulario/marcadas'
import { apiFetch } from '../funil'

/** Todas as marcações (ou as de um idioma). `null` com erro ou sem rede: quem chama mantém o que sabe. */
export async function fetchPalavrasMarcadas(lang?: string): Promise<PalavraMarcada[] | null> {
  try {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : ''
    const res = await apiFetch(`/api/vocab/marcadas${q}`)
    if (!res.ok) return null
    const bruto = (await res.json()) as { marcadas?: unknown }
    if (!Array.isArray(bruto.marcadas)) return null
    return bruto.marcadas.filter(
      (m): m is PalavraMarcada =>
        !!m &&
        typeof (m as PalavraMarcada).lang === 'string' &&
        typeof (m as PalavraMarcada).chave === 'string' &&
        ehEstadoDaMarcacao((m as PalavraMarcada).estado),
    )
  } catch {
    return null
  }
}

/** Marca a palavra (ou troca a marcação). `true` só quando o servidor (ou o espelho local) gravou. */
export async function marcarPalavra(lang: string, chave: string, estado: EstadoDaMarcacao): Promise<boolean> {
  try {
    const res = await apiFetch('/api/vocab/marcadas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, chave, estado }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Desmarca a palavra. `true` quando a marcação não existe mais (desmarcar é idempotente). */
export async function desmarcarPalavra(lang: string, chave: string): Promise<boolean> {
  try {
    const q = `lang=${encodeURIComponent(lang)}&chave=${encodeURIComponent(chave)}`
    const res = await apiFetch(`/api/vocab/marcadas?${q}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}
