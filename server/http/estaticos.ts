/**
 * A SPA EM PRODUÇÃO — o que o navegador pode guardar, e por quanto tempo (Fase 5).
 *
 * `app.use(express.static(dist))` servia tudo com o padrão do Express: `Cache-Control: public,
 * max-age=0` e ETag. Duas consequências medíveis:
 *
 *   - cada arquivo de `/assets/*` — que tem HASH do conteúdo no nome e nunca muda — era revalidado
 *     a cada visita: uma ida e volta por chunk, dezenas por carga de página;
 *   - o `index.html` não dizia nada explícito, e um proxy ou CDN no meio (o Cloudflare, na
 *     produção) fica livre para aplicar a regra dele. Um `index.html` velho em cache aponta para
 *     chunks que o deploy seguinte apagou: tela branca até alguém limpar o cache.
 *
 * A regra agora:
 *
 *   /assets/*            1 ano + `immutable` — o nome muda quando o conteúdo muda
 *   ort-wasm-*, silero_* 1 ano + `immutable` — versionados pelo pacote; mesmo tratamento do
 *                        `public/_headers` da edição estática
 *   /trilha/*, /glosas/* 1 dia com revalidação — dado sem hash no nome (ver `public/_headers`)
 *   index.html           `no-cache` — sempre revalida, é ele que diz quais chunks valem
 *   o resto              padrão do Express (revalida por ETag)
 *
 * E, na frente de tudo, o irmão `.br`/`.gz` pré-comprimido pelo build quando existe e o navegador
 * aceita (`servirPreComprimido`, Fase 4) — com o MESMO `Cache-Control` do original.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import express, { type Express, type RequestHandler, type Response } from 'express'

const UM_ANO_S = 31_536_000
const IMUTAVEL = `public, max-age=${UM_ANO_S}, immutable`
const UM_DIA_REVALIDANDO = 'public, max-age=86400, must-revalidate'
const SEMPRE_REVALIDA = 'no-cache'

/** O `Cache-Control` de um arquivo servido da raiz de `dist/`, pelo caminho relativo a ela. */
export function cacheDoArquivo(relativo: string): string | null {
  const r = relativo.replace(/\\/g, '/').replace(/^\/+/, '')
  if (r === 'index.html') return SEMPRE_REVALIDA
  if (r.startsWith('assets/')) return IMUTAVEL
  if (/^(ort-wasm-[^/]+\.(mjs|wasm)|silero_vad_[^/]+\.onnx)$/.test(r)) return IMUTAVEL
  if (r.startsWith('trilha/') || r.startsWith('glosas/')) return UM_DIA_REVALIDANDO
  return null
}

function aplicar(res: Response, valor: string | null) {
  if (valor) res.setHeader('Cache-Control', valor)
}

/**
 * O IRMÃO PRÉ-COMPRIMIDO, quando o navegador aceita (Fase 4 da prontidão).
 *
 * O build grava `arquivo.br` e `arquivo.gz` ao lado de cada JS/CSS/wasm/JSON
 * (`scripts/vite/precomprimir.ts`). Sem isto o `compression` comprimia de novo, a CADA pedido, os
 * mesmos chunks imutáveis — CPU do único processo, que também atende a API, gasta para refazer o
 * que o build já sabe fazer melhor (brotli 11 em vez de 4: ~15% menos bytes no JS).
 *
 * A resposta leva `Content-Encoding` (e o `compression` não mexe em resposta já codificada),
 * `Vary: Accept-Encoding` (um cache no meio não pode servir o `.br` a quem não pediu) e o
 * `Content-Type` do ORIGINAL — o `send` só o deduziria pela extensão `.br`. O `Cache-Control` é o
 * mesmo do original (`cacheDoArquivo`). Sem irmão, sem `Accept-Encoding` compatível, fora de
 * GET/HEAD, ou caminho que escape de `dist` (`..`): segue para o `express.static` de sempre.
 */
/**
 * As codificações que o `Accept-Encoding` aceita (q > 0), em minúsculas. A PREFERÊNCIA é do
 * servidor (br antes de gzip, o menor primeiro), não da ordem do cabeçalho — é o que o
 * `compression` também faz. Sem cabeçalho: nenhuma (o original). `*` aceita br e gzip. Pura.
 */
export function codificacoesAceitas(cabecalho: string | string[] | undefined): Set<string> {
  const aceitas = new Set<string>()
  for (const parte of String(cabecalho ?? '').split(',')) {
    const [nome, ...params] = parte.trim().toLowerCase().split(';')
    if (!nome) continue
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    if (q !== undefined && !(Number(q.slice(2)) > 0)) continue
    if (nome === '*') {
      aceitas.add('br')
      aceitas.add('gzip')
    } else aceitas.add(nome)
  }
  return aceitas
}

export function servirPreComprimido(distPath: string): RequestHandler {
  const raiz = path.resolve(distPath)
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    let relativo: string
    try {
      relativo = decodeURIComponent(req.path).replace(/^\/+/, '')
    } catch {
      return next()
    }
    if (!relativo || relativo.endsWith('/')) return next()
    const original = path.resolve(raiz, relativo)
    if (!original.startsWith(raiz + path.sep)) return next()
    const aceitas = codificacoesAceitas(req.headers['accept-encoding'])
    let escolhida: { codificacao: string; irmao: string } | null = null
    try {
      if (!statSync(original).isFile()) return next()
      for (const [codificacao, extensao] of [
        ['br', '.br'],
        ['gzip', '.gz'],
      ] as const) {
        if (aceitas.has(codificacao) && existsSync(original + extensao)) {
          escolhida = { codificacao, irmao: original + extensao }
          break
        }
      }
    } catch {
      return next()
    }
    if (!escolhida) return next()
    const { codificacao, irmao } = escolhida
    res.setHeader('Content-Encoding', codificacao)
    res.vary('Accept-Encoding')
    res.type(path.extname(original))
    aplicar(res, cacheDoArquivo(relativo))
    res.sendFile(irmao, (err) => {
      if (err && !res.headersSent) next()
    })
  }
}

/**
 * Monta os estáticos e o fallback da SPA. O fallback manda o `index.html` com `no-cache` também:
 * `/jogar` recarregado é o `index.html`, e precisa da mesma regra que `/index.html`.
 */
export function montarSpa(app: Express, distPath: string): void {
  app.use(servirPreComprimido(distPath))
  app.use(
    express.static(distPath, {
      setHeaders: (res, arquivo) => aplicar(res, cacheDoArquivo(path.relative(distPath, arquivo))),
    }),
  )
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', SEMPRE_REVALIDA)
    res.sendFile(path.join(distPath, 'index.html'))
  })
}
