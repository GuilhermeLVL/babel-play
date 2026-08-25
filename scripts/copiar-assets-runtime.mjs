#!/usr/bin/env node
/**
 * Copia para `public/` os binários de runtime que o app serve do próprio domínio:
 *  - ONNX Runtime Web (wasm + loader .mjs) — `vite.config.ts` os serve de `/` sem a query do Vite;
 *  - Silero VAD (modelos .onnx + worklet) — `@ricky0123/vad-web` os carrega de `/`.
 *
 * Eram 42 MB VERSIONADOS. Agora `npm install` (postinstall) e o Dockerfile os recriam a partir de
 * `node_modules`, e `.gitignore` os exclui. Idempotente: pula o que já existe com o mesmo tamanho.
 *
 * O `onnxruntime-web` pode estar no topo de node_modules ou aninhado — ver `primeiroExistente`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(RAIZ, 'public')
/**
 * `require.resolve('onnxruntime-web/package.json')` FALHA: o mapa `exports` do pacote não expõe
 * o package.json. Resolvemos por caminho, na ordem em que o app os usa: o `onnxruntime-web` de
 * topo é o que o `@huggingface/transformers` traz (era o versionado e o que funcionava); o
 * aninhado em `@ricky0123/vad-web` é o fallback.
 */
function primeiroExistente(candidatos, arquivoDeProva) {
  return candidatos.find((d) => existsSync(join(d, 'dist', arquivoDeProva))) ?? null
}
const ortDir = primeiroExistente([
  join(RAIZ, 'node_modules', 'onnxruntime-web'),
  join(RAIZ, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web'),
  join(RAIZ, 'node_modules', '@ricky0123', 'vad-web', 'node_modules', 'onnxruntime-web'),
], 'ort-wasm-simd-threaded.jsep.wasm')
const vadDir = primeiroExistente([join(RAIZ, 'node_modules', '@ricky0123', 'vad-web')], 'silero_vad_v5.onnx')

const ALVOS = [
  ...['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']
    .map((f) => ({ de: ortDir && join(ortDir, 'dist', f), para: join(PUBLIC, f), pacote: 'onnxruntime-web' })),
  ...['silero_vad_v5.onnx', 'silero_vad_legacy.onnx', 'vad.worklet.bundle.min.js']
    .map((f) => ({ de: vadDir && join(vadDir, 'dist', f), para: join(PUBLIC, f), pacote: '@ricky0123/vad-web' })),
]

mkdirSync(PUBLIC, { recursive: true })
let copiados = 0, pulados = 0
const faltando = []
for (const a of ALVOS) {
  if (!a.de || !existsSync(a.de)) { faltando.push(`${a.pacote}: ${a.para.split(/[\\/]/).pop()}`); continue }
  if (existsSync(a.para) && statSync(a.para).size === statSync(a.de).size) { pulados += 1; continue }
  copyFileSync(a.de, a.para)
  copiados += 1
}
console.log(`[assets-runtime] ${copiados} copiado(s), ${pulados} já existiam → public/`)
if (faltando.length) {
  // Em `npm install` não pode derrubar a instalação; mas deixa claro o que falta e por quê.
  console.warn(`[assets-runtime] NÃO encontrados em node_modules (o VAD/ORT não vão carregar do próprio domínio):\n  - ${faltando.join('\n  - ')}`)
  if (process.argv.includes('--exigir')) process.exit(1)
}
