/**
 * O CLIENTE DAS ROTAS DE SESSÃO — sessões, falas e áudio.
 *
 * Espelho de `src/data/efemero/rotas/sessoes.ts`, arquivo a arquivo: os dois lados deste contrato
 * têm o MESMO recorte por domínio de rota, para que dê para lê-los lado a lado.
 *
 * Rotas: GET/POST `/api/sessions`, GET/PATCH/DELETE `/api/sessions/:id`,
 * PATCH `/api/sessions/:id/meta`, PUT/POST `/api/sessions/:id/utterances`,
 * POST/GET `/api/sessions/:id/audio`, PATCH `/api/sessions/utterances/:id`,
 * GET `/api/sessions/utterances/all`, POST `/api/sessions/utterances/relabel`.
 */
import { data } from '../../lib/i18n'
import type { Recording } from '../../types'
import { apiFetch, IMPORT_TIMEOUT_MS } from '../funil'

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
    idioma: s.sourceLang ?? undefined,
    pronta: (s.status === 'done' || s.status === 'ready') && (s.wordCount ?? 0) > 0,
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

/**
 * A RECUSA DE UMA ESCRITA DE SESSÃO, com o que o servidor disse (relato do dono, 2026-09-28).
 *
 * Antes, toda recusa virava `'falha ao salvar a sessão'`: o 507 do teto sem conta, que explica o
 * limite e o que fazer, chegava à tela como uma frase muda, e a tela reabria o Encerrar num laço.
 * Agora o texto, o código (`TETO_ANONIMO`, `validacao`…) e o status atravessam — é a tela que
 * decide a saída a partir deles. `status` 0 = não houve resposta (rede, prazo).
 */
export class ErroDeSessao extends Error {
  readonly status: number
  readonly codigo?: string
  /** No 507 do teto: o recurso e os números (`teto`, `usado`). */
  readonly detalhes: Record<string, unknown>
  constructor(mensagem: string, status: number, codigo?: string, detalhes: Record<string, unknown> = {}) {
    super(mensagem)
    this.name = 'ErroDeSessao'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

/** O teto sem conta recusou a gravação? (507 `TETO_ANONIMO` do espelho.) */
export function ehTetoDeSessoes(e: unknown): boolean {
  return e instanceof ErroDeSessao && e.codigo === 'TETO_ANONIMO'
}

/** Lê o envelope da recusa: `{ error, code | codigo, ...detalhes }` (o espelho usa `codigo`). */
async function erroDaResposta(res: Response, padrao: string): Promise<ErroDeSessao> {
  try {
    const corpo = (await res.json()) as Record<string, unknown>
    const { error, code, codigo, ...detalhes } = corpo ?? {}
    const texto = typeof error === 'string' && error ? error : padrao
    const cod = typeof code === 'string' ? code : typeof codigo === 'string' ? codigo : undefined
    return new ErroDeSessao(texto, res.status, cod, detalhes)
  } catch {
    return new ErroDeSessao(padrao, res.status)
  }
}

/** A escrita de sessão com a recusa tipada — e a falta de resposta também, com status 0. */
async function escrever(url: string, metodo: string, corpo: unknown, padrao: string): Promise<SessionRow> {
  let res: Response
  try {
    res = await apiFetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  } catch (e) {
    throw new ErroDeSessao(`${padrao}: sem resposta do servidor (${(e as Error)?.message ?? e})`, 0)
  }
  if (!res.ok) throw await erroDaResposta(res, padrao)
  return (await res.json()) as SessionRow
}

export async function createSession(payload: CreateSessionPayload): Promise<Recording> {
  return sessionToRecording(await escrever('/api/sessions', 'POST', payload, 'falha ao salvar a sessão'))
}

/**
 * O TAMANHO DO LOTE de falas por pedido. O servidor aceita até 1.000 por lote e 5.000 no POST; 500
 * deixa o corpo pequeno (uma fala leva até 20 KB de texto) e cada pedido curto o bastante para o
 * prazo do funil.
 */
export const LOTE_DE_FALAS = 500

/** Acrescenta um lote de falas (`POST /:id/utterances`); idempotente por faixa de `idx`. */
export async function appendSessionUtterances(id: string, utterances: NewUtterancePayload[]): Promise<Recording> {
  const lote = utterances.map((u, i) => ({ ...u, idx: u.idx ?? i }))
  return sessionToRecording(
    await escrever(`/api/sessions/${id}/utterances`, 'POST', { utterances: lote }, 'falha ao guardar as falas'),
  )
}

function emLotes<T>(itens: T[], tamanho = LOTE_DE_FALAS): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

/** Cada fala leva o seu `idx` explícito: é ele que torna o reenvio de um lote idempotente. */
function comIdx(utterances: NewUtterancePayload[] = []): NewUtterancePayload[] {
  return utterances.map((u, i) => ({ ...u, idx: u.idx ?? i }))
}

/**
 * CRIA A SESSÃO DA CAPTURA EM LOTES: o primeiro vai no POST, o resto em `POST /:id/utterances`.
 *
 * Tira o teto de 5.000 falas por sessão (o `max` do POST) sem mexer no contrato do POST. Com
 * `origemLocalId`, repetir tudo depois de uma falha no meio é seguro: o POST devolve a sessão que
 * já existia (`jaExistia`) e cada lote substitui a própria faixa. `aoProgresso(feitas, total)`.
 */
export async function criarSessaoEmLotes(
  payload: CreateSessionPayload,
  aoProgresso?: (feitas: number, total: number) => void,
): Promise<Recording> {
  const falas = comIdx(payload.utterances)
  const [primeiro = [], ...resto] = emLotes(falas)
  let recording = await createSession({ ...payload, utterances: primeiro })
  let feitas = primeiro.length
  aoProgresso?.(feitas, falas.length)
  for (const lote of resto) {
    recording = await appendSessionUtterances(recording.id, lote)
    feitas += lote.length
    aoProgresso?.(feitas, falas.length)
  }
  return recording
}

/** RETOMADA em lotes: o PUT troca tudo pelo primeiro lote, o resto é acrescentado. Recusa lança. */
export async function substituirFalasEmLotes(
  id: string,
  utterances: NewUtterancePayload[],
  aoProgresso?: (feitas: number, total: number) => void,
): Promise<Recording> {
  const falas = comIdx(utterances)
  const [primeiro = [], ...resto] = emLotes(falas)
  let recording = sessionToRecording(
    await escrever(`/api/sessions/${id}/utterances`, 'PUT', { utterances: primeiro }, 'falha ao guardar as falas'),
  )
  let feitas = primeiro.length
  aoProgresso?.(feitas, falas.length)
  for (const lote of resto) {
    recording = await appendSessionUtterances(id, lote)
    feitas += lote.length
    aoProgresso?.(feitas, falas.length)
  }
  return recording
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
