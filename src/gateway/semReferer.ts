/**
 * Buscas ao Hugging Face SEM `Referer` (correção A do diagnóstico do Safari, 22/10/2026).
 *
 * O Hub responde 404 sem CORS a qualquer `Referer` de `*.workers.dev` (o staging): `curl -H "Referer:
 * https://x.workers.dev/"` → 404, enquanto `example.com`, `pages.dev` e `localhost` → 307 normal. Com a
 * `Referrer-Policy: strict-origin-when-cross-origin` do app, o navegador manda a origem, e Whisper,
 * opus-mt e WeSpeaker não baixavam em navegador nenhum. A política do app fica como está; só as buscas
 * nossas aos hosts do Hub (e às CDNs dele, para onde o `resolve/` redireciona — a política do `fetch`
 * vale também nos redirecionamentos) saem com `referrerPolicy: 'no-referrer'`.
 */

const HOSTS_DO_HUB = /(^|\.)(huggingface\.co|hf\.co)$/i;

/** A URL é do Hugging Face (o Hub ou uma CDN dele)? URL relativa ou inválida: não. */
export function ehHostDoHub(url: string): boolean {
  try {
    return HOSTS_DO_HUB.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** O `init` da busca com `no-referrer` quando a URL é do Hub; para outro host, o mesmo `init`. */
export function comPoliticaDoHub(url: string, init?: RequestInit): RequestInit | undefined {
  if (!ehHostDoHub(url)) return init;
  return { ...init, referrerPolicy: 'no-referrer' };
}
