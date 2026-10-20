/**
 * Importação de artigo web (lado SERVIDOR) — o navegador não pode buscar sites arbitrários
 * (CORS), então o servidor busca o HTML e extrai o corpo principal com o Readability do Firefox.
 *
 * Honesto: se não houver texto principal extraível, lançamos erro claro (não devolvemos o HTML
 * cru nem inventamos conteúdo). Guard anti-SSRF simples: só http(s) público, nada de rede interna.
 */
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

import { assertPublicUrl, despachanteSeguro, fetchSeguro, type InitSeguro } from '../ai/ssrf'

// Teto do HTML aceito (anti-DoS do DOM/Readability com páginas-bomba).
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
    const res = await fetchSeguro(current, {
      headers: {
        // Alguns sites bloqueiam sem UA de navegador; identificamos honestamente o app.
        'user-agent': 'Mozilla/5.0 (compatible; BabelPlay/0.1; +https://localhost) article-import',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      // P1-10: sem timeout, um alvo slow-loris segurava o request para sempre — e o laço
      // faz até MAX_REDIRECTS saltos, então o tempo total era ilimitado. Por HOP.
      signal: AbortSignal.timeout(15_000),
      // Auditoria de segurança 2026-09-26: o IP é conferido na CONEXÃO (DNS rebinding), ver ssrf.ts.
      dispatcher: despachanteSeguro,
    } as InitSeguro)
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
async function lerComTeto(res: globalThis.Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0)
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
  const junto = new Uint8Array(total)
  let pos = 0
  for (const p of partes) {
    junto.set(p, pos)
    pos += p.byteLength
  }
  return junto
}

/** Acha `charset=<label>` num texto (cabeçalho Content-Type ou atributo do `<meta>`). */
const CHARSET = /charset\s*=\s*["']?\s*([^\s"';>/]+)/i

/**
 * Decodifica o HTML no charset que a página declara: `charset=` do Content-Type; senão `<meta charset>` ou
 * `<meta http-equiv="content-type">` nos primeiros 2.048 bytes (lidos como latin1, que preserva o ASCII);
 * senão utf-8. Label desconhecido cai em utf-8. O BOM é respeitado pelo `TextDecoder` padrão.
 */
export function decodificarHtml(bytes: Uint8Array, contentType: string | null): string {
  const doCabecalho = contentType ? CHARSET.exec(contentType)?.[1] : undefined
  let label = doCabecalho
  if (!label) {
    const cabeca = new TextDecoder('latin1').decode(bytes.subarray(0, 2048))
    for (const meta of cabeca.match(/<meta\b[^>]*>/gi) ?? []) {
      label = CHARSET.exec(meta)?.[1]
      if (label) break
    }
  }
  try {
    return new TextDecoder(label ?? 'utf-8').decode(bytes)
  } catch (err) {
    if (!(err instanceof RangeError)) throw err
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export async function extractArticle(rawUrl: string): Promise<{ title: string; text: string; lang?: string }> {
  const { res, finalUrl } = await fetchPublicHtml(rawUrl)
  const url = new URL(finalUrl)
  if (!res.ok) throw new Error(`falha ao buscar a página (HTTP ${res.status})`)
  const declaredLen = Number(res.headers.get('content-length') || 0)
  if (declaredLen > MAX_HTML_BYTES) throw new Error('página grande demais para importar (> 4MB)')
  const html = decodificarHtml(await lerComTeto(res, MAX_HTML_BYTES), res.headers.get('content-type'))
  const { document: doc } = parseHTML(html)
  /* O linkedom não define `baseURI`/`documentURI` e o Readability os usa para resolver links relativos. */
  for (const chave of ['baseURI', 'documentURI']) Object.defineProperty(doc, chave, { value: url.href })
  const htmlLang = doc.documentElement.getAttribute('lang') || undefined
  const article = new Readability(doc as unknown as Document).parse()
  const text = article?.textContent?.trim()
  if (!text) throw new Error('não consegui extrair o texto principal desta página')
  return {
    title: (article?.title || doc.title || url.href).trim(),
    text,
    lang: htmlLang ? htmlLang.split('-')[0] : undefined,
  }
}
