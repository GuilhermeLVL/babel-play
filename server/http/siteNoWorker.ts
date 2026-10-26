/**
 * O SITE PÚBLICO NO WORKER (Tarefa 1 de `docs/specs/2026-10-25-site-publico-seo-e-anuncios.md`).
 *
 * A raiz é o site estático gerado no build (`scripts/site/gerar.ts`); o app mora em `/app`. Para cada
 * caminho que não é da API, `decidirRotaDoSite` diz o que fazer, sem tocar em rede (puro, testável):
 *
 *   www.<domínio>/…              301 para o domínio sem `www` (mesmo caminho e busca)
 *   /app, /app/*, /auth/callback(/) o `index.html` do app (a SPA). O callback é o endereço cadastrado no
 *                                Supabase para o login: continua fora de `/app` de propósito
 *   /jogar, /plano/assinado, …   302 para `/app/…`: os endereços do app de antes da mudança (favoritos,
 *                                e-mails de convite já enviados, a volta do Asaas pendente)
 *   /                            a home (`inicio.html`; o `index.html` é o app)
 *   /inicio, /index.html, …      301 para `/` (um endereço só por página)
 *   o resto                      o asset como está; sem arquivo, o Static Assets responde a `404.html`
 *                                com status 404 (`not_found_handling: "404-page"` no `wrangler.jsonc`)
 *
 * INDEXAÇÃO: só o host de produção (`HOST_DE_PRODUCAO`, nos `vars` do topo do `wrangler.jsonc`; o
 * staging não herda) é indexável. Em qualquer outro host (staging, URL de preview, `wrangler dev`) toda
 * resposta leva `X-Robots-Tag: noindex, nofollow` e o `robots.txt` é `Disallow: /`. Sem a variável,
 * nenhum host é indexável (falha fechada: melhor um deploy sem SEO do que um staging no Google).
 */

/** Os segmentos de topo do app (`src/lib/rotas.ts`) que NÃO colidem com páginas públicas. */
export const SEGMENTOS_DO_APP = [
  'capturar',
  'interprete',
  'jogar',
  'biblioteca',
  'livros',
  'cartoes',
  'ajustes',
  'perfil',
  'loja',
  'plano',
  'estatisticas',
  'diagnostico',
  'admin',
  'sessao',
  'revisar',
  'vocabulario',
  'personalizar',
  'creditos',
  'responsavel',
  'nao-encontrado',
] as const

const DO_APP = new Set<string>(SEGMENTOS_DO_APP)

/** Endereços que são a home com outro nome. */
const APELIDOS_DA_HOME = new Set(['/inicio', '/inicio.html', '/index.html'])

export type DecisaoDoSite =
  | { tipo: 'redirecionar'; destino: string; status: 301 | 302 }
  | { tipo: 'asset'; caminho: string }

export function decidirRotaDoSite(url: URL): DecisaoDoSite {
  const host = url.hostname.toLowerCase()
  if (host.startsWith('www.')) {
    const destino = new URL(url.toString())
    destino.hostname = host.slice(4)
    return { tipo: 'redirecionar', destino: destino.toString(), status: 301 }
  }
  const caminho = url.pathname
  if (/^\/app(\/|$)/i.test(caminho) || /^\/auth\/callback\/?$/.test(caminho)) return { tipo: 'asset', caminho: '/' }
  const primeiro = caminho.split('/')[1]?.toLowerCase() ?? ''
  if (DO_APP.has(primeiro)) {
    return { tipo: 'redirecionar', destino: `${url.origin}/app${caminho}${url.search}`, status: 302 }
  }
  if (caminho === '/') return { tipo: 'asset', caminho: '/inicio' }
  if (APELIDOS_DA_HOME.has(caminho.toLowerCase())) {
    return { tipo: 'redirecionar', destino: `${url.origin}/${url.search}`, status: 301 }
  }
  return { tipo: 'asset', caminho }
}

/** O host pode ser indexado? Só os de `HOST_DE_PRODUCAO` (lista separada por vírgula, sem porta). */
export function hostIndexavel(host: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const permitidos = (env.HOST_DE_PRODUCAO ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return permitidos.includes(host.toLowerCase())
}

export const CABECALHO_NOINDEX = 'noindex, nofollow'

/** O `robots.txt` de um host que não é o de produção. */
export const ROBOTS_BLOQUEADO = 'User-agent: *\nDisallow: /\n'

/** Uma resposta com o `X-Robots-Tag` de fora da produção (cópia: a do `ASSETS` é imutável). */
export function comNoindex(r: Response): Response {
  const copia = new Response(r.body, r)
  copia.headers.set('x-robots-tag', CABECALHO_NOINDEX)
  return copia
}
