/**
 * Camada de dados do cliente (Fase 2): fala com as rotas `/api/*` e mapeia as
 * linhas do banco para os shapes que a UI já usa (`Recording`, `VocabCard`).
 * Substitui os imports de `mockData`. (React Query entra como refinamento.)
 */
import type { Recording, VocabCard } from '../types'
import { play } from '../lib/soundFx'
import { authHeaders } from '../lib/authHeaders'
import { supabase, authRequired } from '../lib/supabase'
import { aguardarIdentidade } from '../lib/identidade'
import { servidorEfemero } from './efemero/servidor'

// ───────────────────────────── fetch com teto de tempo (A-05) ─────────────────────────────
// Toda a camada de dados usava `fetch` SEM timeout: uma resposta que nunca chega deixava a UI presa
// em "carregando…" para sempre, sem caminho de recuperação a não ser recarregar. `apiFetch` injeta um
// AbortSignal.timeout; rotas longas (import/upload) passam `timeoutMs` maior no próprio init.
const DEFAULT_TIMEOUT_MS = 30_000
/** yt-dlp (300s no servidor), anki até 200MB, uploads grandes — teto folgado para não cortar import. */
const IMPORT_TIMEOUT_MS = 600_000
type ApiInit = RequestInit & { timeoutMs?: number }
export async function apiFetch(input: string, init?: ApiInit): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {}
  // Sem conta, NADA sai para a rede: o servidor em memória responde (ver data/efemero). Este é o
  // único ponto de corte — toda a camada de dados passa por aqui.
  if ((await aguardarIdentidade()) === 'anonimo') return servidorEfemero(input, rest)
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const send = async (): Promise<Response> => {
    // Marco 1: injeta o Authorization quando há sessão (no-op no uso local sem login).
    const auth = await authHeaders()
    return fetch(input, { ...rest, headers: { ...auth, ...(rest.headers ?? {}) }, signal })
  }
  let res = await send()
  // Sessão expirada (modo público): 1 refresh + retry; persistindo, encerra a sessão (→ tela de login).
  if (res.status === 401 && authRequired && supabase) {
    const { data } = await supabase.auth.refreshSession()
    if (data?.session) res = await send()
    if (res.status === 401) await supabase.auth.signOut()
  }
  return res
}

// ───────────────────────────── Sessões ─────────────────────────────

interface SessionRow {
  id: string
  title: string | null
  kind: string | null
  createdAt: number
  durationMs: number | null
  wordCount: number | null
  sourceLang: string | null
  targetLang: string | null
  status: string | null
  meta: string | null
}

export interface UtteranceRow {
  id: string
  idx: number | null
  speakerName: string | null
  source: string | null
  sourceLang: string | null
  sourceText: string | null
  targetLang: string | null
  translatedText: string | null
  tStartMs: number | null
  tEndMs: number | null
  /** Procedência da transcrição: 'youtube-caption-*' | 'whisper-local' | 'import-text' | live STT. */
  engine?: string | null
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms < 1000) return '-'
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoje'
  const diffDays = Math.floor((now.getTime() - ts) / 86_400_000)
  if (diffDays === 1) return 'Ontem'
  if (diffDays < 7) return `Há ${diffDays} dias`
  return d.toLocaleDateString('pt-BR')
}

function toRecordingType(kind: string | null): Recording['type'] {
  return kind === 'video' || kind === 'document' ? kind : 'audio'
}

