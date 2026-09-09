/**
 * O CLIENTE DAS ROTAS DE SESSÃO — sessões, falas e áudio.
 *
 * Espelho de `src/data/efemero/rotas/sessoes.ts`, arquivo a arquivo: os dois lados deste contrato
 * têm o MESMO recorte por domínio de rota, para que dê para lê-los lado a lado.
 *
 * Rotas: GET/POST `/api/sessions`, GET/PATCH/DELETE `/api/sessions/:id`,
 * PATCH `/api/sessions/:id/meta`, PUT `/api/sessions/:id/utterances`,
 * POST/GET `/api/sessions/:id/audio`, PATCH `/api/sessions/utterances/:id`,
 * GET `/api/sessions/utterances/all`, POST `/api/sessions/utterances/relabel`.
 */
import type { Recording } from '../../types'
import { data } from '../../lib/i18n'
import { apiFetch, IMPORT_TIMEOUT_MS } from '../api'

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
  // Diferença por dia de CALENDÁRIO, não por 24h corridas: gravado ontem à noite e visto de
  // manhã dava floor(0.6)=0 → "Há 0 dias" (ux-v2 §1.9).
  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((meiaNoite(now) - meiaNoite(d)) / 86_400_000)
  if (diffDays <= 1) return 'Ontem'
  if (diffDays < 7) return `Há ${diffDays} dias`
  return data(d)
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

/**
 * TODAS as falas do banco — usado pela Auditoria de idioma e pelas Métricas.
 *
 * SEM CONTA NÃO É FALHA (auditoria de 2026-09-07, achado A25). O servidor efêmero não espelha esta
 * rota e responde 501 `EXIGE_CONTA`; aqui isso virava `throw`, e a tela mostrava um erro onde
 * deveria mostrar o estado vazio de quem simplesmente não tem conta. Lista vazia é a resposta
 * correta para "quais são as suas falas guardadas?" quando não há onde guardá-las — e o convite
 * para criar conta já é feito pelo caminho próprio (`EVENTO_EXIGE_CONTA`), não por uma exceção.
 */
export async function fetchAllUtterances(): Promise<UtteranceRow[]> {
  const res = await apiFetch('/api/sessions/utterances/all')
  if (res.status === 501) return []
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
