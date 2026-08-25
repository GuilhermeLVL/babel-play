/** Rotas de busca de imagens (montadas em `/api/images`). Proxy keyless p/ Openverse. */
import { Router } from 'express'
import { imageSearchQuerySchema, parseOr400 } from '../validation'

export const imagesRouter = Router()

// Shape compacto que o cliente consome (uma imagem por card de hover).
interface ImageResult {
  id: string
  thumbnail: string
  url: string
  title?: string
  creator?: string
  source?: string
  license?: string
}

// Cache em memória por query (lowercase). Evita re-bater no Openverse a cada hover.
const CACHE_CAP = 200
const cache = new Map<string, ImageResult[]>()

function cacheGet(key: string): ImageResult[] | undefined {
  return cache.get(key)
}

function cacheSet(key: string, results: ImageResult[]): void {
  cache.set(key, results)
  // Evict o mais antigo (Map preserva ordem de inserção) quando estoura o teto.
  while (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

// Openverse: API pública sem chave. Timeout curto — o cliente degrada sozinho.
const OPENVERSE_URL = 'https://api.openverse.org/v1/images/'

imagesRouter.get('/search', async (req, res) => {
  const bruto = String(req.query.q ?? '').trim()
  if (!bruto) { res.json({ results: [] }); return }
  // P2-1: `q` sem teto virava chave do cache em memória (200 entradas) — um termo enorme
  // inflava o heap do processo sem limite.
  const parsed = parseOr400(imageSearchQuerySchema, { q: bruto }, res)
  if (!parsed) return
  const q = parsed.q

  const key = q.toLowerCase()
  const cached = cacheGet(key)
  if (cached) { res.json({ results: cached }); return }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const url = `${OPENVERSE_URL}?q=${encodeURIComponent(q)}&page_size=8&license_type=all&mature=false`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) { res.json({ results: [], error: `openverse ${response.status}` }); return }

    const data: any = await response.json()
    const raw: any[] = Array.isArray(data?.results) ? data.results : []
    const results: ImageResult[] = []
    for (const item of raw) {
      const thumbnail = item?.thumbnail
      const url = item?.url
      if (!thumbnail || !url) continue
      results.push({
        id: String(item?.id ?? url),
        thumbnail,
        url,
        title: item?.title ?? undefined,
        creator: item?.creator ?? undefined,
        source: item?.source ?? undefined,
        license: item?.license ?? undefined,
      })
      if (results.length >= 8) break
    }

    cacheSet(key, results)
    res.json({ results })
  } catch (err) {
    // Falha honesta: HTTP 200 com lista vazia + motivo curto (o cliente não quebra).
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'erro de rede'
    res.json({ results: [], error: reason })
  } finally {
    clearTimeout(timeout)
  }
})
