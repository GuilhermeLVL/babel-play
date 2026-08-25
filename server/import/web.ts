/**
 * Importação de artigo web (lado SERVIDOR) — o navegador não pode buscar sites arbitrários
 * (CORS), então o servidor busca o HTML e extrai o corpo principal com o Readability do Firefox.
 *
 * Honesto: se não houver texto principal extraível, lançamos erro claro (não devolvemos o HTML
 * cru nem inventamos conteúdo). Guard anti-SSRF simples: só http(s) público, nada de rede interna.
 */
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { assertPublicUrl } from '../ai/ssrf'

// Teto do HTML aceito (anti-DoS do jsdom/Readability com páginas-bomba).
const MAX_HTML_BYTES = 4 * 1024 * 1024
const MAX_REDIRECTS = 5

/**
 * Busca a página validando CADA salto de redirect contra a guarda anti-SSRF completa
 * (`server/ai/ssrf.ts`, que resolve TODOS os IPs). A versão anterior deste arquivo tinha uma
 * guarda própria mais fraca (1 IP só, redirects seguidos às cegas) — achado da auditoria:
 * um alvo público com 302 → rede interna/metadata era seguido sem revalidação.
 */
async function fetchPublicHtml(rawUrl: string): Promise<{ res: globalThis.Response; finalUrl: string }> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current)
    const res = await fetch(current, {
      headers: {
        // Alguns sites bloqueiam sem UA de navegador; identificamos honestamente o app.
        'user-agent': 'Mozilla/5.0 (compatible; BabelPlay/0.1; +https://localhost) article-import',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      // P1-10: sem timeout, um alvo slow-loris segurava o request para sempre — e o laço
      // faz até MAX_REDIRECTS saltos, então o tempo total era ilimitado. Por HOP.
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`redirect sem destino (HTTP ${res.status})`)
      current = new URL(loc, current).href
      continue
    }
    return { res, finalUrl: current }
  }
  throw new Error('redirects demais — a página não estabiliza')
}

/**
 * Lê o corpo com teto REAL, abortando no meio (P1-10).
 *
 * O teto de 4MB era checado assim: primeiro o `content-length` DECLARADO — que um servidor
 * hostil simplesmente omite — e depois `html.length`, ou seja, DEPOIS de `res.text()` já ter
 * puxado tudo para a memória. Um alvo malicioso streamando sem parar enchia o heap antes de
 * qualquer checagem. Aqui o corte acontece durante a leitura.
 */
async function lerComTeto(res: globalThis.Response, maxBytes: number): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('página grande demais para importar (> 4MB)')
      partes.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(partes.map((p) => Buffer.from(p))))
}

export async function extractArticle(rawUrl: string): Promise<{ title: string; text: string; lang?: string }> {
  const { res, finalUrl } = await fetchPublicHtml(rawUrl)
  const url = new URL(finalUrl)
  if (!res.ok) throw new Error(`falha ao buscar a página (HTTP ${res.status})`)
  const declaredLen = Number(res.headers.get('content-length') || 0)
  if (declaredLen > MAX_HTML_BYTES) throw new Error('página grande demais para importar (> 4MB)')
  const html = await lerComTeto(res, MAX_HTML_BYTES)
  const dom = new JSDOM(html, { url: url.href })
  const doc = dom.window.document
  const htmlLang = doc.documentElement.getAttribute('lang') || undefined
  const article = new Readability(doc).parse()
  const text = article?.textContent?.trim()
  if (!text) throw new Error('não consegui extrair o texto principal desta página')
  return {
    title: (article?.title || doc.title || url.href).trim(),
    text,
    lang: htmlLang ? htmlLang.split('-')[0] : undefined,
  }
}
