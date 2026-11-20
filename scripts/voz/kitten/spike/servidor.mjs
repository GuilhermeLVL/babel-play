#!/usr/bin/env node
/**
 * SPIKE do Kitten TTS 2 no navegador — servidor estático com isolamento de origem (COOP/COEP, para as threads do WASM).
 *
 *   /ort/*      → node_modules/onnxruntime-web/dist (o MESMO runtime do app)
 *   /mini/*     → pasta local do `KittenML/kitten-tts-2-mini` (KITTEN_MINI)
 *   /pico/*     → pasta local do `KittenML/kitten-tts-2-pico` (KITTEN_PICO)
 *   /app/<caminho>.js → src/<caminho>.ts empacotado na hora (o código do app, o mesmo que vai para produção)
 *   o resto     → esta pasta
 *
 * Uso: KITTEN_MINI=<dir> KITTEN_PICO=<dir> node scripts/voz/kitten/spike/servidor.mjs [porta]
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const aqui = fileURLToPath(new URL('.', import.meta.url))
const raizDoRepo = join(aqui, '../../../../')
const porta = Number(process.argv[2] ?? 5199)
const raizes = {
  '/ort/': join(raizDoRepo, 'node_modules/onnxruntime-web/dist/'),
  '/mini/': process.env.KITTEN_MINI ?? '',
  '/pico/': process.env.KITTEN_PICO ?? '',
}
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.npz': 'application/octet-stream',
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  /* SPIKE_CORS=1: serve os pesos também para o app em outra porta (o e2e com `VITE_VOZ_KITTEN_URL` apontando aqui). */
  res.setHeader('Cross-Origin-Resource-Policy', process.env.SPIKE_CORS ? 'cross-origin' : 'same-origin')
  if (process.env.SPIKE_CORS) res.setHeader('Access-Control-Allow-Origin', '*')
  if (url.pathname.startsWith('/app/') && url.pathname.endsWith('.js')) {
    /* Código do app (src/<caminho>.ts), empacotado na hora: o spike mede o código que vai para produção. */
    const r = await build({
      entryPoints: [join(raizDoRepo, 'src', normalize(url.pathname.slice(5, -3) + '.ts'))],
      bundle: true,
      format: 'esm',
      write: false,
      platform: 'browser',
    })
    res.setHeader('Content-Type', 'text/javascript')
    return res.end(r.outputFiles[0].text)
  }
  let arquivo = null
  for (const [pre, dir] of Object.entries(raizes))
    if (url.pathname.startsWith(pre) && dir) arquivo = join(dir, normalize(url.pathname.slice(pre.length)))
  arquivo ??= join(aqui, normalize(url.pathname === '/' ? '/index.html' : url.pathname))
  if (!existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.statusCode = 404
    return res.end('404')
  }
  res.setHeader('Content-Type', tipos[extname(arquivo)] ?? 'application/octet-stream')
  createReadStream(arquivo).pipe(res)
}).listen(porta, () => console.log(`spike em http://localhost:${porta}`))
