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

/** O que o servidor (ou o espelho local) respondeu a um lote: quais chaves entraram e por que as outras ficaram de fora. */
export interface ResultadoDoLote {
  criadas: string[]
  jaConhecidas: number
  ignoradas: number
  comCartao: number
}

/**
 * Marca VÁRIAS palavras de um idioma como "Já sei" numa só requisição (`PUT /api/vocab/marcadas/lote`, até 3.000;
 * o teste rápido de vocabulário). `null` com erro, sem rede ou teto de marcadas cheio.
 */
export async function marcarLotePalavras(lang: string, chaves: readonly string[]): Promise<ResultadoDoLote | null> {
  try {
    const res = await apiFetch('/api/vocab/marcadas/lote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, chaves }),
    })
    if (!res.ok) return null
    const r = (await res.json()) as Partial<ResultadoDoLote>
    return Array.isArray(r.criadas)
      ? { criadas: r.criadas, jaConhecidas: r.jaConhecidas ?? 0, ignoradas: r.ignoradas ?? 0, comCartao: r.comCartao ?? 0 }
      : null
  } catch {
    return null
  }
}

/** Desfaz um lote ("Já sei" só; nunca uma "Ignorada"). Devolve as chaves apagadas, ou `null` em erro. */
export async function desfazerLotePalavras(lang: string, chaves: readonly string[]): Promise<string[] | null> {
  try {
    const res = await apiFetch('/api/vocab/marcadas/lote/desfazer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, chaves }),
    })
    if (!res.ok) return null
    const r = (await res.json()) as { removidas?: unknown }
    return Array.isArray(r.removidas) ? r.removidas.filter((c): c is string => typeof c === 'string') : null
  } catch {
    return null
  }
}
