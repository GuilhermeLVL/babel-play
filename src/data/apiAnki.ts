/**
 * CLIENTE DA BIBLIOTECA DE BARALHOS ANKI (`/api/anki/*`).
 *
 * Arquivo IRMÃO de `src/data/api.ts` — mesmo padrão de `apiFetch` (timeout, header de auth) e
 * mesma postura defensiva: quem lê aqui já sabe distinguir "carregando" de "erro" de "vazio", e
 * por isso as funções de LEITURA aqui **lançam** em vez de engolir em `[]`/`null`. Silenciar o
 * erro faria "baralho vazio" e "servidor fora do ar" parecerem a mesma coisa outra vez — o mesmo
 * defeito que `CatalogoDePalavras.tsx` documenta ter corrigido no vocabulário.
 *
 * As rotas em si são de outro agente (`server/routes/anki.ts` e afins); este arquivo só fala o
 * contrato combinado, sem tocar nelas.
 */
import type { EstadoDeNotaAnki, FiltroDeNotaAnki } from '@core'

import { apiFetch } from './api'

// ───────────────────────────── tipos do contrato ─────────────────────────────

export type EstadoBaralho = 'ativo' | 'desativado'

export interface BaralhoAnkiResumo {
  id: string
  nome: string
  arquivoOrigem: string
  estado: EstadoBaralho
  idiomaOrigem: string | null
  idiomaAlvo: string | null
  createdAt: number
  /** Total de notas que o import leu do arquivo. */
  total: number
  /** Já ativadas no vocabulário — entraram nas rodadas. */
  ativas: number
  /**
   * A régua de qualidade RECUSOU. É acionável: quem importou pode corrigir o mapeamento e tentar
   * de novo. NUNCA some com `ausentes` — são causas diferentes e pedem reações diferentes.
   */
  descartadas: number
  /**
   * A nota SUMIU do arquivo no último reimport. É história do baralho (a pessoa editou o Anki),
   * não defeito daqui — não há nada para "consertar".
   */
  ausentes: number
}

/**
 * O ESTADO VEM DO CONTRATO, nao de uma copia local (auditoria de 2026-09-07, achado A21).
 *
 * Esta linha declarava `'ativa' | 'arquivada' | 'descartada'` enquanto o servidor guardava
 * `'ativa' | 'arquivada' | 'ausente_no_arquivo'`: filtrar por "Descartadas" respondia 400 e
 * "ausente no arquivo" nao existia para a tela. `descartada` continua sendo oferecida como
 * FILTRO — ela e o recorte de quem tem motivo de descarte, e a distincao entre "a regua recusou"
 * e "sumiu do arquivo" e a que a tela precisa mostrar.
 */
export type EstadoNota = EstadoDeNotaAnki
export type FiltroDeEstado = FiltroDeNotaAnki

export interface NotaAnkiDetalhe {
  id: string
  guid: string
  frente: string
  verso: string
  exemplo: string | null
  tags: string[]
  estado: EstadoNota
  motivoDescarte: string | null
  notetype: string | null
}

export interface PaginaDeNotas {
  itens: NotaAnkiDetalhe[]
  proximoCursor: string | null
  total: number
}

export interface ResultadoAtivar {
  ativadas: number
  restantes: number
}


// ───────────────────────────── leitura ─────────────────────────────

/** Lista os baralhos importados. Lança em falha — a tela decide o que fazer (erro com retry). */
export async function listarBaralhosAnki(): Promise<BaralhoAnkiResumo[]> {
  const res = await apiFetch('/api/anki/decks')
  if (!res.ok) throw new Error(`não consegui carregar os baralhos (HTTP ${res.status})`)
  return (await res.json()) as BaralhoAnkiResumo[]
}

export interface FiltroNotas {
  cursor?: string | null
  estado?: FiltroDeEstado
  busca?: string
  limite?: number
}

/** Página de notas de um baralho, filtrável e paginada por cursor — mesmo formato do `CatalogoDePalavras`. */
export async function listarNotasDoBaralho(deckId: string, filtro: FiltroNotas = {}): Promise<PaginaDeNotas> {
  const p = new URLSearchParams()
  if (filtro.cursor) p.set('cursor', filtro.cursor)
  if (filtro.estado) p.set('estado', filtro.estado)
  if (filtro.busca?.trim()) p.set('busca', filtro.busca.trim())
  p.set('limite', String(filtro.limite ?? 50))
  const qs = p.toString()
  const res = await apiFetch(`/api/anki/decks/${deckId}/notas${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`não consegui carregar as notas (HTTP ${res.status})`)
  return (await res.json()) as PaginaDeNotas
}


// ───────────────────────────── ações ─────────────────────────────

/** Ativa até `limite` notas pendentes do baralho. Sem `limite`, o servidor decide o teto padrão. */
export async function ativarNotasDoBaralho(deckId: string, limite?: number): Promise<ResultadoAtivar> {
  const res = await apiFetch(`/api/anki/decks/${deckId}/ativar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limite != null ? { limite } : {}),
  })
  if (!res.ok) throw new Error(`não consegui ativar as notas (HTTP ${res.status})`)
  return (await res.json()) as ResultadoAtivar
}

/** Tira o baralho das rodadas sem apagar nada — ação padrão, reversível. */
export async function desativarBaralho(deckId: string): Promise<void> {
  const res = await apiFetch(`/api/anki/decks/${deckId}/desativar`, { method: 'POST' })
  if (!res.ok) throw new Error(`não consegui desativar o baralho (HTTP ${res.status})`)
}

/**
 * PURGA — destrutiva. Exige `confirmar: true` explícito: é a mesma trava que `excluirConta` usa
 * em `data/api.ts`, para que um DELETE nunca saia por engano com corpo vazio.
 */
export async function purgarBaralho(deckId: string): Promise<{ notasApagadas: number }> {
  const res = await apiFetch(`/api/anki/decks/${deckId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmar: true }),
  })
  if (!res.ok) throw new Error(`não consegui apagar o baralho (HTTP ${res.status})`)
  return (await res.json()) as { ok: true; notasApagadas: number }
}
