/**
 * O CLIENTE DAS ROTAS DO HISTÓRICO DA PALAVRA — as etiquetas da legenda e o cartão da palavra.
 *
 * Rotas: GET `/api/vocab/vistas?lang=` (o índice de palavras vistas, com ETag), GET `/api/vocab/palavra?lang=&chave=`
 * (onde a palavra apareceu, os jogos, a nota), PUT `/api/vocab/:id/nota`, PUT `/api/vocab/:id/etiquetas` e
 * GET `/api/vocab/etiquetas`.
 *
 * NÃO TÊM PAR no modo sem conta, e a ausência é declarada em `tests/contratos/rotas-espelhadas.test.ts`: sem conta o
 * servidor efêmero responde 501 `exige_conta`, e cada função aqui devolve `null` (ou `false`). É esse o modo
 * convidado das etiquetas: só os estados do caderno local, sem o ponto "nova para você" e sem contagens.
 */
import type { Forca } from '../../core/learning/forcaDoCartao'
import { apiFetch } from '../funil'

/** O índice de palavras vistas de um idioma, como o servidor o manda. */
export interface PalavrasVistas {
  lang: string
  chaves: string[]
  /** O servidor cortou a lista (teto de chaves): o conjunto é parcial. */
  truncado: boolean
}

/** O cartão da palavra no contrato do servidor. `aprendendo` é o "aprendida" das peles de cartão. */
export interface CartaoNoHistorico {
  id: string
  estado: 'nova' | 'aprendendo' | 'dominada'
  /** ISO, ou `null` sem revisão marcada. */
  proximaRevisao: string | null
  reps: number
  lapses: number
  /** A força 1–4 (`forcaDoCartao`). Ausente em servidor antigo. */
  forca?: Forca
  /** As etiquetas do usuário neste cartão. Ausente em servidor antigo. */
  etiquetas?: string[]
}

export interface HistoricoDaPalavra {
  chave: string
  lang: string
  cartao: CartaoNoHistorico | null
  vistas: { vezes: number; sessoes: number; primeiraEm: string | null; ultimaEm: string | null }
  /** Até 10 sessões, as mais recentes primeiro. */
  onde: Array<{ sessaoId: string; titulo: string | null; quando: string; frase: string | null }>
  jogos: Array<{ jogo: string; acertos: number; erros: number; ultimoEm: string }>
  nota: string | null
}

/** O teto da nota do cartão (o servidor recusa acima disto). */
export const TETO_DA_NOTA = 500

/* O último índice de cada idioma e o ETag dele: a revalidação custa um 304 e zero bytes de lista. */
const ultimasVistas = new Map<string, { etag: string; corpo: PalavrasVistas }>()

/** Para os testes: esquece os ETags guardados. */
export function esquecerPalavrasVistas(): void {
  ultimasVistas.clear()
}

/** O índice de palavras vistas de `lang`. `null` sem conta (501), sem rota (404), com erro ou sem rede. */
export async function fetchPalavrasVistas(lang: string): Promise<PalavrasVistas | null> {
  const memo = ultimasVistas.get(lang)
  try {
    const res = await apiFetch(
      `/api/vocab/vistas?lang=${encodeURIComponent(lang)}`,
      memo ? { headers: { 'If-None-Match': memo.etag } } : undefined,
    )
    if (res.status === 304 && memo) return memo.corpo
    if (!res.ok) return null
    const bruto = (await res.json()) as Partial<PalavrasVistas>
    if (!Array.isArray(bruto.chaves)) return null
    const corpo: PalavrasVistas = {
      lang: typeof bruto.lang === 'string' ? bruto.lang : lang,
      chaves: bruto.chaves.filter((c): c is string => typeof c === 'string'),
      /* Sem o campo (servidor antigo), o seguro é tratar como parcial: nenhum ponto errado. */
      truncado: bruto.truncado !== false,
    }
    const etag = res.headers?.get?.('etag')
    if (etag) ultimasVistas.set(lang, { etag, corpo })
    else ultimasVistas.delete(lang)
    return corpo
  } catch {
    return null
  }
}

/** O histórico de uma palavra (a chave do núcleo, `chaveDaPalavra`). `null` sem conta, com erro ou sem rede. */
export async function fetchHistoricoDaPalavra(lang: string, chave: string): Promise<HistoricoDaPalavra | null> {
  try {
    const q = `lang=${encodeURIComponent(lang)}&chave=${encodeURIComponent(chave)}`
    const res = await apiFetch(`/api/vocab/palavra?${q}`)
    if (!res.ok) return null
    const h = (await res.json()) as HistoricoDaPalavra
    return h && typeof h === 'object' && h.vistas ? h : null
  } catch {
    return null
  }
}

/** Grava a nota do cartão (`''` limpa). Corta no teto antes de mandar. `true` só quando o servidor gravou. */
export async function salvarNotaDoCartao(cardId: string, nota: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/vocab/${encodeURIComponent(cardId)}/nota`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nota: nota.slice(0, TETO_DA_NOTA) }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** As etiquetas em uso na conta, com quantos cartões cada uma tem. `[]` sem conta, com erro ou sem rede. */
export async function fetchEtiquetasEmUso(): Promise<Array<{ etiqueta: string; cartoes: number }>> {
  try {
    const res = await apiFetch('/api/vocab/etiquetas')
    if (!res.ok) return []
    const corpo = (await res.json()) as { etiquetas?: Array<{ etiqueta: string; cartoes: number }> }
    return Array.isArray(corpo.etiquetas) ? corpo.etiquetas : []
  } catch {
    return []
  }
}

/** Grava as etiquetas do cartão (a lista inteira). Devolve as normalizadas pelo servidor, ou `null` se não gravou. */
export async function salvarEtiquetasDoCartao(cardId: string, etiquetas: string[]): Promise<string[] | null> {
  try {
    const res = await apiFetch(`/api/vocab/${encodeURIComponent(cardId)}/etiquetas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiquetas }),
    })
    if (!res.ok) return null
    const corpo = (await res.json()) as { etiquetas?: string[] }
    return Array.isArray(corpo.etiquetas) ? corpo.etiquetas : null
  } catch {
    return null
  }
}
