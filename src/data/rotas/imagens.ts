/**
 * O CLIENTE DA ROTA DE IMAGENS (hover keyless).
 *
 * Proxy p/ Openverse (sem chave). Falha honesta: devolve [] quando não há imagem.
 *
 * NÃO HÁ ESPELHO deste arquivo em `src/data/efemero/rotas/`, e não precisa haver: quando o proxy
 * falha — inclusive o 501 de quem não tem conta — este mesmo código cai DIRETO no Openverse, que
 * é público e tem CORS. O motivo está escrito em `tests/contratos/rotas-espelhadas.test.ts`.
 *
 * Rotas: GET `/api/images/search`.
 */
import { apiFetch } from '../api'

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
    if (res.ok) {
      const data = (await res.json()) as { results?: ImageResult[] }
      if (data.results?.length) return data.results
    }
  } catch { /* cai no direto */ }
  /* Com a API fora do ar: busca DIRETO no Openverse — API pública, sem chave e
     com CORS, o mesmo provedor que o proxy do servidor usa. Só a PALAVRA pesquisada sai daqui,
     num gesto explícito do usuário (hover/clique); nada da sessão. */
  try {
    const r = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=6&mature=false`,
      { headers: { accept: 'application/json' } },
    )
    if (!r.ok) return []
    const d = (await r.json()) as { results?: Array<{ url?: string; thumbnail?: string; title?: string }> }
    return (d.results ?? [])
      .filter((x) => x.thumbnail || x.url)
      .map((x, i) => ({ id: `ov-${i}`, url: x.url ?? x.thumbnail ?? '', thumbnail: x.thumbnail ?? x.url ?? '', title: x.title ?? q }))
  } catch {
    return []
  }
}
