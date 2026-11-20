/**
 * O CLIENTE DAS ROTAS DE IMPORTAÇÃO.
 *
 * Cada import produz uma SESSÃO no formato canônico (ver server/routes/import.ts). Estes wrappers
 * são finos: só falam com as rotas de import e propagam o erro do servidor (mensagem honesta na UI).
 *
 * NÃO HÁ ESPELHO deste arquivo em `src/data/efemero/rotas/` — e a ausência é a informação: importar
 * uma página exige o servidor (busca com CORS e SSRF). PDF, DOCX e Anki são lidos no navegador. O motivo está
 * escrito em `tests/contratos/rotas-espelhadas.test.ts`, que o cobra.
 *
 * Rota: POST `/api/import/web`.
 */
import { apiFetch, IMPORT_TIMEOUT_MS } from '../funil'

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
