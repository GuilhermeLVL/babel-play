/**
 * O CLIENTE DA ROTA DE IMAGENS (hover keyless).
 *
 * Proxy p/ Openverse (sem chave). Falha honesta: devolve [] quando não há imagem.
 *
 * NÃO HÁ ESPELHO deste arquivo em `src/data/efemero/rotas/`, e não precisa haver: quando o proxy
 * falha — inclusive o 501 de quem não tem conta — este mesmo código cai DIRETO no Openverse, que
 * é público e tem CORS. O motivo está escrito em `tests/contratos/rotas-espelhadas.test.ts`.
 *
 * Rotas: GET `/api/images/search` (`searchImages` para a capa da sessão, `buscarImagensLivres` para a
 * folha da palavra).
 */
import { apiFetch } from '../funil'

export interface ImageResult {
  id: string
  thumbnail: string
  url: string
  title?: string
  creator?: string
  source?: string
  license?: string
  /* O que a folha da palavra usa para filtrar e dar o crédito (`lib/imagens/criterios.ts`). */
  licenseVersion?: string
  /** A página da imagem no acervo de origem: autor, licença e condições. */
  landingUrl?: string
  width?: number
  height?: number
  filetype?: string
  category?: string
  tags?: string[]
}

/** Um resultado do Openverse como ele vem da API pública (só o que lemos). */
interface DoOpenverse {
  id?: string
  url?: string
  thumbnail?: string
  title?: string
  creator?: string
  source?: string
  license?: string
  license_version?: string
  foreign_landing_url?: string
  width?: number
  height?: number
  filetype?: string
  category?: string
  mature?: boolean
  tags?: Array<{ name?: string }>
}

/**
 * A BUSCA LIVRE DA FOLHA DA PALAVRA: os mesmos dois caminhos de `searchImages` (o proxy e, sem ele,
 * o Openverse direto), com 20 resultados e os campos que o filtro lê.
 *
 * Difere de `searchImages` em uma coisa, e é de propósito: lista VAZIA do proxy é resposta, não
 * falha. Lá, "o proxy não achou nada" refaz a busca direto no Openverse, e uma palavra sem imagem
 * custa dois pedidos de uma cota que é de 200 por dia por endereço. Aqui só a falha (rede, 501 de
 * quem não tem conta, `error` no corpo) leva ao caminho direto.
 */
export async function buscarImagensLivres(q: string): Promise<ImageResult[]> {
  try {
    const res = await apiFetch(`/api/images/search?q=${encodeURIComponent(q)}&n=20`)
    if (res.ok) {
      const data = (await res.json()) as { results?: ImageResult[]; error?: string }
      if (!data.error && Array.isArray(data.results)) return data.results
    }
  } catch { /* cai no direto */ }
  try {
    const r = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&mature=false`,
      { headers: { accept: 'application/json' } },
    )
    if (!r.ok) return []
    const d = (await r.json()) as { results?: DoOpenverse[] }
    return (d.results ?? [])
      .filter((x) => x.url && x.mature !== true)
      .map((x, i) => ({
        id: x.id ?? `ov-${i}`,
        url: x.url ?? '',
        thumbnail: x.thumbnail ?? x.url ?? '',
        title: x.title,
        creator: x.creator,
        source: x.source,
        license: x.license,
        licenseVersion: x.license_version,
        landingUrl: x.foreign_landing_url,
        width: x.width,
        height: x.height,
        filetype: x.filetype,
        category: x.category,
        tags: (x.tags ?? []).map((e) => e.name ?? '').filter(Boolean).slice(0, 12),
      }))
  } catch {
    return []
  }
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
