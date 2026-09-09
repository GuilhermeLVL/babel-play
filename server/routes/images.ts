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

/*
 * O CACHE EM MEMÓRIA FOI REMOVIDO (Fase 5), e a decisão veio da MEDIÇÃO, não da regra.
 *
 * Havia aqui um `Map<string, ImageResult[]>` com teto de 200 entradas, sem validade, dizendo
 * "evita re-bater no Openverse a cada hover". Ele é estado de processo — com N instâncias cada uma
 * aquece o seu —, mas isso sozinho não decide nada: cache é otimização, não a "resposta certa" de
 * que fala `tests/integration/replica-sem-estado-local.test.ts`. O que decide é quanto ele rendia.
 *
 * MEDIDO sobre uma cópia de `data/babel.db` (240 falas, 6 sessões, 752 palavras distintas),
 * reproduzindo o fluxo real — o cliente JÁ tem cache por palavra (`hoverCacheRef` em
 * `src/lib/analise/palavraDaAnalise.ts:113`), então o que chega ao servidor é cada palavra
 * distinta uma vez por sessão aberta:
 *
 *     teto de 200 (o que existia)   20 de 916 buscas = 2,2% de acerto
 *     teto de 1.000                164 de 916        = 17,9%
 *     sem teto                     164 de 916        = 17,9%
 *
 * 2,2%. As 140 palavras que se repetem entre sessões quase sempre já foram despejadas quando a
 * segunda sessão chega — o cache era pequeno demais para o vocabulário de uma sessão só. Ele
 * pagava heap e, pior, servia resultado de idade ilimitada (não havia validade: uma entrada vivia
 * enquanto o processo vivesse) para acertar em duas buscas de cada cem.
 *
 * AS DUAS ALTERNATIVAS RECUSADAS. (1) Levar para o banco, como o teto de erros da mesma fase: seria
 * trocar uma chamada de rede por uma ida ao disco EM TODA busca para servir 2% delas — o caso
 * comum ficaria mais lento para o raro ficar mais rápido. (2) Aumentar o teto para 1.000 e pôr
 * validade: renderia 17,9%, e ainda assim é otimização de um caminho que já degrada sozinho (o
 * cliente cai direto no Openverse quando o proxy falha, `src/data/rotas/imagens.ts:35`) e cujo
 * upstream é público e sem chave. Guardar imagem de terceiro na memória do servidor para poupar
 * uma chamada em seis não paga o que custa explicar.
 *
 * O número acima vem de UM banco de desenvolvimento, com um usuário. Vocabulário compartilhado
 * entre muitos usuários subiria a taxa — e é por isso que a medição está escrita aqui: refazê-la
 * com dados de produção é o que deve reabrir a decisão, não a intuição de que "cache ajuda".
 */

// Openverse: API pública sem chave. Timeout curto — o cliente degrada sozinho.
const OPENVERSE_URL = 'https://api.openverse.org/v1/images/'

imagesRouter.get('/search', async (req, res) => {
  const bruto = String(req.query.q ?? '').trim()
  if (!bruto) {
    res.json({ results: [] })
    return
  }
  /* P2-1: `q` sem teto virava chave do cache em memória — um termo enorme inflava o heap do
     processo sem limite. O cache saiu (ver acima) e o teto FICA, agora por outro motivo: `q` é
     concatenado na URL do Openverse logo abaixo, e um termo sem tamanho máximo vira requisição de
     saída arbitrariamente grande paga pelo servidor. */
  const parsed = parseOr400(imageSearchQuerySchema, { q: bruto }, res)
  if (!parsed) return
  const q = parsed.q

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const url = `${OPENVERSE_URL}?q=${encodeURIComponent(q)}&page_size=8&license_type=all&mature=false`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      res.json({ results: [], error: `openverse ${response.status}` })
      return
    }

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

    res.json({ results })
  } catch (err) {
    // Falha honesta: HTTP 200 com lista vazia + motivo curto (o cliente não quebra).
    const reason = (err as Error)?.name === 'AbortError' ? 'timeout' : 'erro de rede'
    res.json({ results: [], error: reason })
  } finally {
    clearTimeout(timeout)
  }
})