function parseMeta(meta: string | null): Record<string, unknown> {
  try {
    return meta ? (JSON.parse(meta) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function sessionToRecording(s: SessionRow): Recording {
  const m = parseMeta(s.meta)
  return {
    id: s.id,
    title: s.title ?? 'Sessão sem título',
    date: fmtDate(s.createdAt),
    durationStr: fmtDuration(s.durationMs),
    wordCount: s.wordCount ?? 0,
    type: toRecordingType(s.kind),
    tags: [],
    status: 'Processado',
    audioUrl: m.audioFile ? `/api/sessions/${s.id}/audio` : undefined,
    imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : undefined,
    pinned: m.pinned === true,
  }
}

export async function fetchSessions(): Promise<Recording[]> {
  const res = await apiFetch('/api/sessions')
  if (!res.ok) return []
  const rows = (await res.json()) as SessionRow[]
  return rows.map(sessionToRecording)
}

export interface NewUtterancePayload {
  idx?: number
  source?: string
  speakerName?: string
  sourceLang?: string
  sourceText?: string
  targetLang?: string
  translatedText?: string
  confidence?: number
  engine?: string
  /** Timing real do enunciado (ms, relativo ao início da sessão). */
  tStartMs?: number
  tEndMs?: number
}

export interface CreateSessionPayload {
  title?: string
  kind?: string
  sourceLang?: string
  targetLang?: string
  status?: string
  durationMs?: number
  utterances?: NewUtterancePayload[]
  /** Migração sem conta → conta: o servidor é idempotente por este id (ver data/migracao). */
  origemLocalId?: string
}

export async function createSession(payload: CreateSessionPayload): Promise<Recording> {
  const res = await apiFetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('falha ao salvar a sessão')
  return sessionToRecording((await res.json()) as SessionRow)
}

/** Sobe o áudio gravado da sessão (Blob do MediaRecorder). Best-effort — nunca quebra o save. */
export async function uploadSessionAudio(id: string, blob: Blob): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/sessions/${id}/audio`, {
      timeoutMs: IMPORT_TIMEOUT_MS, // upload de áudio grande (até 120MB)
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { audioUrl?: string }
    return data.audioUrl ?? `/api/sessions/${id}/audio`
  } catch {
    return null
  }
}

// ───────────────────────────── Importação ─────────────────────────────
// Cada import produz uma SESSÃO no formato canônico (ver server/routes/import.ts). Estes wrappers
// são finos: só falam com `/api/import/*` e propagam o erro do servidor (mensagem honesta na UI).

export interface ImportYoutubeResult {
  id: string
  /** true = vídeo SEM legenda → o cliente transcreve o áudio baixado com o Whisper local. */
  needsClientStt: boolean
  sourceLang?: string
  captionKind: 'manual' | 'auto' | null
}

export async function importYoutube(url: string): Promise<ImportYoutubeResult> {
  const res = await apiFetch('/api/import/youtube', {
    timeoutMs: IMPORT_TIMEOUT_MS, // yt-dlp: até 300s no servidor
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'falha ao importar do YouTube')
  return data as ImportYoutubeResult
}

/** Resultado da extração de TEXTO (web/documento) — o cliente monta a sessão-documento. */
export interface ImportTextResult {
  title: string
  text: string
  lang?: string
}

export async function importWeb(url: string): Promise<ImportTextResult> {
  const res = await apiFetch('/api/import/web', {
    timeoutMs: IMPORT_TIMEOUT_MS, // fetch + Readability de página arbitrária
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'falha ao importar a página')
  return data as ImportTextResult
}

export async function importDocument(file: File): Promise<ImportTextResult> {
  const res = await apiFetch('/api/import/document', {
    timeoutMs: IMPORT_TIMEOUT_MS, // documento até 30MB (PDF/DOCX)
    method: 'POST',
    // Corpo binário cru + nome no header (mesmo padrão do upload de áudio; sem multer no servidor).
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
    },
    body: file,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'falha ao importar o documento')
  return data as ImportTextResult
}

/** Mescla `{ pinned?, imageUrl? }` no `meta` da sessão. Devolve o Recording atualizado. */
export async function patchSessionMeta(
  id: string,
  patch: { pinned?: boolean; imageUrl?: string | null },
): Promise<Recording | null> {
  try {
    const res = await apiFetch(`/api/sessions/${id}/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    return sessionToRecording((await res.json()) as SessionRow)
  } catch {
    return null
  }
}

/** Soft delete da sessão (o servidor também apaga o áudio real). Best-effort. */
/** Renomeia a sessão / ajusta duração e contagem (ex.: depois de retomar a captura). */
export async function updateSession(
  id: string,
  patch: { title?: string; kind?: string; status?: string; durationMs?: number; wordCount?: number },
): Promise<Recording | null> {
  try {
    const res = await apiFetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    return sessionToRecording((await res.json()) as SessionRow)
  } catch {
    return null
  }
}

/**
 * Substitui TODAS as falas da sessão. É o que "retomar captura" usa: o cliente
 * reidrata o que existia, continua gravando e devolve o conjunto completo — um
 * append duplicaria o transcript antigo. O servidor recalcula `wordCount`.
 */
export async function replaceSessionUtterances(
  id: string,
  utterances: NewUtterancePayload[],
): Promise<Recording | null> {
  try {
    const res = await apiFetch(`/api/sessions/${id}/utterances`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utterances }),
    })
    if (!res.ok) return null
    return sessionToRecording((await res.json()) as SessionRow)
  } catch {
    return null
  }
}

/** Corrige uma fala: o que o STT ouviu errado, a tradução, ou o nome do falante. */
export async function updateUtterance(
  utteranceId: string,
  patch: { sourceText?: string; translatedText?: string; speakerName?: string },
): Promise<UtteranceRow | null> {
  try {
    const res = await apiFetch(`/api/sessions/utterances/${utteranceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    return (await res.json()) as UtteranceRow
  } catch {
    return null
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

export interface SessionTranscript {
  session: SessionRow
  utterances: UtteranceRow[]
}

export async function fetchSessionTranscript(id: string): Promise<SessionTranscript> {
  const res = await apiFetch(`/api/sessions/${id}`)
  if (!res.ok) throw new Error('sessão não encontrada')
  return (await res.json()) as SessionTranscript
}

// ───────────────────────────── Vocabulário ─────────────────────────────

interface VocabRow {
  id: string
  word: string
  back: string | null
  sentence: string | null
  srcLang: string | null
  tgtLang: string | null
  clozePrompt: string | null
  clozeAnswer: string | null
  box: number | null
  dueAt: number | null
  stability: number | null
  difficulty: number | null
  reps: number | null
  /** epoch ms da última revisão FSRS. A coluna sempre existiu (`server/db/schema.ts`); só esta
   *  interface a omitia, então o servidor já mandava o campo e o cliente o descartava aqui. */
  lastReview: number | null
  sessionId: string | null
  inDeck: number | null
  cefrLevel: string | null
  cefrConfidence: number | null
}

function fsrsStateOf(row: VocabRow): VocabCard['fsrsState'] {
  if (row.stability == null) return 'New'
  return (row.reps ?? 0) < 2 ? 'Learning' : 'Review'
}

export function rowToVocabCard(row: VocabRow): VocabCard {
  const dueIso = row.dueAt ? new Date(row.dueAt).toISOString() : ''
  return {
    id: row.id,
    word: row.word,
    phonetics: '',
    translation: row.back ?? '',
    explanation: '',
    sentence: row.sentence ?? undefined,
    // Idiomas REAIS do cartão (o banco já os guardava; a UI os ignorava e assumia en→pt).
    srcLang: row.srcLang ?? undefined,
    tgtLang: row.tgtLang ?? undefined,
    // O nível vem do banco (a lista curada grava `cefrLevel`+`confidence: 1`). Sem isto a trilha
    // não tem como respeitar o nível escolhido.
    cefrLevel: row.cefrLevel ?? undefined,
    cefrConfidence: row.cefrConfidence ?? undefined,
    sourceSessionId: row.sessionId ?? undefined,
    daTrilha: !!(row as { daTrilha?: boolean }).daTrilha,
    frequency: 'medium',
    leitnerBox: row.box ?? 1,
    leitnerDueAt: dueIso,
    fsrsState: fsrsStateOf(row),
    fsrsStability: row.stability ?? 0,
    fsrsDifficulty: row.difficulty ?? 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: dueIso,
    /* LIDO DO BANCO, não mais fixo em `true`.
       Enquanto era constante, TODO `filter(c => c.inDeck)` do app era um no-op, inclusive o da
       tela de jogos, e arquivar um cartão não tinha efeito nenhum. A coluna sempre existiu
       (`schema.ts`); só o cliente é que a ignorava. `?? true` mantém os cartões antigos, gravados
       antes de a coluna ser preenchida, dentro do baralho. */
    inDeck: row.inDeck == null ? true : row.inDeck === 1,
    stability: row.stability ?? undefined,
    /* Segundo insumo da retenção real (`retrievability(dias, estabilidade)`, `@core`). Sem isto a
       UI só tinha a estabilidade, metade da conta, e o painel "Requer Atenção" classificava os
       151 cartões revisados como "nunca revisados", invertendo o próprio diagnóstico. */
    lastReview: row.lastReview ?? undefined,
    reps: row.reps ?? undefined,
  }
}

export async function fetchDeck(): Promise<VocabCard[]> {
  const res = await apiFetch('/api/vocab')
  if (!res.ok) return []
  return ((await res.json()) as VocabRow[]).map(rowToVocabCard)
}

/**
 * Edita um cartão pela CURADORIA: a tradução e a presença no baralho.
 * Arquivar (`inDeck: false`) tira das rodadas sem apagar — o cartão continua no banco.
 */
export async function updateCard(
  id: string,
  patch: { translation?: string; inDeck?: boolean },
): Promise<VocabCard> {
  const body: Record<string, unknown> = {}
  if (typeof patch.translation === 'string') body.back = patch.translation
  if (typeof patch.inDeck === 'boolean') body.inDeck = patch.inDeck
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('não consegui salvar a alteração')
  return rowToVocabCard((await res.json()) as VocabRow)
}

/** Uma nota lida de um baralho do Anki (ainda NÃO gravada). */
export interface NotaAnki {
  frente: string
  verso: string
  exemplo?: string
  tags: string[]
}

export interface LeituraAnki {
  notas: NotaAnki[]
  formato: string
  campos: string[]
  descartadas: number
  temMidia: boolean
}

/**
 * Lê um baralho do Anki (`.apkg`, `.txt`, `.csv`) SEM gravar nada.
 *
 * A gravação é um segundo passo, por `bulkAddCards`, para o baralho importado passar pela mesma
 * régua de qualidade e pela mesma deduplicação de todo o resto — e para a tela poder mostrar o
 * que entrou e o que foi pulado antes de mexer no vocabulário de alguém.
 */
export async function lerBaralhoAnki(arquivo: File): Promise<LeituraAnki> {
  const res = await apiFetch('/api/import/anki', {
    timeoutMs: IMPORT_TIMEOUT_MS, // .apkg até 200MB
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(arquivo.name) },
    body: arquivo,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: 'falha ao ler o baralho' }))
    throw new Error(e.error ?? 'falha ao ler o baralho')
  }
  return (await res.json()) as LeituraAnki
}

/**
 * Gera um `.apkg` no servidor e devolve o arquivo para download.
 *
 * O `.txt` é o caminho garantido (o Anki o importa nativamente e sem plugin); o `.apkg` é o que
 * abre com duplo clique e chega com nome de baralho. A tela oferece os dois de propósito.
 */
export async function exportarApkg(
  cartoes: Array<{ frente: string; verso: string; exemplo?: string }>,
  nome: string,
): Promise<Blob> {
  const res = await apiFetch('/api/import/anki/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartoes, nome }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: 'falha ao gerar o baralho' }))
    throw new Error(e.error ?? 'falha ao gerar o baralho')
  }
  return await res.blob()
}

export interface NewCardPayload {
  word: string
  back?: string
  sentence?: string
  srcLang?: string
  tgtLang?: string
  clozePrompt?: string
  clozeAnswer?: string
  sessionId?: string
}

/** Um cartão recusado na entrada, com o motivo — o servidor não engole em silêncio. */
export interface CartaoPulado {
  word: string
  motivo: string
}

/**
 * Resultado real de uma inserção: o que entrou e o que ficou de fora.
 *
 * O servidor passou a aplicar a régua de qualidade e a deduplicar por (palavra, idioma). Sem
 * devolver os pulados, a tela diria "salvei 6" tendo salvo 2 — que é como o baralho chegou a
 * 1.506 cartões com 194 repetições e 72 com a "tradução" igual à palavra.
 */
export interface BulkAddResult {
  cards: VocabCard[]
  skipped: CartaoPulado[]
}

export async function bulkAddCards(cards: NewCardPayload[]): Promise<BulkAddResult> {
  const res = await apiFetch('/api/vocab/bulk-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  })
  if (!res.ok) return { cards: [], skipped: [] }
  const body = (await res.json()) as { cards: VocabRow[]; skipped?: CartaoPulado[] }
  const criados = (body.cards ?? []).map(rowToVocabCard)
  /* Som de "guardei" no ponto onde a palavra ENTRA no deck, e so quando entrou de verdade —
     as quatro telas que adicionam vocabulario (Analise, Captura, Vocabulario, menu de pratica)
     passam todas por aqui. Um `add` num botao que falhou seria mentira. */
  if (criados.length) play('add')
  return { cards: criados, skipped: body.skipped ?? [] }
}

/**
 * Corrige o idioma de cartões existentes (Auditoria de idioma). Só grava o que o usuário confirmou;
 * toca exclusivamente `srcLang`/`tgtLang` — o histórico de revisão do cartão fica intacto.
 * Devolve quantos cartões foram de fato alterados (não quantos foram pedidos).
 */
export async function relabelCards(
  items: Array<{ id: string; srcLang: string; tgtLang: string }>,
): Promise<number> {
  if (!items.length) return 0
  const res = await apiFetch('/api/vocab/relabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) throw new Error('falha ao corrigir o idioma dos cartões')
  return ((await res.json()) as { changed: number }).changed
}

/** TODAS as falas do banco — usado só pela Auditoria de idioma para varrer o passivo das transcrições. */
export async function fetchAllUtterances(): Promise<UtteranceRow[]> {
  const res = await apiFetch('/api/sessions/utterances/all')
  if (!res.ok) throw new Error('falha ao carregar as falas')
  return (await res.json()) as UtteranceRow[]
}

/**
 * Reetiquetagem de idioma das falas (Auditoria). Espelha `relabelCards`, mas os campos são os da fala
 * (`sourceLang`/`targetLang`). Devolve quantas falas o servidor de fato alterou, não quantas pedimos.
 */
export async function relabelUtterances(
  items: Array<{ id: string; sourceLang: string; targetLang: string }>,
): Promise<number> {
  if (!items.length) return 0
  const res = await apiFetch('/api/sessions/utterances/relabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) throw new Error('falha ao corrigir o idioma das falas')
  return ((await res.json()) as { changed: number }).changed
}

/** Revisão SRS: grade 1=Again 2=Hard 3=Good 4=Easy. Persiste o estado FSRS. */
export async function reviewCard(id: string, grade: 1 | 2 | 3 | 4): Promise<VocabCard> {
  const res = await apiFetch(`/api/vocab/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade }),
  })
  if (!res.ok) throw new Error('falha ao revisar o card')
  return rowToVocabCard((await res.json()) as VocabRow)
}

// ───────────────────────────── Métricas ─────────────────────────────

// M-06: contrato ÚNICO — `AppMetrics` vem de src/core/learning/contract.ts (era duplicado aqui e no
// servidor, e já divergia: `seedsGastas` era opcional aqui e obrigatório lá). Re-exportado para os
// consumidores que importavam de `data/api`.
export type { AppMetrics } from '@core'
import type { AppMetrics } from '@core'

/**
 * Métricas do perfil. Com `sessionId`, só daquela gravação.
 *
 * O parâmetro é opcional de propósito: toda chamada existente continua pedindo a conta inteira,
 * e a aba de métricas da Sessão passa a ter o que chamar — antes ela não tinha, e preenchia o
 * vazio com dado global renderizado dentro de um painel de sessão.
 */
export async function fetchMetrics(sessionId?: string | null): Promise<AppMetrics | null> {
  const qs = sessionId ? `?sessao=${encodeURIComponent(sessionId)}` : ''
  const res = await apiFetch(`/api/metrics/profile${qs}`)
  if (!res.ok) return null
  return (await res.json()) as AppMetrics
}

// ───────────────────────────── Exercícios ─────────────────────────────

export interface ExerciseResultPayload {
  sessionId?: string
  kind?: string
  /** 1 = acertou, 0 = errou. */
  correct?: number
  score?: number
  exerciseKind?: string
  /**
   * Campos abaixo: migração 0001. Antes deles uma rodada de 8 itens virava 8 linhas
   * indistinguíveis no banco (gravadas em `Promise.all`, mesmo milissegundo), e o
   * `ItemOutcome` — que já mede attempts/ms/hinted — tinha isso tudo descartado no POST.
   * Todos opcionais: o servidor aceita o payload antigo sem mudança.
   */
  /** Id da rodada — reagrupa os itens de UMA partida. */
  roundId?: string
  /** A palavra (jogo de baralho) ou o id da fala (jogo de frase). Responde "o que eu já vi". */
  itemRef?: string
  /** Tentativas até acertar (1 = de primeira). */
  attempts?: number
  /** Tempo até responder, em ms. */
  ms?: number
  /** 1 = usou dica/revelação. */
  hinted?: number
  /** 'baralho' | 'sessao:<id>' | 'trilha:<nivel>'. */
  origem?: string
}

export interface ExerciseResultRow extends ExerciseResultPayload {
  id: string
  createdAt: number
}

/**
 * O que aconteceu na gravação. Antes isto era `ExerciseResultRow | null`, e o `null` era MUDO:
 * uma rodada rejeitada pela validação do servidor (o teto de `score`, por anos) era
 * indistinguível de rede caída, e quem chamava não tinha como contar nem avisar. O erro sumia
 * inteiro — foi assim que 53 linhas de duelo relâmpago acabaram com um `round_id` só.
 *
 * Uma FORMA SÓ, e não uma união discriminada: este projeto compila sem `strict`, e sem
 * `strictNullChecks` o TypeScript não estreita `{ok:true}|{ok:false}` — ler `.motivo` depois de
 * um `if (!r.ok)` daria erro de compilação. Campos opcionais custam nada e funcionam aqui.
 */
export interface GravacaoDeExercicio {
  ok: boolean
  row?: ExerciseResultRow
  /** HTTP quando o servidor respondeu; `null` quando nem chegou lá (rede). */
  status?: number | null
  /** O corpo do erro — é ele que diz QUAL campo o zod barrou. */
  motivo?: string
}

/**
 * Persiste uma RODADA inteira em UMA requisição (F3).
 *
 * Substitui o `Promise.all` de N chamadas a `saveExerciseResult`: 20 itens viravam 20 requests e
 * ~60 queries, e a falha parcial deixava a rodada meio gravada. Continua best-effort — quem chama
 * decide o que fazer —, mas agora "gravou" e "não gravou" são estados inteiros, não por item.
 */
export async function salvarRodada(payload: {
  roundId: string
  exerciseKind?: string
  origem?: string
  sessionId?: string
  score?: number
  itens: Array<{ cardId?: string; itemRef?: string; correct?: number; attempts?: number; ms?: number; hinted?: number; kind?: string }>
}): Promise<GravacaoDeExercicio> {
  try {
    const res = await apiFetch('/api/exercises/rodada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const motivo = await res.text().catch(() => '')
      return { ok: false, status: res.status, motivo: motivo.slice(0, 300) || res.statusText }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: String((e as Error)?.message ?? e).slice(0, 200) }
  }
}

/** Persiste o resultado de um exercício. Best-effort: NUNCA lança — quem chama decide o que fazer. */
export async function saveExerciseResult(
  payload: ExerciseResultPayload,
): Promise<GravacaoDeExercicio> {
  try {
    const res = await apiFetch('/api/exercises/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      // O corpo do 400 diz QUAL campo o zod barrou — é a diferença entre "some sem explicação"
      // e "score: teto excedido". Ler o corpo pode falhar por si só; não deixa isso derrubar.
      const motivo = await res.text().catch(() => '')
      return { ok: false, status: res.status, motivo: motivo.slice(0, 300) || res.statusText }
    }
    return { ok: true, row: (await res.json()) as ExerciseResultRow }
  } catch (erro) {
    return { ok: false, status: null, motivo: erro instanceof Error ? erro.message : 'rede' }
  }
}

/**
 * `origem` recorta no SERVIDOR. Quem lê isto (a tela de jogos, para remontar a última rodada de
 * cada jogo) já descartava as outras fontes no cliente — mas depois de baixá-las. Com uma corrente
 * de rodadas em curso, esta chamada acontece a cada rodada e a tabela cresce a cada rodada.
 */
export async function fetchExerciseResults(
  sessionId?: string,
  opts: { origem?: string } = {},
): Promise<ExerciseResultRow[]> {
  const qs = new URLSearchParams()
  if (sessionId) qs.set('sessionId', sessionId)
  else if (opts.origem) qs.set('origem', opts.origem)
  const q = qs.toString()
  const res = await apiFetch(`/api/exercises/results${q ? `?${q}` : ''}`)
  if (!res.ok) return []
  return (await res.json()) as ExerciseResultRow[]
}

/** Uma linha do histórico agregado por item. Chave = `itemRef`. */
export interface HistoricoDeItem {
  itemRef: string
  vezes: number
  erros: number
  ultimaEm: number
  ultimoAcerto: boolean
}

/**
 * O que já apareceu, agregado por item — a leitura que permite dizer o que vem, repetir uma
 * rodada e evitar repetir o que já foi acertado. Defensiva como `fetchMetrics`/`fetchDeck`:
 * devolve `[]` em erro de rede ou status ruim, porque um histórico ausente deve degradar para
 * "nunca vi nada" e não derrubar a tela do jogo.
 */
export async function fetchHistoricoDeItens(
  opts: { origem?: string; desde?: number } = {},
): Promise<HistoricoDeItem[]> {
  try {
    const qs = new URLSearchParams()
    if (opts.origem) qs.set('origem', opts.origem)
    if (typeof opts.desde === 'number') qs.set('desde', String(opts.desde))
    const q = qs.toString()
    const res = await apiFetch(`/api/exercises/historico${q ? `?${q}` : ''}`)
    if (!res.ok) return []
    return (await res.json()) as HistoricoDeItem[]
  } catch {
    return []
  }
}

/**
 * Gasta seeds — idempotente por `spendId`.
 *
 * QUEM CHAMA GERA O `spendId` ANTES de enviar, e reenvia o MESMO id em qualquer retry. É isso que
 * impede o duplo-clique de cobrar duas vezes: o botão que gasta vive numa tela de fim de rodada,
 * onde se clica rápido, e o servidor precisa poder dizer "esta é a mesma compra".
 *
 * Devolve `null` em falha (rede ou recusa). Quem chamou deve tratar como "não comprou" e NÃO
 * entregar o benefício — ao contrário das outras leituras, aqui degradar em silêncio para o
 * valor cheio seria dar o item de graça.
 */
export async function gastarSeeds(input: {
  spendId: string
  amount: number
  reason: string
  ref?: string
}): Promise<{ jaExistia: boolean; gasto: number; seedsGastas: number } | null> {
  try {
    const res = await apiFetch('/api/metrics/seeds/gastar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** O melhor placar já feito num jogo, numa fonte. Chave = `exerciseKind`. */
export interface RecordeDoJogo {
  exerciseKind: string
  melhorPontos: number
  melhorEm: number
  /** Rodadas DISTINTAS já jogadas — `score` é gravado por item, então contar linhas mentiria. */
  rodadas: number
}

/**
 * Os recordes por jogo. Mesma postura defensiva de `fetchHistoricoDeItens`: `[]` em qualquer
 * falha, porque recorde ausente deve degradar para "ainda não há recorde" — nunca impedir de
 * jogar nem derrubar a tela de fim de rodada, onde ele é exibido.
 */
export async function fetchRecordes(opts: { origem?: string } = {}): Promise<RecordeDoJogo[]> {
  try {
    const q = opts.origem ? `?origem=${encodeURIComponent(opts.origem)}` : ''
    const res = await apiFetch(`/api/exercises/recordes${q}`)
    if (!res.ok) return []
    return (await res.json()) as RecordeDoJogo[]
  } catch {
    return []
  }
}

// ───────────────────────────── Configurações ─────────────────────────────

export interface AppSettings {
  id: string
  activeProfileId: string | null
  targetLanguage: string | null
  ui: string | null
}

export interface SettingsPayload {
  activeProfileId?: string | null
  targetLanguage?: string | null
  ui?: unknown
}

export async function fetchSettings(): Promise<AppSettings | null> {
  try {
    const res = await apiFetch('/api/settings')
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

export async function saveSettings(payload: SettingsPayload): Promise<AppSettings | null> {
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return (await res.json()) as AppSettings
  } catch {
    return null
  }
}

/**
 * Atualiza campos do blob `ui` MESCLANDO com o que já existe (o `ui` é compartilhado
 * por onboarding, tema, persona etc.). Evita que salvar uma pref apague as outras.
 */
export async function patchUiSettings(patch: Record<string, unknown>): Promise<AppSettings | null> {
  const s = await fetchSettings()
  let ui: Record<string, unknown>
  try { ui = s?.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {} } catch { ui = {} }
  return saveSettings({ ui: { ...ui, ...patch } })
}

// ───────────────────────────── Credenciais (chave de nuvem) ─────────────────────────────
// O segredo é enviado UMA vez (POST), cifrado no servidor e nunca devolvido. O cliente
// só guarda o `id` (credentialId) para referenciar nos bindings do perfil.

export interface CredentialMeta {
  id: string
  label: string | null
  kind: string | null
  baseUrl: string | null
  defaultModel: string | null
}

export interface NewCredentialPayload {
  label?: string
  kind?: string
  baseUrl?: string
  defaultModel?: string
  secret?: string
}

export async function listCredentials(): Promise<CredentialMeta[]> {
  try {
    const res = await apiFetch('/api/ai/credentials')
    if (!res.ok) return []
    return (await res.json()) as CredentialMeta[]
  } catch {
    return []
  }
}

export async function createCredential(payload: NewCredentialPayload): Promise<CredentialMeta | null> {
  try {
    const res = await apiFetch('/api/ai/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return null
    return (await res.json()) as CredentialMeta
  } catch {
    return null
  }
}

export async function deleteCredential(id: string): Promise<void> {
  try { await apiFetch(`/api/ai/credentials/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
}

/** Testa um provider por credentialId (ou baseUrl+apiKey cru). Chave nunca no cliente. */
export async function testProvider(payload: { credentialId?: string; baseUrl?: string; model?: string; apiKey?: string }): Promise<{ ok: boolean; latencyMs?: number; message?: string }> {
  try {
    const res = await apiFetch('/api/ai/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { ok: boolean; latencyMs?: number; message?: string }
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message ?? e) }
  }
}

// ───────────────────────────── Imagens (hover keyless) ─────────────────────────────
// Proxy p/ Openverse (sem chave). Falha honesta: devolve [] quando não há imagem.

export interface ImageResult {
  id: string
  thumbnail: string
  url: string
  title?: string
  creator?: string
  source?: string
  license?: string
}

export async function searchImages(q: string): Promise<ImageResult[]> {
  try {
    const res = await apiFetch(`/api/images/search?q=${encodeURIComponent(q)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { results?: ImageResult[] }
    return data.results ?? []
  } catch {
    return []
  }
}
