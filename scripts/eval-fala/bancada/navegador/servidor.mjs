/**
 * Servidor estático da BANCADA NO NAVEGADOR. Só escuta em 127.0.0.1.
 *
 *   /                 a página de teste (`pagina.html`)
 *   /lib/…            `node_modules/@huggingface/transformers/dist` (a MESMA versão que o app empacota)
 *   /ort/…            `node_modules/onnxruntime-web/dist` (os .wasm e o `ort.webgpu` do Parakeet)
 *   /dados/…          BANCADA_DIR/navegador (as falas e os manifestos de `preparar-audio.py`)
 *   /modelos/…        BANCADA_DIR/cache/modelos (os ONNX do Parakeet, baixados pelo `rodar.mjs`)
 *
 * Isolamento de origem igual ao da produção (`public/_headers`): COOP same-origin + COEP
 * credentialless — é o que liga o SharedArrayBuffer e as threads do WASM do ONNX Runtime.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ_DO_REPO = path.resolve(AQUI, '../../../..')
export const BANCADA_DIR =
  process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'babel-bancada')

const MONTAGENS = {
  '/lib/': path.join(RAIZ_DO_REPO, 'node_modules/@huggingface/transformers/dist'),
  '/ort/': path.join(RAIZ_DO_REPO, 'node_modules/onnxruntime-web/dist'),
  '/dados/': path.join(BANCADA_DIR, 'navegador'),
  '/modelos/': path.join(BANCADA_DIR, 'cache', 'modelos'),
}
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.onnx': 'application/octet-stream',
}

export function subirServidor(porta) {
  const servidor = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let arquivo = null
    if (url === '/' || url === '/pagina.html') arquivo = path.join(AQUI, 'pagina.html')
    else
      for (const [prefixo, raiz] of Object.entries(MONTAGENS)) {
        if (!url.startsWith(prefixo)) continue
        const alvo = path.resolve(raiz, url.slice(prefixo.length))
        if (alvo.startsWith(raiz)) arquivo = alvo
      }
    const cabecalhos = {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cache-Control': 'no-store',
    }
    if (!arquivo || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
      res.writeHead(404, cabecalhos).end('nao encontrado')
      return
    }
    res.writeHead(200, {
      ...cabecalhos,
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      'Content-Length': statSync(arquivo).size,
    })
    createReadStream(arquivo).pipe(res)
  })
  return new Promise((ok, erro) => {
    servidor.once('error', erro)
    servidor.listen(porta, '127.0.0.1', () => ok(servidor))
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const porta = Number(process.argv[2] || 4517)
  await subirServidor(porta)
  console.log(`bancada no navegador: http://127.0.0.1:${porta}/`)
}
