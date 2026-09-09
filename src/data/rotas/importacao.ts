/**
 * O CLIENTE DAS ROTAS DE IMPORTAÇÃO.
 *
 * Cada import produz uma SESSÃO no formato canônico (ver server/routes/import.ts). Estes wrappers
 * são finos: só falam com as rotas de import e propagam o erro do servidor (mensagem honesta na UI).
 *
 * NÃO HÁ ESPELHO deste arquivo em `src/data/efemero/rotas/` — e a ausência é a informação: importar
 * exige o servidor (yt-dlp, busca de página com CORS e SSRF, extração de PDF/DOCX). O motivo está
 * escrito em `tests/contratos/rotas-espelhadas.test.ts`, que o cobra.
 *
 * Rotas: POST `/api/import/youtube`, POST `/api/import/web`, POST `/api/import/document`.
 */
import { apiFetch, IMPORT_TIMEOUT_MS } from '../api'

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
