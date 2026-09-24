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
 */
import path from 'node:path'

import express, { type Express, type Response } from 'express'

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
 * Monta os estáticos e o fallback da SPA. O fallback manda o `index.html` com `no-cache` também:
 * `/jogar` recarregado é o `index.html`, e precisa da mesma regra que `/index.html`.
 */
export function montarSpa(app: Express, distPath: string): void {
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
